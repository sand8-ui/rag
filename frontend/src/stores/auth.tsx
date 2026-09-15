import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { logout as logoutRequest } from '../api/auth';
import { requestTokenRefresh } from '../api/client';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  persistSession,
  setOnUnauthorized,
} from '../auth/tokens';
import type { AuthResponse, User } from '../types';

type AuthContextValue = {
  isReady: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  user: User | null;
  login: (session: AuthResponse) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const login = useCallback((session: AuthResponse) => {
    persistSession(session);
    setAccessTokenState(session.accessToken);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await logoutRequest(refreshToken);
      } catch {
        // Local session still needs to be cleared.
      }
    }
    clearSession();
    setAccessTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      setAccessTokenState(null);
      setUser(null);
    });
    return () => setOnUnauthorized(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearSession();
        if (!cancelled) {
          setIsReady(true);
        }
        return;
      }

      const session = await requestTokenRefresh();
      if (cancelled) {
        return;
      }
      if (session?.accessToken) {
        setAccessTokenState(getAccessToken());
        setUser(session.user ?? getStoredUser());
      } else {
        setAccessTokenState(null);
        setUser(null);
      }
      setIsReady(true);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      isAuthenticated: Boolean(accessToken),
      accessToken,
      user,
      login,
      logout,
    }),
    [accessToken, isReady, login, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
