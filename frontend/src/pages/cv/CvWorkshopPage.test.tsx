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
};

const mockApi = (analysis = ANALYSIS) => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
    if (url === '/api/cv-workshop/analyses') return Promise.resolve(json(202, { runId: RUN_ID }));
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

const pdfFile = (content = '%PDF-1.4 cv fictif', name = 'cv.pdf') => new File([content], name, { type: 'application/pdf' });

/** Publishes the end of the run on the stream of executions, as the API does (EF-EXE-04). */
const endRun = (outcome: 'success' | 'failure', error: string | null = null) =>
  act(() => {
    for (const stream of openStreams) {
      stream.emit('run', { id: RUN_ID, job: 'cv_analysis', trigger: 'manual', outcome, counters: {}, error });
    }
  });

const chooseAndRead = async (file: File) => {
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(screen.getByLabelText('CV au format PDF, 5 Mo au plus'), file);
  await user.click(screen.getByRole('button', { name: 'Lire mon CV' }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CvWorkshopPage', () => {
  it('[EF-CVX-21] refuses a file that is not a PDF, without sending it', async () => {
    const fetchMock = mockApi();
    renderPage();
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(
      screen.getByLabelText('CV au format PDF, 5 Mo au plus'),
      new File(['docx'], 'cv.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Seul un CV au format PDF est accepté.');
    expect(screen.getByRole('button', { name: 'Lire mon CV' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[EF-CVX-21] refuses a CV of more than 5 MB, without sending it', async () => {
    const fetchMock = mockApi();
    renderPage();
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(screen.getByLabelText('CV au format PDF, 5 Mo au plus'), pdfFile('x'.repeat(5 * 1024 * 1024 + 1)));

    expect(screen.getByRole('alert')).toHaveTextContent('Le CV dépasse 5 Mo.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[EF-CVX-32] sends the PDF in base64 and waits for the queue, its button disabled', async () => {
    const fetchMock = mockApi();
    renderPage();

    await chooseAndRead(pdfFile());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cv-workshop/analyses', expect.anything()));
    const init = fetchMock.mock.calls.find(([url]) => url === '/api/cv-workshop/analyses')?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ file: btoa('%PDF-1.4 cv fictif') });
    expect(screen.getByRole('button', { name: 'Lecture en cours…' })).toBeDisabled();
  });

  it('[ENF-RGP-07] shows the text the AI will receive and the contact details kept aside', async () => {
    const fetchMock = mockApi();
    renderPage();
    await chooseAndRead(pdfFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cv-workshop/analyses', expect.anything()));

    await endRun('success');

    const text = await screen.findByRole('region', { name: 'Texte lu, tel que l’IA le recevra' });
    expect(text).toHaveTextContent('Data Analyst - Atelier Nova');
    const contacts = screen.getByRole('region', { name: 'Coordonnées mises à part' });
    expect(within(contacts).getByText('camille.durand@example.com')).toBeInTheDocument();
    expect(within(contacts).getByText('06 12 34 56 78')).toBeInTheDocument();
    expect(within(contacts).getAllByText('non repéré')).toHaveLength(2);
  });

  it('[EF-CVX-22] says how many pages were read by OCR, so that the candidate checks them', async () => {
    const fetchMock = mockApi({ reading: { ...ANALYSIS.reading, ocrPageCount: 2 } });
    renderPage();
    await chooseAndRead(pdfFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cv-workshop/analyses', expect.anything()));

    await endRun('success');

    expect(await screen.findByText(/2 pages lues par reconnaissance de caractères/)).toBeInTheDocument();
  });

  it('[EF-CVX-34] shows the reason a CV could not be read, and lets the candidate try again', async () => {
    const fetchMock = mockApi();
    renderPage();
    await chooseAndRead(pdfFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cv-workshop/analyses', expect.anything()));

    await endRun('failure', 'Ce PDF est protégé par un mot de passe : exportez-le sans protection.');

    expect(await screen.findByRole('alert')).toHaveTextContent('protégé par un mot de passe');
    expect(screen.getByRole('button', { name: 'Lire mon CV' })).toBeEnabled();
  });
});
