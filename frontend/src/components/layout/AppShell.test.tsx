import { render, screen, within } from '@testing-library/react';
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

const mockApi = (handlers: Record<string, Handler>) => {
  const fetchMock = vi.fn((url: string) => {
    const handler = handlers[url.replace(/^\/api/, '')];
    return Promise.resolve(handler ? handler() : json(404, { error: 'Ressource introuvable' }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderSignedIn = (path: string) => {
  mockApi({
    '/auth/me': () => json(200, ACCOUNT),
    '/stats/dashboard': () => json(200, EMPTY_DASHBOARD),
    '/auth/logout': () => new Response(null, { status: 204 }),
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

  it('[ENF-UTI-02] marks the current screen with aria-current', async () => {
    renderSignedIn('/candidatures');

    expect(await screen.findByRole('link', { name: /Candidatures/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Tableau de bord/ })).not.toHaveAttribute('aria-current');
  });

  it('[EF-AUT-04] signs out from the shell and returns to the login page', async () => {
    renderSignedIn('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tableau de bord' });

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByRole('heading', { name: 'Bon retour.' })).toBeInTheDocument();
  });

  it("[EF-AUT-06] never shows the previous session's applications to the next account", async () => {
    const FIRST_PAGE = '/applications?limit=100&offset=0';
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
      '/auth/me': () => json(200, ACCOUNT),
      '/stats/dashboard': () => json(200, EMPTY_DASHBOARD),
      [FIRST_PAGE]: () => answerApplications(),
      '/auth/logout': () => new Response(null, { status: 204 }),
      '/auth/login': () => json(200, OTHER_ACCOUNT),
    });
    render(
      <MemoryRouter initialEntries={['/candidatures']} future={ROUTER_FUTURE}>
        <App />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await screen.findByRole('region', { name: 'Atelier Nova' });

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await screen.findByRole('heading', { name: 'Bon retour.' });
    answerApplications = () => new Promise<Response>(() => undefined);
    await user.type(screen.getByLabelText('Adresse e-mail'), OTHER_ACCOUNT.email);
    await user.type(screen.getByLabelText('Mot de passe'), 'another-long-password');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await user.click(await screen.findByRole('link', { name: /Candidatures/ }));

    expect(await screen.findByText('Chargement des candidatures…')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Atelier Nova' })).not.toBeInTheDocument();
  });

  it("[EF-AUT-06] never shows the previous session's figures to the next account", async () => {
    let answerDashboard: Handler = () =>
      json(200, { ...EMPTY_DASHBOARD, totals: { applications: 12, reachedInterview: 0, responseRate: 0 } });
    mockApi({
      '/auth/me': () => json(200, ACCOUNT),
      '/stats/dashboard': () => answerDashboard(),
      '/auth/logout': () => new Response(null, { status: 204 }),
      '/auth/login': () => json(200, OTHER_ACCOUNT),
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
    await screen.findByRole('heading', { name: 'Bon retour.' });
    answerDashboard = () => new Promise<Response>(() => undefined);
    await user.type(screen.getByLabelText('Adresse e-mail'), OTHER_ACCOUNT.email);
    await user.type(screen.getByLabelText('Mot de passe'), 'another-long-password');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('Chargement du tableau de bord…')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Indicateurs clés' })).not.toBeInTheDocument();
  });
});
