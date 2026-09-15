import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');

export const createOrderSchema = z
  .object({
    roomId: z.string().min(1, 'roomId 不能为空'),
    checkIn: dateString,
    checkOut: dateString,
  })
  .strict();

export type CreateOrderDto = z.infer<typeof createOrderSchema>;
