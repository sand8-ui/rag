import { Injectable, Logger } from '@nestjs/common';
import { ChatMessageRole, ChunkStrategy } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  RetrieverService,
  type RetrievedChunk,
} from '../knowledge/retriever.service';
import {
  CHAT_RETRIEVE_K,
  toCitations,
  trimRetrieved,
  type ChatCitation,
  type LlmMessage,
} from './chat-context';
import { packChatContext } from './chat-pack';
import {
  REFUSE_REPLY,
  buildRouterMessages,
  parseChatRoute,
} from './chat-router';
import { ChatLlmService } from './chat-llm.service';
import { asSlots, collectSlots } from './chat-slots';
import { buildSummaryPrompt } from './chat-window';
import { ConversationService } from './conversation.service';
import type { StreamChatDto } from './dto/stream-chat.dto';

export type ChatSsePayload = {
  token: string;
  done: boolean;
  error?: string;
  conversationId?: string;
  citations?: ChatCitation[];
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatLlmService: ChatLlmService,
    private readonly conversations: ConversationService,
    private readonly retriever: RetrieverService,
  ) {}

  listConversations(userId: string) {
    return this.conversations.list(userId);
  }

  async getConversation(userId: string, id: string) {
    const conversation = await this.conversations.getWithMessages(userId, id);
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        citations: (message.citations as ChatCitation[] | null) ?? undefined,
        createdAt: message.createdAt,
      })),
    };
  }

  removeConversation(userId: string, id: string) {
    return this.conversations.remove(userId, id);
  }

  async writeSse(
    userId: string,
    dto: StreamChatDto,
    req: Request,
    res: Response,
  ): Promise<void> {
    const conversation = dto.conversationId
      ? await this.conversations.getOwned(userId, dto.conversationId)
      : await this.conversations.create(userId, titleFrom(dto.content));

    await this.conversations.addMessage({
      conversationId: conversation.id,
      role: ChatMessageRole.user,
      content: dto.content,
      title:
        conversation.title === '新对话' ? titleFrom(dto.content) : undefined,
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    const onClose = () => abort.abort();
    req.on('close', onClose);

    const write = (payload: ChatSsePayload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      write({ token: '', done: false, conversationId: conversation.id });

      const history = await this.conversations.listRecentTurns(conversation.id);
      const slots = collectSlots(
        history
          .filter((turn) => turn.role === ChatMessageRole.user)
          .map((turn) => turn.content),
        asSlots(conversation.slots),
      );
      await this.conversations.updateMemory(conversation.id, { slots });

      const route = await this.routeQuestion(history, abort.signal);
      this.logger.log(`chat route=${route}`);
      if (abort.signal.aborted) {
        return;
      }

      if (route === 'refuse') {
        write({ token: REFUSE_REPLY, done: false, conversationId: conversation.id });
        await this.conversations.addMessage({
          conversationId: conversation.id,
          role: ChatMessageRole.assistant,
          content: REFUSE_REPLY,
        });
        write({ token: '', done: true, conversationId: conversation.id });
        return;
      }

      const retrieved = trimRetrieved(await this.retrieveKnowledge(dto.content));
      const citations = retrieved ? toCitations(retrieved) : [];
      write({
        token: '',
        done: false,
        conversationId: conversation.id,
        citations,
      });

      const packed = await packChatContext({
        history,
        retrieved,
        slots,
        summary: conversation.summary,
        mode: 'full',
        summarize: async (previous, overflow) => {
          const summary = await this.summarizeOverflow(
            previous,
            overflow,
            abort.signal,
          );
          await this.conversations.updateMemory(conversation.id, { summary });
          return summary;
        },
      });
      this.logger.log(
        `context tokens≈${packed.tokens} kept=${packed.kept} overflow=${packed.overflow}`,
      );
      const messages = packed.messages;

      let assistant = '';
      for await (const token of this.chatLlmService.streamTokens(
        messages,
        abort.signal,
      )) {
        if (abort.signal.aborted) {
          break;
        }
        assistant += token;
        write({ token, done: false });
      }

      if (assistant.trim()) {
        await this.conversations.addMessage({
          conversationId: conversation.id,
          role: ChatMessageRole.assistant,
          content: assistant,
          citations,
        });
      }

      if (!abort.signal.aborted) {
        write({ token: '', done: true, conversationId: conversation.id });
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        const message =
          error instanceof Error ? error.message : '聊天服务暂时不可用';
        this.logger.error(message);
        write({ token: '', done: true, error: message });
      }
    } finally {
      req.off('close', onClose);
      res.end();
    }
  }

  private async summarizeOverflow(
    previous: string | null,
    overflow: LlmMessage[],
    signal: AbortSignal,
  ) {
    try {
      const summary = await this.chatLlmService.complete(
        buildSummaryPrompt(previous, overflow),
        signal,
        { maxTokens: 220 },
      );
      return summary || previous;
    } catch (error) {
      this.logger.warn(
        `summary failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return previous;
    }
  }

  private async routeQuestion(
    history: LlmMessage[],
    signal: AbortSignal,
  ) {
    const raw = await this.chatLlmService.complete(
      buildRouterMessages(history),
      signal,
    );
    return parseChatRoute(raw);
  }

  private async retrieveKnowledge(
    query: string,
  ): Promise<RetrievedChunk[] | null> {
    try {
      return await this.retriever.retrieve({
        query,
        strategy: ChunkStrategy.heading,
        mode: 'hybrid',
        k: CHAT_RETRIEVE_K,
      });
    } catch (error) {
      this.logger.warn(
        `retrieve failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

function titleFrom(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}…` : compact;
}
