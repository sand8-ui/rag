import type {
  ChatCitation,
  ConversationDetail,
  ConversationSummary,
} from '../types';
import { getAccessToken } from '../auth/tokens';
import { API_BASE_URL, api, requestTokenRefresh } from './client';

export type ChatSsePayload = {
  token: string;
  done: boolean;
  error?: string;
  conversationId?: string;
  citations?: ChatCitation[];
};

export function fetchConversations() {
  return api.get<ConversationSummary[]>('/chat/conversations');
}

export function fetchConversation(id: string) {
  return api.get<ConversationDetail>(`/chat/conversations/${id}`);
}

export function deleteConversation(id: string) {
  return api.delete<{ ok: boolean }>(`/chat/conversations/${id}`);
}

export async function streamChat(
  payload: { conversationId?: string; content: string },
  onEvent: (event: ChatSsePayload) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await postStream(payload, signal, false);
  if (!response.body) {
    throw new Error('聊天流为空');
  }
  await readSse(response.body, onEvent, signal);
}

async function postStream(
  payload: { conversationId?: string; content: string },
  signal: AbortSignal,
  retried: boolean,
): Promise<Response> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (response.status === 401 && !retried) {
    const session = await requestTokenRefresh();
    if (session?.accessToken) {
      return postStream(payload, signal, true);
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `聊天请求失败（${response.status}）`);
  }

  return response;
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (payload: ChatSsePayload) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const abort = () => {
    void reader.cancel();
  };
  signal.addEventListener('abort', abort);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const payload = parseSseLine(line);
        if (payload) {
          onEvent(payload);
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

function parseSseLine(rawLine: string): ChatSsePayload | null {
  const line = rawLine.trim();
  if (!line.startsWith('data:')) {
    return null;
  }
  const data = line.slice(5).trim();
  if (!data) {
    return null;
  }
  return JSON.parse(data) as ChatSsePayload;
}
