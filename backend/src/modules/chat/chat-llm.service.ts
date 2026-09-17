import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmMessage } from './chat-context';
import { CHAT_GENERATION_MAX_TOKENS } from './chat-tokens';

@Injectable()
export class ChatLlmService {
  private readonly logger = new Logger(ChatLlmService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('CHAT_BASE_URL') ??
      this.configService.get<string>('EMBEDDING_BASE_URL') ??
      'http://localhost:11434/v1'
    ).replace(/\/$/, '');
    this.model = this.configService.get<string>('CHAT_MODEL') ?? 'qwen2.5:7b';
    this.apiKey =
      this.configService.get<string>('CHAT_API_KEY') ??
      this.configService.get<string>('EMBEDDING_API_KEY') ??
      'ollama';
  }

  async complete(
    messages: LlmMessage[],
    signal: AbortSignal,
    options?: { maxTokens?: number },
  ): Promise<string> {
    const payload = await this.postChat(
      {
        model: this.model,
        stream: false,
        temperature: 0,
        max_tokens: options?.maxTokens ?? 32,
        messages,
      },
      signal,
    );
    const body = (await payload.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content?.trim() ?? '';
  }

  async *streamTokens(
    messages: LlmMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const response = await this.postChat(
      {
        model: this.model,
        stream: true,
        max_tokens: CHAT_GENERATION_MAX_TOKENS,
        messages,
      },
      signal,
    );
    if (!response.body) {
      throw new Error('Chat stream is empty');
    }
    yield* this.readOpenAiSse(response.body);
  }

  private async postChat(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Chat request failed (${response.status}): ${text.slice(0, 400)}`,
      );
    }
    return response;
  }

  private async *readOpenAiSse(
    body: ReadableStream<Uint8Array>,
  ): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const token = this.deltaFromSseLine(line);
        if (token) {
          yield token;
        }
      }
    }

    const tail = this.deltaFromSseLine(buffer);
    if (tail) {
      yield tail;
    }
  }

  private deltaFromSseLine(rawLine: string): string | null {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) {
      return null;
    }
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') {
      return null;
    }
    try {
      const payload = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      return payload.choices?.[0]?.delta?.content || null;
    } catch (error) {
      this.logger.warn(`skip malformed chat chunk: ${String(error)}`);
      return null;
    }
  }
}
