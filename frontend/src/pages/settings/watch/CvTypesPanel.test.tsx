import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bodiesOf,
  CV_TYPE,
  cvTypes,
  emitRun,
  json,
  keysOf,
  mockApi,
  PDF_BASE64,
  pdfFile,
  renderSection,
} from './testApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

const DEVELOPER = {
  ...CV_TYPE,
  id: 2,
  label: 'Développeur',
  years: 1,
  level: 'junior',
  deductionReady: true,
};
const MANAGER = { ...CV_TYPE, id: 3, label: 'Chef de projet', years: 9, level: 'senior' };
const FOURTH = { ...CV_TYPE, id: 4, label: 'Consultant', years: 5 };

const importForm = () => screen.findByRole('form', { name: 'Importer un CV type' });

/** The reading is followed once the API has answered with its run; the file is read in the browser first, which takes a moment. */
const progressOfReading = () => screen.findByRole('status', { name: 'Avancement de l’import' });

/** Fills the import form with a label and a PDF and sends it. */
const importCv = async (user: ReturnType<typeof userEvent.setup>, label = 'Data analyst') => {
  const form = await importForm();
  await user.type(within(form).getByLabelText('Libellé du CV type'), label);
  await user.upload(within(form).getByLabelText('Fichier PDF'), pdfFile());
  await user.click(within(form).getByRole('button', { name: 'Importer ce CV type' }));
  return form;
};

describe('WatchSettings — the CV types (EF-CVX-39 to EF-CVX-43)', () => {
  it('[EF-CVX-39] lists each CV type with its years and level, and says which profile waits for validation', async () => {
    mockApi({ 'GET /cv-types': () => cvTypes(CV_TYPE, DEVELOPER) });

    renderSection();
    const list = await screen.findByRole('list', { name: 'Vos CV types' });
    const [first, second] = within(list).getAllByRole('listitem');

    expect(first).toHaveTextContent('Data analyst');
    expect(first).toHaveTextContent('4 ans d’expérience · Confirmé');
    expect(first).not.toHaveTextContent('Profil à valider');
    expect(second).toHaveTextContent('Développeur');
    expect(second).toHaveTextContent('1 an d’expérience · Junior');
    expect(second).toHaveTextContent('Profil à valider');
  });

  it('[ENF-UTI-03] shows a waiting state while the CV types are read', () => {
    mockApi({ 'GET /cv-types': () => new Promise<Response>(() => undefined) });

    renderSection();

    expect(screen.getByText('Chargement de vos CV types…')).toBeInTheDocument();
  });

  it('[ENF-UTI-03] shows the reason the CV types cannot be read, and lets the candidate try again', async () => {
    let isDown = true;
    mockApi({
      'GET /cv-types': () =>
        isDown ? json(500, { error: 'Une erreur inattendue est survenue.' }) : cvTypes(CV_TYPE),
    });
    renderSection();
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur inattendue est survenue.');
    isDown = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('list', { name: 'Vos CV types' })).toHaveTextContent('Data analyst');
  });

  it('[EF-CVX-39] invites the candidate to provide three or four CV types while they have fewer', async () => {
    mockApi({ 'GET /cv-types': () => cvTypes(CV_TYPE) });

    renderSection();

    expect(await screen.findByText(/1 CV type sur 4\. Importez-en 3 ou 4/)).toBeInTheDocument();
  });

  it('[EF-CVX-39] invites the candidate to start when they have none', async () => {
    mockApi({});

    renderSection();

    expect(await screen.findByText(/Aucun CV type pour l’instant\. Importez-en 3 ou 4/)).toBeInTheDocument();
  });

  it('[EF-CVX-39] stops insisting at three CV types, and still offers a fourth', async () => {
    mockApi({ 'GET /cv-types': () => cvTypes(CV_TYPE, DEVELOPER, MANAGER) });

    renderSection();

    expect(
      await screen.findByText(/3 CV types sur 4 : c’est ce que nous vous conseillons/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Importez-en 3 ou 4/)).not.toBeInTheDocument();
    expect(await importForm()).toBeInTheDocument();
  });

  it('[EF-CVX-39] offers no import at four CV types, and says to remove one first', async () => {
    mockApi({ 'GET /cv-types': () => cvTypes(CV_TYPE, DEVELOPER, MANAGER, FOURTH) });

    renderSection();

    expect(
      await screen.findByText('4 CV types sur 4 : supprimez-en un pour en importer un autre.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Importer un CV type' })).not.toBeInTheDocument();
  });

  it('[EF-CVX-39] [EF-CVX-43] [ENF-UTI-03] sends the label and the PDF in base64, then follows the reading and the deduction', async () => {
    let items: object[] = [];
    const calls = mockApi({
      'GET /cv-types': () => cvTypes(...items),
      'POST /cv-types': () => json(202, { runId: 7 }),
    });
    renderSection();
    const user = userEvent.setup();

    await importCv(user);

    const progress = await progressOfReading();
    expect(bodiesOf(calls, 'POST /cv-types')).toEqual([{ label: 'Data analyst', file: PDF_BASE64 }]);
    expect(within(progress).getByRole('listitem', { current: 'step' })).toHaveTextContent('Lecture du CV');
    expect(screen.getByRole('button', { name: 'Import en cours…' })).toBeDisabled();

    emitRun({ id: 7, job: 'profile_deduction', outcome: 'running', counters: { cv_steps_done: 1 } });
    expect(within(progress).getByRole('listitem', { current: 'step' })).toHaveTextContent(
      'Déduction du profil',
    );

    items = [{ ...CV_TYPE, deductionReady: true }];
    emitRun({ id: 7, job: 'profile_deduction', outcome: 'success', counters: { cv_steps_done: 2 } });

    expect(
      await screen.findByText('« Data analyst » est importé : son profil est à valider ci-dessous.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Vos CV types' })).toHaveTextContent('Data analyst');
    expect(screen.queryByRole('status', { name: 'Avancement de l’import' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer ce CV type' })).toBeEnabled();
    expect(screen.getByLabelText('Libellé du CV type')).toHaveValue('');
    expect(keysOf(calls).filter((key) => key === 'GET /cv-types')).toHaveLength(2);
  });

  it('[EF-CVX-43] says a reading is waiting for its turn', async () => {
    mockApi({ 'POST /cv-types': () => json(202, { runId: 7 }) });
    renderSection();
    const user = userEvent.setup();

    await importCv(user);
    await progressOfReading();
    emitRun({ id: 7, job: 'profile_deduction', outcome: 'queued' });

    expect(await screen.findByText('En attente de son tour…')).toBeInTheDocument();
  });

  it('[EF-CVX-43] [EF-EXE-03] shows why a reading failed, and gives the form back as it was filled', async () => {
    mockApi({ 'POST /cv-types': () => json(202, { runId: 8 }) });
    renderSection();
    const user = userEvent.setup();

    await importCv(user);
    await progressOfReading();
    emitRun({
      id: 8,
      job: 'profile_deduction',
      outcome: 'failure',
      error: 'Ce PDF est protégé par un mot de passe : retirez la protection puis réessayez.',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce PDF est protégé par un mot de passe');
    expect(screen.getByRole('button', { name: 'Importer ce CV type' })).toBeEnabled();
    expect(screen.getByLabelText('Libellé du CV type')).toHaveValue('Data analyst');
  });

  it('[EF-CVX-43] [EF-EXE-03] catches the end of a reading the stream did not announce, by asking for the run', async () => {
    mockApi({
      'POST /cv-types': () => json(202, { runId: 11 }),
      'GET /jobs/11': () =>
        json(200, {
          id: 11,
          job: 'profile_deduction',
          trigger: 'manual',
          outcome: 'failure',
          counters: {},
          error: 'Aucun service d’IA n’a pu traiter la demande. Réessayez dans quelques minutes.',
        }),
    });
    renderSection();
    const user = userEvent.setup();

    await importCv(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aucun service d’IA n’a pu traiter la demande.',
    );
  });

  it('[EF-CVX-43] [EF-EXE-04] tells the end of a reading once, even when the stream and the check both bring it', async () => {
    const ended = {
      id: 12,
      job: 'profile_deduction',
      trigger: 'manual',
      outcome: 'success',
      counters: {},
      error: null,
    };
    let answerCheck: () => void = () => undefined;
    const calls = mockApi({
      'POST /cv-types': () => json(202, { runId: 12 }),
      'GET /jobs/12': () =>
        new Promise<Response>((resolve) => {
          answerCheck = () => resolve(json(200, ended));
        }),
    });
    renderSection();
    const user = userEvent.setup();

    await importCv(user);
    await progressOfReading();
    emitRun(ended as Parameters<typeof emitRun>[0]);
    await screen.findByText('« Data analyst » est importé : son profil est à valider ci-dessous.');
    answerCheck();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(keysOf(calls).filter((key) => key === 'GET /cv-types')).toHaveLength(2);
  });

  it.each([
    [0, 'Donnez un libellé à ce CV type.'],
    [81, 'Le libellé dépasse 80 caractères : gardez l’essentiel.'],
  ])('[EF-CVX-39] refuses a label of %i characters before sending anything', async (length, message) => {
    const calls = mockApi({});
    renderSection();
    const user = userEvent.setup();
    const form = await importForm();

    await user.upload(within(form).getByLabelText('Fichier PDF'), pdfFile());
    if (length > 0) {
      await user.click(within(form).getByLabelText('Libellé du CV type'));
      await user.paste('x'.repeat(length));
    }
    await user.click(within(form).getByRole('button', { name: 'Importer ce CV type' }));

    expect(within(form).getByText(message)).toBeInTheDocument();
    expect(within(form).getByLabelText('Libellé du CV type')).toBeInvalid();
    expect(keysOf(calls)).not.toContain('POST /cv-types');
  });

  it('[EF-CVX-39] asks for the file when there is none, and sends nothing', async () => {
    const calls = mockApi({});
    renderSection();
    const user = userEvent.setup();
    const form = await importForm();

    await user.type(within(form).getByLabelText('Libellé du CV type'), 'Data analyst');
    await user.click(within(form).getByRole('button', { name: 'Importer ce CV type' }));

    expect(within(form).getByText('Choisissez le PDF de ce CV.')).toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('POST /cv-types');
  });

  it('[EF-CVX-39] [EF-CVX-40] says under the field that a file is not a PDF or weighs over 5 MB, and sends nothing', async () => {
    const calls = mockApi({});
    renderSection();
    const user = userEvent.setup({ applyAccept: false });
    const form = await importForm();
    const field = within(form).getByLabelText('Fichier PDF');
    const heavy = pdfFile('gros.pdf');
    Object.defineProperty(heavy, 'size', { value: 5 * 1024 * 1024 + 1 });

    await user.upload(field, new File(['x'], 'cv.docx', { type: 'application/msword' }));
    expect(within(form).getByText(/Ce fichier n’est pas un PDF/)).toBeInTheDocument();
    await user.upload(field, heavy);
    expect(
      within(form).getByText('Votre CV dépasse 5 Mo : essayez une version plus légère.'),
    ).toBeInTheDocument();
    await user.type(within(form).getByLabelText('Libellé du CV type'), 'Data analyst');
    await user.click(within(form).getByRole('button', { name: 'Importer ce CV type' }));

    expect(keysOf(calls)).not.toContain('POST /cv-types');
  });

  it.each([
    [409, 'Vous avez déjà 4 CV types : supprimez-en un pour en importer un autre.'],
    [413, 'Votre CV dépasse 5 Mo : essayez une version plus légère.'],
    [429, 'Vous avez lancé vos 5 lectures de CV du jour. Rendez-vous demain !'],
    [400, 'Ce fichier n’est pas un PDF lisible.'],
  ])(
    '[EF-CVX-39] [EF-CVX-44] shows what the API answers to an import refused with %i',
    async (status, error) => {
      mockApi({ 'POST /cv-types': () => json(status, { error }) });
      renderSection();
      const user = userEvent.setup();

      await importCv(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(error);
      expect(screen.getByRole('button', { name: 'Importer ce CV type' })).toBeEnabled();
    },
  );

  it('[EF-CVX-41] replaces the file of a CV type, then follows the reading like an import', async () => {
    const calls = mockApi({
      'GET /cv-types': () => cvTypes(CV_TYPE),
      'PUT /cv-types/1': () => json(202, { runId: 9 }),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Remplacer le fichier du CV type Data analyst' }),
    );
    await user.upload(
      screen.getByLabelText('Nouveau fichier du CV type Data analyst'),
      pdfFile('nouveau.pdf'),
    );
    await user.click(screen.getByRole('button', { name: 'Remplacer' }));

    expect(await progressOfReading()).toBeInTheDocument();
    expect(bodiesOf(calls, 'PUT /cv-types/1')).toEqual([{ file: PDF_BASE64 }]);
    expect(screen.getByRole('button', { name: 'Remplacement en cours…' })).toBeDisabled();
    // One reading at a time: nothing else of the CV types can be asked while it goes.
    expect(screen.getByRole('button', { name: 'Supprimer le CV type Data analyst' })).toBeDisabled();

    emitRun({ id: 9, job: 'profile_deduction', outcome: 'success', counters: { cv_steps_done: 2 } });

    expect(
      await screen.findByText(
        'Le fichier de « Data analyst » est remplacé : son profil est à valider ci-dessous.',
      ),
    ).toBeInTheDocument();
    expect(keysOf(calls).filter((key) => key === 'GET /cv-types')).toHaveLength(2);
  });

  it('[EF-CVX-41] refuses a file that is not a PDF for the replacement, and sends nothing', async () => {
    const calls = mockApi({ 'GET /cv-types': () => cvTypes(CV_TYPE) });
    renderSection();
    const user = userEvent.setup({ applyAccept: false });

    await user.click(
      await screen.findByRole('button', { name: 'Remplacer le fichier du CV type Data analyst' }),
    );
    await user.upload(
      screen.getByLabelText('Nouveau fichier du CV type Data analyst'),
      new File(['x'], 'cv.docx', { type: 'application/msword' }),
    );

    expect(screen.getByText(/Ce fichier n’est pas un PDF/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remplacer' })).toBeDisabled();
    expect(keysOf(calls)).not.toContain('PUT /cv-types/1');
  });

  it('[EF-CVX-41] [EF-EXE-03] leaves the CV type as it was and says why when the replacement fails', async () => {
    mockApi({
      'GET /cv-types': () => cvTypes(CV_TYPE),
      'PUT /cv-types/1': () => json(202, { runId: 10 }),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Remplacer le fichier du CV type Data analyst' }),
    );
    await user.upload(screen.getByLabelText('Nouveau fichier du CV type Data analyst'), pdfFile());
    await user.click(screen.getByRole('button', { name: 'Remplacer' }));
    await progressOfReading();
    emitRun({
      id: 10,
      job: 'profile_deduction',
      outcome: 'failure',
      error: 'Ce PDF ne contient aucun texte lisible.',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce PDF ne contient aucun texte lisible.');
    expect(screen.getByRole('list', { name: 'Vos CV types' })).toHaveTextContent('4 ans d’expérience');
  });

  it('[EF-CVX-42] deletes a CV type only after a confirmation that says what goes with it', async () => {
    let items: object[] = [CV_TYPE, DEVELOPER];
    const calls = mockApi({
      'GET /cv-types': () => cvTypes(...items),
      'DELETE /cv-types/1': () => {
        items = [DEVELOPER];
        return new Response(null, { status: 204 });
      },
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Supprimer le CV type Data analyst' }));
    expect(screen.getByText(/efface aussi le profil qui en a été déduit/)).toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('DELETE /cv-types/1');
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(
      await screen.findByText(/« Data analyst » est supprimé, avec le profil qui en avait été déduit/),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Vos CV types' });
    expect(list).not.toHaveTextContent('Data analyst');
    expect(list).toHaveTextContent('Développeur');
  });

  it('[EF-CVX-42] keeps the CV type when the candidate cancels the deletion', async () => {
    const calls = mockApi({ 'GET /cv-types': () => cvTypes(CV_TYPE) });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Supprimer le CV type Data analyst' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('button', { name: 'Supprimer le CV type Data analyst' })).toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('DELETE /cv-types/1');
  });

  it('[EF-CVX-42] says why a CV type was not deleted', async () => {
    mockApi({
      'GET /cv-types': () => cvTypes(CV_TYPE),
      'DELETE /cv-types/1': () => json(404, { error: 'Ce CV type est introuvable.' }),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Supprimer le CV type Data analyst' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce CV type est introuvable.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Supprimer le CV type Data analyst' })).toBeEnabled(),
    );
  });
});
