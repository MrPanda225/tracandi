import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '../../lib/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';

const ACCOUNT = { id: 1, email: 'alex.martin@example.com' };
const PASSWORD = 'une phrase de passe longue';
const CHALLENGE = 'challenge-opaque';

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

/** Fills the login form with a correct password and waits for the code step; `extra` adds or overrides routes. */
const toCodeStep = async (extra: Record<string, Handler> = {}) => {
  const fetchMock = mockApi({
    '/auth/session': () => json(200, { account: null }),
    '/auth/login': () => json(200, { challenge: CHALLENGE }),
    ...extra,
  });
  renderAt('/connexion');
  await screen.findByRole('heading', { name: 'Bon retour.' });
  const user = await fillCredentials(ACCOUNT.email, PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
  await screen.findByRole('heading', { name: 'Entrez votre code' });
  return fetchMock;
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

    expect(await screen.findByRole('tab', { name: 'Créer un compte' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('[EF-AUT-03] [EF-AUT-16] asks for the e-mailed code after the password, and opens no session yet', async () => {
    const fetchMock = mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/login': () => json(200, { challenge: CHALLENGE }),
    });
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });

    const user = await fillCredentials('Alex.Martin@example.com ', PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('heading', { name: 'Entrez votre code' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).not.toBeInTheDocument();
    const code = screen.getByLabelText('Code de connexion');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('maxlength', '6');
    const loginCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login');
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      email: 'Alex.Martin@example.com',
      password: PASSWORD,
    });
  });

  it('[EF-AUT-16] logs in and lands on the dashboard once the code is confirmed', async () => {
    const fetchMock = mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/login': () => json(200, { challenge: CHALLENGE }),
      '/auth/login/verify': () => json(200, ACCOUNT),
      '/stats/dashboard': () => json(200, EMPTY_DASHBOARD),
    });
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });
    const user = await fillCredentials(ACCOUNT.email, PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: 'Entrez votre code' });

    await user.type(screen.getByLabelText('Code de connexion'), '04a2517');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT.email)).toBeInTheDocument();
    const verifyCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login/verify');
    expect(JSON.parse(String(verifyCall?.[1]?.body))).toEqual({ challenge: CHALLENGE, code: '042517' });
  });

  it('[EF-AUT-16] checks locally that the code holds six digits before calling the API', async () => {
    const fetchMock = await toCodeStep();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Code de connexion'), '123');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez les 6 chiffres');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/login/verify')).toBe(false);
  });

  it('[EF-AUT-16] shows a wrong code with attempts left and stays on the code step', async () => {
    await toCodeStep({
      '/auth/login/verify': () =>
        json(401, { error: 'Code incorrect. Vérifiez-le et réessayez.', code: 'login_code_invalid' }),
    });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Code de connexion'), '111111');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect');
    expect(screen.getByRole('heading', { name: 'Entrez votre code' })).toBeInTheDocument();
    expect(screen.getByLabelText('Code de connexion')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Valider' })).toBeEnabled();
  });

  it.each([
    ['login_code_locked', 'Trop de codes incorrects : ce code n’est plus valable.'],
    ['login_code_expired', 'Ce code a expiré.'],
  ])('[EF-AUT-16] [ENF-SEC-26] goes back to the password step with a message on %s', async (code, error) => {
    await toCodeStep({ '/auth/login/verify': () => json(401, { error, code }) });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Code de connexion'), '111111');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByRole('heading', { name: 'Bon retour.' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(error);
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue(ACCOUNT.email);
    expect(screen.getByLabelText('Mot de passe')).toHaveValue('');
  });

  it('[EF-AUT-17] asks for a new code with the resend button and confirms it', async () => {
    const fetchMock = await toCodeStep({ '/auth/login/resend': () => json(204) });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Renvoyer le code' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Un nouveau code vient d’être envoyé');
    const resendCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login/resend');
    expect(JSON.parse(String(resendCall?.[1]?.body))).toEqual({ challenge: CHALLENGE });
  });

  it('[EF-AUT-17] shows the rate limit message when the API refuses a fourth resend', async () => {
    await toCodeStep({
      '/auth/login/resend': () => json(429, { error: 'Trop de demandes, réessayez dans une minute' }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Renvoyer le code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de demandes');
    expect(screen.getByRole('heading', { name: 'Entrez votre code' })).toBeInTheDocument();
  });

  it('[ENF-UTI-03] disables the buttons and shows a waiting state while the code is checked', async () => {
    let answer: (response: Response) => void = () => undefined;
    await toCodeStep({ '/auth/login/verify': () => new Promise<Response>((resolve) => (answer = resolve)) });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Code de connexion'), '042517');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    const pending = await screen.findByRole('button', { name: 'Vérification…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Renvoyer le code' })).toBeDisabled();
    answer(json(401, { error: 'Code incorrect.', code: 'login_code_invalid' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('[EF-AUT-16] lets the user go back from the code step to the password step', async () => {
    await toCodeStep();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Retour à la connexion' }));

    expect(await screen.findByRole('heading', { name: 'Bon retour.' })).toBeInTheDocument();
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

    expect(
      await screen.findByText(/Si cette adresse a un compte en attente d’activation/),
    ).toBeInTheDocument();
    const resendCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/activate/resend');
    expect(JSON.parse(String(resendCall?.[1]?.body))).toEqual({ email: ACCOUNT.email });
  });

  it('[EF-AUT-14] refuses an inactive account at login with a message and a resend button', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: null }),
      '/auth/login': () =>
        json(403, { error: 'Ce compte n’est pas encore activé.', code: 'account_not_activated' }),
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
