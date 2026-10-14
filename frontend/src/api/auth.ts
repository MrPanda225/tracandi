import { request } from './client';

/** Account of the signed-in user (`GET /api/auth/me`). */
export interface Account {
  id: number;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}

/** EF-AUT-01, EF-AUT-14: creates the account inactive and sends its activation e-mail; opens no session. */
export const registerAccount = (credentials: Credentials) =>
  request<{ id: number }>('/auth/register', { method: 'POST', body: credentials });

/**
 * EF-AUT-03: opens a session.
 * @throws ApiError with `code: 'account_not_activated'` (status 403) for an existing, still inactive account.
 */
export const logIn = (credentials: Credentials) =>
  request<Account>('/auth/login', { method: 'POST', body: credentials });

/**
 * EF-AUT-14: consumes the activation code from the e-mail link.
 * @throws ApiError with `code` one of `activation_code_expired`, `activation_code_already_used`,
 * `activation_code_invalid`.
 */
export const activateAccount = (code: string) =>
  request<undefined>('/auth/activate', { method: 'POST', body: { code } });

/**
 * EF-AUT-15: asks for a new activation e-mail. Always resolves the same way whether or not the address has a
 * pending activation — the API never reveals which (RG) — except when the API itself refuses with 429.
 */
export const resendActivation = (email: string) =>
  request<undefined>('/auth/activate/resend', { method: 'POST', body: { email } });

/** EF-AUT-04: closes the session on the server. */
export const logOut = () => request<undefined>('/auth/logout', { method: 'POST' });

/** EF-AUT-08: current account; fails with status 401 without a valid session. */
export const fetchAccount = () => request<Account>('/auth/me');

/** EF-AUT-13: account of the current session, `null` for a visitor — never a 401 in the browser console. */
export const fetchSession = async (signal?: AbortSignal): Promise<Account | null> =>
  (await request<{ account: Account | null }>('/auth/session', { signal })).account;
