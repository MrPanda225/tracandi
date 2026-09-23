import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTER_FUTURE } from '../../lib/router';
import { CvWorkshopPage } from './CvWorkshopPage';

const PROFILE = {
  identity: {
    name: 'Alex MARTIN',
    city: 'Villeurbanne',
    phone: '06 00 00 00 00',
    email: 'alex.martin@example.com',
    extra: 'Permis B',
  },
  location: { searchArea: 'Lyon ou télétravail' },
  availability: 'CDI : immédiatement',
  targets: [{ label: 'Data analyst', contractTypes: ['cdi', 'alternance'], keywords: ['data', 'sql'] }],
  cvSource: {
    defaultTitle: 'Data Analyst',
    defaultSubtitle: 'CDI ou alternance',
    profile: 'Étudiant en Master MIAGE.',
    experiences: [
      {
        dates: 'Oct. 2024 – Avril 2026',
        company: 'Boulangerie Exemple',
        place: 'Rennes',
        role: 'Équipier polyvalent',
        duration: '1 an et 6 mois',
        bullets: ['Tenue de caisse.', 'Rotation des stocks.'],
      },
    ],
    education: [
      { dates: '2024 – 2026', school: 'Université de Rennes', place: null, degree: 'Master MIAGE', detail: null },
    ],
    skills: [{ label: 'Outils', value: 'SQL, Python' }],
    interests: ['Basketball'],
  },
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Route = () => Response | Promise<Response>;

const mockApi = (routes: Record<string, Route>) => {
  const sent: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${input.replace(/^\/api/, '')}`;
      if (init?.body !== undefined) sent.push(JSON.parse(String(init.body)));
      const route = routes[key];
      return Promise.resolve(route ? route() : json(404, { error: 'Ressource introuvable' }));
    }),
  );
  return sent;
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/atelier-cv']} future={ROUTER_FUTURE}>
      <CvWorkshopPage />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CvWorkshopPage', () => {
  it('[EF-CVX-01] shows the reference profile, section by section', async () => {
    mockApi({ 'GET /profile': () => json(200, PROFILE) });

    renderPage();

    expect(await screen.findByText('Alex MARTIN')).toBeInTheDocument();
    expect(screen.getByText(/Villeurbanne · 06 00 00 00 00/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cibles' })).toBeInTheDocument();
    expect(screen.getByText('Data analyst')).toBeInTheDocument();
    expect(screen.getByText('CDI, Alternance')).toBeInTheDocument();
    expect(screen.getByText('Équipier polyvalent')).toBeInTheDocument();
    expect(screen.getByText('Rotation des stocks.')).toBeInTheDocument();
    expect(screen.getByText('Master MIAGE')).toBeInTheDocument();
    expect(screen.getByText('Basketball')).toBeInTheDocument();
  });

  it('[EF-CVX-01] invites the candidate to create a profile when none is saved', async () => {
    mockApi({ 'GET /profile': () => json(404, { error: 'Aucun profil de référence enregistré' }) });

    renderPage();

    expect(await screen.findByText(/Aucun profil de référence n’est enregistré/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon profil' }));
    expect(screen.getByRole('button', { name: 'Enregistrer le profil' })).toBeInTheDocument();
  });

  it('[EF-CVX-02] saves what the candidate changed, and shows the profile again', async () => {
    let saved = false;
    const sent = mockApi({
      'GET /profile': () => json(200, saved ? { ...PROFILE, availability: 'Disponible en mai' } : PROFILE),
      'PUT /profile': () => {
        saved = true;
        return new Response(null, { status: 204 });
      },
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Modifier le profil' }));
    const availability = screen.getByLabelText('Disponibilités');
    await user.clear(availability);
    await user.type(availability, 'Disponible en mai');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Profil enregistré.');
    expect(sent[0]).toMatchObject({ availability: 'Disponible en mai' });
    expect(await screen.findByText(/Disponibilités : Disponible en mai/)).toBeInTheDocument();
  });

  it('[EF-CVX-02] [ENF-SEC-04] names the fields the API refused, and keeps the form open', async () => {
    mockApi({
      'GET /profile': () => json(200, PROFILE),
      'PUT /profile': () =>
        json(400, {
          error: 'Données invalides',
          details: [{ path: 'body.identity.email', message: 'Invalid email' }],
        }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Modifier le profil' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Données invalides');
    expect(screen.getByLabelText('Champs refusés')).toHaveTextContent('body.identity.email');
    // Nothing is lost: the form is still there with what was typed.
    expect(screen.getByRole('button', { name: 'Enregistrer le profil' })).toBeInTheDocument();
  });

  it('[EF-CVX-02] adds and removes a repeated entry', async () => {
    mockApi({ 'GET /profile': () => json(200, PROFILE) });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Modifier le profil' }));
    const skills = screen.getByRole('group', { name: 'Compétences' });
    await user.click(within(skills).getByRole('button', { name: 'Ajouter une compétence' }));

    expect(within(skills).getAllByLabelText('Intitulé')).toHaveLength(2);
    await user.click(within(skills).getAllByRole('button', { name: 'Retirer' })[0] as HTMLElement);
    expect(within(skills).getAllByLabelText('Intitulé')).toHaveLength(1);
  });

  it('[ENF-UTI-03] shows a readable message when the profile cannot be read', async () => {
    mockApi({ 'GET /profile': () => json(500, { error: 'Erreur interne du serveur' }) });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Erreur interne du serveur');
    });
  });
});
