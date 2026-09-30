import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTER_FUTURE } from '../../lib/router';
import { OffersPage } from './OffersPage';

const OFFER = {
  id: 7,
  title: 'Data analyst H/F',
  companyName: 'Atelier Aurore',
  location: 'Nanterre',
  contractType: 'cdi',
  url: 'https://boards.greenhouse.io/atelieraurore/jobs/7',
  postedAt: '2026-09-28T08:00:00.000Z',
  firstSeenAt: '2026-09-29T07:00:00.000Z',
  relevanceScore: 84,
  relevanceReason: 'Poste de data analyst en CDI dans votre zone.',
  matchedTarget: 'Data analyst',
  status: 'new',
  source: { adapter: 'greenhouse', label: 'Greenhouse' },
  applicationId: null,
  isFromAppliedCompany: false,
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const mockApi = (routes: Record<string, (url: string) => Response>) => {
  const calls: { key: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = input.replace(/^\/api/, '');
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0] ?? ''}`;
      calls.push({ key, url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      const route = routes[key];
      return Promise.resolve(route ? route(url) : json(404, { error: 'Ressource introuvable' }));
    }),
  );
  return calls;
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/offres']} future={ROUTER_FUTURE}>
      <OffersPage />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OffersPage', () => {
  it('[EF-VEI-16] lists each offer with its score, its reason and a link to it', async () => {
    mockApi({ 'GET /offers': () => json(200, { items: [OFFER], total: 1 }) });

    renderPage();

    const offers = await screen.findByRole('list', { name: 'Offres' });
    const link = within(offers).getByRole('link', { name: /Data analyst H\/F/u });
    expect(link).toHaveAttribute('href', OFFER.url);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(offers).getByText(/Atelier Aurore · Nanterre · CDI · publiée le/u)).toBeInTheDocument();
    expect(within(offers).getByText('Poste de data analyst en CDI dans votre zone.')).toBeInTheDocument();
    expect(within(offers).getByText('84')).toBeInTheDocument();
  });

  it('[EF-VEI-35] says when the employer is a company the candidate applied to', async () => {
    mockApi({
      'GET /offers': () =>
        json(200, {
          items: [
            { ...OFFER, isFromAppliedCompany: true },
            { ...OFFER, id: 8, title: 'Data engineer', source: { adapter: 'france_travail', label: 'France Travail' } },
          ],
          total: 2,
        }),
    });

    renderPage();

    expect(await screen.findAllByText('Vous y avez déjà postulé')).toHaveLength(1);
    // EF-VEI-32: an offer of an official source names its source.
    expect(screen.getByText(/source : France Travail/u)).toBeInTheDocument();
  });

  it('[EF-VEI-17] [EF-VEI-22] asks the API for the score and contract chosen', async () => {
    const user = userEvent.setup();
    const calls = mockApi({ 'GET /offers': () => json(200, { items: [], total: 0 }) });
    renderPage();
    await screen.findByText('Aucune offre à regarder pour l’instant.');

    await user.selectOptions(screen.getByLabelText('Pertinence'), '60');
    await user.selectOptions(screen.getByLabelText('Contrat'), 'alternance');

    await waitFor(() =>
      expect(calls.at(-1)?.url).toBe('/offers?view=active&limit=50&minScore=60&contractType=alternance'),
    );
  });

  it('[EF-VEI-18] moves a dismissed offer out of the list, without reloading it', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      'GET /offers': () => json(200, { items: [OFFER], total: 1 }),
      'PATCH /offers/7': () => json(200, { ...OFFER, status: 'dismissed' }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Écarter' }));

    expect(await screen.findByText('Aucune offre à regarder pour l’instant.')).toBeInTheDocument();
    expect(calls.find((call) => call.key === 'PATCH /offers/7')?.body).toEqual({ status: 'dismissed' });
    expect(calls.filter((call) => call.key === 'GET /offers')).toHaveLength(1);
  });

  it('[EF-VEI-18] keeps a kept offer in view, marked so', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /offers': () => json(200, { items: [OFFER], total: 1 }),
      'PATCH /offers/7': () => json(200, { ...OFFER, status: 'saved' }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Garder' }));

    expect(await screen.findByRole('button', { name: 'Ne plus garder' })).toBeInTheDocument();
  });

  it('[EF-VEI-19] [EF-VEI-20] turns an offer into an application, and says where to follow it', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /offers': () => json(200, { items: [{ ...OFFER, status: 'saved' }], total: 1 }),
      'POST /offers/7/apply': () =>
        json(201, { offer: { ...OFFER, status: 'applied', applicationId: 3 }, applicationId: 3 }),
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Gardées' }));

    await user.click(await screen.findByRole('button', { name: 'J’ai postulé' }));

    // Applied, it leaves the view of the kept offers.
    expect(await screen.findByText('Aucune offre gardée.')).toBeInTheDocument();
  });

  it('[EF-VEI-19] shows why the API refused, on the offer itself', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /offers': () => json(200, { items: [OFFER], total: 1 }),
      'POST /offers/7/apply': () => json(409, { error: 'Une candidature à ce poste existe déjà.' }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'J’ai postulé' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Une candidature à ce poste existe déjà.');
  });

  it('[EF-VEI-16] reads the text of an offer only when asked', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      'GET /offers': () => json(200, { items: [OFFER], total: 1 }),
      'GET /offers/7': () => json(200, { ...OFFER, description: 'SQL, Power BI et tableaux de bord.' }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Lire le texte' }));

    expect(await screen.findByText('SQL, Power BI et tableaux de bord.')).toBeInTheDocument();
    expect(calls.filter((call) => call.key === 'GET /offers/7')).toHaveLength(1);
  });

  it('[EF-VEI-16] loads the next page on demand', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      'GET /offers': (url) =>
        json(200, {
          items: url.includes('offset=1') ? [{ ...OFFER, id: 8, title: 'Data engineer' }] : [OFFER],
          total: 2,
        }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Afficher 1 de plus' }));

    expect(await screen.findByRole('link', { name: /Data engineer/u })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Data analyst H\/F/u })).toBeInTheDocument();
    expect(calls.at(-1)?.url).toContain('offset=1');
  });

  it('[ENF-UTI-03] says so when the offers cannot be read', async () => {
    mockApi({ 'GET /offers': () => json(500, { error: 'Erreur interne' }) });

    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
