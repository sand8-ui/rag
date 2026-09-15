import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');

export const updateOrderSchema = z
  .object({
    checkIn: dateString.optional(),
    checkOut: dateString.optional(),
  })
  .strict();

export type UpdateOrderDto = z.infer<typeof updateOrderSchema>;
