import type { LlmMessage } from './chat-context';

export const CHAT_CONTEXT_BUDGET = 6000;
export const CHAT_RAG_TOKEN_BUDGET = 2200;
export const CHAT_HISTORY_LOAD_LIMIT = 80;
export const CHAT_GENERATION_MAX_TOKENS = 512;

export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    tokens += /[\u4e00-\u9fff]/.test(char) ? 1 : 0.35;
  }
  return Math.max(1, Math.ceil(tokens));
}

export function estimateMessage(message: LlmMessage): number {
  return estimateTokens(message.content) + 8;
}

export function estimateMessages(messages: LlmMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessage(message), 0);
}
