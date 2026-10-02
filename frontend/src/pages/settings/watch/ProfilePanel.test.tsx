import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodiesOf, CV_TYPE, cvTypes, json, keysOf, mockApi, renderSection } from './testApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

const READY = { ...CV_TYPE, deductionReady: true };
const DEVELOPER = { ...CV_TYPE, id: 2, label: 'Développeur', years: 6, deductionReady: true };

const target = (label: string, keywords: string[], contractTypes: string[] = ['cdi']) => ({
  label,
  keywords,
  contractTypes,
  level: 'confirme',
});

const DEDUCTION = {
  years: 4,
  level: 'confirme',
  targets: [
    target('Data analyst', ['data', 'sql', 'python'], ['cdi', 'alternance']),
    target('Data engineer', ['etl', 'spark']),
  ],
};

const CRITERIA = {
  targets: [{ label: 'Data analyst', keywords: ['sql'], contractTypes: ['cdi'] }],
  place: null,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: [],
};

/** The CV types and the deductions behind them, for the panel to offer a profile to validate. */
const withDeduction = (deduction: object = DEDUCTION) => ({
  'GET /cv-types': () => cvTypes(READY),
  'GET /cv-types/1/deduction': () => json(200, deduction),
});

const profileForm = () => screen.findByRole('form', { name: 'Profil à valider' });
const offerGroup = (form: HTMLElement, position: number) =>
  within(form).getByRole('group', { name: new RegExp(`^Offre type ${String(position)}\\b`) });

const retype = async (user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) => {
  await user.clear(field);
  if (text !== '') await user.type(field, text);
};

describe('WatchSettings — the deduced profile to validate (EF-VEI-43 to EF-VEI-47)', () => {
  it('[EF-VEI-46] says nothing is proposed while no CV type has a profile to validate', async () => {
    mockApi({ 'GET /cv-types': () => cvTypes(CV_TYPE) });

    renderSection();

    expect(await screen.findByText(/Aucun profil à valider pour l’instant/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Profil à valider' })).not.toBeInTheDocument();
  });

  it('[EF-VEI-46] says plainly that nothing of the deduced profile is used until the candidate validates it', async () => {
    mockApi(withDeduction());

    renderSection();

    expect(await profileForm()).toBeInTheDocument();
    expect(
      screen.getByText(/Tant que vous n’avez pas validé, la veille n’utilise rien de ce profil/),
    ).toBeInTheDocument();
  });

  it('[EF-VEI-43] [EF-VEI-45] shows the years counted, the level and each offer proposed, ready to correct', async () => {
    mockApi(withDeduction());

    renderSection();
    const form = await profileForm();

    expect(within(form).getByLabelText('Années d’expérience')).toHaveValue(4);
    expect(within(form).getByRole('radio', { name: 'Confirmé' })).toBeChecked();
    const first = offerGroup(form, 1);
    expect(within(first).getByLabelText('Métier')).toHaveValue('Data analyst');
    expect(within(first).getByLabelText('Mots-clés')).toHaveValue('data, sql, python');
    expect(within(first).getByRole('checkbox', { name: 'CDI' })).toBeChecked();
    expect(within(first).getByRole('checkbox', { name: 'Alternance' })).toBeChecked();
    expect(within(first).getByRole('checkbox', { name: 'CDD' })).not.toBeChecked();
    expect(within(first).getByRole('checkbox', { name: 'Garder cette offre' })).toBeChecked();
    expect(within(offerGroup(form, 2)).getByLabelText('Métier')).toHaveValue('Data engineer');
  });

  it('[EF-VEI-47] [RG-28] gives the level of the years as they are corrected, live: 2 junior, 3 and 7 confirmé, 8 senior', async () => {
    mockApi(withDeduction());
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();
    const years = within(form).getByLabelText('Années d’expérience');

    for (const [typed, level] of [
      ['2', 'Junior'],
      ['3', 'Confirmé'],
      ['7', 'Confirmé'],
      ['8', 'Senior'],
    ] as const) {
      await retype(user, years, typed);
      expect(within(form).getByRole('radio', { name: level })).toBeChecked();
      expect(within(form).getByText(`Niveau d’après vos années : ${level}.`)).toBeInTheDocument();
    }
  });

  it('[EF-VEI-47] refuses 51 years under the field, shows no level, and sends nothing', async () => {
    const calls = mockApi(withDeduction());
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();
    const years = within(form).getByLabelText('Années d’expérience');

    await retype(user, years, '51');
    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));

    expect(within(form).getByText('Indiquez un nombre entier d’années, de 0 à 50.')).toBeInTheDocument();
    expect(years).toBeInvalid();
    expect(within(form).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('POST /watch/criteria/validation');
  });

  it('[EF-VEI-47] accepts 0 and 50 years', async () => {
    const calls = mockApi({
      ...withDeduction(),
      'POST /watch/criteria/validation': () =>
        json(200, { criteria: { ...CRITERIA, years: 50, level: 'senior' } }),
    });
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();
    const years = within(form).getByLabelText('Années d’expérience');

    await retype(user, years, '0');
    expect(within(form).getByRole('radio', { name: 'Junior' })).toBeChecked();
    await retype(user, years, '50');
    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));

    await waitFor(() => expect(bodiesOf(calls, 'POST /watch/criteria/validation')).toHaveLength(1));
    expect(bodiesOf(calls, 'POST /watch/criteria/validation')[0]).toMatchObject({ years: 50 });
  });

  it('[EF-VEI-46] [EF-VEI-47] posts the corrected profile: the years, the offers kept as edited', async () => {
    const calls = mockApi({
      ...withDeduction(),
      'POST /watch/criteria/validation': () =>
        json(200, {
          criteria: {
            ...CRITERIA,
            years: 6,
            level: 'confirme',
            targets: [{ label: 'Analyste BI', keywords: ['bi', 'sql'], contractTypes: ['cdi'] }],
          },
        }),
    });
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();

    await retype(user, within(form).getByLabelText('Années d’expérience'), '6');
    const first = offerGroup(form, 1);
    await retype(user, within(first).getByLabelText('Métier'), 'Analyste BI');
    await retype(user, within(first).getByLabelText('Mots-clés'), 'bi, sql');
    await user.click(within(first).getByRole('checkbox', { name: 'Alternance' }));
    await user.click(within(offerGroup(form, 2)).getByRole('checkbox', { name: 'Garder cette offre' }));
    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));

    await screen.findByText(/Profil validé/);
    expect(bodiesOf(calls, 'POST /watch/criteria/validation')).toEqual([
      { targets: [{ label: 'Analyste BI', keywords: ['bi', 'sql'], contractTypes: ['cdi'] }], years: 6 },
    ]);
    expect(
      screen.getByText('Profil utilisé par la veille : 6 ans d’expérience, niveau Confirmé.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tant que vous n’avez pas validé/)).not.toBeInTheDocument();
  });

  it('[EF-VEI-47] sends the level alone when the candidate picks one that the years do not give, and says so', async () => {
    const calls = mockApi({
      ...withDeduction(),
      'POST /watch/criteria/validation': () => json(200, { criteria: { ...CRITERIA, level: 'senior' } }),
    });
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();

    await user.click(within(form).getByRole('radio', { name: 'Senior' }));

    expect(
      within(form).getByText(/Vous avez choisi le niveau Senior, que vos années ne donnent pas/),
    ).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));

    await screen.findByText(/Profil validé/);
    const [sent] = bodiesOf(calls, 'POST /watch/criteria/validation');
    expect(sent).toMatchObject({ level: 'senior' });
    expect(sent).not.toHaveProperty('years');
    expect(screen.getByText('Profil utilisé par la veille : niveau Senior.')).toBeInTheDocument();
  });

  it('[EF-VEI-47] lets the candidate give years again after picking a level by hand: the level follows once more', async () => {
    mockApi(withDeduction());
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();

    await user.click(within(form).getByRole('radio', { name: 'Senior' }));
    await retype(user, within(form).getByLabelText('Années d’expérience'), '1');

    expect(within(form).getByRole('radio', { name: 'Junior' })).toBeChecked();
    expect(within(form).queryByText(/que vos années ne donnent pas/)).not.toBeInTheDocument();
  });

  it('[EF-VEI-45] keeps the first five offers when the CV types propose more, and lets the candidate choose', async () => {
    mockApi({
      'GET /cv-types': () => cvTypes(READY, DEVELOPER),
      'GET /cv-types/1/deduction': () => json(200, DEDUCTION),
      'GET /cv-types/2/deduction': () =>
        json(200, {
          years: 6,
          level: 'confirme',
          targets: ['Développeur Python', 'Développeur web', 'Architecte', 'Tech lead'].map((label) =>
            target(label, ['code']),
          ),
        }),
    });
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();

    const sixth = within(offerGroup(form, 6)).getByRole('checkbox', { name: 'Garder cette offre' });
    expect(sixth).not.toBeChecked();
    expect(sixth).toBeDisabled();
    expect(within(form).getByText('5 offres gardées sur 5 au plus.')).toBeInTheDocument();
    expect(within(offerGroup(form, 3)).getByText(/d’après « Développeur »/)).toBeInTheDocument();

    await user.click(within(offerGroup(form, 1)).getByRole('checkbox', { name: 'Garder cette offre' }));
    expect(within(form).getByText('4 offres gardées sur 5 au plus.')).toBeInTheDocument();
    expect(sixth).toBeEnabled();
  });

  it('[EF-VEI-43] starts from the most years the CV types count, and says what each counted', async () => {
    mockApi({
      'GET /cv-types': () => cvTypes(READY, DEVELOPER),
      'GET /cv-types/1/deduction': () => json(200, DEDUCTION),
      'GET /cv-types/2/deduction': () => json(200, { ...DEDUCTION, years: 6 }),
    });

    renderSection();
    const form = await profileForm();

    expect(within(form).getByLabelText('Années d’expérience')).toHaveValue(6);
    expect(within(form).getByText(/« Data analyst » 4 ans, « Développeur » 6 ans/)).toBeInTheDocument();
  });

  it.each([
    { name: 'an empty label', field: 'Métier', value: '', message: 'Indiquez un intitulé.' },
    { name: 'no keyword', field: 'Mots-clés', value: '', message: 'Indiquez au moins un mot-clé.' },
    {
      name: '16 keywords',
      field: 'Mots-clés',
      value: Array.from({ length: 16 }, (_, index) => `mot${String(index)}`).join(', '),
      message: 'Gardez 15 mots-clés au plus.',
    },
  ])('[EF-VEI-45] refuses an offer with $name before sending anything', async ({ field, value, message }) => {
    const calls = mockApi(withDeduction());
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();

    const input = within(offerGroup(form, 1)).getByLabelText(field);
    await user.clear(input);
    if (value !== '') {
      await user.click(input);
      await user.paste(value);
    }
    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));

    expect(within(offerGroup(form, 1)).getByText(message)).toBeInTheDocument();
    expect(input).toBeInvalid();
    expect(keysOf(calls)).not.toContain('POST /watch/criteria/validation');
  });

  it('[EF-VEI-45] refuses an offer with no contract, and a profile with no offer kept', async () => {
    const calls = mockApi(withDeduction());
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();

    await user.click(within(offerGroup(form, 2)).getByRole('checkbox', { name: 'CDI' }));
    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));
    expect(within(offerGroup(form, 2)).getByText('Choisissez au moins un contrat.')).toBeInTheDocument();

    await user.click(within(offerGroup(form, 1)).getByRole('checkbox', { name: 'Garder cette offre' }));
    await user.click(within(offerGroup(form, 2)).getByRole('checkbox', { name: 'Garder cette offre' }));
    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));

    expect(within(form).getByText('Gardez au moins une offre type.')).toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('POST /watch/criteria/validation');
  });

  it('[EF-VEI-46] [ENF-UTI-03] disables the button while the profile is validated', async () => {
    mockApi({
      ...withDeduction(),
      'POST /watch/criteria/validation': () => new Promise<Response>(() => undefined),
    });
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();

    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));

    expect(within(form).getByRole('button', { name: 'Validation…' })).toBeDisabled();
  });

  it('[EF-VEI-46] [ENF-SEC-04] shows what the API refused in the validation and keeps the form', async () => {
    mockApi({
      ...withDeduction(),
      'POST /watch/criteria/validation': () =>
        json(400, {
          error: 'Données invalides',
          details: [{ path: 'body.targets.0.keywords', message: 'Un mot-clé est trop long.' }],
        }),
    });
    renderSection();
    const user = userEvent.setup();
    const form = await profileForm();

    await user.click(within(form).getByRole('button', { name: 'Valider ce profil' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Données invalides');
    expect(screen.getByText('Un mot-clé est trop long.')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Profil à valider' })).toBeInTheDocument();
  });

  it('[EF-VEI-46] shows the message of the API when the deduced profile is gone — it is kept 30 minutes', async () => {
    mockApi({
      'GET /cv-types': () => cvTypes(READY),
      'GET /cv-types/1/deduction': () =>
        json(404, {
          error:
            'Le profil déduit de ce CV n’est plus disponible : il s’efface au bout de 30 minutes. Importez de nouveau le CV.',
        }),
    });

    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Data analyst : Le profil déduit de ce CV n’est plus disponible : il s’efface au bout de 30 minutes. Importez de nouveau le CV.',
    );
    expect(screen.queryByRole('form', { name: 'Profil à valider' })).not.toBeInTheDocument();
  });

  it('[ENF-UTI-03] shows a waiting state while the deduced profile is read', async () => {
    mockApi({
      'GET /cv-types': () => cvTypes(READY),
      'GET /cv-types/1/deduction': () => new Promise<Response>(() => undefined),
    });

    renderSection();

    expect(await screen.findByText('Chargement du profil déduit…')).toBeInTheDocument();
  });

  it('[EF-VEI-47] shows the years and the level of the criteria the watch uses', async () => {
    mockApi({
      'GET /watch/criteria': () => json(200, { criteria: { ...CRITERIA, years: 4, level: 'confirme' } }),
    });

    renderSection();

    expect(
      await screen.findByText('Profil utilisé par la veille : 4 ans d’expérience, niveau Confirmé.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Offres types : Data analyst')).toBeInTheDocument();
  });

  it('[EF-VEI-47] says when the criteria give neither years nor level', async () => {
    mockApi({ 'GET /watch/criteria': () => json(200, { criteria: CRITERIA }) });

    renderSection();

    expect(await screen.findByText(/ne précisent ni années ni niveau/)).toBeInTheDocument();
  });

  it('[EF-VEI-55] says that no criteria are saved yet, and that the watch waits for them', async () => {
    mockApi({});

    renderSection();

    expect(await screen.findByText(/Aucun critère enregistré pour l’instant/)).toBeInTheDocument();
  });

  it('[EF-VEI-46] sends the candidate to « Sites surveillés » for the commune, the radius and remote work', async () => {
    mockApi({});

    renderSection();

    expect(await screen.findByRole('link', { name: 'Sites surveillés' })).toHaveAttribute('href', '/sites');
  });
});
