import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { ROUTER_FUTURE } from '../../lib/router';

const json = (status: number, body?: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>,
  );

/** A system that lets animations play (jsdom has no matchMedia: the pages then count motion as reduced). */
const allowMotion = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

const descriptionOf = () => document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content;

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock = vi.fn((url: string) =>
    Promise.resolve(url === '/api/auth/session' ? json(200, { account: null }) : json(404, { error: 'Ressource introuvable' })),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LandingPage', () => {
  it('[EF-AUT-09] presents the service to a visitor at the root, with its two ways in', async () => {
    renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vos candidatures, suivies toutes seules.' }),
    ).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
    expect(within(header).getByRole('link', { name: 'Créer un compte' })).toHaveAttribute(
      'href',
      '/connexion?mode=inscription',
    );
    for (const section of ['Comment ça marche', 'Ce que Tracandi fait pour vous', 'Vos données restent les vôtres']) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    }
  });

  it('[EF-LEG-01] links the three legal pages from its footer', async () => {
    renderAt('/');

    const footer = await screen.findByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Mentions légales' })).toHaveAttribute('href', '/mentions-legales');
    expect(within(footer).getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '/confidentialite');
    expect(within(footer).getByRole('link', { name: 'Cookies' })).toHaveAttribute('href', '/cookies');
  });

  it('[EF-AUT-09] asks the API nothing but whether a session exists', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });

    expect(fetchMock.mock.calls.map(([url]) => url as string)).toEqual(['/api/auth/session']);
  });

  it('[EF-AUT-09] labels the dashboard preview as an example, never as someone’s figures', async () => {
    renderAt('/');

    expect(await screen.findByRole('img', { name: /Aperçu du tableau de bord, données d’exemple/ })).toBeInTheDocument();
  });

  it('[ENF-UTI-04] shows everything at once, without loader, when the system asks for less motion', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByText('Chargement de Tracandi…')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Commencer maintenant' })).toBeInTheDocument();
  });

  it('[ENF-UTI-04] opens with a short loader that steps aside on its own when motion is allowed', async () => {
    allowMotion();
    renderAt('/');

    const loader = await screen.findByText('Chargement de Tracandi…');
    await waitForElementToBeRemoved(loader, { timeout: 3000 });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('[ENF-PERF-07] plays the loader once per visit, not on every return to the page', async () => {
    allowMotion();
    const first = renderAt('/');
    await waitForElementToBeRemoved(await screen.findByText('Chargement de Tracandi…'), { timeout: 3000 });
    first.unmount();

    renderAt('/');
    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByText('Chargement de Tracandi…')).not.toBeInTheDocument();
  });

  it('[ENF-PERF-07] shows the promise and both ways in at once, without waiting for an animation', async () => {
    allowMotion();
    renderAt('/');

    const hero = await screen.findByRole('region', { name: 'Vos candidatures, suivies toutes seules.' });
    expect(within(hero).getByText(/Tracandi lit vos e-mails de candidature/)).toBeVisible();
    expect(within(hero).getByRole('link', { name: 'Créer un compte' })).toBeVisible();
    expect(within(hero).getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible();
  });

  it('[EF-SEO-01] gives the page its own title and a description of the service', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });

    expect(document.title).toBe('Tracandi — suivi de candidatures depuis Gmail');
    expect(descriptionOf()).toMatch(/^Tracandi lit vos e-mails de candidature.{60,}/);
  });
});
