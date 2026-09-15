import type { RefreshResponse, User } from '../types';

const REFRESH_KEY = 'staywise_refresh_token';
const USER_KEY = 'staywise_user';
const LEGACY_TOKEN_KEY = 'hotel_token';
const LEGACY_USER_KEY = 'hotel_user';

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function persistSession(data: RefreshResponse) {
  accessToken = data.accessToken;
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  if (data.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }
}

export function clearSession() {
  accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

export function setOnUnauthorized(callback: (() => void) | null) {
  onUnauthorized = callback;
}

export function notifyUnauthorized() {
  clearSession();
  onUnauthorized?.();
}
