import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '../../lib/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';

const ACCOUNT = { id: 1, email: 'alex.martin@example.com' };
const PASSWORD = 'une phrase de passe longue';

// Empty dashboard: enough for the shell to render past its loading state in tests unrelated to its content.
const EMPTY_DASHBOARD = {
  totals: { applications: 0, reachedInterview: 0, responseRate: 0 },
  byStatus: [],
  byChannel: { direct: 0, platform: 0 },
  byContractType: [],
  weekly: [],
  followUps: { total: 0, items: [] },
  offers: { newAboveThreshold: 0, threshold: 60 },
  followUpDays: 10,
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Handler = (method: string, body: unknown) => Response | Promise<Response>;

/** Fake API: one handler per path; any other path answers 404. */
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

const fillCredentials = async (email: string, password: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Adresse e-mail'), email);
  await user.type(screen.getByLabelText('Mot de passe'), password);
  return user;
};

beforeEach(() => {
  mockApi({ '/auth/session': () => json(200, { account: null }) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthPage', () => {
  it('[EF-SEO-01] gives the login page its own title and description', async () => {
    renderAt('/connexion');
    await screen.findByRole('heading', { level: 2 });

    // The page names itself in an effect, which may run just after its heading is painted.
    await waitFor(() => expect(document.title).toBe('Connexion — Tracandi'));
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toMatch(
      /Connectez-vous à Tracandi/,
    );
  });

  it('[ENF-PERF-07] keeps the login form a form, inside the panel of the selected tab', async () => {
    renderAt('/connexion');

    const panel = await screen.findByRole('tabpanel', { name: 'Connexion' });
    expect(within(panel).getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(panel.querySelector('form')).not.toBeNull();
  });

  it('[ENF-UTI-01] shows the login form in French', async () => {
    renderAt('/connexion');

    expect(await screen.findByRole('heading', { name: 'Bon retour.' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Connexion' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Chaque candidature mérite une suite.',
    );
  });

  it('[EF-AUT-05] redirects a signed-out user from a screen of the application to the login page', async () => {
    renderAt('/candidatures');

    expect(await screen.findByRole('heading', { name: 'Bon retour.' })).toBeInTheDocument();
  });

  it('[EF-AUT-10] opens on account creation when asked by the address', async () => {
    renderAt('/connexion?mode=inscription');

    expect(await screen.findByRole('tab', { name: 'Créer un compte' })).toHaveAttribute('aria-selected', 'true');
  });

  it('[EF-AUT-03] logs in and lands on the dashboard', async () => {
    const fetchMock = mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/login': () => json(200, ACCOUNT),
      '/stats/dashboard': () => json(200, EMPTY_DASHBOARD),
    });
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });

    const user = await fillCredentials('Alex.Martin@example.com ', PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT.email)).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login');
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      email: 'Alex.Martin@example.com',
      password: PASSWORD,
    });
  });

  it('[EF-AUT-03] shows the API message when the credentials are refused, and stays on the page', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/login': () => json(401, { error: 'Adresse e-mail ou mot de passe incorrect' }),
    });
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });

    const user = await fillCredentials(ACCOUNT.email, 'mauvais mot de passe');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Adresse e-mail ou mot de passe incorrect');
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
  });

  it('[ENF-UTI-03] disables the button and shows a waiting state during the request', async () => {
    let answer: (response: Response) => void = () => undefined;
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/login': () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });

    const user = await fillCredentials(ACCOUNT.email, PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    const pending = await screen.findByRole('button', { name: 'Connexion…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    answer(json(401, { error: 'Adresse e-mail ou mot de passe incorrect' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('[ENF-SEC-04] checks the email locally before calling the API', async () => {
    const fetchMock = mockApi({ '/auth/session': () => json(200, { account: null }) });
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });

    const user = await fillCredentials('pas-une-adresse', PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(screen.getByText('Saisissez une adresse e-mail valide.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/login')).toBe(false);
  });

  it('[EF-AUT-01] [EF-AUT-14] creates an inactive account and shows the "check your e-mail" message', async () => {
    mockApi({ '/auth/session': () => json(200, { account: null }) });
    renderAt('/connexion');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Créer un compte' }));
    expect(screen.getByRole('heading', { name: 'Commençons.' })).toBeInTheDocument();
    const fetchMock = mockApi({ '/auth/register': () => json(201, { id: ACCOUNT.id }) });

    await fillCredentials(ACCOUNT.email, PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect(await screen.findByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT.email)).toBeInTheDocument();
    // EF-AUT-01: no session opened — the screens of the application never asked for.
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/me')).toBe(false);
    const registerCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/register');
    expect(JSON.parse(String(registerCall?.[1]?.body))).toEqual({ email: ACCOUNT.email, password: PASSWORD });
  });

  it('[EF-AUT-15] resends the activation e-mail from the "check your e-mail" screen', async () => {
    mockApi({ '/auth/session': () => json(200, { account: null }) });
    renderAt('/connexion');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Créer un compte' }));
    mockApi({ '/auth/register': () => json(201, { id: ACCOUNT.id }) });
    await fillCredentials(ACCOUNT.email, PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    await screen.findByRole('heading', { name: 'Vérifiez votre boîte mail' });
    const fetchMock = mockApi({ '/auth/activate/resend': () => json(204) });

    await user.click(screen.getByRole('button', { name: 'Renvoyer l’e-mail d’activation' }));

    expect(await screen.findByText(/Si cette adresse a un compte en attente d’activation/)).toBeInTheDocument();
    const resendCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/activate/resend');
    expect(JSON.parse(String(resendCall?.[1]?.body))).toEqual({ email: ACCOUNT.email });
  });

  it('[EF-AUT-14] refuses an inactive account at login with a message and a resend button', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/login': () => json(403, { error: 'Ce compte n’est pas encore activé.', code: 'account_not_activated' }),
    });
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });

    const user = await fillCredentials(ACCOUNT.email, PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce compte n’est pas encore activé.');
    expect(screen.getByRole('button', { name: 'Renvoyer l’e-mail d’activation' })).toBeInTheDocument();
  });

  it('[EF-AUT-02] refuses a password shorter than 12 characters when creating an account', async () => {
    const fetchMock = mockApi({ '/auth/session': () => json(200, { account: null }) });
    renderAt('/connexion');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Créer un compte' }));

    await fillCredentials(ACCOUNT.email, 'a'.repeat(11));
    expect(screen.getByText('12 caractères minimum — 11/12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect(screen.getByText('Le mot de passe doit contenir au moins 12 caractères.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/register')).toBe(false);
  });

  it('[EF-AUT-01] shows the conflict message of an address already used', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/register': () => json(409, { error: 'Un compte existe déjà avec cette adresse' }),
    });
    renderAt('/connexion');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Créer un compte' }));

    await fillCredentials(ACCOUNT.email, PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Un compte existe déjà avec cette adresse');
  });

  it('[ENF-UTI-01] shows and hides the password on demand', async () => {
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });
    const user = userEvent.setup();
    const toggle = screen.getByRole('button', { name: 'Afficher le mot de passe' });

    await user.click(toggle);

    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Masquer le mot de passe' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('[ENF-UTI-03] tells the user when the API cannot be reached', async () => {
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const user = await fillCredentials(ACCOUNT.email, PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('API injoignable');
  });
});
