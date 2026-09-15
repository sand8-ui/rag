import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.string().email('邮箱格式不正确'),
    password: z.string().min(6, '密码至少 6 位'),
  })
  .strict();

export type LoginDto = z.infer<typeof loginSchema>;
