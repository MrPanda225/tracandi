import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '../../lib/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';

const ACCOUNT = { id: 1, email: 'alex.martin@example.com' };
const OTHER_ACCOUNT = { id: 2, email: 'camille.durand@example.com' };
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

type Handler = () => Response | Promise<Response>;

const ALL_FEATURES: Handler = () => json(200, { features: ['watch', 'cv'] });

/** Every optional feature is enabled unless a test answers `/settings/features` itself (ENF-MAI-07). */
const mockApi = (handlers: Record<string, Handler>) => {
  const answers: Record<string, Handler> = { '/settings/features': ALL_FEATURES, ...handlers };
  const fetchMock = vi.fn((url: string) => {
    const handler = answers[url.replace(/^\/api/, '')];
    return Promise.resolve(handler ? handler() : json(404, { error: 'Ressource introuvable' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderSignedIn = (path: string, features: Handler = ALL_FEATURES) => {
  mockApi({
    '/auth/session': () => json(200, { account: ACCOUNT }),
    '/stats/dashboard': () => json(200, EMPTY_DASHBOARD),
    '/auth/logout': () => new Response(null, { status: 204 }),
    '/settings/features': features,
  });
  return render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>,
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('[T-003] renders every screen of the navigation with its own heading', async () => {
    renderSignedIn('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tableau de bord' });

    const screens: [string, string][] = [
      ['Candidatures', 'Candidatures'],
      ['Offres', 'Offres'],
      ['Sites surveillés', 'Sites surveillés'],
      ['Atelier CV', 'Atelier CV'],
      ['Réglages', 'Réglages'],
    ];
    for (const [link, heading] of screens) {
      await user.click(screen.getByRole('link', { name: new RegExp(link) }));
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('link', { name: /Tableau de bord/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument();
  });

  it('[ENF-MAI-07] keeps the six screens in the navigation when no optional feature runs, the closed ones said « bientôt »', async () => {
    renderSignedIn('/', () => json(200, { features: [] }));
    await screen.findByRole('heading', { name: 'Tableau de bord' });

    const navigation = within(screen.getByRole('navigation', { name: 'Navigation principale' }));
    await waitFor(() =>
      expect(navigation.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
        'Tableau de bord (Accueil)',
        'Candidatures (Suivi)',
        'Offres, bientôt',
        'Sites surveillés, bientôt',
        'Atelier CV, bientôt',
        'Réglages',
      ]),
    );
    expect(navigation.getAllByText('Bientôt')).toHaveLength(3);
  });

  it('[ENF-MAI-07] announces nothing « bientôt » once every optional feature runs', async () => {
    renderSignedIn('/', () => json(200, { features: ['watch', 'cv'] }));
    await screen.findByRole('heading', { name: 'Tableau de bord' });

    const navigation = within(screen.getByRole('navigation', { name: 'Navigation principale' }));
    await waitFor(() => expect(navigation.getByRole('link', { name: 'Offres' })).toBeInTheDocument());
    expect(navigation.queryByText('Bientôt')).toBeNull();
  });

  it('[ENF-MAI-07] shows a disabled screen as in preparation, without loading its content', async () => {
    const fetchMock = mockApi({
      '/auth/session': () => json(200, { account: ACCOUNT }),
      '/settings/features': () => json(200, { features: [] }),
    });
    render(
      <MemoryRouter initialEntries={['/atelier-cv']} future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Atelier CV' })).toBeInTheDocument();
    expect(screen.getByText('En préparation')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/profile');
  });

  it('[ENF-MAI-07] shows the watched sites as in preparation when the enabled features cannot be read', async () => {
    renderSignedIn('/sites', () => json(500, { error: 'Erreur interne' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sites surveillés' })).toBeInTheDocument();
    expect(screen.getByText('En préparation')).toBeInTheDocument();
  });

  it('[ENF-UTI-02] marks the current screen with aria-current', async () => {
    renderSignedIn('/candidatures');

    expect(await screen.findByRole('link', { name: /Candidatures/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Tableau de bord/ })).not.toHaveAttribute('aria-current');
  });

  it('[ENF-UTI-02] names each screen with the words it shows, whether the full label or the short one of a phone', async () => {
    renderSignedIn('/');
    await screen.findByRole('heading', { name: 'Tableau de bord' });

    // WCAG 2.5.3: « Suivi », shown on a phone, must be a word of the name a voice command can say.
    const link = screen.getByRole('link', { name: 'Candidatures (Suivi)' });
    expect(within(link).getByText('Suivi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tableau de bord (Accueil)' })).toBeInTheDocument();
    // A short label already in the full one adds nothing.
    expect(screen.getByRole('link', { name: 'Sites surveillés' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Réglages' })).toBeInTheDocument();
  });

  it('[EF-SEO-01] names the browser tab after the screen shown', async () => {
    renderSignedIn('/reglages');

    await screen.findByRole('heading', { level: 1, name: 'Réglages' });
    // The page names itself in an effect, which may run just after its heading is painted.
    await waitFor(() => expect(document.title).toBe('Réglages — Tracandi'));
  });

  it('[ENF-PERF-07] shows a screen of the core without waiting for the list of optional features', async () => {
    renderSignedIn('/reglages', () => new Promise<Response>(() => undefined));

    expect(await screen.findByRole('heading', { level: 1, name: 'Réglages' })).toBeInTheDocument();
  });

  it('[ENF-MAI-07] waits for the list of features before showing a screen of an optional one', async () => {
    renderSignedIn('/atelier-cv', () => new Promise<Response>(() => undefined));

    expect(await screen.findByText('Chargement de l’application…')).toBeInTheDocument();
    expect(screen.queryByText(/En préparation/)).not.toBeInTheDocument();
  });

  it('[EF-AUT-04] [EF-AUT-09] signs out from the shell and returns to the presentation of the service', async () => {
    renderSignedIn('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tableau de bord' });

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /^Postulez\.\sOn\ss’occupe\sdu\ssuivi\.$/ }),
    ).toBeInTheDocument();
  });

  it("[EF-AUT-06] never shows the previous session's applications to the next account", async () => {
    const FIRST_PAGE = '/applications?sort=applied_at&order=desc&limit=100&offset=0';
    let answerApplications: Handler = () =>
      json(200, {
        items: [
          {
            id: 1,
            company: { id: 1, name: 'Atelier Nova' },
            jobTitle: 'Développeur',
            contractType: 'cdi',
            status: 'sent',
            source: 'manual',
            platform: null,
            notes: null,
            appliedAt: '2026-09-01T09:00:00.000Z',
            lastActivityAt: '2026-09-01T09:00:00.000Z',
            isFollowUpDue: false,
          },
        ],
        total: 1,
      });
    mockApi({
      '/auth/session': () => json(200, { account: ACCOUNT }),
      '/stats/dashboard': () => json(200, EMPTY_DASHBOARD),
      [FIRST_PAGE]: () => answerApplications(),
      '/auth/logout': () => new Response(null, { status: 204 }),
      '/auth/login': () => json(200, { challenge: 'challenge-opaque' }),
      '/auth/login/verify': () => json(200, OTHER_ACCOUNT),
    });
    render(
      <MemoryRouter initialEntries={['/candidatures']} future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await screen.findAllByText('Atelier Nova');

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await screen.findByRole('heading', { name: 'Bon retour.' });
    answerApplications = () => new Promise<Response>(() => undefined);
    await user.type(screen.getByLabelText('Adresse e-mail'), OTHER_ACCOUNT.email);
    await user.type(screen.getByLabelText('Mot de passe'), 'another-long-password');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await user.type(await screen.findByLabelText('Code de connexion'), '042517');
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await user.click(await screen.findByRole('link', { name: /Candidatures/ }));

    expect(await screen.findByText('Chargement des candidatures…')).toBeInTheDocument();
    expect(screen.queryByText('Atelier Nova')).not.toBeInTheDocument();
  });

  it("[EF-AUT-06] never shows the previous session's figures to the next account", async () => {
    let answerDashboard: Handler = () =>
      json(200, { ...EMPTY_DASHBOARD, totals: { applications: 12, reachedInterview: 0, responseRate: 0 } });
    mockApi({
      '/auth/session': () => json(200, { account: ACCOUNT }),
      '/stats/dashboard': () => answerDashboard(),
      '/auth/logout': () => new Response(null, { status: 204 }),
      '/auth/login': () => json(200, { challenge: 'challenge-opaque' }),
      '/auth/login/verify': () => json(200, OTHER_ACCOUNT),
    });
    render(
      <MemoryRouter initialEntries={['/']} future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    const kpis = within(await screen.findByRole('group', { name: 'Indicateurs clés' }));
    expect(await kpis.findByText('12')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await user.click(within(await screen.findByRole('banner')).getByRole('link', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: 'Bon retour.' });
    answerDashboard = () => new Promise<Response>(() => undefined);
    await user.type(screen.getByLabelText('Adresse e-mail'), OTHER_ACCOUNT.email);
    await user.type(screen.getByLabelText('Mot de passe'), 'another-long-password');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await user.type(await screen.findByLabelText('Code de connexion'), '042517');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText('Chargement du tableau de bord…')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Indicateurs clés' })).not.toBeInTheDocument();
  });

  it('[Q-11] asks to reconnect Gmail on every screen once Google refused the authorisation', async () => {
    mockApi({
      '/auth/session': () => json(200, { account: ACCOUNT }),
      '/stats/dashboard': () => json(200, EMPTY_DASHBOARD),
      '/gmail/status': () =>
        json(200, {
          connected: true,
          emailAddress: ACCOUNT.email,
          connectedAt: '2026-09-15T09:00:00.000Z',
          lastSyncAt: '2026-09-21T09:00:00.000Z',
          applyLabels: true,
          lookbackDays: 30,
          authorizationExpired: true,
        }),
    });
    render(
      <MemoryRouter initialEntries={['/']} future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>,
    );
    const user = userEvent.setup();

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('L’autorisation Gmail a expiré : la synchronisation est en pause.');
    await user.click(within(banner).getByRole('link', { name: 'Reconnecter Gmail' }));

    expect(await screen.findByRole('heading', { name: 'Réglages' })).toBeInTheDocument();
  });

  it('[Q-11] shows no banner while the authorisation holds', async () => {
    renderSignedIn('/');

    await screen.findByRole('heading', { name: 'Tableau de bord' });

    expect(screen.queryByRole('link', { name: 'Reconnecter Gmail' })).not.toBeInTheDocument();
  });

  it('[ENF-PERF-07] shows the login page while the session is still being checked', async () => {
    let answerSession: (response: Response) => void = () => undefined;
    const session = new Promise<Response>((resolve) => (answerSession = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.endsWith('/auth/session') ? session : Promise.resolve(json(404, {})))),
    );
    render(
      <MemoryRouter initialEntries={['/connexion']} future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Bon retour.' })).toBeInTheDocument();

    answerSession(json(200, { account: ACCOUNT }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument();
  });
});
