import type { Order } from '../types';
import { api } from './client';

export function fetchOrders() {
  return api.get<Order[]>('/orders');
}

export function createOrder(payload: {
  roomId: string;
  checkIn: string;
  checkOut: string;
}) {
  return api.post<Order>('/orders', payload);
}

export function updateOrder(
  id: string,
  payload: { checkIn?: string; checkOut?: string },
) {
  return api.patch<Order>(`/orders/${id}`, payload);
}

export function cancelOrder(id: string) {
  return api.delete<Order>(`/orders/${id}`);
}
