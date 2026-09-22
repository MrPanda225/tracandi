import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard } from '../../api/stats';
import { DashboardPage } from './DashboardPage';
import { DashboardCacheProvider } from './useDashboard';

const DASHBOARD: Dashboard = {
  totals: { applications: 12, reachedInterview: 5, responseRate: 42 },
  byStatus: [
    { status: 'to_apply', count: 1 },
    { status: 'sent', count: 6 },
    { status: 'acknowledged', count: 2 },
    { status: 'interview', count: 2 },
    { status: 'offer', count: 1 },
    { status: 'rejected', count: 0 },
  ],
  byChannel: { direct: 9, platform: 3 },
  byContractType: [
    { contractType: 'cdi', count: 8, responseRate: 50 },
    { contractType: 'alternance', count: 4, responseRate: 25 },
    { contractType: 'cdd', count: 0, responseRate: 0 },
    { contractType: 'job_etudiant', count: 0, responseRate: 0 },
    { contractType: 'autre', count: 0, responseRate: 0 },
    { contractType: 'non_precise', count: 0, responseRate: 0 },
  ],
  weekly: Array.from({ length: 16 }, (_, index) => ({
    weekStart: new Date(Date.UTC(2026, 5, 8 + index * 7)).toISOString(),
    sent: index === 15 ? 2 : 0,
    interviews: 0,
    rejected: 0,
  })),
  followUps: {
    total: 1,
    items: [
      {
        id: 7,
        company: 'Atelier Nova',
        jobTitle: 'Développeur',
        status: 'sent',
        lastActivityAt: '2026-09-01T09:00:00.000Z',
        daysSinceActivity: 21,
      },
    ],
  },
  offers: { newAboveThreshold: 7, threshold: 60 },
  followUpDays: 10,
};

const EMPTY_DASHBOARD: Dashboard = {
  ...DASHBOARD,
  totals: { applications: 0, reachedInterview: 0, responseRate: 0 },
  byStatus: DASHBOARD.byStatus.map((row) => ({ ...row, count: 0 })),
  byChannel: { direct: 0, platform: 0 },
  byContractType: DASHBOARD.byContractType.map((row) => ({ ...row, count: 0 })),
  weekly: DASHBOARD.weekly.map((week) => ({ ...week, sent: 0, interviews: 0, rejected: 0 })),
  followUps: { total: 0, items: [] },
  offers: { newAboveThreshold: 0, threshold: 60 },
};

const json = (status: number, body?: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const kpiGroup = () => screen.getByRole('group', { name: 'Indicateurs clés' });

const renderPage = () =>
  render(
    <DashboardCacheProvider>
      <DashboardPage />
    </DashboardCacheProvider>,
  );

/** Leaves the dashboard for another screen, then comes back, within the same session. */
const leaveAndComeBack = (rerender: (ui: ReactElement) => void) => {
  rerender(
    <DashboardCacheProvider>
      <p>Autre écran</p>
    </DashboardCacheProvider>,
  );
  rerender(
    <DashboardCacheProvider>
      <DashboardPage />
    </DashboardCacheProvider>,
  );
};

const pending = () => {
  let answer: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => (answer = resolve));
  return { response, answer: (value: Response) => answer(value) };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DashboardPage', () => {
  it('[ENF-UTI-03] shows a skeleton of the dashboard while the figures load', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Chargement du tableau de bord…');
    expect(screen.queryByRole('group', { name: 'Indicateurs clés' })).not.toBeInTheDocument();
  });

  it('[ENF-PERF-01] shows the last figures at once when coming back, then refreshes them', async () => {
    const refresh = pending();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json(200, DASHBOARD)).mockReturnValueOnce(refresh.response),
    );
    const { rerender } = renderPage();
    await screen.findByText('Candidatures suivies');

    leaveAndComeBack(rerender);

    expect(within(kpiGroup()).getByText('12')).toBeInTheDocument();
    expect(screen.queryByText('Chargement du tableau de bord…')).not.toBeInTheDocument();
    expect(screen.getByText(/actualisation…/)).toBeInTheDocument();

    refresh.answer(json(200, { ...DASHBOARD, totals: { ...DASHBOARD.totals, applications: 13 } }));

    expect(await within(kpiGroup()).findByText('13')).toBeInTheDocument();
    expect(screen.queryByText(/actualisation…/)).not.toBeInTheDocument();
  });

  it('[ENF-UTI-03] keeps the last figures and says why they could not be refreshed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(200, DASHBOARD))
        .mockResolvedValueOnce(json(500, { error: 'Une erreur inattendue est survenue.' })),
    );
    const { rerender } = renderPage();
    await screen.findByText('Candidatures suivies');

    leaveAndComeBack(rerender);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chiffres de votre dernière visite. Une erreur inattendue est survenue.',
    );
    expect(within(kpiGroup()).getByText('12')).toBeInTheDocument();
  });

  it('[EF-TDB-01] [EF-TDB-02] [EF-TDB-03] shows the headline numbers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    renderPage();
    await screen.findByText('Candidatures suivies');
    const kpis = within(kpiGroup());

    expect(kpis.getByText('12')).toBeInTheDocument();
    expect(kpis.getByText('5')).toBeInTheDocument();
    expect(kpis.getByText('42%')).toBeInTheDocument();
  });

  it('[EF-TDB-08] shows the number of new offers above the threshold', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    renderPage();
    await screen.findByText('Candidatures suivies');
    const kpis = within(kpiGroup());

    expect(kpis.getByText('7')).toBeInTheDocument();
    expect(kpis.getByText('Score ≥ 60 points')).toBeInTheDocument();
  });

  it('[EF-TDB-05] labels every status in French, in its own section', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    renderPage();
    const byStatus = within(await screen.findByRole('region', { name: 'Par statut' }));

    expect(byStatus.getByText('Envoyée')).toBeInTheDocument();
    expect(byStatus.getByText('Entretien')).toBeInTheDocument();
    expect(byStatus.getByText('6')).toBeInTheDocument();
  });

  it('[EF-TDB-09] labels every contract type and its RG-07 response rate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    renderPage();
    const byContract = within(await screen.findByRole('region', { name: 'Par type de contrat' }));

    expect(byContract.getByText('CDI')).toBeInTheDocument();
    expect(byContract.getByText('· 50% de réponse')).toBeInTheDocument();
    // Contract types with no application are not shown (nothing to compare).
    expect(byContract.queryByText('CDD')).not.toBeInTheDocument();
  });

  it('[EF-TDB-06] splits applications between direct and platform channels', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    renderPage();
    const byChannel = within(await screen.findByRole('region', { name: 'Par canal' }));

    expect(byChannel.getByText('Envoi direct')).toBeInTheDocument();
    expect(byChannel.getByText('9')).toBeInTheDocument();
    expect(byChannel.getByText('3')).toBeInTheDocument();
  });

  it('[EF-TDB-07] lists the applications to follow up, with the delay applied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    renderPage();
    const followUps = within(await screen.findByRole('region', { name: 'À relancer' }));

    expect(followUps.getByText('Atelier Nova')).toBeInTheDocument();
    expect(followUps.getByText('Développeur')).toBeInTheDocument();
    expect(followUps.getByText('il y a 21 jours')).toBeInTheDocument();
  });

  it('[EF-TDB-07] tells the user there is nothing to follow up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, EMPTY_DASHBOARD)));

    renderPage();
    const followUps = within(await screen.findByRole('region', { name: 'À relancer' }));

    expect(followUps.getByText('Rien à relancer pour l’instant : c’est à jour.')).toBeInTheDocument();
  });

  it('[ENF-UTI-03] shows a readable message when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { error: 'Authentification requise' })));

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Authentification requise');
  });
});
