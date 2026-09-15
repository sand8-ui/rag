import { isAxiosError } from 'axios';
import type { AuthResponse } from '../types';
import { authClient } from './client';

export function login(email: string, password: string) {
  return authClient.post<AuthResponse>('/auth/login', { email, password });
}

export function register(email: string, password: string, name?: string) {
  return authClient.post<AuthResponse>('/auth/register', { email, password, name });
}

export function logout(refreshToken: string) {
  return authClient.post('/auth/logout', { refreshToken });
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && !isAxiosError(error)) {
    return error.message;
  }
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (typeof data?.message === 'string') {
      return data.message;
    }
    if (Array.isArray(data?.message)) {
      return data.message.join('，');
    }
  }
  return fallback;
}
