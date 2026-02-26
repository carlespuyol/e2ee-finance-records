import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { loadSession, clearSession } from '../services/keystore';

interface AuthUser {
  id: number;
  email: string;
}

export interface AuthState {
  token: string;
  user: AuthUser;
  cryptoKey: CryptoKey;
}

interface AuthContextValue {
  auth: AuthState | null;
  setAuth: (state: AuthState | null) => void;
  logout: () => void;
  /** True while the persisted session is being restored from IndexedDB on first load. */
  isRestoring: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // On mount: attempt to restore a saved session (localStorage JWT + IndexedDB CryptoKey).
  // If the JWT has expired or the CryptoKey is missing, the session is discarded.
  useEffect(() => {
    loadSession()
      .then(session => {
        if (session) {
          setAuthState({
            token: session.token,
            user: { id: session.userId, email: session.email },
            cryptoKey: session.cryptoKey,
          });
        }
      })
      .catch(() => {
        // IndexedDB or localStorage error — start with no session
      })
      .finally(() => setIsRestoring(false));
  }, []);

  const setAuth = useCallback((state: AuthState | null) => {
    setAuthState(state);
    if (state === null) clearSession();
  }, []);

  const logout = useCallback(() => {
    setAuthState(null);
    clearSession();
  }, []);

  return (
    <AuthContext.Provider value={{ auth, setAuth, logout, isRestoring }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
