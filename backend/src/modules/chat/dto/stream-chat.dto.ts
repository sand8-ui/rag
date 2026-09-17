import { z } from 'zod';

export const streamChatSchema = z
  .object({
    conversationId: z.string().trim().min(1).max(64).optional(),
    content: z.string().trim().min(1, '消息不能为空').max(4000),
  })
  .strict();

export type StreamChatDto = z.infer<typeof streamChatSchema>;
