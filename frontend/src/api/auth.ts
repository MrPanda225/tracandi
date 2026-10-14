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
 * EF-AUT-03, EF-AUT-16: step one of the login. A correct password opens no session: the API e-mails a six-digit code
 * and returns the opaque challenge to send back with it.
 * @throws ApiError with `code: 'account_not_activated'` (status 403) for an existing, still inactive account.
 */
export const requestLoginCode = (credentials: Credentials) =>
  request<{ challenge: string }>('/auth/login', { method: 'POST', body: credentials });

/**
 * EF-AUT-16: step two of the login. Opens the session (cookie set by the API) when the code is right.
 * @throws ApiError with `code` one of `login_code_invalid` (attempts remain), `login_code_locked`,
 * `login_code_expired` (status 401).
 */
export const confirmLoginCode = (challenge: string, code: string) =>
  request<Account>('/auth/login/verify', { method: 'POST', body: { challenge, code } });

/** EF-AUT-17: asks for a new code for a pending login; the API answers 429 past three requests a minute. */
export const resendLoginCode = (challenge: string) =>
  request<undefined>('/auth/login/resend', { method: 'POST', body: { challenge } });

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
