import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChatCitation } from './chat-context';
import type { SessionSlots } from './chat-slots';
import { CHAT_HISTORY_LOAD_LIMIT } from './chat-tokens';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });
  }

  async getOwned(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
    });
    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }
    return conversation;
  }

  async getWithMessages(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }
    return conversation;
  }

  create(userId: string, title = '新对话') {
    return this.prisma.conversation.create({
      data: { userId, title },
    });
  }

  async addMessage(options: {
    conversationId: string;
    role: ChatMessageRole;
    content: string;
    citations?: ChatCitation[];
    title?: string;
  }) {
    const { conversationId, role, content, citations, title } = options;
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          conversationId,
          role,
          content,
          citations:
            citations === undefined
              ? undefined
              : (citations as Prisma.InputJsonValue),
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          ...(title ? { title } : {}),
        },
      }),
    ]);
    return message;
  }

  listRecentTurns(conversationId: string, take = CHAT_HISTORY_LOAD_LIMIT) {
    return this.prisma.chatMessage
      .findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          role: true,
          content: true,
        },
      })
      .then((rows) => rows.reverse());
  }

  updateMemory(
    conversationId: string,
    memory: { slots?: SessionSlots; summary?: string | null },
  ) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(memory.slots !== undefined
          ? { slots: memory.slots as Prisma.InputJsonValue }
          : {}),
        ...(memory.summary !== undefined ? { summary: memory.summary } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.prisma.conversation.delete({ where: { id } });
    return { ok: true };
  }
}
