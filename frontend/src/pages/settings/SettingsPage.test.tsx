import { render, screen, waitFor } from '@testing-library/react';
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
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Route = () => Response | Promise<Response>;

const mockApi = (routes: Record<string, Route>) => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${input.replace(/^\/api/, '')}`;
      calls.push(key);
      const route = routes[key];
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

    expect(screen.getByRole('status')).toHaveTextContent('Chargement de la connexion Gmail…');
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
