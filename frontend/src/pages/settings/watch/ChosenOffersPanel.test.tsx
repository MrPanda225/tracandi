import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodiesOf, emitRun, json, keysOf, mockApi, renderSection } from './testApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

const AT = '2026-10-02T08:00:00.000Z';

const offer = (id: number, level: string, changes: object = {}) => ({
  id,
  level,
  title: `Offre ${String(id)}`,
  keywords: ['sql', 'python'],
  years: 5,
  suggestedLevel: 'confirme',
  createdAt: AT,
  updatedAt: AT,
  ...changes,
});

const offers = (...items: object[]) => json(200, { items, maxPerLevel: 3 });

/** Text of an offer, at least 200 characters, as it would be pasted. */
const offerText = (length = 300) => 'a'.repeat(length);

const addForm = () => screen.findByRole('form', { name: 'Ajouter une offre' });

/** The reading is followed once the API has answered with its run. */
const progressOfReading = () => screen.findByRole('status', { name: 'Avancement de la lecture de l’offre' });
const levelSection = (name: string) => screen.findByRole('region', { name });

/** Pastes a text (typing 20 000 characters would take forever) and sends the add form. */
const addOffer = async (user: ReturnType<typeof userEvent.setup>, level: string, text = offerText()) => {
  const form = await addForm();
  await user.click(within(form).getByRole('radio', { name: new RegExp(`^${level}`) }));
  await user.click(within(form).getByLabelText('Texte de l’offre'));
  await user.paste(text);
  await user.click(within(form).getByRole('button', { name: 'Ajouter cette offre' }));
  return form;
};

describe('WatchSettings — the offers chosen by level (EF-VEI-48 to EF-VEI-50)', () => {
  it('[EF-VEI-48] [EF-VEI-49] lists the offers of each level with their traits and how many of three they take', async () => {
    mockApi({
      'GET /chosen-offers': () =>
        offers(
          offer(1, 'confirme', { title: 'Data analyst', keywords: ['sql', 'python'], years: 5 }),
          offer(2, 'confirme', { title: 'BI analyst', years: null, suggestedLevel: null }),
          offer(3, 'junior', { title: 'Assistant data', years: 1, suggestedLevel: 'junior' }),
        ),
    });

    renderSection();
    const confirmed = await levelSection('Confirmé');

    expect(within(confirmed).getByText('2 offres sur 3')).toBeInTheDocument();
    const analyst = within(confirmed).getByRole('article', { name: 'Data analyst' });
    const bi = within(confirmed).getByRole('article', { name: 'BI analyst' });
    expect(analyst).toHaveTextContent('Années demandées : 5 ans');
    expect(analyst).toHaveTextContent('Niveau suggéré : Confirmé');
    const keywords = within(analyst).getByRole('list', { name: 'Mots-clés de Data analyst' });
    expect(
      within(keywords)
        .getAllByRole('listitem')
        .map((keyword) => keyword.textContent),
    ).toEqual(['sql', 'python']);
    expect(bi).toHaveTextContent('Années demandées : non précisée');
    expect(bi).toHaveTextContent('Niveau suggéré : non déterminé');
    expect(within(await levelSection('Junior')).getByText('1 offre sur 3')).toBeInTheDocument();
    expect(
      within(await levelSection('Senior')).getByText('Aucune offre pour ce niveau.'),
    ).toBeInTheDocument();
  });

  it('[ENF-UTI-03] shows a waiting state while the chosen offers are read', () => {
    mockApi({ 'GET /chosen-offers': () => new Promise<Response>(() => undefined) });

    renderSection();

    expect(screen.getByText('Chargement de vos offres choisies…')).toBeInTheDocument();
  });

  it('[EF-VEI-48] says that the pasted text is never kept', async () => {
    mockApi({});

    renderSection();

    expect(await screen.findByText(/Le texte n’est pas conservé/)).toBeInTheDocument();
  });

  it('[EF-VEI-48] [EF-VEI-49] sends the level and the text, follows the reading, then shows the traits and forgets the text', async () => {
    let items: object[] = [];
    const calls = mockApi({
      'GET /chosen-offers': () => offers(...items),
      'POST /chosen-offers': () => json(202, { runId: 21 }),
    });
    renderSection();
    const user = userEvent.setup();

    const sent = await addOffer(user, 'Junior', offerText(300));

    expect(bodiesOf(calls, 'POST /chosen-offers')).toEqual([{ level: 'junior', text: offerText(300) }]);
    expect(await within(sent).findByRole('button', { name: 'Lecture de l’offre…' })).toBeDisabled();
    const progress = await progressOfReading();
    expect(progress).toHaveTextContent('Lecture de l’offre en attente de son tour');
    emitRun({ id: 21, job: 'offer_extraction', outcome: 'running' });
    expect(progress).toHaveTextContent('Lecture de l’offre en cours');

    items = [offer(5, 'junior', { title: 'Assistant data', years: 1, suggestedLevel: 'junior' })];
    emitRun({ id: 21, job: 'offer_extraction', outcome: 'success' });

    expect(await screen.findByText(/Offre ajoutée au niveau Junior/)).toBeInTheDocument();
    expect(within(await levelSection('Junior')).getByText('Assistant data')).toBeInTheDocument();
    // The form starts again, empty: the text the candidate pasted is gone from the screen.
    const form = screen.getByRole('form', { name: 'Ajouter une offre' });
    expect(within(form).getByLabelText('Texte de l’offre')).toHaveValue('');
    expect(within(form).getByRole('button', { name: 'Ajouter cette offre' })).toBeEnabled();
    expect(
      screen.queryByRole('status', { name: 'Avancement de la lecture de l’offre' }),
    ).not.toBeInTheDocument();
  });

  it('[EF-VEI-48] says a reading is waiting for its turn', async () => {
    mockApi({ 'POST /chosen-offers': () => json(202, { runId: 21 }) });
    renderSection();
    const user = userEvent.setup();

    await addOffer(user, 'Senior');
    await progressOfReading();
    emitRun({ id: 21, job: 'offer_extraction', outcome: 'queued' });

    expect(await screen.findByText('Lecture de l’offre en attente de son tour…')).toBeInTheDocument();
  });

  it('[EF-VEI-49] [EF-EXE-03] shows why a reading failed, and keeps the text to try again', async () => {
    mockApi({ 'POST /chosen-offers': () => json(202, { runId: 22 }) });
    renderSection();
    const user = userEvent.setup();

    const form = await addOffer(user, 'Junior', offerText(250));
    await progressOfReading();
    emitRun({
      id: 22,
      job: 'offer_extraction',
      outcome: 'failure',
      error: 'Aucun service d’IA n’a pu traiter la demande. Réessayez dans quelques minutes.',
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aucun service d’IA n’a pu traiter la demande.',
    );
    expect(within(form).getByLabelText('Texte de l’offre')).toHaveValue(offerText(250));
    expect(within(form).getByRole('button', { name: 'Ajouter cette offre' })).toBeEnabled();
  });

  it('[EF-VEI-49] [EF-EXE-03] catches the end of a reading the stream did not announce, by asking for the run', async () => {
    let items: object[] = [];
    mockApi({
      'GET /chosen-offers': () => offers(...items),
      'POST /chosen-offers': () => json(202, { runId: 23 }),
      'GET /jobs/23': () => {
        items = [offer(6, 'senior', { title: 'Architecte data', years: 10, suggestedLevel: 'senior' })];
        return json(200, {
          id: 23,
          job: 'offer_extraction',
          trigger: 'manual',
          outcome: 'success',
          counters: {},
          error: null,
        });
      },
    });
    renderSection();
    const user = userEvent.setup();

    await addOffer(user, 'Senior');

    expect(await screen.findByText('Architecte data')).toBeInTheDocument();
  });

  it('[EF-VEI-48] shows the length of the text as it is pasted, out of 20 000', async () => {
    mockApi({});
    renderSection();
    const user = userEvent.setup();
    const form = await addForm();

    await user.click(within(form).getByLabelText('Texte de l’offre'));
    await user.paste(offerText(1234));

    expect(within(form).getByText('1 234 / 20 000 caractères')).toBeInTheDocument();
  });

  it.each([
    [199, 'L’offre semble incomplète : collez le texte entier de l’annonce.'],
    [20_001, 'L’offre dépasse 20 000 caractères : gardez l’essentiel de l’annonce.'],
  ])('[EF-VEI-48] refuses a text of %i characters before sending anything', async (length, message) => {
    const calls = mockApi({});
    renderSection();
    const user = userEvent.setup();

    const form = await addOffer(user, 'Junior', offerText(length));

    expect(within(form).getByText(message)).toBeInTheDocument();
    expect(within(form).getByLabelText('Texte de l’offre')).toBeInvalid();
    expect(keysOf(calls)).not.toContain('POST /chosen-offers');
  });

  it.each([200, 20_000])('[EF-VEI-48] sends a text of %i characters', async (length) => {
    const calls = mockApi({ 'POST /chosen-offers': () => json(202, { runId: 30 }) });
    renderSection();
    const user = userEvent.setup();

    await addOffer(user, 'Confirmé', offerText(length));

    expect(bodiesOf(calls, 'POST /chosen-offers')).toHaveLength(1);
  });

  it('[EF-VEI-48] asks for the level when none is chosen, and sends nothing', async () => {
    const calls = mockApi({});
    renderSection();
    const user = userEvent.setup();
    const form = await addForm();

    await user.click(within(form).getByLabelText('Texte de l’offre'));
    await user.paste(offerText());
    await user.click(within(form).getByRole('button', { name: 'Ajouter cette offre' }));

    expect(within(form).getByText('Choisissez le niveau de cette offre.')).toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('POST /chosen-offers');
  });

  it('[EF-VEI-48] no longer offers a level that holds three offers, and says how to make room', async () => {
    mockApi({
      'GET /chosen-offers': () => offers(offer(1, 'junior'), offer(2, 'junior'), offer(3, 'junior')),
    });

    renderSection();
    const form = await addForm();

    await screen.findByText('3 offres sur 3');
    expect(within(form).getByRole('radio', { name: 'Junior (complet)' })).toBeDisabled();
    expect(within(form).getByRole('radio', { name: 'Confirmé (0 sur 3)' })).toBeEnabled();
    expect(
      within(form).getByText(
        'Un niveau complet n’est plus proposé : retirez une offre pour en ajouter une autre.',
      ),
    ).toBeInTheDocument();
  });

  it('[EF-VEI-48] shows the refusal of the API when the level filled up meanwhile', async () => {
    mockApi({
      'GET /chosen-offers': () => offers(offer(1, 'junior'), offer(2, 'junior')),
      'POST /chosen-offers': () =>
        json(409, {
          error: 'Vous avez déjà 3 offres pour ce niveau : supprimez-en une pour en ajouter une autre.',
        }),
    });
    renderSection();
    const user = userEvent.setup();

    const form = await addOffer(user, 'Junior');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vous avez déjà 3 offres pour ce niveau : supprimez-en une pour en ajouter une autre.',
    );
    expect(within(form).getByRole('button', { name: 'Ajouter cette offre' })).toBeEnabled();
  });

  it('[EF-VEI-48] shows the refusal of the API when the allowance of the day is spent', async () => {
    mockApi({
      'POST /chosen-offers': () =>
        json(429, { error: 'Vous avez lancé vos 20 lectures d’offres du jour. Rendez-vous demain !' }),
    });
    renderSection();
    const user = userEvent.setup();

    await addOffer(user, 'Junior');

    expect(await screen.findByRole('alert')).toHaveTextContent('Rendez-vous demain !');
  });

  it('[EF-VEI-49] corrects the traits of an offer: only what changed is sent, and the offer shows it', async () => {
    let items: object[] = [offer(1, 'confirme', { title: 'Data analyst', years: 5 })];
    const calls = mockApi({
      'GET /chosen-offers': () => offers(...items),
      'PATCH /chosen-offers/1': () => {
        items = [
          offer(1, 'confirme', {
            title: 'Analyste BI',
            keywords: ['bi', 'sql'],
            years: 7,
            suggestedLevel: 'confirme',
          }),
        ];
        return json(200, items[0]);
      },
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Corriger les traits de Data analyst' }));
    const form = screen.getByRole('form', { name: 'Corriger les traits de Data analyst' });
    await user.clear(within(form).getByLabelText('Intitulé'));
    await user.type(within(form).getByLabelText('Intitulé'), 'Analyste BI');
    await user.clear(within(form).getByLabelText('Mots-clés'));
    await user.type(within(form).getByLabelText('Mots-clés'), 'bi, sql');
    await user.clear(within(form).getByLabelText('Années demandées'));
    await user.type(within(form).getByLabelText('Années demandées'), '7');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Analyste BI')).toBeInTheDocument();
    expect(bodiesOf(calls, 'PATCH /chosen-offers/1')).toEqual([
      { title: 'Analyste BI', keywords: ['bi', 'sql'], years: 7 },
    ]);
    expect(screen.queryByRole('form', { name: /Corriger les traits/ })).not.toBeInTheDocument();
    expect(screen.getByText('Années demandées : 7 ans')).toBeInTheDocument();
  });

  it('[EF-VEI-49] says an offer demands no years: they are sent as null', async () => {
    let items: object[] = [offer(1, 'confirme', { title: 'Data analyst', years: 5 })];
    const calls = mockApi({
      'GET /chosen-offers': () => offers(...items),
      'PATCH /chosen-offers/1': () => {
        items = [offer(1, 'confirme', { title: 'Data analyst', years: null })];
        return json(200, items[0]);
      },
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Corriger les traits de Data analyst' }));
    const form = screen.getByRole('form', { name: 'Corriger les traits de Data analyst' });
    await user.click(within(form).getByRole('checkbox', { name: 'L’offre n’en précise pas' }));
    expect(within(form).getByLabelText('Années demandées')).toBeDisabled();
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    await screen.findByText('Années demandées : non précisée');
    expect(bodiesOf(calls, 'PATCH /chosen-offers/1')).toEqual([{ years: null }]);
  });

  it('[EF-VEI-49] shows a null years offer as « n’en précise pas » when its traits are corrected', async () => {
    mockApi({ 'GET /chosen-offers': () => offers(offer(1, 'confirme', { years: null })) });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Corriger les traits de Offre 1' }));
    const form = screen.getByRole('form', { name: 'Corriger les traits de Offre 1' });

    expect(within(form).getByRole('checkbox', { name: 'L’offre n’en précise pas' })).toBeChecked();
    expect(within(form).getByLabelText('Années demandées')).toBeDisabled();
  });

  it('[EF-VEI-49] refuses 51 years, an empty title and no keyword in the correction, and sends nothing', async () => {
    const calls = mockApi({
      'GET /chosen-offers': () => offers(offer(1, 'confirme', { title: 'Data analyst' })),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Corriger les traits de Data analyst' }));
    const form = screen.getByRole('form', { name: 'Corriger les traits de Data analyst' });
    await user.clear(within(form).getByLabelText('Années demandées'));
    await user.type(within(form).getByLabelText('Années demandées'), '51');
    await user.clear(within(form).getByLabelText('Intitulé'));
    await user.clear(within(form).getByLabelText('Mots-clés'));
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    expect(within(form).getByText('Indiquez un nombre entier d’années, de 0 à 50.')).toBeInTheDocument();
    expect(within(form).getByText('Indiquez un intitulé.')).toBeInTheDocument();
    expect(within(form).getByText('Indiquez au moins un mot-clé.')).toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('PATCH /chosen-offers/1');
  });

  it('[EF-VEI-49] changes the level of an offer, and shows the refusal of the API when that level is full', async () => {
    const calls = mockApi({
      'GET /chosen-offers': () => offers(offer(1, 'confirme', { title: 'Data analyst' })),
      'PATCH /chosen-offers/1': () =>
        json(409, {
          error: 'Vous avez déjà 3 offres pour ce niveau : supprimez-en une pour en ajouter une autre.',
        }),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Corriger les traits de Data analyst' }));
    const form = screen.getByRole('form', { name: 'Corriger les traits de Data analyst' });
    expect(within(form).getByRole('radio', { name: 'Confirmé' })).toBeChecked();
    await user.click(within(form).getByRole('radio', { name: 'Senior' }));
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Vous avez déjà 3 offres pour ce niveau',
    );
    expect(bodiesOf(calls, 'PATCH /chosen-offers/1')).toEqual([{ level: 'senior' }]);
  });

  it('[EF-VEI-49] closes the correction without a request when nothing changed, or when the candidate cancels', async () => {
    const calls = mockApi({
      'GET /chosen-offers': () => offers(offer(1, 'confirme', { title: 'Data analyst' })),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Corriger les traits de Data analyst' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('form', { name: /Corriger les traits/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Corriger les traits de Data analyst' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('form', { name: /Corriger les traits/ })).not.toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('PATCH /chosen-offers/1');
  });

  it('[EF-VEI-48] removes an offer only after a confirmation', async () => {
    let items: object[] = [offer(1, 'confirme', { title: 'Data analyst' })];
    const calls = mockApi({
      'GET /chosen-offers': () => offers(...items),
      'DELETE /chosen-offers/1': () => {
        items = [];
        return new Response(null, { status: 204 });
      },
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Retirer l’offre Data analyst' }));
    expect(keysOf(calls)).not.toContain('DELETE /chosen-offers/1');
    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));

    expect(await screen.findByText(/« Data analyst » est retirée/)).toBeInTheDocument();
    expect(
      within(await levelSection('Confirmé')).getByText('Aucune offre pour ce niveau.'),
    ).toBeInTheDocument();
  });

  it('[EF-VEI-48] keeps the offer when the candidate cancels the removal', async () => {
    const calls = mockApi({
      'GET /chosen-offers': () => offers(offer(1, 'confirme', { title: 'Data analyst' })),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Retirer l’offre Data analyst' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('button', { name: 'Retirer l’offre Data analyst' })).toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('DELETE /chosen-offers/1');
  });
});
