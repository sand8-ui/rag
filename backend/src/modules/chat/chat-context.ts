import type { RetrievedChunk } from '../knowledge/retriever.service';
import { formatSlots, type SessionSlots } from './chat-slots';
import { CHAT_RAG_TOKEN_BUDGET, estimateTokens } from './chat-tokens';

export const CHAT_RETRIEVE_K = 6;
const CHUNK_CONTENT_LIMIT = 500;

export const CHAT_SYSTEM_PROMPT =
  '你是 StayWise 酒店预订客服。\n' +
  '【能力边界】可以解释预订与入住政策，并引导用户在「我的订单」自行取消或改期；不能支付、锁房、改系统，不能假装已经改单成功，也没有实时房态、航班或天气接口。\n' +
  '【幻觉规则】不要编造退改费率、房价、库存、订单状态、工单号或值班经理姓名。资料不足时明确说知识库里没有足够信息。\n' +
  '【语气】简洁中文，先给结论再补条件；涉及扣费先说明可能产生费用。';

export type ChatCitation = {
  chunkId: string;
  sourcePath: string;
  documentTitle: string;
  sectionTitle: string | null;
  score: number;
};

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export function toCitations(chunks: RetrievedChunk[]): ChatCitation[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.id,
    sourcePath: chunk.sourcePath,
    documentTitle: chunk.documentTitle,
    sectionTitle: chunk.sectionTitle,
    score: chunk.score,
  }));
}

export function buildPinnedSystem(
  slots: SessionSlots,
  summary: string | null,
): string {
  return [
    CHAT_SYSTEM_PROMPT,
    formatSlots(slots),
    summary?.trim() ? `【窗口外摘要】\n${summary.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildRagTurns(
  chunks: RetrievedChunk[] | null,
): LlmMessage[] {
  return [
    { role: 'user', content: formatKnowledge(chunks) },
    {
      role: 'assistant',
      content: '已收到检索结果，将只根据这些资料回答，不编造未出现的数字或政策。',
    },
  ];
}

export function trimRetrieved(
  chunks: RetrievedChunk[] | null,
  budget = CHAT_RAG_TOKEN_BUDGET,
): RetrievedChunk[] | null {
  if (chunks === null) {
    return null;
  }
  const kept: RetrievedChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const content =
      chunk.content.length > CHUNK_CONTENT_LIMIT
        ? `${chunk.content.slice(0, CHUNK_CONTENT_LIMIT)}…`
        : chunk.content;
    const clipped = { ...chunk, content };
    const cost = estimateTokens(content);
    if (kept.length > 0 && used + cost > budget) {
      break;
    }
    kept.push(clipped);
    used += cost;
  }
  return kept;
}

function formatKnowledge(chunks: RetrievedChunk[] | null): string {
  if (chunks === null) {
    return (
      '【知识库检索结果】\n检索服务暂时不可用。不要编造政策数字，建议用户稍后重试、查看「我的订单」或转人工。'
    );
  }
  if (chunks.length === 0) {
    return (
      '【知识库检索结果】\n无命中。请明确告知用户知识库里没有足够信息，并建议补充订单号、酒店名、入住日期，或查看「我的订单」/转人工。'
    );
  }

  const body = chunks
    .map((chunk, index) => {
      const heading = [chunk.documentTitle, chunk.sectionTitle]
        .filter(Boolean)
        .join(' / ');
      return `[${index + 1}] ${heading}\n${chunk.content}`;
    })
    .join('\n\n');

  return `【知识库检索结果】（只可根据以下内容回答，不要编造未出现的数字或政策）\n${body}`;
}
