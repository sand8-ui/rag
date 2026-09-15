import type { AuthResponse } from '../types';
import { api } from './client';

export function login(email: string, password: string) {
  return api.post<AuthResponse>('/auth/login', { email, password });
}

export function register(email: string, password: string, name?: string) {
  return api.post<AuthResponse>('/auth/register', { email, password, name });
}
