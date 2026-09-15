import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  getAccessToken,
  getRefreshToken,
  notifyUnauthorized,
  persistSession,
} from '../auth/tokens';
import type { RefreshResponse } from '../types';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const AUTH_SKIP_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh'];

export const authClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

let refreshPromise: Promise<RefreshResponse | null> | null = null;

function shouldSkipRefresh(url?: string) {
  if (!url) {
    return false;
  }
  return AUTH_SKIP_REFRESH.some((path) => url.includes(path));
}

async function doRefresh(): Promise<RefreshResponse | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const { data } = await authClient.post<RefreshResponse>('/auth/refresh', {
      refreshToken,
    });

    if (!data.accessToken || !data.refreshToken) {
      notifyUnauthorized();
      return null;
    }

    persistSession(data);
    return data;
  } catch {
    notifyUnauthorized();
    return null;
  }
}

export function requestTokenRefresh() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retry ||
      shouldSkipRefresh(original.url)
    ) {
      return Promise.reject(error);
    }

    original._retry = true;
    const session = await requestTokenRefresh();
    if (!session?.accessToken) {
      return Promise.reject(error);
    }

    original.headers.Authorization = `Bearer ${session.accessToken}`;
    return api(original);
  },
);
