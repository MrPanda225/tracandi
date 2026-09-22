import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaveFor } from '../../lib/browser';
import { ROUTER_FUTURE } from '../../lib/router';
import { SettingsPage } from './SettingsPage';

vi.mock('../../lib/browser', () => ({ leaveFor: vi.fn() }));

const CONNECTED = {
  connected: true,
  emailAddress: 'alex.martin@example.com',
  connectedAt: '2026-09-20T09:00:00.000Z',
  lastSyncAt: null,
  applyLabels: true,
  authorizationExpired: false,
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Route = () => Response | Promise<Response>;

const NO_AI = { providers: [], tasks: [] };

const mockApi = (routes: Record<string, Route>) => {
  const calls: string[] = [];
  // The AI card reads its own configuration on every render of the page.
  const withDefaults: Record<string, Route> = { 'GET /settings/ai': () => json(200, NO_AI), ...routes };
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
    mockApi({ 'GET /gmail/status': () => json(200, { ...CONNECTED, lastSyncAt: '2026-09-22T08:30:00.000Z' }) });

    renderPage();

    expect(await screen.findByText(/Dernière synchronisation : 22 sept\. 2026/)).toBeInTheDocument();
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

  it('[EF-GML-04] synchronises on demand and tells what was read, retained and classified', async () => {
    let status: object = CONNECTED;
    let answer: (response: Response) => void = () => undefined;
    const calls = mockApi({
      'GET /gmail/status': () => json(200, status),
      'POST /gmail/sync': () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Synchroniser maintenant' }));

    expect(screen.getByRole('button', { name: 'Synchronisation…' })).toBeDisabled();
    status = { ...CONNECTED, lastSyncAt: '2026-09-22T08:30:00.000Z' };
    answer(json(200, { read: 12, retained: 3, classified: 1 }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Synchronisation terminée : 12 messages lus, 3 retenus, 1 classé.',
    );
    expect(await screen.findByText(/Dernière synchronisation : 22 sept\. 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchroniser maintenant' })).toBeEnabled();
    expect(calls.filter((call) => call === 'POST /gmail/sync')).toHaveLength(1);
  });

  it('[EF-GML-04] [EF-IA-04] shows why a synchronisation failed', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, CONNECTED),
      'POST /gmail/sync': () =>
        json(502, { error: 'Aucun service d’IA n’a pu traiter la demande. Réessayez dans quelques minutes.' }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Synchroniser maintenant' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Aucun service d’IA n’a pu traiter la demande.');
    expect(screen.getByRole('button', { name: 'Synchroniser maintenant' })).toBeEnabled();
  });

  it('[EF-GML-17] turns the writing of Gmail labels off, then on again', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        if (input.endsWith('/settings/ai')) return Promise.resolve(json(200, NO_AI));
        if (init?.method === 'PATCH' && input.endsWith('/gmail/settings')) {
          bodies.push(JSON.parse(String(init.body)));
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(json(200, CONNECTED));
      }),
    );
    renderPage();
    const user = userEvent.setup();
    const option = await screen.findByRole('checkbox', { name: /Ranger les fils avec des libellés Gmail/ });

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

    await user.click(await screen.findByRole('checkbox', { name: /Ranger les fils avec des libellés Gmail/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur inattendue est survenue.');
    expect(screen.getByRole('checkbox', { name: /Ranger les fils avec des libellés Gmail/ })).toBeChecked();
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

describe('SettingsPage — AI providers', () => {
  it('[EF-CFG-02] shows the configured providers and the provider of each task, with its fallback', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, { connected: false }),
      'GET /settings/ai': () =>
        json(200, {
          providers: [
            { name: 'claude', model: 'claude-sonnet-5' },
            { name: 'gemini', model: 'gemini-2.5-flash' },
          ],
          tasks: [
            { task: 'classify_emails', providers: ['gemini', 'claude'] },
            { task: 'tailor_cv', providers: ['claude', 'gemini'] },
          ],
        }),
    });

    renderPage();

    const card = await screen.findByRole('region', { name: 'Fournisseurs d’IA' });
    const providers = within(within(card).getByRole('list')).getAllByRole('listitem');
    expect(providers.map((provider) => provider.textContent)).toEqual([
      'Claude claude-sonnet-5',
      'Gemini gemini-2.5-flash',
    ]);
    const classification = within(card).getByRole('row', { name: /Classement des e-mails/ });
    expect(classification).toHaveTextContent('Gemini');
    expect(classification).toHaveTextContent('secours : Claude');
    expect(within(card).getByRole('row', { name: /CV adapté/ })).toHaveTextContent('Claude');
  });

  it('[EF-CFG-02] [EF-IA-05] says when a task has no fallback', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, { connected: false }),
      'GET /settings/ai': () =>
        json(200, {
          providers: [{ name: 'gemini', model: 'gemini-2.5-flash' }],
          tasks: [{ task: 'classify_emails', providers: ['gemini'] }],
        }),
    });

    renderPage();

    const row = await screen.findByRole('row', { name: /Classement des e-mails/ });
    expect(row).toHaveTextContent('sans secours');
  });

  it('[ENF-UTI-03] shows why the AI configuration could not be read', async () => {
    mockApi({
      'GET /gmail/status': () => json(200, { connected: false }),
      'GET /settings/ai': () => json(500, { error: 'Une erreur inattendue est survenue.' }),
    });

    renderPage();

    const card = await screen.findByRole('region', { name: 'Fournisseurs d’IA' });
    expect(await within(card).findByRole('alert')).toHaveTextContent('Une erreur inattendue est survenue.');
  });
});
