import type { Hotel, SearchQuery } from '../types';
import { api } from './client';

export function fetchHotels(params: SearchQuery) {
  return api.get<{ items: Hotel[]; query: SearchQuery }>('/hotels', { params });
}

export function fetchHotel(id: string) {
  return api.get<Hotel>(`/hotels/${id}`);
}
