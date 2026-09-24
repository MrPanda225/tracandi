import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPendingTab } from '../../lib/browser';
import { openStreams } from '../../test/setup';
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
  // EF-TDB-04 (v1.21): the 5 weeks from Monday 24 August to the current week of Monday 21 September.
  weekly: [
    { weekStart: '2026-08-24T00:00:00.000Z', sent: 0, interviews: 0, rejected: 0 },
    { weekStart: '2026-08-31T00:00:00.000Z', sent: 4, interviews: 0, rejected: 0 },
    { weekStart: '2026-09-07T00:00:00.000Z', sent: 63, interviews: 2, rejected: 13 },
    { weekStart: '2026-09-14T00:00:00.000Z', sent: 5, interviews: 1, rejected: 3 },
    { weekStart: '2026-09-21T00:00:00.000Z', sent: 8, interviews: 1, rejected: 1 },
  ],
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

const pendingTab = { go: vi.fn(), close: vi.fn() };
vi.mock('../../lib/browser', () => ({ openPendingTab: vi.fn(() => pendingTab), leaveFor: vi.fn() }));

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
  vi.clearAllMocks();
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

  it('[ENF-MAI-07] [EF-TDB-08] leaves the offers card out when the watch is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { ...DASHBOARD, offers: null })));

    renderPage();
    await screen.findByText('Candidatures suivies');

    expect(within(kpiGroup()).queryByText('Offres à regarder')).not.toBeInTheDocument();
  });

  it('[EF-TDB-04] lists the 5 weeks, the current one named as such, in a table for screen readers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    renderPage();
    const table = await screen.findByRole('table', { name: 'Suivi des 5 dernières semaines' });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      '24 – 30 août',
      '31 août – 6 sept.',
      '7 – 13 sept.',
      '14 – 20 sept.',
      'Cette semaine',
    ]);
    expect(within(rows[2] as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '63',
      '2',
      '13',
    ]);
  });

  it('[EF-TDB-10] compares the current week with the previous one, for each series', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));

    renderPage();
    const thisWeek = await screen.findByRole('group', { name: 'Cette semaine' });

    expect(within(thisWeek).getByRole('button', { name: /Envoyées/ })).toHaveAccessibleName(
      'Envoyées : 8 cette semaine, 3 de plus que la semaine dernière',
    );
    expect(within(thisWeek).getByRole('button', { name: /Entretiens/ })).toHaveAccessibleName(
      'Entretiens : 1 cette semaine, autant que la semaine dernière',
    );
    expect(within(thisWeek).getByRole('button', { name: /Refusées/ })).toHaveAccessibleName(
      'Refusées : 1 cette semaine, 2 de moins que la semaine dernière',
    );
  });

  it('[EF-TDB-04] hides a series from the chart, then shows it again, from its figure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, DASHBOARD)));
    renderPage();
    const user = userEvent.setup();
    const sent = within(await screen.findByRole('group', { name: 'Cette semaine' })).getByRole('button', {
      name: /Envoyées/,
    });

    expect(sent).toHaveAttribute('aria-pressed', 'true');
    await user.click(sent);
    expect(sent).toHaveAttribute('aria-pressed', 'false');
    await user.click(sent);
    expect(sent).toHaveAttribute('aria-pressed', 'true');
  });

  it('[EF-TDB-11] refreshes the figures on its own when a Gmail synchronisation ends', async () => {
    const fresh = {
      ...DASHBOARD,
      totals: { applications: 13, reachedInterview: 5, responseRate: 42 },
      weekly: DASHBOARD.weekly.map((week, index) => (index === 4 ? { ...week, sent: 9 } : week)),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, DASHBOARD)).mockResolvedValueOnce(json(200, fresh));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByText('Candidatures suivies');

    openStreams
      .find((open) => open.url.endsWith('/jobs/stream'))
      ?.emit('run', {
        id: 3,
        job: 'gmail_sync',
        trigger: 'schedule',
        outcome: 'success',
        counters: { messages_read: 1 },
        error: null,
      });

    expect(await within(kpiGroup()).findByText('13')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Envoyées : 9 cette semaine/ })).toBeInTheDocument();
    expect(screen.getByText('Tableau de bord mis à jour après la synchronisation.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('[EF-TDB-11] ignores the executions that change no figure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, DASHBOARD));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await screen.findByText('Candidatures suivies');

    const stream = openStreams.find((open) => open.url.endsWith('/jobs/stream'));
    stream?.emit('run', { id: 4, job: 'gmail_sync', trigger: 'manual', outcome: 'running', counters: {}, error: null });
    stream?.emit('run', { id: 5, job: 'scraper', trigger: 'manual', outcome: 'success', counters: {}, error: null });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('[EF-CAN-17] prepares the follow-up as a Gmail draft and opens Gmail on it', async () => {
    const draft = {
      draftUrl: 'https://mail.google.com/mail/#drafts?compose=draft-1',
      to: 'rh@atelier-nova.example',
      subject: 'Re: Votre candidature',
    };
    const fetchMock = vi.fn((input: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST' && input.endsWith('/applications/7/follow-up-draft')
          ? json(201, draft)
          : json(200, DASHBOARD),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Relancer Atelier Nova — Développeur' }));

    expect(vi.mocked(openPendingTab)).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Brouillon prêt pour rh@atelier-nova.example.')).toBeInTheDocument();
    expect(pendingTab.go).toHaveBeenCalledWith(draft.draftUrl);
    expect(screen.getByRole('link', { name: 'Ouvrir le brouillon' })).toHaveAttribute('href', draft.draftUrl);
  });

  it('[EF-CAN-17] says why the follow-up could not be prepared, and closes the tab it opened', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === 'POST'
            ? json(409, { error: 'Aucune adresse à laquelle écrire pour cette candidature.' })
            : json(200, DASHBOARD),
        ),
      ),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Relancer Atelier Nova — Développeur' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Aucune adresse à laquelle écrire');
    expect(pendingTab.close).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Relancer Atelier Nova — Développeur' })).toBeEnabled();
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
