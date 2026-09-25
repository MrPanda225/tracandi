import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { ROUTER_FUTURE } from '../../lib/router';

const json = (status: number, body?: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(401, { error: 'Authentification requise' }))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('legal pages (EF-LEG-01)', () => {
  it.each([
    ['/mentions-legales', 'Mentions légales — Tracandi'],
    ['/confidentialite', 'Politique de confidentialité — Tracandi'],
    ['/cookies', 'Cookies — Tracandi'],
  ])('[EF-SEO-01] gives %s its own title and description', async (path, title) => {
    renderAt(path);
    await screen.findByRole('heading', { level: 1 });

    expect(document.title).toBe(title);
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toMatch(/Tracandi/);
  });

  it('[EF-LEG-01] publishes the legal notice without a session: publisher, contact and hosts', async () => {
    renderAt('/mentions-legales');

    const main = await screen.findByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Mentions légales' })).toBeInTheDocument();
    expect(within(main).getAllByText(/Sahiré YAPI/).length).toBeGreaterThan(0);
    expect(within(main).getByRole('link', { name: 'sahireyapi33@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:sahireyapi33@gmail.com',
    );
    expect(within(main).getByText(/Vercel Inc\..*Northflank Ltd/)).toBeInTheDocument();
    expect(within(main).queryByText(/à compléter|\[/)).not.toBeInTheDocument();
  });

  it('[EF-LEG-01] [ENF-RGP-05] names in the privacy policy every recipient, the rights and the CNIL', async () => {
    renderAt('/confidentialite');

    const main = await screen.findByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeInTheDocument();
    for (const recipient of ['Vercel', 'Northflank', 'Neon', 'Google', 'Groq', 'Gemini', 'Anthropic']) {
      expect(within(main).getAllByText(new RegExp(recipient)).length).toBeGreaterThan(0);
    }
    expect(within(main).getAllByText(/CNIL/).length).toBeGreaterThan(0);
    expect(within(main).getByText(/utilisation limitée/)).toBeInTheDocument();
    expect(within(main).getByText(/Royaume-Uni, pays reconnu par une décision d’adéquation/)).toBeInTheDocument();
    expect(within(main).getByRole('heading', { name: 'Vos droits' })).toBeInTheDocument();
    expect(within(main).queryByText(/à compléter|\[/)).not.toBeInTheDocument();
  });

  it('[EF-LEG-01] [ENF-RGP-04] describes the only cookie on the cookies page', async () => {
    renderAt('/cookies');

    expect(await screen.findByRole('heading', { level: 1, name: 'Cookies' })).toBeInTheDocument();
    expect(screen.getByText('tracandi_session')).toBeInTheDocument();
  });

  it('[EF-LEG-01] links the privacy policy from the login page', async () => {
    renderAt('/connexion');

    expect(await screen.findByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '/confidentialite');
  });
});

describe('cookie notice (EF-LEG-02)', () => {
  it('[EF-LEG-02] tells once about the only cookie, asks no consent, and stays gone once read', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAt('/connexion');

    const notice = await screen.findByRole('region', { name: 'Information sur les cookies' });
    expect(notice).toHaveTextContent('un seul cookie');
    expect(within(notice).queryByRole('button', { name: /Refuser|Accepter/ })).not.toBeInTheDocument();
    expect(within(notice).getByRole('link', { name: 'En savoir plus' })).toHaveAttribute('href', '/cookies');

    await user.click(within(notice).getByRole('button', { name: 'Compris' }));
    expect(screen.queryByRole('region', { name: 'Information sur les cookies' })).not.toBeInTheDocument();

    unmount();
    renderAt('/connexion');
    await screen.findByRole('heading', { name: 'Bon retour.' });
    expect(screen.queryByRole('region', { name: 'Information sur les cookies' })).not.toBeInTheDocument();
  });
});
