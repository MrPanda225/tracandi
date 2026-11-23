import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportPreview, ImportResult } from '../../api/applications';
import { ROUTER_FUTURE } from '../../lib/router';
import { ApplicationsPage } from './ApplicationsPage';
import { ApplicationsCacheProvider } from './useApplications';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const CSV = 'Entreprise,Poste,Statut\nAtelier Nova,Data analyst,Envoyée\nBeta,Ops,En cours\n';
const PREVIEW: ImportPreview = {
  delimiter: ',',
  headers: ['Entreprise', 'Poste', 'Statut'],
  rows: [
    ['Atelier Nova', 'Data analyst', 'Envoyée'],
    ['Beta', 'Ops', 'En cours'],
  ],
  totalRows: 2,
  mapping: { company: 0, jobTitle: 1, link: null, appliedAt: null, status: 2, notes: null },
};
const RESULT: ImportResult = {
  created: 1,
  duplicates: 0,
  rejected: [{ line: 3, reason: 'Statut « En cours » inconnu' }],
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** Fake API keyed by « METHOD /path »; records every call. */
const mockApi = (routes: Record<string, () => Response>): Call[] => {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://127.0.0.1');
      const method = init?.method ?? 'GET';
      const path = url.pathname.replace(/^\/api/, '');
      calls.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      const route = routes[`${method} ${path}`];
      return Promise.resolve(route ? route() : json(404, { error: 'Ressource introuvable' }));
    }),
  );
  return calls;
};

const renderPage = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <ApplicationsCacheProvider>
        <ApplicationsPage />
      </ApplicationsCacheProvider>
    </MemoryRouter>,
  );

const fromBase64 = (base64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));

const csvFile = (content = CSV, name = 'suivi.csv') => new File([content], name, { type: 'text/csv' });

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Importer un fichier CSV' }));
  return screen.getByRole('region', { name: 'Choisir le fichier' });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CsvImportPanel', () => {
  it('[EF-CAN-23] imports a file in three steps: file, columns with a preview, result', async () => {
    const calls = mockApi({
      'GET /applications': () => json(200, { items: [], total: 0 }),
      'POST /applications/import/preview': () => json(200, PREVIEW),
      'POST /applications/import': () => json(200, RESULT),
    });
    const user = userEvent.setup();
    renderPage();
    const panel = await openPanel(user);
    expect(screen.getByRole('heading', { name: 'Choisir le fichier' })).toHaveFocus();

    // Step 1: the file.
    await user.upload(within(panel).getByLabelText('Fichier CSV'), csvFile());
    await user.click(within(panel).getByRole('button', { name: 'Lire le fichier' }));

    // Step 2: the proposed columns beside the first rows.
    const heading = await screen.findByRole('heading', { name: 'Associer les colonnes' });
    expect(heading).toHaveFocus();
    const columns = screen.getByRole('region', { name: 'Associer les colonnes' });
    expect(within(columns).getByRole('table')).toHaveTextContent('Atelier Nova');
    expect(within(columns).getByRole('combobox', { name: 'Entreprise' })).toHaveDisplayValue('Entreprise');
    expect(within(columns).getByRole('combobox', { name: 'Statut' })).toHaveDisplayValue('Statut');
    expect(within(columns).getByRole('combobox', { name: 'Lien de l’offre' })).toHaveDisplayValue(
      'Aucune colonne',
    );
    const preview = calls.find((call) => call.path === '/applications/import/preview');
    expect(fromBase64((preview?.body as { file: string }).file)).toBe(CSV);

    await user.selectOptions(within(columns).getByRole('combobox', { name: 'Statut' }), 'Aucune colonne');
    await user.click(within(columns).getByRole('button', { name: 'Importer 2 lignes' }));

    // Step 3: the result, each refused row with its line.
    expect(await screen.findByRole('heading', { name: 'Résultat de l’import' })).toHaveFocus();
    expect(screen.getByText('1 candidature ajoutée')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Lignes refusées' })).getByRole('listitem'),
    ).toHaveTextContent('Ligne 3 Statut « En cours » inconnu');
    const sent = calls.find((call) => call.path === '/applications/import')?.body as { mapping: unknown };
    expect(sent.mapping).toEqual({ ...PREVIEW.mapping, status: null });
    // The list behind the panel is read again, with the new application.
    await waitFor(() => expect(calls.filter((call) => call.path === '/applications')).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('region', { name: 'Résultat de l’import' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer un fichier CSV' })).toHaveFocus();
  });

  it('[EF-CAN-23] shows under the file field why a file is refused, here or by the API', async () => {
    mockApi({
      'GET /applications': () => json(200, { items: [], total: 0 }),
      'POST /applications/import/preview': () =>
        json(415, { error: 'Ce fichier n’est pas un CSV en texte (UTF-8).' }),
    });
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    const panel = await openPanel(user);
    const input = within(panel).getByLabelText('Fichier CSV');

    await user.click(within(panel).getByRole('button', { name: 'Lire le fichier' }));
    expect(input).toHaveAccessibleDescription('Choisissez le fichier CSV de votre tableau.');

    await user.upload(input, new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }));
    await user.click(within(panel).getByRole('button', { name: 'Lire le fichier' }));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/n’est pas un CSV/u);

    await user.upload(input, csvFile('é', 'latin1.csv'));
    await user.click(within(panel).getByRole('button', { name: 'Lire le fichier' }));
    await waitFor(() => expect(input).toHaveAccessibleDescription(/UTF-8/u));
  });

  it('[EF-CAN-23] shows a link of the preview with its full address in its title', async () => {
    const link = 'https://emplois.example/offres/data-analyst-2026-reference-12345';
    mockApi({
      'GET /applications': () => json(200, { items: [], total: 0 }),
      'POST /applications/import/preview': () =>
        json(200, {
          ...PREVIEW,
          headers: ['Entreprise', 'Lien'],
          rows: [['Atelier Nova', link]],
          totalRows: 1,
          mapping: { ...PREVIEW.mapping, jobTitle: null, status: null, link: 1 },
        }),
    });
    const user = userEvent.setup();
    renderPage();
    const panel = await openPanel(user);
    await user.upload(within(panel).getByLabelText('Fichier CSV'), csvFile());
    await user.click(within(panel).getByRole('button', { name: 'Lire le fichier' }));

    const columns = await screen.findByRole('region', { name: 'Associer les colonnes' });
    const table = within(columns).getByRole('table');
    expect(within(table).getByTitle(link)).toHaveTextContent(link);
    expect(within(table).getByRole('cell', { name: 'Atelier Nova' })).not.toHaveAttribute('title');
  });

  it('[EF-CAN-23] names the mapping errors under the field they concern', async () => {
    const calls = mockApi({
      'GET /applications': () => json(200, { items: [], total: 0 }),
      'POST /applications/import/preview': () => json(200, PREVIEW),
    });
    const user = userEvent.setup();
    renderPage();
    const panel = await openPanel(user);
    await user.upload(within(panel).getByLabelText('Fichier CSV'), csvFile());
    await user.click(within(panel).getByRole('button', { name: 'Lire le fichier' }));
    await screen.findByRole('heading', { name: 'Associer les colonnes' });
    const columns = screen.getByRole('region', { name: 'Associer les colonnes' });
    const company = within(columns).getByRole('combobox', { name: 'Entreprise' });

    await user.selectOptions(company, 'Aucune colonne');
    await user.selectOptions(within(columns).getByRole('combobox', { name: 'Notes' }), 'Poste');
    await user.click(within(columns).getByRole('button', { name: 'Importer 2 lignes' }));

    expect(company).toHaveAccessibleDescription('Choisissez la colonne qui donne l’entreprise.');
    expect(within(columns).getByRole('combobox', { name: 'Notes' })).toHaveAccessibleDescription(
      'Cette colonne remplit déjà un autre champ.',
    );
    expect(calls.some((call) => call.path === '/applications/import')).toBe(false);
  });
});
