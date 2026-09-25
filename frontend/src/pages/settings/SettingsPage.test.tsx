import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaveFor } from '../../lib/browser';
import { openStreams } from '../../test/setup';
import { ROUTER_FUTURE } from '../../lib/router';
import { AuthProvider } from '../../auth/AuthContext';
import { SettingsPage } from './SettingsPage';

vi.mock('../../lib/browser', () => ({ leaveFor: vi.fn() }));

const CONNECTED = {
  connected: true,
  emailAddress: 'alex.martin@example.com',
  connectedAt: '2026-09-20T09:00:00.000Z',
  lastRunAt: null,
  lastSyncAt: null,
  applyLabels: true,
  lookbackDays: 30,
  authorizationExpired: false,
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Route = () => Response | Promise<Response>;

const mockApi = (routes: Record<string, Route>) => {
  const calls: string[] = [];
  const withDefaults: Record<string, Route> = routes;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${input.replace(/^\/api/, '')}`;
      calls.push(key);
      const route = withDefaults[key];
      return Promise.resolve(route ? route() : json(404, { error: 'Ressource introuvable' }));
    }),
  );
  return calls;
};

function CurrentSearch() {
  return <div aria-label="Adresse courante">{useLocation().search}</div>;
}

const renderPage = (path = '/reglages') =>
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <AuthProvider>
      <Routes>
        <Route
          path="/reglages"
          element={
            <>
              <SettingsPage />
              <CurrentSearch />
            </>
          }
        />
      </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(leaveFor).mockClear();
});

describe('SettingsPage — Gmail', () => {
  it('[ENF-UTI-03] shows a waiting state while the connection is read', () => {
    mockApi({ 'GET /gmail/status': () => new Promise<Response>(() => undefined) });

    renderPage();

    const gmailCard = screen.getByRole('region', { name: 'Boîte Gmail' });
    expect(within(gmailCard).getByRole('status')).toHaveTextContent('Chargement de la connexion Gmail…');
  });

  it('[ENF-UTI-03] shows a readable message when the API fails', async () => {
    mockApi({ 'GET /gmail/status': () => json(500, { error: 'Une erreur inattendue est survenue.' }) });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur inattendue est survenue.');
  });

  it('[EF-CFG-01] shows the connected address, the day of the connection and the last synchronisation', async () => {
    mockApi({ 'GET /gmail/status': () => json(200, CONNECTED) });

    renderPage();

    expect(await screen.findByText('alex.martin@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Connectée depuis le 20 sept\. 2026/)).toBeInTheDocument();
    expect(screen.getByText('Dernière synchronisation : pas encore')).toBeInTheDocument();
  });

  it('[EF-CFG-01] dates the last synchronisation when there was one', async () => {
    mockApi({
      'GET /gmail/status': () =>
        json(200, {
          ...CONNECTED,
          lastRunAt: '2026-09-22T08:30:00.000Z',
          lastSyncAt: '2026-09-22T08:30:00.000Z',
        }),
    });

    renderPage();

    expect(await screen.findByText(/Dernière synchronisation : 22 sept\. 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Rattrapage en cours/)).not.toBeInTheDocument();
  });

  it('[EF-GML-06] says a backlog is being caught up when a pass ran without reaching the end', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, { ...CONNECTED, lastRunAt: '2026-09-23T08:30:00.000Z' }),
    });

    renderPage();

    expect(await screen.findByText(/Dernière synchronisation : 23 sept\. 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Rattrapage en cours/)).toBeInTheDocument();
  });

  it('[EF-GML-01] sends the user to Google’s consent page to connect a mailbox', async () => {
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?state=abc';
    mockApi({
      'GET /gmail/status': () => json(200, { connected: false }),
      'GET /gmail/authorization-url': () => json(200, { url }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Connecter Gmail' }));

    await waitFor(() => expect(leaveFor).toHaveBeenCalledWith(url));
    expect(screen.getByRole('button', { name: 'Redirection vers Google…' })).toBeDisabled();
  });

  it.each([
    ['connected', 'status', 'Gmail est connecté'],
    ['refused', 'alert', 'l’accès à Gmail n’a pas été accordé'],
    ['expired', 'alert', 'Le lien de connexion a expiré'],
    ['failed', 'alert', 'Google n’a pas pu finaliser la connexion'],
  ])('[EF-GML-01] tells the outcome « %s » of the return from Google, once', async (outcome, role, message) => {
    mockApi({ 'GET /gmail/status': () => json(200, outcome === 'connected' ? CONNECTED : { connected: false }) });

    renderPage(`/reglages?gmail=${outcome}`);

    expect(await screen.findByRole(role)).toHaveTextContent(message);
    await waitFor(() => expect(screen.getByLabelText('Adresse courante')).toHaveTextContent(''));
  });

  it('[EF-GML-02] disconnects Gmail after a confirmation', async () => {
    let status: object = CONNECTED;
    const calls = mockApi({
      'GET /gmail/status': () => json(200, status),
      'DELETE /gmail/connection': () => {
        status = { connected: false };
        return new Response(null, { status: 204 });
      },
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Déconnecter Gmail' }));
    expect(calls).not.toContain('DELETE /gmail/connection');
    await user.click(screen.getByRole('button', { name: 'Confirmer la déconnexion' }));

    expect(await screen.findByRole('button', { name: 'Connecter Gmail' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Gmail est déconnecté');
    expect(calls).toContain('DELETE /gmail/connection');
  });

  it('[EF-GML-04] [EF-EXE-01] queues the pass, then tells what it read, retained and classified', async () => {
    let status: object = CONNECTED;
    const calls = mockApi({
      'GET /gmail/status': () => json(200, status),
      'POST /gmail/sync': () => json(202, { runId: 7 }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Synchroniser maintenant' }));

    // EF-EXE-04: what happens next arrives through the stream, not through the answer of the button.
    const stream = openStreams.find((open) => open.url.endsWith('/jobs/stream'));
    stream?.emit('run', {
      id: 7,
      job: 'gmail_sync',
      trigger: 'manual',
      outcome: 'running',
      counters: { messages_read: 120, messages_retained: 8, messages_classified: 0 },
      error: null,
    });
    expect(await screen.findByText(/Synchronisation en cours : 120 messages lus/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchronisation…' })).toBeDisabled();

    status = { ...CONNECTED, lastRunAt: '2026-09-22T08:30:00.000Z', lastSyncAt: '2026-09-22T08:30:00.000Z' };
    stream?.emit('run', {
      id: 7,
      job: 'gmail_sync',
      trigger: 'manual',
      outcome: 'success',
      counters: { messages_read: 12, messages_retained: 3, messages_classified: 1, messages_pending: 0 },
      error: null,
    });

    expect(await screen.findByText(/Synchronisation terminée : 12 messages lus, 3 retenus, 1 classé\./)).toBeInTheDocument();
    expect(await screen.findByText(/Dernière synchronisation : 22 sept\. 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchroniser maintenant' })).toBeEnabled();
    expect(calls.filter((call) => call === 'POST /gmail/sync')).toHaveLength(1);
  });

  it('[EF-GML-04] tells that messages are still waiting after a bounded pass', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, { ...CONNECTED, lastRunAt: '2026-09-23T08:30:00.000Z' }),
      'POST /gmail/sync': () => json(202, { runId: 9 }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Synchroniser maintenant' }));
    openStreams
      .find((open) => open.url.endsWith('/jobs/stream'))
      ?.emit('run', {
        id: 9,
        job: 'gmail_sync',
        trigger: 'manual',
        outcome: 'success',
        counters: { messages_read: 200, messages_retained: 23, messages_classified: 23, messages_pending: 1 },
        error: null,
      });

    expect(
      await screen.findByText(/Il reste des messages à traiter : relancez pour continuer\./),
    ).toBeInTheDocument();
  });

  it('[EF-GML-04] [EF-IA-04] [EF-EXE-03] shows why a synchronisation failed', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, CONNECTED),
      'POST /gmail/sync': () => json(202, { runId: 11 }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Synchroniser maintenant' }));
    openStreams
      .find((open) => open.url.endsWith('/jobs/stream'))
      ?.emit('run', {
        id: 11,
        job: 'gmail_sync',
        trigger: 'manual',
        outcome: 'failure',
        counters: {},
        error: 'Aucun service d’IA n’a pu traiter la demande. Réessayez dans quelques minutes.',
      });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aucun service d’IA n’a pu traiter la demande.',
    );
    expect(screen.getByRole('button', { name: 'Synchroniser maintenant' })).toBeEnabled();
  });

  it('[EF-GML-20] [EF-EXE-01] queues the reading again of the acknowledgements, then tells what it corrected', async () => {
    const calls = mockApi({
      'GET /gmail/status': () => json(200, { ...CONNECTED, lastRunAt: '2026-09-23T08:30:00.000Z' }),
      'POST /gmail/reclassify': () => json(202, { runId: 21 }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Relire les accusés de réception' }));
    const stream = openStreams.find((open) => open.url.endsWith('/jobs/stream'));
    stream?.emit('run', {
      id: 21,
      job: 'gmail_reclassify',
      trigger: 'manual',
      outcome: 'running',
      counters: { messages_read: 14, messages_corrected: 1 },
      error: null,
    });
    expect(await screen.findByText(/Relecture en cours : 14 messages relus, 1 corrigé en refus/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relecture…' })).toBeDisabled();
    // A reading again is not a synchronisation: that button stays as it was.
    expect(screen.getByRole('button', { name: 'Synchroniser maintenant' })).toBeEnabled();

    stream?.emit('run', {
      id: 21,
      job: 'gmail_reclassify',
      trigger: 'manual',
      outcome: 'success',
      counters: { messages_read: 40, messages_corrected: 2 },
      error: null,
    });

    expect(
      await screen.findByText('Relecture terminée : 40 messages relus, 2 corrigés en refus.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relire les accusés de réception' })).toBeEnabled();
    expect(calls.filter((call) => call === 'POST /gmail/reclassify')).toHaveLength(1);
  });

  it('[EF-GML-20] [EF-EXE-03] shows why the reading again failed', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, CONNECTED),
      'POST /gmail/reclassify': () => json(202, { runId: 22 }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Relire les accusés de réception' }));
    openStreams
      .find((open) => open.url.endsWith('/jobs/stream'))
      ?.emit('run', {
        id: 22,
        job: 'gmail_reclassify',
        trigger: 'manual',
        outcome: 'failure',
        counters: {},
        error: 'Gmail limite temporairement le nombre de requêtes.',
      });

    expect(await screen.findByRole('alert')).toHaveTextContent('Gmail limite temporairement le nombre de requêtes.');
  });

  it('[EF-GML-20] offers no reading again while the authorisation is expired', async () => {
    mockApi({ 'GET /gmail/status': () => json(200, { ...CONNECTED, authorizationExpired: true }) });
    renderPage();

    await screen.findByRole('button', { name: 'Reconnecter Gmail' });

    expect(screen.queryByRole('button', { name: 'Relire les accusés de réception' })).not.toBeInTheDocument();
  });

  it('[EF-GML-17] turns the writing of Gmail labels off, then on again', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        if (init?.method === 'PATCH' && input.endsWith('/gmail/settings')) {
          bodies.push(JSON.parse(String(init.body)));
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(json(200, CONNECTED));
      }),
    );
    renderPage();
    const user = userEvent.setup();
    const option = await screen.findByRole('switch', { name: /Ranger les fils avec des libellés Gmail/ });

    expect(option).toBeChecked();
    await user.click(option);
    expect(option).not.toBeChecked();
    await waitFor(() => expect(option).toBeEnabled());
    await user.click(option);

    await waitFor(() => expect(bodies).toEqual([{ applyLabels: false }, { applyLabels: true }]));
    expect(option).toBeChecked();
  });

  it('[EF-GML-17] keeps the previous setting when the API refuses the change', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, CONNECTED),
      'PATCH /gmail/settings': () => json(500, { error: 'Une erreur inattendue est survenue.' }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: /Ranger les fils avec des libellés Gmail/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur inattendue est survenue.');
    expect(screen.getByRole('switch', { name: /Ranger les fils avec des libellés Gmail/ })).toBeChecked();
  });

  it('[EF-CFG-04] shows the period of the first synchronisation and records the one chosen', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        if (init?.method === 'PATCH' && input.endsWith('/gmail/settings')) {
          bodies.push(JSON.parse(String(init.body)));
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(json(200, CONNECTED));
      }),
    );
    renderPage();
    const user = userEvent.setup();
    const period = await screen.findByRole('radiogroup', { name: 'Période de la première synchronisation' });

    expect(within(period).getByRole('radio', { name: '1 mois' })).toBeChecked();
    await user.click(within(period).getByRole('radio', { name: '7 jours' }));

    await waitFor(() => expect(bodies).toEqual([{ lookbackDays: 7 }]));
    expect(within(period).getByRole('radio', { name: '7 jours' })).toBeChecked();
    expect(screen.getByText(/Une période courte évite les limites de l’API Gmail/)).toBeInTheDocument();
  });

  it('[EF-CFG-04] keeps the previous period when the API refuses the change', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, { ...CONNECTED, lookbackDays: 90 }),
      'PATCH /gmail/settings': () => json(400, { error: 'Données invalides' }),
    });
    renderPage();
    const user = userEvent.setup();
    const period = await screen.findByRole('radiogroup', { name: 'Période de la première synchronisation' });

    await user.click(within(period).getByRole('radio', { name: '1 an' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Données invalides');
    expect(within(period).getByRole('radio', { name: '3 mois' })).toBeChecked();
  });

  it('[Q-11] asks to reconnect an expired authorisation, through Google’s consent page', async () => {
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?state=again';
    mockApi({
      'GET /gmail/status': () => json(200, { ...CONNECTED, authorizationExpired: true }),
      'GET /gmail/authorization-url': () => json(200, { url }),
    });
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('L’autorisation Gmail a expiré');
    await user.click(screen.getByRole('button', { name: 'Reconnecter Gmail' }));

    await waitFor(() => expect(leaveFor).toHaveBeenCalledWith(url));
  });

  it('[EF-GML-02] keeps the connection when the user cancels', async () => {
    const calls = mockApi({ 'GET /gmail/status': () => json(200, CONNECTED) });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Déconnecter Gmail' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('button', { name: 'Déconnecter Gmail' })).toBeInTheDocument();
    expect(calls).not.toContain('DELETE /gmail/connection');
  });
});

describe('SettingsPage — layout of the Gmail card (EF-CFG-05)', () => {
  const SYNCED = { ...CONNECTED, lastRunAt: '2026-09-22T08:30:00.000Z', lastSyncAt: '2026-09-22T08:30:00.000Z' };

  it('[EF-CFG-05] leads with the state of the mailbox, in words, and the synchronisation before the preferences', async () => {
    mockApi({ 'GET /gmail/status': () => json(200, SYNCED) });

    renderPage();
    const badge = await screen.findByText('Connectée');
    const synchronise = screen.getByRole('button', { name: 'Synchroniser maintenant' });
    const preferences = screen.getByRole('heading', { name: 'Préférences' });

    expect(badge).toBeInTheDocument();
    expect(synchronise.compareDocumentPosition(preferences) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('[EF-CFG-05] says a synchronisation is running in the badge too', async () => {
    mockApi({ 'GET /gmail/status': () => json(200, SYNCED), 'POST /gmail/sync': () => json(202, { runId: 5 }) });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Synchroniser maintenant' }));
    openStreams
      .find((open) => open.url.endsWith('/jobs/stream'))
      ?.emit('run', { id: 5, job: 'gmail_sync', trigger: 'manual', outcome: 'running', counters: {}, error: null });

    expect(await screen.findByText('Synchronisation en cours')).toBeInTheDocument();
  });

  it('[EF-CFG-05] [Q-11] names an expired authorisation in the badge', async () => {
    mockApi({ 'GET /gmail/status': () => json(200, { ...SYNCED, authorizationExpired: true }) });

    renderPage();

    expect(await screen.findByText('Autorisation expirée')).toBeInTheDocument();
  });

  it('[EF-CFG-05] [EF-CFG-04] no longer offers the period once the first synchronisation is done', async () => {
    mockApi({ 'GET /gmail/status': () => json(200, SYNCED) });

    renderPage();
    await screen.findByText('Connectée');

    expect(screen.queryByRole('radiogroup', { name: 'Période de la première synchronisation' })).not.toBeInTheDocument();
    expect(screen.getByText(/seuls les nouveaux messages sont lus/)).toBeInTheDocument();
  });

  it('[EF-CFG-05] keeps the disconnection apart, in its own section', async () => {
    mockApi({ 'GET /gmail/status': () => json(200, SYNCED) });

    renderPage();
    const connection = await screen.findByRole('region', { name: 'Connexion' });

    expect(within(connection).getByRole('button', { name: 'Déconnecter Gmail' })).toBeInTheDocument();
    expect(within(connection).queryByRole('button', { name: 'Synchroniser maintenant' })).not.toBeInTheDocument();
  });

  it('[EF-CFG-02] shows no AI provider any more (v1.23)', async () => {
    const calls = mockApi({ 'GET /gmail/status': () => json(200, SYNCED) });

    renderPage();
    await screen.findByText('Connectée');

    expect(screen.queryByRole('heading', { name: /Fournisseurs/ })).not.toBeInTheDocument();
    expect(calls).not.toContain('GET /settings/ai');
  });
});

describe('SettingsPage — my data (EF-AUT-11, EF-AUT-12)', () => {
  it('[EF-AUT-12] downloads every datum held on the user as a file', async () => {
    const calls = mockApi({
      'GET /gmail/status': () => json(200, CONNECTED),
      'GET /account/export': () => json(200, { account: { email: 'alex.martin@example.com' } }),
    });
    const createObjectURL = vi.fn(() => 'blob:export');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Télécharger mes données' }));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(calls).toContain('GET /account/export');
    expect(createObjectURL).toHaveBeenCalled();
    click.mockRestore();
  });

  it('[EF-AUT-11] deletes the account only after the password, then leaves the application', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        if (init?.method === 'DELETE' && input.endsWith('/auth/account')) {
          bodies.push(JSON.parse(String(init.body)));
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(json(200, input.endsWith('/auth/session') ? { account: { id: 1, email: 'alex.martin@example.com' } } : CONNECTED));
      }),
    );
    renderPage();
    const user = userEvent.setup();
    const data = await screen.findByRole('region', { name: 'Mes données' });

    await user.click(within(data).getByRole('button', { name: 'Supprimer mon compte' }));
    expect(within(data).getByRole('button', { name: 'Supprimer définitivement' })).toBeDisabled();
    await user.type(within(data).getByLabelText('Mot de passe'), 'une phrase de passe longue');
    await user.click(within(data).getByRole('button', { name: 'Supprimer définitivement' }));

    await waitFor(() => expect(bodies).toEqual([{ password: 'une phrase de passe longue' }]));
  });

  it('[EF-AUT-11] says why the account was not deleted, and keeps it', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, CONNECTED),
      'DELETE /auth/account': () => json(403, { error: 'Mot de passe incorrect : le compte n’a pas été supprimé.' }),
    });
    renderPage();
    const user = userEvent.setup();
    const data = await screen.findByRole('region', { name: 'Mes données' });

    await user.click(within(data).getByRole('button', { name: 'Supprimer mon compte' }));
    await user.type(within(data).getByLabelText('Mot de passe'), 'mauvais');
    await user.click(within(data).getByRole('button', { name: 'Supprimer définitivement' }));

    expect(await within(data).findByRole('alert')).toHaveTextContent('Mot de passe incorrect');
  });
});

