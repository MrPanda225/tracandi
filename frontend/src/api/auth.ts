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

/** EF-AUT-01: creates the account and opens a session (cookie set by the API). */
export const registerAccount = (credentials: Credentials) =>
  request<{ id: number }>('/auth/register', { method: 'POST', body: credentials });

/** EF-AUT-03: opens a session. */
export const logIn = (credentials: Credentials) =>
  request<Account>('/auth/login', { method: 'POST', body: credentials });

/** EF-AUT-04: closes the session on the server. */
export const logOut = () => request<undefined>('/auth/logout', { method: 'POST' });

/** EF-AUT-08: current account; fails with status 401 without a valid session. */
export const fetchAccount = (signal?: AbortSignal) => request<Account>('/auth/me', { signal });
