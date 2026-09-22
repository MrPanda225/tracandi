import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application, ApplicationEmail } from '../../api/applications';
import { ApplicationsPage } from './ApplicationsPage';
import { ApplicationsCacheProvider } from './useApplications';

const application = (overrides: Partial<Application>): Application => ({
  id: 1,
  company: { id: 1, name: 'Atelier Nova' },
  jobTitle: 'Développeur',
  contractType: 'cdi',
  status: 'sent',
  source: 'manual',
  platform: null,
  notes: null,
  appliedAt: '2026-09-01T09:00:00.000Z',
  lastActivityAt: '2026-09-01T09:00:00.000Z',
  isFollowUpDue: false,
  ...overrides,
});

// Sorted as the API sorts them: company name, then most recent activity (EF-CAN-01).
const NOVA_DEV = application({ id: 1, isFollowUpDue: true });
const NOVA_DATA = application({ id: 2, jobTitle: 'Data analyst', status: 'interview' });
const LUMEN_UX = application({
  id: 3,
  company: { id: 2, name: 'Maison Lumen' },
  jobTitle: 'UX designer',
  contractType: 'alternance',
  status: 'rejected',
  platform: 'APEC',
});
const MCDO = application({
  id: 4,
  company: { id: 3, name: "McDonald's" },
  jobTitle: 'Équipier polyvalent',
  contractType: 'job_etudiant',
  status: 'acknowledged',
});
const ALL = [NOVA_DEV, NOVA_DATA, LUMEN_UX, MCDO];

const EMAILS: ApplicationEmail[] = [
  {
    id: 10,
    direction: 'outbound',
    category: 'sent_application',
    fromAddress: 'alex.martin@example.com',
    subject: 'Candidature Développeur',
    snippet: 'Bonjour, je vous adresse ma candidature.',
    platform: null,
    receivedAt: '2026-09-01T09:00:00.000Z',
    gmailUrl: 'https://mail.google.com/mail/u/0/#all/thread-a',
  },
  {
    id: 11,
    direction: 'inbound',
    category: 'acknowledged',
    fromAddress: 'rh@nova.example.com',
    subject: 'Votre candidature chez Atelier Nova',
    snippet: 'Nous avons bien reçu votre candidature.',
    platform: null,
    receivedAt: '2026-09-03T10:00:00.000Z',
    gmailUrl: 'https://mail.google.com/mail/u/0/#all/thread-a',
  },
];

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface ApiCall {
  method: string;
  url: URL;
  body: unknown;
}

type Route = (url: URL, body: unknown) => Response | Promise<Response>;

/** Fake API keyed by « METHOD /path » (without /api); records every call. */
const mockApi = (routes: Record<string, Route>): ApiCall[] => {
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://127.0.0.1');
      const method = init?.method ?? 'GET';
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      const route = routes[`${method} ${url.pathname.replace(/^\/api/, '')}`];
      return Promise.resolve(route ? route(url, body) : json(404, { error: 'Ressource introuvable' }));
    }),
  );
  return calls;
};

const listOf = (items: Application[], total = items.length) => json(200, { items, total });

/** The list endpoint, applying the filters the way the API does. */
const filteredList: Route = (url) => {
  const status = url.searchParams.get('status');
  const contractType = url.searchParams.get('contractType');
  const q = url.searchParams.get('q')?.toLowerCase();
  return listOf(
    ALL.filter(
      (item) =>
        (!status || item.status === status) &&
        (!contractType || item.contractType === contractType) &&
        (!q || item.company.name.toLowerCase().includes(q) || (q === 'mcdo' && item.id === MCDO.id)),
    ),
  );
};

const withinSession = (page: ReactElement) => (
  <MemoryRouter>
    <ApplicationsCacheProvider>{page}</ApplicationsCacheProvider>
  </MemoryRouter>
);

const renderPage = () => render(withinSession(<ApplicationsPage />));

/** Leaves the screen for another one, then comes back, within the same session. */
const leaveAndComeBack = (rerender: (ui: ReactElement) => void) => {
  rerender(withinSession(<p>Autre écran</p>));
  rerender(withinSession(<ApplicationsPage />));
};

const pending = () => {
  let answer: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => (answer = resolve));
  return { response, answer: (value: Response) => answer(value) };
};

const companyNames = () =>
  screen.getAllByRole('region').map((region) => within(region).getByRole('heading', { level: 2 }).textContent);

const itemOf = (jobTitle: RegExp) => {
  const button = screen.getByRole('button', { name: jobTitle });
  const item = button.closest('li');
  if (!item) throw new Error('application item not found');
  return item;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApplicationsPage', () => {
  it('[ENF-UTI-03] shows the shape of the list while the applications load', () => {
    mockApi({ 'GET /applications': () => new Promise<Response>(() => undefined) });

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Chargement des candidatures…');
  });

  it('[ENF-UTI-03] shows a readable message when the API fails', async () => {
    mockApi({ 'GET /applications': () => json(500, { error: 'Une erreur inattendue est survenue.' }) });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur inattendue est survenue.');
  });

  it('[ENF-PERF-01] shows the last list at once when coming back, then refreshes it', async () => {
    const refresh = pending();
    let calls = 0;
    mockApi({
      'GET /applications': () => {
        calls += 1;
        return calls === 1 ? listOf(ALL) : refresh.response;
      },
    });
    const { rerender } = renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });

    leaveAndComeBack(rerender);

    expect(screen.getByRole('region', { name: 'Atelier Nova' })).toBeInTheDocument();
    expect(screen.queryByText('Chargement des candidatures…')).not.toBeInTheDocument();

    refresh.answer(listOf([LUMEN_UX]));

    await waitFor(() => expect(companyNames()).toEqual(['Maison Lumen']));
  });

  it('[ENF-PERF-01] keeps the filters chosen before leaving the screen', async () => {
    mockApi({ 'GET /applications': filteredList });
    const { rerender } = renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Statut'), 'rejected');
    await waitFor(() => expect(companyNames()).toEqual(['Maison Lumen']));

    leaveAndComeBack(rerender);

    expect(screen.getByLabelText('Statut')).toHaveValue('rejected');
    expect(companyNames()).toEqual(['Maison Lumen']);
  });

  it('[EF-CAN-01] groups the applications by company, companies in alphabetical order', async () => {
    mockApi({ 'GET /applications': () => listOf(ALL) });

    renderPage();
    const nova = await screen.findByRole('region', { name: 'Atelier Nova' });

    expect(companyNames()).toEqual(['Atelier Nova', 'Maison Lumen', "McDonald's"]);
    expect(within(nova).getAllByRole('listitem')).toHaveLength(2);
  });

  it('[EF-CAN-01] tells a new user how applications get in', async () => {
    mockApi({ 'GET /applications': () => listOf([]) });

    renderPage();

    expect(await screen.findByText(/Aucune candidature pour l’instant/)).toBeInTheDocument();
  });

  it('[EF-CAN-02] filters the applications by status', async () => {
    const calls = mockApi({ 'GET /applications': filteredList });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Statut'), 'rejected');

    await waitFor(() => expect(companyNames()).toEqual(['Maison Lumen']));
    expect(calls.at(-1)?.url.searchParams.get('status')).toBe('rejected');
  });

  it('[EF-CAN-14] filters the applications by contract type', async () => {
    const calls = mockApi({ 'GET /applications': filteredList });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'alternance');

    await waitFor(() => expect(companyNames()).toEqual(['Maison Lumen']));
    expect(calls.at(-1)?.url.searchParams.get('contractType')).toBe('alternance');
  });

  it('[EF-CAN-03] searches the applications by company name or job title', async () => {
    const calls = mockApi({ 'GET /applications': filteredList });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Rechercher'), 'mcdo');

    await waitFor(() => expect(companyNames()).toEqual(["McDonald's"]));
    expect(calls.some((call) => call.url.searchParams.get('q') === 'mcdo')).toBe(true);
    expect(calls.some((call) => call.url.searchParams.get('q') === 'm')).toBe(false);
  });

  it('[EF-CAN-12] marks the applications to follow up', async () => {
    mockApi({ 'GET /applications': () => listOf(ALL) });

    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });

    expect(within(itemOf(/Développeur/)).getByText('À relancer')).toBeInTheDocument();
    expect(within(itemOf(/Data analyst/)).queryByText('À relancer')).not.toBeInTheDocument();
  });

  it('[EF-CAN-04] opens the chronology of an application, oldest message first', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1/emails': () => json(200, EMAILS),
    });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Développeur/ }));

    const chronology = await screen.findByRole('list', { name: 'Chronologie des messages' });
    const messages = within(chronology).getAllByRole('listitem');
    expect(messages).toHaveLength(2);
    expect(within(messages[0] as HTMLElement).getByText('Candidature Développeur')).toBeInTheDocument();
    expect(within(messages[0] as HTMLElement).getByText('Envoyé')).toBeInTheDocument();
    expect(within(messages[0] as HTMLElement).getByText('Candidature envoyée')).toBeInTheDocument();
    expect(within(messages[1] as HTMLElement).getByText('Reçu')).toBeInTheDocument();
    expect(within(messages[1] as HTMLElement).getByText('Accusé de réception')).toBeInTheDocument();
    expect(within(messages[1] as HTMLElement).getByText('Nous avons bien reçu votre candidature.')).toBeInTheDocument();
    expect(within(messages[1] as HTMLElement).getByRole('time')).toHaveAttribute('dateTime', '2026-09-03T10:00:00.000Z');
    expect(screen.getByRole('button', { name: /Développeur/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('[EF-CAN-05] links every message to its thread in Gmail, in a new tab', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1/emails': () => json(200, EMAILS),
    });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Développeur/ }));

    const links = await screen.findAllByRole('link', { name: /Ouvrir dans Gmail/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#all/thread-a');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('[EF-CAN-05] never renders a message link that does not point to Gmail', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1/emails': () =>
        json(200, [{ ...EMAILS[0], gmailUrl: 'javascript:alert(document.cookie)' }]),
    });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Développeur/ }));

    await screen.findByText('Candidature Développeur');
    expect(screen.queryByRole('link', { name: /Ouvrir dans Gmail/ })).not.toBeInTheDocument();
  });

  it('[EF-CAN-07] changes the status of an application', async () => {
    const calls = mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1/emails': () => json(200, []),
      'PATCH /applications/1': () => new Response(null, { status: 204 }),
      'GET /applications/1': () => json(200, { ...NOVA_DEV, status: 'interview', isFollowUpDue: false }),
    });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Développeur/ }));

    await user.selectOptions(await screen.findByLabelText('Changer le statut'), 'interview');

    const summary = screen.getByRole('button', { name: /Développeur/ });
    await waitFor(() => expect(summary).toHaveAccessibleName(/Entretien/));
    expect(summary).not.toHaveAccessibleName(/À relancer/);
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'interview' });
  });

  it('[EF-CAN-07] keeps the status and explains why when the change is refused', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1/emails': () => json(200, []),
      'PATCH /applications/1': () => json(404, { error: 'Candidature introuvable' }),
    });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Développeur/ }));

    await user.selectOptions(await screen.findByLabelText('Changer le statut'), 'interview');

    expect(await screen.findByRole('alert')).toHaveTextContent('Candidature introuvable');
    expect(screen.getByLabelText('Changer le statut')).toHaveValue('sent');
  });

  it('[EF-CAN-06] adds an application by hand and shows it in the list', async () => {
    let items = ALL;
    const created = application({ id: 5, company: { id: 4, name: 'Studio Ardent' }, jobTitle: 'UX', contractType: 'cdd' });
    const calls = mockApi({
      'GET /applications': () => listOf(items),
      'POST /applications': () => {
        items = [...ALL.slice(0, 3), MCDO, created];
        return json(201, { id: 5 });
      },
    });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Ajouter une candidature' }));
    const form = screen.getByRole('form', { name: 'Nouvelle candidature' });
    await user.type(within(form).getByLabelText('Entreprise'), 'Studio Ardent');
    await user.type(within(form).getByLabelText('Intitulé du poste'), 'UX');
    await user.selectOptions(within(form).getByLabelText('Type de contrat'), 'cdd');
    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));

    expect(await screen.findByRole('region', { name: 'Studio Ardent' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Candidature ajoutée : UX chez Studio Ardent.');
    expect(screen.queryByRole('form', { name: 'Nouvelle candidature' })).not.toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      companyName: 'Studio Ardent',
      jobTitle: 'UX',
      status: 'sent',
      contractType: 'cdd',
    });
  });

  it('[EF-CAN-06] moves the keyboard focus into the form, and back to its button when it closes', async () => {
    mockApi({ 'GET /applications': () => listOf(ALL) });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();
    const openButton = screen.getByRole('button', { name: 'Ajouter une candidature' });

    await user.click(openButton);
    const form = screen.getByRole('form', { name: 'Nouvelle candidature' });
    expect(within(form).getByLabelText('Entreprise')).toHaveFocus();

    await user.click(within(form).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('form', { name: 'Nouvelle candidature' })).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
  });

  it('[EF-CAN-06] keeps the form open and shows the reason when the API refuses the application', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'POST /applications': () =>
        json(409, { error: 'Une candidature existe déjà pour cette entreprise et cet intitulé' }),
    });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Ajouter une candidature' }));
    const form = screen.getByRole('form', { name: 'Nouvelle candidature' });
    await user.type(within(form).getByLabelText('Entreprise'), 'Atelier Nova');
    await user.type(within(form).getByLabelText('Intitulé du poste'), 'Développeur');
    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('Une candidature existe déjà');
    expect(within(form).getByRole('button', { name: 'Ajouter' })).toBeEnabled();
  });

  it('[EF-CAN-01] loads the next applications on demand', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      application({ id: 100 + index, jobTitle: `Poste ${index}` }),
    );
    const lastOne = application({ id: 999, company: { id: 9, name: 'Zénith' }, jobTitle: 'Dernier poste' });
    const calls = mockApi({
      'GET /applications': (url) =>
        url.searchParams.get('offset') === '100' ? listOf([lastOne], 101) : listOf(firstPage, 101),
    });
    renderPage();
    await screen.findByRole('region', { name: 'Atelier Nova' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Afficher plus/ }));

    expect(await screen.findByRole('region', { name: 'Zénith' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Afficher plus/ })).not.toBeInTheDocument();
    expect(calls.at(-1)?.url.searchParams.get('offset')).toBe('100');
  });
});
