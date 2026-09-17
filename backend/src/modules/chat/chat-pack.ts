import {
  buildPinnedSystem,
  buildRagTurns,
  type LlmMessage,
} from './chat-context';
import type { RetrievedChunk } from '../knowledge/retriever.service';
import type { SessionSlots } from './chat-slots';
import {
  CHAT_CONTEXT_BUDGET,
  estimateMessage,
  estimateMessages,
} from './chat-tokens';
import { slideWindow } from './chat-window';

export type ContextMode = 'window' | 'full';

export type PackedContext = {
  messages: LlmMessage[];
  summary: string | null;
  kept: number;
  overflow: number;
  tokens: number;
};

export function historyBudget(
  pinned: string,
  ragTurns: LlmMessage[],
  history: LlmMessage[],
  totalBudget = CHAT_CONTEXT_BUDGET,
) {
  const reserved = estimateMessages([
    { role: 'system', content: pinned },
    ...ragTurns,
  ]);
  const current = history[history.length - 1];
  const minHistory = current ? estimateMessage(current) : 0;
  return Math.max(totalBudget - reserved, minHistory);
}

export async function packChatContext(options: {
  history: LlmMessage[];
  retrieved: RetrievedChunk[] | null;
  slots: SessionSlots;
  summary: string | null;
  mode: ContextMode;
  budget?: number;
  summarize?: (
    previous: string | null,
    overflow: LlmMessage[],
  ) => Promise<string | null | undefined>;
}): Promise<PackedContext> {
  const ragTurns = buildRagTurns(options.retrieved);
  const useMemory = options.mode === 'full';
  let summary = useMemory ? options.summary : null;
  const slots = useMemory ? options.slots : {};
  let pinned = buildPinnedSystem(slots, summary);
  const budget = options.budget ?? CHAT_CONTEXT_BUDGET;
  let windowBudget = historyBudget(pinned, ragTurns, options.history, budget);
  let { kept, overflow } = slideWindow(options.history, windowBudget);

  if (useMemory && overflow.length > 0 && options.summarize) {
    summary = (await options.summarize(summary, overflow)) ?? summary;
    pinned = buildPinnedSystem(slots, summary);
    windowBudget = historyBudget(pinned, ragTurns, options.history, budget);
    ({ kept, overflow } = slideWindow(options.history, windowBudget));
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: pinned },
    ...ragTurns,
    ...kept,
  ];
  return {
    messages,
    summary,
    kept: kept.length,
    overflow: overflow.length,
    tokens: estimateMessages(messages),
  };
}
