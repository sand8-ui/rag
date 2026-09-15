import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().email('邮箱格式不正确'),
    password: z.string().min(6, '密码至少 6 位'),
    name: z.string().min(1, '昵称不能为空').optional(),
  })
  .strict();

export type RegisterDto = z.infer<typeof registerSchema>;
