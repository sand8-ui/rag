import { estimateMessage } from './chat-tokens';
import type { LlmMessage } from './chat-context';

export function slideWindow(
  history: LlmMessage[],
  budget: number,
): { kept: LlmMessage[]; overflow: LlmMessage[] } {
  if (history.length === 0) {
    return { kept: [], overflow: [] };
  }

  const current = history[history.length - 1];
  const kept: LlmMessage[] = [current];
  let used = estimateMessage(current);
  let firstKept = history.length - 1;

  for (let index = history.length - 2; index >= 0; index -= 1) {
    const cost = estimateMessage(history[index]);
    if (used + cost > budget) {
      break;
    }
    kept.push(history[index]);
    used += cost;
    firstKept = index;
  }

  if (firstKept > 0 && kept[kept.length - 1]?.role === 'assistant') {
    const maybeUser = history[firstKept - 1];
    if (
      maybeUser?.role === 'user' &&
      used + estimateMessage(maybeUser) <= budget
    ) {
      kept.push(maybeUser);
      firstKept -= 1;
    }
  }

  return {
    kept: kept.reverse(),
    overflow: history.slice(0, firstKept),
  };
}

export function buildSummaryPrompt(
  previous: string | null,
  overflow: LlmMessage[],
): LlmMessage[] {
  const transcript = overflow
    .map((message) => `${message.role === 'user' ? '用户' : '客服'}：${message.content}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        '把移出窗口的对话压成不超过 180 字的中文摘要。只保留订单号、酒店名、入住离店日、用户在问哪类政策。' +
        '禁止编造费率、房价、取消结果或订单状态。没有这些信息就写「无关键预订信息」。只输出摘要正文。',
    },
    {
      role: 'user',
      content: `已有摘要：${previous?.trim() || '无'}\n\n新溢出对话：\n${transcript}`,
    },
  ];
}
