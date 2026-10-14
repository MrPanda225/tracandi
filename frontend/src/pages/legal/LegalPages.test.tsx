import { render, screen, waitFor, within } from '@testing-library/react';
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
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(json(401, { error: 'Authentification requise' }))),
  );
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

    // The page names itself in an effect, which may run just after its heading is painted.
    await waitFor(() => expect(document.title).toBe(title));
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toMatch(
      /Tracandi/,
    );
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
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Politique de confidentialité' }),
    ).toBeInTheDocument();
    for (const recipient of ['Vercel', 'Northflank', 'Neon', 'Google', 'Groq', 'Gemini', 'Anthropic']) {
      expect(within(main).getAllByText(new RegExp(recipient)).length).toBeGreaterThan(0);
    }
    expect(within(main).getAllByText(/CNIL/).length).toBeGreaterThan(0);
    // ENF-RGP-05, ENF-RGP-10 (v1.33): the sources of the watch, what they receive, and how long an offer is kept.
    for (const source of ['France Travail', 'La bonne alternance', 'Recherche d’entreprises']) {
      expect(within(main).getAllByText(new RegExp(source)).length).toBeGreaterThan(0);
    }
    expect(within(main).getByText(/60 jours après que sa source a cessé de la publier/)).toBeInTheDocument();
    expect(within(main).getByText(/utilisation limitée/)).toBeInTheDocument();
    expect(
      within(main).getByText(/Royaume-Uni, pays reconnu par une décision d’adéquation/),
    ).toBeInTheDocument();
    expect(within(main).getByRole('heading', { name: 'Vos droits' })).toBeInTheDocument();
    expect(within(main).queryByText(/à compléter|\[/)).not.toBeInTheDocument();
  });

  it('[ENF-RGP-05] [ENF-RGP-14] names the local model among the recipients, and what is kept of a CV type and of a chosen offer', async () => {
    renderAt('/confidentialite');

    const main = await screen.findByRole('main');
    // The model the publisher runs himself, which reads first, and the others that follow it.
    expect(within(main).getByText(/Modèle d’IA local de l’éditeur/)).toBeInTheDocument();
    expect(within(main).getByText(/ne transmet rien à un tiers/)).toBeInTheDocument();
    // CV types and chosen offers: what is kept, and what never is.
    expect(within(main).getByText(/Votre veille automatique/)).toBeInTheDocument();
    expect(within(main).getByText(/Jamais le fichier, jamais son texte/)).toBeInTheDocument();
    expect(within(main).getByText(/ne restent que 30 minutes en mémoire/)).toBeInTheDocument();
    // What the models are sent, and what they never are.
    expect(within(main).getByText(/sans vos coordonnées \(ni nom, ni adresse e-mail/)).toBeInTheDocument();
    expect(
      within(main).getByText(/Jamais votre adresse e-mail de compte, vos messages Gmail ni vos candidatures/),
    ).toBeInTheDocument();
  });

  it('[ENF-RGP-05] [ENF-RGP-15] names Resend among the recipients and says it never receives the password', async () => {
    renderAt('/confidentialite');

    const main = await screen.findByRole('main');
    const resend = (await within(main).findByText('Resend')).closest('li');
    expect(resend).toHaveTextContent('États-Unis');
    expect(resend).toHaveTextContent(/jamais votre mot de passe/);
    expect(within(main).getByText(/Vercel, Google, Resend et les fournisseurs/)).toBeInTheDocument();
  });

  it('[EF-LEG-01] [ENF-RGP-04] describes the only cookie on the cookies page', async () => {
    renderAt('/cookies');

    expect(await screen.findByRole('heading', { level: 1, name: 'Cookies' })).toBeInTheDocument();
    expect(screen.getByText('tracandi_session')).toBeInTheDocument();
  });

  it('[EF-AUT-07] states on the cookies page that the session lasts 24 hours at most', async () => {
    renderAt('/cookies');

    expect(await screen.findByText(/24 heures au plus/)).toBeInTheDocument();
    expect(screen.queryByText(/7 jours/)).not.toBeInTheDocument();
  });

  it('[EF-LEG-01] links the privacy policy from the login page', async () => {
    renderAt('/connexion');

    expect(await screen.findByRole('link', { name: 'Confidentialité' })).toHaveAttribute(
      'href',
      '/confidentialite',
    );
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
