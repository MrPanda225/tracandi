import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type Account, type Credentials, fetchSession, logIn, logOut, registerAccount } from '../api/auth';
import { ApiError } from '../api/client';

export type AuthMode = 'login' | 'register';

type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; account: Account };

interface AuthContextValue {
  state: AuthState;
  /**
   * Logs in, or creates the account (EF-AUT-14: inactive, no session opened — the caller shows its own
   * "check your e-mail" state instead of waiting for `state` to change). Rejects with an ApiError carrying a
   * French message.
   */
  authenticate: (mode: AuthMode, credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
  /** EF-AUT-11: the account was deleted by the API — its session with it: the interface forgets it too. */
  forgetAccount: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Holds the session state of the whole interface; the session itself lives in an HttpOnly cookie (ADR-09). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchSession(controller.signal)
      .then((account) => setState(account ? { status: 'authenticated', account } : { status: 'anonymous' }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setState({ status: 'anonymous' });
      });
    return () => controller.abort();
  }, []);

  const authenticate = useCallback(async (mode: AuthMode, credentials: Credentials) => {
    // EF-AUT-14: registering no longer opens a session — the account stays inactive until its e-mail is confirmed.
    if (mode === 'register') {
      await registerAccount(credentials);
      return;
    }
    const account = await logIn(credentials);
    setState({ status: 'authenticated', account });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logOut();
    } catch (error) {
      // The local state is cleared anyway; an unreachable API must not keep the user "signed in" on screen.
      if (!(error instanceof ApiError)) throw error;
    }
    setState({ status: 'anonymous' });
  }, []);

  const forgetAccount = useCallback(() => setState({ status: 'anonymous' }), []);

  const value = useMemo(
    () => ({ state, authenticate, signOut, forgetAccount }),
    [state, authenticate, signOut, forgetAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access to the session state; must be used under AuthProvider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
