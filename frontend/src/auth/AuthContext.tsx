import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  type Account,
  type Credentials,
  confirmLoginCode,
  fetchSession,
  logOut,
  registerAccount,
  requestLoginCode,
} from '../api/auth';
import { ApiError } from '../api/client';

type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; account: Account };

interface AuthContextValue {
  state: AuthState;
  /**
   * EF-AUT-14: creates the account, inactive and without a session — the caller shows its own "check your e-mail"
   * state instead of waiting for `state` to change. Rejects with an ApiError carrying a French message.
   */
  register: (credentials: Credentials) => Promise<void>;
  /**
   * EF-AUT-16: login step one. Resolves with the challenge to send back with the e-mailed code; the session state is
   * unchanged. Rejects with an ApiError carrying a French message.
   */
  requestLoginCode: (credentials: Credentials) => Promise<string>;
  /** EF-AUT-16: login step two. The state only becomes authenticated once the code is accepted. */
  confirmLoginCode: (challenge: string, code: string) => Promise<void>;
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

  const register = useCallback(async (credentials: Credentials) => {
    await registerAccount(credentials);
  }, []);

  const startLogin = useCallback(
    async (credentials: Credentials) => (await requestLoginCode(credentials)).challenge,
    [],
  );

  const finishLogin = useCallback(async (challenge: string, code: string) => {
    const account = await confirmLoginCode(challenge, code);
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
    () => ({
      state,
      register,
      requestLoginCode: startLogin,
      confirmLoginCode: finishLogin,
      signOut,
      forgetAccount,
    }),
    [state, register, startLogin, finishLogin, signOut, forgetAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access to the session state; must be used under AuthProvider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
