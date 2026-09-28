import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTER_FUTURE } from '../../lib/router';
import { openStreams } from '../../test/setup';
import { CvWorkshopPage } from './CvWorkshopPage';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const RUN_ID = 5;
const OFFER = 'Data Analyst en CDI à Lyon. Vous maîtrisez SQL, Python, dbt et Airflow. '.repeat(4);
const explained = (score: number, explanation: string) => ({ score, explanation });
const ANALYSIS = {
  reading: {
    text: 'Data Analyst - Atelier Nova\nTableaux de bord Power BI pour 12 equipes commerciales.',
    contacts: {
      name: 'Camille Durand',
      emails: ['camille.durand@example.com'],
      phones: ['06 12 34 56 78'],
      address: null,
      links: [],
    },
    ocrPageCount: 0,
  },
  diagnosis: {
    overallScore: 70,
    dimensions: {
      skills: explained(80, 'Vous maîtrisez SQL et Python, deux piliers de l’offre.'),
      experience: explained(60, 'Deux ans de tableaux de bord chez Atelier Nova, c’est un vrai atout.'),
      education: explained(90, 'Votre master correspond exactement au niveau demandé.'),
      techStack: explained(40, 'Airflow et dbt n’apparaissent pas dans votre CV.'),
    },
    weakDimensions: ['techStack'],
    missingSkills: ['dbt', 'Airflow'],
  },
  adapted: {
    cv: {
      headline: 'Data Analyst',
      profile: 'Data analyst tournée vers les tableaux de bord et SQL.',
      experiences: [
        {
          title: 'Data Analyst',
          organization: 'Atelier Nova',
          place: null,
          dates: '09/2024 – 08/2026',
          bullets: ['Conception de tableaux de bord Power BI pour 12 équipes commerciales.'],
        },
      ],
      education: [{ degree: 'Master Informatique', school: 'Université de Lyon', place: null, dates: '2024', detail: null }],
      skills: ['SQL', 'Python', 'Power BI'],
      certifications: [],
      languages: [],
      interests: [],
    },
    changes: [
      {
        section: 'Expériences professionnelles',
        before: 'Tableaux de bord Power BI pour 12 equipes commerciales.',
        after: 'Conception de tableaux de bord Power BI pour 12 équipes commerciales.',
        reason: 'L’offre parle de conception de tableaux de bord : le verbe d’action le met en avant.',
      },
    ],
  },
};

const mockApi = (analysis: unknown = ANALYSIS) => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
    if (url === '/api/cv-workshop/analyses') return Promise.resolve(json(202, { runId: RUN_ID }));
    if (url === `/api/cv-workshop/analyses/${String(RUN_ID)}/docx`) {
      return Promise.resolve(
        // A text body: Node's Response does not take a jsdom Blob.
        new Response('PK docx', {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="cv-adapte.docx"' },
        }),
      );
    }
    if (url === `/api/cv-workshop/analyses/${String(RUN_ID)}`) return Promise.resolve(json(200, analysis));
    return Promise.resolve(json(200, { id: RUN_ID, job: 'cv_analysis', outcome: 'running', counters: {} }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderPage = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <CvWorkshopPage />
    </MemoryRouter>,
  );

const pdfFile = (content = '%PDF-1.4 cv fictif') => new File([content], 'cv.pdf', { type: 'application/pdf' });

/** Publishes a state of the run on the stream of executions, as the API does (EF-EXE-04). */
const publish = (outcome: 'running' | 'success' | 'failure', extra: object = {}) =>
  act(() => {
    for (const stream of openStreams) {
      stream.emit('run', { id: RUN_ID, job: 'cv_analysis', trigger: 'manual', outcome, counters: {}, error: null, ...extra });
    }
  });

const fillForm = async ({ file = pdfFile(), offer = OFFER } = {}) => {
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(screen.getByLabelText('1. Votre CV'), file);
  if (offer) {
    await user.click(screen.getByLabelText('2. L’offre qui vous intéresse'));
    await user.paste(offer);
  }
  return user;
};

/** Fills the form, sends it, and waits for the API to have received it. */
const analyse = async (fetchMock: ReturnType<typeof mockApi>) => {
  const user = await fillForm();
  await user.click(screen.getByRole('button', { name: 'Analyser' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cv-workshop/analyses', expect.anything()));
  return user;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CvWorkshopPage — the form', () => {
  it('[EF-CVX-21] says under the field that a file is not a PDF, and sends nothing', async () => {
    const fetchMock = mockApi();
    renderPage();

    await fillForm({ file: new File(['docx'], 'cv.docx', { type: 'application/msword' }), offer: '' });

    expect(screen.getByLabelText('1. Votre CV')).toHaveAccessibleDescription(/Ce fichier n’est pas un PDF/);
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[EF-CVX-21] says a CV of more than 5 MB is too heavy, and sends nothing', async () => {
    const fetchMock = mockApi();
    renderPage();

    await fillForm({ file: pdfFile('x'.repeat(5 * 1024 * 1024 + 1)), offer: '' });

    expect(screen.getByText('Votre CV dépasse 5 Mo : essayez une version plus légère.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[EF-CVX-23] asks for the whole offer when it is too short, under its field', async () => {
    const fetchMock = mockApi();
    renderPage();
    const user = await fillForm({ offer: 'Data Analyst, SQL.' });

    await user.click(screen.getByRole('button', { name: 'Analyser' }));

    expect(screen.getByLabelText('2. L’offre qui vous intéresse')).toHaveAccessibleDescription(
      /L’offre semble incomplète : collez le texte entier de l’annonce\./,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CvWorkshopPage — the analysis', () => {
  it('[EF-CVX-32] sends the PDF in base64 with the offer, then tells where the analysis stands', async () => {
    const fetchMock = mockApi();
    renderPage();

    await analyse(fetchMock);

    const init = fetchMock.mock.calls.find(([url]) => url === '/api/cv-workshop/analyses')?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ file: btoa('%PDF-1.4 cv fictif'), offer: OFFER.trim() });
    expect(screen.getByRole('button', { name: 'Analyse en cours…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('On lit votre CV…');

    await publish('running', { counters: { cv_steps_done: 1 } });

    expect(screen.getByRole('status')).toHaveTextContent('On lit votre CV : c’est fait.');
    expect(screen.getByRole('status')).toHaveTextContent('On le compare à l’offre…');

    await publish('running', { counters: { cv_steps_done: 2 } });

    expect(screen.getByRole('status')).toHaveTextContent('On le compare à l’offre : c’est fait.');
    expect(screen.getByRole('status')).toHaveTextContent('On l’adapte à l’offre…');
  });

  it('[EF-CVX-34] shows why the analysis failed, and lets the candidate try again', async () => {
    const fetchMock = mockApi();
    renderPage();
    await analyse(fetchMock);

    await publish('failure', { error: 'Ce PDF est protégé par un mot de passe.' });

    expect(await screen.findByRole('alert')).toHaveTextContent('protégé par un mot de passe');
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeEnabled();
  });
});

describe('CvWorkshopPage — the result', () => {
  const showResult = async (analysis: unknown = ANALYSIS) => {
    const fetchMock = mockApi(analysis);
    renderPage();
    const user = await analyse(fetchMock);
    await publish('success');
    await screen.findByRole('region', { name: 'Votre score' });
    return user;
  };

  it('[EF-CVX-24] [RG-23] shows the overall score with a verdict in words', async () => {
    await showResult();

    const score = screen.getByRole('region', { name: 'Votre score' });
    expect(score).toHaveTextContent('70/100');
    expect(score).toHaveTextContent('Correspondance partielle');
  });

  it('[EF-CVX-24] [EF-CVX-30] details the four dimensions, their reasons, and names the weak one', async () => {
    await showResult();

    const detail = screen.getByRole('region', { name: 'Dans le détail' });
    expect(within(detail).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Compétences',
      'Expérience',
      'Outils et technologies',
      'Formation',
    ]);
    expect(within(detail).getByRole('meter', { name: 'Outils et technologies : 40 sur 100' })).toBeInTheDocument();
    expect(within(detail).getByText('Airflow et dbt n’apparaissent pas dans votre CV.')).toBeInTheDocument();
    expect(within(detail).getAllByText('À renforcer')).toHaveLength(1);
  });

  it('[EF-CVX-27] lists what the offer asks for and the CV does not say, each to tick', async () => {
    await showResult();

    const missing = screen.getByRole('region', { name: 'Ce que l’offre demande et que votre CV ne dit pas' });
    expect(within(missing).getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual([
      'dbt',
      'Airflow',
    ]);
    expect(within(missing).queryAllByRole('checkbox', { checked: true })).toHaveLength(0);
  });

  it('[EF-CVX-25] shows the adapted CV, said to invent nothing', async () => {
    await showResult();

    const adapted = screen.getByRole('region', { name: 'Votre CV, adapté à cette offre' });
    expect(adapted).toHaveTextContent('Rien n’a été inventé');
    const preview = within(adapted).getByRole('article', { name: 'Aperçu de votre CV adapté' });
    expect(preview).toHaveTextContent('Data Analyst — Atelier Nova');
    expect(preview).toHaveTextContent('Conception de tableaux de bord Power BI pour 12 équipes commerciales.');
    expect(preview).toHaveTextContent('SQL, Python, Power BI');
  });

  it('[EF-CVX-29] shows each change: before, after and why', async () => {
    await showResult();

    const changes = screen.getByRole('region', { name: 'Ce qui a changé, et pourquoi' });
    expect(within(changes).getByText('Tableaux de bord Power BI pour 12 equipes commerciales.')).toBeInTheDocument();
    expect(within(changes).getByText('Conception de tableaux de bord Power BI pour 12 équipes commerciales.')).toBeInTheDocument();
    expect(within(changes).getByText(/le verbe d’action le met en avant/)).toBeInTheDocument();
  });

  it('[EF-CVX-28] adds a ticked skill to the preview, and the score does not move', async () => {
    const user = await showResult();

    await user.click(screen.getByRole('checkbox', { name: 'Airflow' }));

    expect(screen.getByRole('article', { name: 'Aperçu de votre CV adapté' })).toHaveTextContent(
      'SQL, Python, Power BI, Airflow',
    );
    expect(screen.getByRole('region', { name: 'Votre score' })).toHaveTextContent('70/100');
  });

  it('[EF-CVX-31] [EF-CVX-28] downloads the Word file with the ticked skills', async () => {
    const saved: string[] = [];
    // jsdom has no object URLs: the real URL keeps its constructor, only the two missing functions are added.
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:cv', revokeObjectURL: () => undefined }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    const user = await showResult();
    await user.click(screen.getByRole('checkbox', { name: 'dbt' }));

    await user.click(screen.getByRole('button', { name: 'Télécharger mon CV (Word)' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
      expect(saved).toEqual(['cv-adapte.docx']);
    });
    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls.find(([url]) => url === `/api/cv-workshop/analyses/${String(RUN_ID)}/docx`)?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ addedSkills: ['dbt'] });
    click.mockRestore();
  });

  it('[EF-CVX-27] says so warmly when nothing important is missing', async () => {
    await showResult({ ...ANALYSIS, diagnosis: { ...ANALYSIS.diagnosis, missingSkills: [] } });

    expect(screen.getByText('Rien d’important ne manque. Bravo !')).toBeInTheDocument();
  });

  it('[EF-CVX-35] [ENF-RGP-07] keeps folded what the AI received, and the contact details kept aside', async () => {
    const user = await showResult();

    await user.click(screen.getByText('Ce que l’IA a reçu'));

    const received = within(screen.getByText('Ce que l’IA a reçu').closest('details') as HTMLElement);
    expect(received.getByText(/Tableaux de bord Power BI/)).toBeVisible();
    expect(received.getByText('camille.durand@example.com')).toBeVisible();
    expect(received.getAllByText('non repéré')).toHaveLength(2);
  });

  it('[ENF-RGP-06] offers another offer, keeping the CV, and recalls that nothing is kept', async () => {
    const user = await showResult();
    expect(screen.getByText('Rien n’est gardé : ce résultat s’efface dans 30 minutes.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Analyser une autre offre' }));

    expect(screen.getByText('Votre CV : cv.pdf. Choisissez-en un autre si besoin.')).toBeInTheDocument();
    expect(screen.getByLabelText('2. L’offre qui vous intéresse')).toHaveValue('');
  });
});
