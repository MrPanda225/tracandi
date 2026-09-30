import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CriteriaCard } from './CriteriaCard';

const NANTERRE = { code: '92050', name: 'Nanterre', departmentCode: '92', latitude: 48.89, longitude: 2.21 };

const SAVED = {
  targets: [{ label: 'Data analyst', keywords: ['data', 'sql'], contractTypes: ['cdi', 'alternance'] }],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: ['M1419'],
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const mockApi = (routes: Record<string, () => Response>) => {
  const sent: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const path = input.replace(/^\/api/, '').split('?')[0] ?? '';
      if (init?.body !== undefined) sent.push(JSON.parse(String(init.body)));
      const route = routes[`${init?.method ?? 'GET'} ${path}`];
      return Promise.resolve(route ? route() : json(404, { error: 'Ressource introuvable' }));
    }),
  );
  return sent;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CriteriaCard', () => {
  it('[EF-VEI-29] opens the form at once when nothing is saved yet', async () => {
    mockApi({ 'GET /watch/criteria': () => json(200, { criteria: null }) });

    render(<CriteriaCard />);

    expect(await screen.findByRole('form', { name: 'Critères de recherche' })).toBeInTheDocument();
    expect(screen.getByLabelText('Métier')).toHaveValue('');
  });

  it('[EF-VEI-29] summarises saved criteria in a few lines', async () => {
    mockApi({ 'GET /watch/criteria': () => json(200, { criteria: SAVED }) });

    render(<CriteriaCard />);

    const targets = await screen.findByRole('list', { name: 'Vos cibles' });
    expect(within(targets).getByText('Data analyst')).toBeInTheDocument();
    expect(within(targets).getByText('CDI, Alternance')).toBeInTheDocument();
    expect(screen.getByText('Nanterre (92) et 30 km autour, télétravail accepté')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('[EF-VEI-29] [EF-VEI-30] saves a target and a commune chosen among those the service knows', async () => {
    const user = userEvent.setup();
    const sent = mockApi({
      'GET /watch/criteria': () => json(200, { criteria: null }),
      'GET /watch/places': () => json(200, { items: [NANTERRE] }),
      'PUT /watch/criteria': () => json(200, { criteria: SAVED }),
    });
    render(<CriteriaCard />);

    await user.type(await screen.findByLabelText('Métier'), 'Data analyst');
    await user.type(screen.getByLabelText('Mots-clés'), 'data, sql,');
    await user.click(screen.getByRole('checkbox', { name: 'Alternance' }));
    await user.type(screen.getByLabelText('Commune'), 'Nanterre');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await user.click(await screen.findByRole('button', { name: 'Nanterre (92)' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer mes critères' }));

    expect(await screen.findByText('Nanterre (92) et 30 km autour, télétravail accepté')).toBeInTheDocument();
    expect(sent).toEqual([
      {
        targets: [{ label: 'Data analyst', keywords: ['data', 'sql'], contractTypes: ['cdi', 'alternance'] }],
        place: NANTERRE,
        radiusKm: 30,
        acceptsRemote: true,
        romeCodes: [],
      },
    ]);
  });

  it('[EF-VEI-29] [ENF-SEC-04] shows what the API refused and keeps the form', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /watch/criteria': () => json(200, { criteria: SAVED }),
      'PUT /watch/criteria': () =>
        json(400, {
          error: 'Données invalides',
          details: [
            { path: 'body.romeCodes.0', message: 'Code ROME invalide : une lettre et quatre chiffres.' },
          ],
        }),
    });
    render(<CriteriaCard />);

    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer mes critères' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Données invalides');
    expect(screen.getByText('Code ROME invalide : une lettre et quatre chiffres.')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Critères de recherche' })).toBeInTheDocument();
  });

  it('[EF-VEI-29] adds up to five targets, then offers no more', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /watch/criteria': () => json(200, { criteria: null }) });
    render(<CriteriaCard />);

    const add = await screen.findByRole('button', { name: 'Ajouter une cible' });
    for (let count = 1; count < 5; count += 1) await user.click(add);

    await waitFor(() => expect(screen.getAllByLabelText('Métier')).toHaveLength(5));
    expect(screen.queryByRole('button', { name: 'Ajouter une cible' })).not.toBeInTheDocument();
  });
});
