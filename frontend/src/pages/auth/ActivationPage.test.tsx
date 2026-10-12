import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { ROUTER_FUTURE } from '../../lib/router';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Handler = (method: string, body: unknown) => Response | Promise<Response>;

/** Fake API: one handler per path, `/auth/session` answers anonymous unless overridden; any other path is a 404. */
const mockApi = (handlers: Record<string, Handler>) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const path = url.replace(/^\/api/, '');
    const handler = handlers[path];
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    return Promise.resolve(
      handler ? handler(init?.method ?? 'GET', body) : json(404, { error: 'Ressource introuvable' }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ActivationPage', () => {
  it('[EF-AUT-14] activates the account and links to the login page', async () => {
    const fetchMock = mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/activate': () => json(204),
    });

    renderAt('/activation?code=le-code-recu-par-mail');

    expect(await screen.findByRole('heading', { name: 'Compte activé' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aller à la connexion' })).toHaveAttribute('href', '/connexion');
    const activateCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/activate');
    expect(JSON.parse(String(activateCall?.[1]?.body))).toEqual({ code: 'le-code-recu-par-mail' });
  });

  it('[EF-AUT-14] shows a waiting state before the API answers', async () => {
    let answer: (response: Response) => void = () => undefined;
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/activate': () => new Promise<Response>((resolve) => (answer = resolve)),
    });

    renderAt('/activation?code=un-code');

    expect(await screen.findByRole('status')).toHaveTextContent('Activation de votre compte');
    answer(json(204));
    expect(await screen.findByRole('heading', { name: 'Compte activé' })).toBeInTheDocument();
  });

  it('[EF-AUT-14] tells an expired link apart from an already used one', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/activate': () => json(400, { error: 'Expiré', code: 'activation_code_expired' }),
    });

    renderAt('/activation?code=expire');

    expect(await screen.findByRole('heading', { name: 'Lien expiré' })).toBeInTheDocument();
  });

  it('[EF-AUT-14] shows the already-used state for a code consumed twice', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/activate': () => json(400, { error: 'Déjà utilisé', code: 'activation_code_already_used' }),
    });

    renderAt('/activation?code=deja-utilise');

    expect(await screen.findByRole('heading', { name: 'Lien déjà utilisé' })).toBeInTheDocument();
  });

  it('[EF-AUT-14] shows a generic failure for an invalid code or any other failure', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/activate': () => json(400, { error: 'Invalide', code: 'activation_code_invalid' }),
    });

    renderAt('/activation?code=inconnu');

    expect(await screen.findByRole('heading', { name: 'Activation impossible' })).toBeInTheDocument();
  });

  it('[EF-AUT-14] shows the generic failure without calling the API when the link carries no code', async () => {
    const fetchMock = mockApi({ '/auth/session': () => json(200, { account: null }) });

    renderAt('/activation');

    expect(await screen.findByRole('heading', { name: 'Activation impossible' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/activate')).toBe(false);
  });

  it('[ENF-UTI-01] is entirely in French', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/activate': () => json(204),
    });

    renderAt('/activation?code=un-code');

    expect(await screen.findAllByText(/activé/)).not.toHaveLength(0);
  });
});
