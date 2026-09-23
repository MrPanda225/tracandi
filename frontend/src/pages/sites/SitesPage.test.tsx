import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTER_FUTURE } from '../../lib/router';
import { openStreams } from '../../test/setup';
import { SitesPage } from './SitesPage';

const TYPES = [
  { id: 'greenhouse', label: 'Greenhouse', identifierHint: 'Nom du board, par exemple « atelieraurore ».' },
  { id: 'generic', label: 'Page carrières', identifierHint: 'Adresse de la page qui liste les offres.' },
];

const SOURCE = {
  id: 1,
  companyName: 'Atelier Aurore',
  adapter: 'greenhouse',
  adapterLabel: 'Greenhouse',
  identifier: 'atelieraurore',
  isActive: true,
  lastCheckedAt: '2026-09-23T09:00:00.000Z',
  lastError: null,
  offerCount: 4,
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

const withSources = (...items: unknown[]): Record<string, Route> => ({
  'GET /sites/types': () => json(200, { items: TYPES }),
  'GET /sites': () => json(200, { items }),
  'GET /sites/suggestions': () => json(200, { items: [] }),
});

const SUGGESTION = {
  companyId: 12,
  companyName: 'Arkema',
  domain: 'arkema.com',
  adapter: 'generic',
  identifier: 'https://arkema.com',
  messages: 3,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/sites']} future={ROUTER_FUTURE}>
      <SitesPage />
    </MemoryRouter>,
  );

/** EF-EXE-04 : pousse un état d'exécution dans le flux, comme le ferait le serveur. */
const pushRun = (run: Record<string, unknown>) => {
  openStreams.find((open) => open.url.endsWith('/jobs/stream'))?.emit('run', run);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SitesPage', () => {
  it('[EF-VEI-01] [EF-VEI-10] lists the watched sources with their last check', async () => {
    mockApi(withSources(SOURCE));

    renderPage();

    const list = within(await screen.findByRole('list', { name: 'Sources surveillées' }));
    expect(list.getByText('Atelier Aurore')).toBeInTheDocument();
    expect(list.getByText(/Greenhouse/)).toBeInTheDocument();
    expect(list.getByText('atelieraurore')).toBeInTheDocument();
    expect(list.getByText(/4 offres repérées/)).toBeInTheDocument();
  });

  it('[EF-VEI-10] says so when a source has never been checked', async () => {
    mockApi(withSources({ ...SOURCE, lastCheckedAt: null, offerCount: 0 }));

    renderPage();

    expect(await screen.findByText(/Jamais consultée/)).toBeInTheDocument();
  });

  it('[EF-VEI-11] shows the failure of the last check, on the source it happened to', async () => {
    mockApi(withSources({ ...SOURCE, lastError: 'Greenhouse a répondu 500.' }));

    renderPage();

    expect(await screen.findByText(/Greenhouse a répondu 500\./)).toBeInTheDocument();
  });

  it('[EF-VEI-01] invites the candidate to add a source when none is watched', async () => {
    mockApi(withSources());

    renderPage();

    expect(await screen.findByText(/Aucune source surveillée/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Sources surveillées' })).not.toBeInTheDocument();
  });

  it('[EF-VEI-01] [EF-VEI-08] offers the source types the API describes, with their own hint', async () => {
    mockApi(withSources());
    renderPage();
    const user = userEvent.setup();

    const type = await screen.findByLabelText('Type de source');
    expect(within(type).getByRole('option', { name: 'Greenhouse' })).toBeInTheDocument();
    expect(screen.getByText(/Nom du board/)).toBeInTheDocument();

    // RG-08 : l'aide suit le type choisi, un slug ici, une adresse là.
    await user.selectOptions(type, 'generic');
    expect(screen.getByText(/Adresse de la page qui liste les offres/)).toBeInTheDocument();
  });

  it('[EF-VEI-01] adds a source and shows it in the list', async () => {
    let added = false;
    const sent = mockApi({
      'GET /sites/types': () => json(200, { items: TYPES }),
      'GET /sites/suggestions': () => json(200, { items: [] }),
      'GET /sites': () => json(200, { items: added ? [SOURCE] : [] }),
      'POST /sites': () => {
        added = true;
        return json(201, SOURCE);
      },
    });
    renderPage();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Entreprise'), 'Atelier Aurore');
    await user.type(screen.getByLabelText('Identifiant'), 'atelieraurore');
    await user.click(screen.getByRole('button', { name: 'Surveiller cette source' }));

    expect(sent[0]).toEqual({
      companyName: 'Atelier Aurore',
      adapter: 'greenhouse',
      identifier: 'atelieraurore',
    });
    expect(await screen.findByRole('list', { name: 'Sources surveillées' })).toBeInTheDocument();
  });

  it('[EF-VEI-02] [ENF-SEC-04] shows what the API refused on the field it named', async () => {
    mockApi({
      ...withSources(),
      'POST /sites': () =>
        json(400, {
          error: 'Données invalides',
          details: [{ path: 'body.identifier', message: 'Identifiant invalide : lettres, chiffres…' }],
        }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Entreprise'), 'Atelier Aurore');
    await user.type(screen.getByLabelText('Identifiant'), '../../etc');
    await user.click(screen.getByRole('button', { name: 'Surveiller cette source' }));

    const identifier = await screen.findByLabelText('Identifiant');
    await waitFor(() => expect(identifier).toHaveAttribute('aria-invalid', 'true'));
    expect(identifier).toHaveAccessibleDescription(/Identifiant invalide/);
  });

  it('[EF-VEI-03] says plainly when a source is already watched', async () => {
    mockApi({
      ...withSources(SOURCE),
      'POST /sites': () => json(409, { error: 'Cette source est déjà surveillée pour cette entreprise' }),
    });
    renderPage();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Entreprise'), 'Atelier Aurore');
    await user.type(screen.getByLabelText('Identifiant'), 'atelieraurore');
    await user.click(screen.getByRole('button', { name: 'Surveiller cette source' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('déjà surveillée');
  });

  it('[EF-VEI-04] suspends a source, then offers to reactivate it', async () => {
    let isActive = true;
    const sent = mockApi({
      'GET /sites/types': () => json(200, { items: TYPES }),
      'GET /sites/suggestions': () => json(200, { items: [] }),
      'GET /sites': () => json(200, { items: [{ ...SOURCE, isActive }] }),
      'PATCH /sites/1': () => {
        isActive = false;
        return json(200, { ...SOURCE, isActive });
      },
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Suspendre' }));

    expect(sent[0]).toEqual({ isActive: false });
    expect(await screen.findByRole('button', { name: 'Réactiver' })).toBeInTheDocument();
    expect(screen.getByText('Suspendue')).toBeInTheDocument();
  });

  it('[EF-VEI-05] asks before removing a source, and says what goes with it', async () => {
    let removed = false;
    mockApi({
      'GET /sites/types': () => json(200, { items: TYPES }),
      'GET /sites/suggestions': () => json(200, { items: [] }),
      'GET /sites': () => json(200, { items: removed ? [] : [SOURCE] }),
      'DELETE /sites/1': () => {
        removed = true;
        return new Response(null, { status: 204 });
      },
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Retirer' }));
    expect(screen.getByText(/4 offres repérées sur cette source seront supprimées/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));

    expect(await screen.findByText(/Aucune source surveillée/)).toBeInTheDocument();
  });

  it('[EF-VEI-07] [EF-EXE-01] queues a pass and follows it, without blocking the screen', async () => {
    mockApi({ ...withSources(SOURCE), 'POST /sites/run': () => json(202, { runId: 7 }) });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Consulter maintenant' }));

    pushRun({ id: 7, job: 'scraper', trigger: 'manual', outcome: 'running', counters: {}, error: null });
    expect(await screen.findByRole('button', { name: 'Consultation en cours…' })).toBeDisabled();

    pushRun({
      id: 7,
      job: 'scraper',
      trigger: 'manual',
      outcome: 'success',
      counters: { sources_checked: 2, offers_new: 5, offers_relevant: 3 },
      error: null,
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 sources consultées, 5 nouvelles offres, dont 3 au-dessus de votre seuil.',
    );
    expect(screen.getByRole('button', { name: 'Consulter maintenant' })).toBeEnabled();
  });

  it('[EF-EXE-03] shows why a pass failed, in the words the candidate can act on', async () => {
    mockApi({ ...withSources(SOURCE), 'POST /sites/run': () => json(202, { runId: 8 }) });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Consulter maintenant' }));
    pushRun({
      id: 8,
      job: 'scraper',
      trigger: 'manual',
      outcome: 'failure',
      counters: {},
      error: 'Renseignez votre profil de référence avant de lancer la veille',
    });

    expect(await screen.findByRole('status')).toHaveTextContent('profil de référence');
  });

  it('[EF-VEI-07] leaves the pass out of reach while no source is active', async () => {
    mockApi(withSources({ ...SOURCE, isActive: false }));

    renderPage();

    expect(await screen.findByRole('button', { name: 'Consulter maintenant' })).toBeDisabled();
  });

  it('[EF-VEI-23] proposes the companies the candidate applied to and does not watch yet', async () => {
    mockApi({ ...withSources(), 'GET /sites/suggestions': () => json(200, { items: [SUGGESTION] }) });

    renderPage();

    const proposed = within(await screen.findByRole('list', { name: 'Sources proposées' }));
    expect(proposed.getByText('Arkema')).toBeInTheDocument();
    expect(proposed.getByText(/arkema\.com · 3 messages reçus/)).toBeInTheDocument();
  });

  it('[EF-VEI-23] [RG-19] fills the form with the proposal rather than adding it outright', async () => {
    mockApi({ ...withSources(), 'GET /sites/suggestions': () => json(200, { items: [SUGGESTION] }) });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Surveiller' }));

    // Rien n'est enregistré : le candidat vérifie l'identifiant, puis valide lui-même.
    expect(screen.getByLabelText('Entreprise')).toHaveValue('Arkema');
    expect(screen.getByLabelText('Identifiant')).toHaveValue('https://arkema.com');
    expect(screen.getByLabelText('Type de source')).toHaveValue('generic');
  });

  it('[EF-VEI-23] lets the candidate correct what was filled in', async () => {
    mockApi({ ...withSources(), 'GET /sites/suggestions': () => json(200, { items: [SUGGESTION] }) });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Surveiller' }));
    const identifier = screen.getByLabelText('Identifiant');
    await user.clear(identifier);
    await user.type(identifier, 'https://arkema.com/carrieres');

    expect(identifier).toHaveValue('https://arkema.com/carrieres');
  });

  it('[EF-VEI-25] sets a proposal aside, and stops showing it', async () => {
    let dismissed = false;
    mockApi({
      ...withSources(),
      'GET /sites/suggestions': () => json(200, { items: dismissed ? [] : [SUGGESTION] }),
      'POST /sites/suggestions/12/dismiss': () => {
        dismissed = true;
        return new Response(null, { status: 204 });
      },
    });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Écarter' }));

    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Sources proposées' })).not.toBeInTheDocument(),
    );
  });

  it('[EF-VEI-23] shows no proposal block when there is nothing to propose', async () => {
    mockApi(withSources(SOURCE));

    renderPage();

    await screen.findByRole('list', { name: 'Sources surveillées' });
    expect(screen.queryByRole('list', { name: 'Sources proposées' })).not.toBeInTheDocument();
  });

  it('[ENF-UTI-03] shows a readable message when the sources cannot be read', async () => {
    mockApi({ 'GET /sites/types': () => json(200, { items: TYPES }) });

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ressource introuvable'));
  });
});
