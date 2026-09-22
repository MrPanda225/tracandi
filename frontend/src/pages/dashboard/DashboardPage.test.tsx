import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard } from '../../api/stats';
import { DashboardPage } from './DashboardPage';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DashboardPage', () => {
  it('[ENF-UTI-03] shows a waiting state while the figures load', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );

    render(<DashboardPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Chargement du tableau de bord…');
  });

  it('[EF-TDB-01] [EF-TDB-02] [EF-TDB-03] shows the headline numbers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    render(<DashboardPage />);
    await screen.findByText('Candidatures suivies');
    const kpis = within(kpiGroup());

    expect(kpis.getByText('12')).toBeInTheDocument();
    expect(kpis.getByText('5')).toBeInTheDocument();
    expect(kpis.getByText('42%')).toBeInTheDocument();
  });

  it('[EF-TDB-08] shows the number of new offers above the threshold', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    render(<DashboardPage />);
    await screen.findByText('Candidatures suivies');
    const kpis = within(kpiGroup());

    expect(kpis.getByText('7')).toBeInTheDocument();
    expect(kpis.getByText('Score ≥ 60 points')).toBeInTheDocument();
  });

  it('[EF-TDB-05] labels every status in French, in its own section', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    render(<DashboardPage />);
    const byStatus = within(await screen.findByRole('region', { name: 'Par statut' }));

    expect(byStatus.getByText('Envoyée')).toBeInTheDocument();
    expect(byStatus.getByText('Entretien')).toBeInTheDocument();
    expect(byStatus.getByText('6')).toBeInTheDocument();
  });

  it('[EF-TDB-09] labels every contract type and its RG-07 response rate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    render(<DashboardPage />);
    const byContract = within(await screen.findByRole('region', { name: 'Par type de contrat' }));

    expect(byContract.getByText('CDI')).toBeInTheDocument();
    expect(byContract.getByText('· 50% de réponse')).toBeInTheDocument();
    // Contract types with no application are not shown (nothing to compare).
    expect(byContract.queryByText('CDD')).not.toBeInTheDocument();
  });

  it('[EF-TDB-06] splits applications between direct and platform channels', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    render(<DashboardPage />);
    const byChannel = within(await screen.findByRole('region', { name: 'Par canal' }));

    expect(byChannel.getByText('Envoi direct')).toBeInTheDocument();
    expect(byChannel.getByText('9')).toBeInTheDocument();
    expect(byChannel.getByText('3')).toBeInTheDocument();
  });

  it('[EF-TDB-07] lists the applications to follow up, with the delay applied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    render(<DashboardPage />);
    const followUps = within(await screen.findByRole('region', { name: 'À relancer' }));

    expect(followUps.getByText('Atelier Nova')).toBeInTheDocument();
    expect(followUps.getByText('Développeur')).toBeInTheDocument();
    expect(followUps.getByText('il y a 21 jours')).toBeInTheDocument();
  });

  it('[EF-TDB-07] tells the user there is nothing to follow up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, EMPTY_DASHBOARD)));

    render(<DashboardPage />);
    const followUps = within(await screen.findByRole('region', { name: 'À relancer' }));

    expect(followUps.getByText('Rien à relancer pour l’instant : c’est à jour.')).toBeInTheDocument();
  });

  it('[ENF-UTI-03] shows a readable message when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { error: 'Authentification requise' })));

    render(<DashboardPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Authentification requise');
  });
});
