import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '../../lib/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application, ApplicationDetail, ApplicationEmail } from '../../api/applications';
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
const NOVA_DEV_DETAIL: ApplicationDetail = { ...NOVA_DEV, offerDescription: null };
const OFFER_TEXT = 'Pipelines de données sous Airflow.\nPython, SQL, équipe de 6 personnes.';

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
  <MemoryRouter future={ROUTER_FUTURE}>
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

const COMPANIES = ['Atelier Nova', 'Maison Lumen', "McDonald's", 'Studio Ardent', 'Zénith'];

/** The companies of the applications listed, in order, each once — grouped by company or not (EF-CAN-20). */
const companyNames = () => {
  const groups = screen.queryAllByRole('region');
  if (groups.length > 0) return groups.map((group) => within(group).getByRole('heading', { level: 2 }).textContent);
  return [
    ...new Set(
      screen
        .getAllByRole('listitem')
        .map((item) => COMPANIES.find((name) => item.textContent?.startsWith(name)))
        .filter((name) => name !== undefined),
    ),
  ];
};

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
    await screen.findAllByText('Atelier Nova');

    leaveAndComeBack(rerender);

    expect(screen.getAllByText('Atelier Nova').length).toBeGreaterThan(0);
    expect(screen.queryByText('Chargement des candidatures…')).not.toBeInTheDocument();

    refresh.answer(listOf([LUMEN_UX]));

    await waitFor(() => expect(companyNames()).toEqual(['Maison Lumen']));
  });

  it('[ENF-PERF-01] keeps the filters chosen before leaving the screen', async () => {
    mockApi({ 'GET /applications': filteredList });
    const { rerender } = renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Statut'), 'rejected');
    await waitFor(() => expect(companyNames()).toEqual(['Maison Lumen']));

    leaveAndComeBack(rerender);

    expect(screen.getByLabelText('Statut')).toHaveValue('rejected');
    expect(companyNames()).toEqual(['Maison Lumen']);
  });

  it('[EF-CAN-20] lists the most recent application first by default, each naming its company', async () => {
    const calls = mockApi({ 'GET /applications': () => listOf(ALL) });

    renderPage();
    await screen.findAllByText('Atelier Nova');

    expect(screen.getByLabelText('Trier par')).toHaveValue('recent');
    expect(calls[0]?.url.searchParams.get('sort')).toBe('applied_at');
    expect(calls[0]?.url.searchParams.get('order')).toBe('desc');
    expect(screen.queryByRole('region', { name: 'Atelier Nova' })).toBeNull();
  });

  it('[EF-CAN-20] puts the applications under the heading of their day, the date no longer on every line', async () => {
    const early = application({ id: 5, company: { id: 4, name: 'Zénith' }, jobTitle: 'Chargé BI', appliedAt: '2026-08-30T09:00:00.000Z' });
    mockApi({ 'GET /applications': () => listOf([NOVA_DEV, NOVA_DATA, early]) });
    renderPage();
    await screen.findAllByText('Atelier Nova');

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['Mardi 1 septembre2', 'Dimanche 30 août1']);
    // Said once in the heading, the day stays in the name read out for each application.
    expect(screen.getByRole('button', { name: /Chargé BI/ })).toHaveAccessibleName(/candidature du 30 août 2026/);
  });

  it('[EF-CAN-20] tells nothing it does not know: no « Non précisé » contract, no « Candidature » as a title', async () => {
    const vague = application({ id: 6, company: { id: 5, name: 'CGI' }, jobTitle: 'Candidature', contractType: 'non_precise' });
    mockApi({ 'GET /applications': () => listOf([vague]) });
    renderPage();

    const line = await screen.findByRole('button', { name: /CGI/ });
    expect(line).toHaveTextContent('Poste non précisé');
    expect(line).not.toHaveTextContent('Non précisé ·');
  });

  it('[EF-CAN-20] asks the API for the order chosen', async () => {
    const calls = mockApi({ 'GET /applications': () => listOf(ALL) });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Trier par'), 'activity');

    await waitFor(() => expect(calls.at(-1)?.url.searchParams.get('sort')).toBe('last_activity'));
  });

  it('[EF-CAN-24] filters the applications by period of application', async () => {
    const calls = mockApi({ 'GET /applications': () => listOf(ALL) });
    renderPage();
    await screen.findAllByText('Atelier Nova');

    fireEvent.change(screen.getByLabelText('Candidature du'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('au'), { target: { value: '2026-09-15' } });

    await waitFor(() => {
      const last = calls.at(-1)?.url.searchParams;
      expect([last?.get('appliedFrom'), last?.get('appliedTo')]).toEqual(['2026-09-01', '2026-09-15']);
    });
  });

  it('[EF-CAN-01] groups the applications by company, companies in alphabetical order, when sorted by company', async () => {
    mockApi({ 'GET /applications': () => listOf(ALL) });

    renderPage();
    await screen.findAllByText('Atelier Nova');
    await userEvent.setup().selectOptions(screen.getByLabelText('Trier par'), 'company');
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
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Statut'), 'rejected');

    await waitFor(() => expect(companyNames()).toEqual(['Maison Lumen']));
    expect(calls.at(-1)?.url.searchParams.get('status')).toBe('rejected');
  });

  it('[EF-CAN-14] filters the applications by contract type', async () => {
    const calls = mockApi({ 'GET /applications': filteredList });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'alternance');

    await waitFor(() => expect(companyNames()).toEqual(['Maison Lumen']));
    expect(calls.at(-1)?.url.searchParams.get('contractType')).toBe('alternance');
  });

  it('[EF-CAN-03] searches the applications by company name or job title', async () => {
    const calls = mockApi({ 'GET /applications': filteredList });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Rechercher'), 'mcdo');

    await waitFor(() => expect(companyNames()).toEqual(["McDonald's"]));
    expect(calls.some((call) => call.url.searchParams.get('q') === 'mcdo')).toBe(true);
    expect(calls.some((call) => call.url.searchParams.get('q') === 'm')).toBe(false);
  });

  it('[EF-CAN-12] marks the applications to follow up', async () => {
    mockApi({ 'GET /applications': () => listOf(ALL) });

    renderPage();
    await screen.findAllByText('Atelier Nova');

    expect(within(itemOf(/Développeur/)).getByText('À relancer')).toBeInTheDocument();
    expect(within(itemOf(/Data analyst/)).queryByText('À relancer')).not.toBeInTheDocument();
  });

  it('[EF-CAN-04] opens the chronology of an application, oldest message first', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1': () => json(200, NOVA_DEV_DETAIL),
      'GET /applications/1/emails': () => json(200, EMAILS),
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
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
    expect(
      within(messages[1] as HTMLElement).getByText('Nous avons bien reçu votre candidature.'),
    ).toBeInTheDocument();
    expect(within(messages[1] as HTMLElement).getByRole('time')).toHaveAttribute(
      'dateTime',
      '2026-09-03T10:00:00.000Z',
    );
    expect(screen.getByRole('button', { name: /Développeur/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('[EF-CAN-05] links every message to its thread in Gmail, in a new tab', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1': () => json(200, NOVA_DEV_DETAIL),
      'GET /applications/1/emails': () => json(200, EMAILS),
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
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
      'GET /applications/1': () => json(200, NOVA_DEV_DETAIL),
      'GET /applications/1/emails': () =>
        json(200, [{ ...EMAILS[0], gmailUrl: 'javascript:alert(document.cookie)' }]),
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
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
    await screen.findAllByText('Atelier Nova');
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
      'GET /applications/1': () => json(200, NOVA_DEV_DETAIL),
      'GET /applications/1/emails': () => json(200, []),
      'PATCH /applications/1': () => json(404, { error: 'Candidature introuvable' }),
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Développeur/ }));

    await user.selectOptions(await screen.findByLabelText('Changer le statut'), 'interview');

    expect(await screen.findByRole('alert')).toHaveTextContent('Candidature introuvable');
    expect(screen.getByLabelText('Changer le statut')).toHaveValue('sent');
  });

  it('[EF-CAN-06] adds an application by hand and shows it in the list', async () => {
    let items = ALL;
    const created = application({
      id: 5,
      company: { id: 4, name: 'Studio Ardent' },
      jobTitle: 'UX',
      contractType: 'cdd',
    });
    const calls = mockApi({
      'GET /applications': () => listOf(items),
      'POST /applications': () => {
        items = [...ALL.slice(0, 3), MCDO, created];
        return json(201, { id: 5 });
      },
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Ajouter une candidature' }));
    const form = screen.getByRole('form', { name: 'Nouvelle candidature' });
    await user.type(within(form).getByLabelText('Entreprise'), 'Studio Ardent');
    await user.type(within(form).getByLabelText('Intitulé du poste'), 'UX');
    await user.selectOptions(within(form).getByLabelText('Type de contrat'), 'cdd');
    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));

    expect(await screen.findByText('Studio Ardent')).toBeInTheDocument();
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
    await screen.findAllByText('Atelier Nova');
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
    await screen.findAllByText('Atelier Nova');
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
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Afficher plus/ }));

    expect(await screen.findByText('Zénith')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Afficher plus/ })).not.toBeInTheDocument();
    expect(calls.at(-1)?.url.searchParams.get('offset')).toBe('100');
  });
});

describe('ApplicationsPage — offer description and application date (T-104)', () => {
  // Only Date is faked: timers stay real for userEvent and the search delay.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 22, 10, 0, 0) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const openCreationForm = async () => {
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ajouter une candidature' }));
    const form = screen.getByRole('form', { name: 'Nouvelle candidature' });
    await user.type(within(form).getByLabelText('Entreprise'), 'Arkema');
    await user.type(within(form).getByLabelText('Intitulé du poste'), 'Data Engineer');
    return { user, form };
  };

  const localNoon = (year: number, monthIndex: number, day: number) =>
    new Date(year, monthIndex, day, 12, 0, 0).toISOString();

  it('[EF-CAN-16] shows the date of the application in its summary', async () => {
    mockApi({ 'GET /applications': () => listOf(ALL) });

    renderPage();

    expect(await screen.findByRole('button', { name: /Développeur/ })).toHaveAccessibleName(
      /candidature du 1 sept\. 2026/,
    );
  });

  it('[EF-CAN-16] dates a new application in the past', async () => {
    const calls = mockApi({
      'GET /applications': () => listOf(ALL),
      'POST /applications': () => json(201, { id: 9 }),
    });
    const { user, form } = await openCreationForm();
    const date = within(form).getByLabelText('Date de candidature');
    expect(date).toHaveValue('2026-09-22');

    fireEvent.change(date, { target: { value: '2026-09-07' } });
    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      appliedAt: localNoon(2026, 8, 7),
    });
  });

  it('[EF-CAN-16] refuses a date in the future without calling the API', async () => {
    const calls = mockApi({ 'GET /applications': () => listOf(ALL) });
    const { user, form } = await openCreationForm();

    fireEvent.change(within(form).getByLabelText('Date de candidature'), { target: { value: '2026-09-23' } });
    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));

    expect(
      within(form).getByText('La date de candidature ne peut pas être dans le futur.'),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText('Date de candidature')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('[EF-CAN-15] adds an application with the description of the offer', async () => {
    const calls = mockApi({
      'GET /applications': () => listOf(ALL),
      'POST /applications': () => json(201, { id: 9 }),
    });
    const { user, form } = await openCreationForm();

    await user.type(
      within(form).getByLabelText('Description de l’offre'),
      'Pipelines de données sous Airflow.',
    );
    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      offerDescription: 'Pipelines de données sous Airflow.',
    });
  });

  it('[EF-CAN-15] shows the description of the offer in the detail of the application', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1': () => json(200, { ...NOVA_DEV_DETAIL, offerDescription: OFFER_TEXT }),
      'GET /applications/1/emails': () => json(200, []),
      'GET /applications/2': () => json(200, { ...NOVA_DATA, offerDescription: null }),
      'GET /applications/2/emails': () => json(200, []),
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Développeur/ }));
    expect(await screen.findByText(/Pipelines de données sous Airflow\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Data analyst/ }));
    expect(await screen.findByText('Aucune description enregistrée.')).toBeInTheDocument();
  });

  it('[EF-CAN-15] [EF-CAN-16] changes the description and the date from the detail', async () => {
    let detail: ApplicationDetail = { ...NOVA_DEV_DETAIL, offerDescription: OFFER_TEXT };
    const calls = mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1': () => json(200, detail),
      'GET /applications/1/emails': () => json(200, []),
      'PATCH /applications/1': (_url, body) => {
        detail = { ...detail, ...(body as Partial<ApplicationDetail>) };
        return new Response(null, { status: 204 });
      },
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Développeur/ }));
    await user.click(await screen.findByRole('button', { name: 'Modifier la candidature' }));

    const form = screen.getByRole('form', { name: 'Détails de la candidature' });
    const description = within(form).getByLabelText('Description de l’offre');
    expect(description).toHaveValue(OFFER_TEXT);
    await user.clear(description);
    await user.type(description, 'Nouvelle description');
    fireEvent.change(within(form).getByLabelText('Date de candidature'), { target: { value: '2026-09-05' } });
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Nouvelle description')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      offerDescription: 'Nouvelle description',
      appliedAt: localNoon(2026, 8, 5),
    });
    expect(screen.getByRole('button', { name: /Développeur/ })).toHaveAccessibleName(
      /candidature du 5 sept\. 2026/,
    );
  });

  it('[EF-CAN-13] [EF-CAN-08] changes the contract type and writes notes', async () => {
    let detail: ApplicationDetail = { ...NOVA_DEV_DETAIL };
    const calls = mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1': () => json(200, detail),
      'GET /applications/1/emails': () => json(200, []),
      'PATCH /applications/1': (_url, body) => {
        detail = { ...detail, ...(body as Partial<ApplicationDetail>) };
        return new Response(null, { status: 204 });
      },
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Développeur/ }));
    await user.click(await screen.findByRole('button', { name: 'Modifier la candidature' }));

    const form = screen.getByRole('form', { name: 'Détails de la candidature' });
    await user.selectOptions(within(form).getByLabelText('Type de contrat'), 'alternance');
    await user.type(within(form).getByLabelText('Notes'), 'Relancer après le salon');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Notes : Relancer après le salon')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      contractType: 'alternance',
      notes: 'Relancer après le salon',
    });
  });

  it('[EF-CAN-09] deletes an application once confirmed, and takes it out of the list', async () => {
    const calls = mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1': () => json(200, NOVA_DEV_DETAIL),
      'GET /applications/1/emails': () => json(200, []),
      'DELETE /applications/1': () => new Response(null, { status: 204 }),
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Développeur/ }));

    await user.click(await screen.findByRole('button', { name: 'Supprimer la candidature' }));
    const confirmation = screen.getByRole('group', { name: 'Confirmer la suppression' });
    expect(confirmation).toHaveTextContent('Les messages restent dans Gmail.');
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await user.click(within(confirmation).getByRole('button', { name: 'Supprimer définitivement' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Développeur/ })).toBeNull());
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  });

  it('[EF-CAN-09] keeps the application when the deletion is cancelled', async () => {
    const calls = mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1': () => json(200, NOVA_DEV_DETAIL),
      'GET /applications/1/emails': () => json(200, []),
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Développeur/ }));

    await user.click(await screen.findByRole('button', { name: 'Supprimer la candidature' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Confirmer la suppression' })).getByRole('button', {
        name: 'Annuler',
      }),
    );

    expect(screen.getByRole('button', { name: /Développeur/ })).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('[EF-CAN-15] clears the description of the offer', async () => {
    let detail: ApplicationDetail = { ...NOVA_DEV_DETAIL, offerDescription: OFFER_TEXT };
    const calls = mockApi({
      'GET /applications': () => listOf(ALL),
      'GET /applications/1': () => json(200, detail),
      'GET /applications/1/emails': () => json(200, []),
      'PATCH /applications/1': (_url, body) => {
        detail = { ...detail, ...(body as Partial<ApplicationDetail>) };
        return new Response(null, { status: 204 });
      },
    });
    renderPage();
    await screen.findAllByText('Atelier Nova');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Développeur/ }));
    await user.click(await screen.findByRole('button', { name: 'Modifier la candidature' }));

    const form = screen.getByRole('form', { name: 'Détails de la candidature' });
    await user.clear(within(form).getByLabelText('Description de l’offre'));
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Aucune description enregistrée.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ offerDescription: null });
  });

  it('[EF-CAN-06] shows the reason given by the API under the refused field', async () => {
    mockApi({
      'GET /applications': () => listOf(ALL),
      'POST /applications': () =>
        json(400, {
          error: 'Données invalides',
          details: [{ path: 'body.companyName', message: 'Doit contenir au moins une lettre ou un chiffre' }],
        }),
    });
    const { user, form } = await openCreationForm();

    await user.click(within(form).getByRole('button', { name: 'Ajouter' }));

    expect(
      await within(form).findByText('Doit contenir au moins une lettre ou un chiffre'),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText('Entreprise')).toHaveAttribute('aria-invalid', 'true');
  });
});
