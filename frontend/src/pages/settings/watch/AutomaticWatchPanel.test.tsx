import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchSlot } from '../../../api/autowatch';
import { formatDateTime } from '../../../lib/format';
import { automaticWatch, bodiesOf, emitRun, json, keysOf, mockApi, pass, renderSection } from './testApi';

// 2 October 2026, 10 h in Paris (summer time): the morning slot is behind, the noon and the evening ones ahead.
const AT_10_IN_PARIS = new Date('2026-10-02T08:00:00.000Z');

beforeEach(() => {
  // Only the clock: the waits of the tests keep running.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT_10_IN_PARIS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const watchOf =
  (changes: Parameters<typeof automaticWatch>[0] = {}) =>
  () =>
    json(200, automaticWatch(changes));

const slotsGroup = () => screen.findByRole('group', { name: 'Créneaux' });
const rowOf = async (slot: string) => {
  const list = await screen.findByRole('list', { name: 'Passages du jour' });
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => item.textContent?.startsWith(slot));
  if (!row) throw new Error(`No row for the slot « ${slot} ».`);
  return row;
};

describe('WatchSettings — the slots of the automatic watch (EF-CFG-07)', () => {
  it('[EF-CFG-07] shows the watch on, and the three slots with their hour of Paris, ticked as chosen', async () => {
    mockApi({ 'GET /watch/automatic': watchOf({ enabled: true, slots: ['morning', 'evening'] }) });

    renderSection();
    const slots = await slotsGroup();

    expect(await screen.findByRole('switch', { name: 'Lancer la veille automatiquement' })).toBeChecked();
    expect(
      screen.getByText(/Veille activée : Tracandi consulte vos sources aux créneaux choisis/),
    ).toBeInTheDocument();
    expect(within(slots).getByRole('checkbox', { name: 'Matin · 7 h' })).toBeChecked();
    expect(within(slots).getByRole('checkbox', { name: 'Midi · 13 h' })).not.toBeChecked();
    expect(within(slots).getByRole('checkbox', { name: 'Soir · 19 h' })).toBeChecked();
    expect(screen.getByText(/Heure de Paris/)).toBeInTheDocument();
  });

  it('[EF-CFG-07] shows the watch stopped, in words', async () => {
    mockApi({ 'GET /watch/automatic': watchOf({ enabled: false }) });

    renderSection();

    expect(await screen.findByRole('switch', { name: 'Lancer la veille automatiquement' })).not.toBeChecked();
    expect(screen.getByText(/Veille arrêtée : Tracandi ne consulte rien tout seul/)).toBeInTheDocument();
  });

  it('[EF-CFG-07] activates the watch with the slots it keeps', async () => {
    const calls = mockApi({
      'GET /watch/automatic': watchOf({ enabled: false, slots: ['noon'] }),
      'PUT /watch/automatic': () => json(200, automaticWatch({ enabled: true, slots: ['noon'] })),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: 'Lancer la veille automatiquement' }));

    expect(bodiesOf(calls, 'PUT /watch/automatic')).toEqual([{ enabled: true, slots: ['noon'] }]);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Lancer la veille automatiquement' })).toBeChecked(),
    );
  });

  it('[EF-CFG-07] stops the watch and keeps the slots', async () => {
    const calls = mockApi({
      'GET /watch/automatic': watchOf(),
      'PUT /watch/automatic': () => json(200, automaticWatch({ enabled: false })),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: 'Lancer la veille automatiquement' }));

    expect(bodiesOf(calls, 'PUT /watch/automatic')).toEqual([
      { enabled: false, slots: ['morning', 'noon', 'evening'] },
    ]);
    expect(
      await screen.findByText(/Veille arrêtée : Tracandi ne consulte rien tout seul/),
    ).toBeInTheDocument();
    expect(within(await slotsGroup()).getByRole('checkbox', { name: 'Matin · 7 h' })).toBeChecked();
  });

  it('[EF-CFG-07] unticks and ticks a slot, and sends the slots in the order of the day', async () => {
    let slots: WatchSlot[] = ['morning', 'noon', 'evening'];
    const calls = mockApi({
      'GET /watch/automatic': () => json(200, automaticWatch({ slots })),
      'PUT /watch/automatic': (body) => {
        slots = (body as { slots: WatchSlot[] }).slots;
        return json(200, automaticWatch({ slots }));
      },
    });
    renderSection();
    const user = userEvent.setup();
    const group = await slotsGroup();

    await user.click(within(group).getByRole('checkbox', { name: 'Midi · 13 h' }));
    await waitFor(() =>
      expect(within(group).getByRole('checkbox', { name: 'Midi · 13 h' })).not.toBeChecked(),
    );
    await user.click(within(group).getByRole('checkbox', { name: 'Midi · 13 h' }));

    await waitFor(() => expect(within(group).getByRole('checkbox', { name: 'Midi · 13 h' })).toBeChecked());
    expect(bodiesOf(calls, 'PUT /watch/automatic')).toEqual([
      { enabled: true, slots: ['morning', 'evening'] },
      { enabled: true, slots: ['morning', 'noon', 'evening'] },
    ]);
  });

  it('[EF-CFG-07] does not let the last slot be unticked while the watch is on, and says why', async () => {
    const calls = mockApi({ 'GET /watch/automatic': watchOf({ enabled: true, slots: ['noon'] }) });
    renderSection();
    const user = userEvent.setup();
    const group = await slotsGroup();
    const noon = within(group).getByRole('checkbox', { name: 'Midi · 13 h' });

    await user.click(noon);

    expect(noon).toBeDisabled();
    expect(noon).toBeChecked();
    expect(screen.getByText(/Gardez au moins un créneau tant que la veille est activée/)).toBeInTheDocument();
    expect(keysOf(calls)).not.toContain('PUT /watch/automatic');
  });

  it('[EF-CFG-07] lets the last slot be unticked once the watch is stopped, and then offers no activation without one', async () => {
    const calls = mockApi({
      'GET /watch/automatic': watchOf({ enabled: false, slots: ['noon'] }),
      'PUT /watch/automatic': () => json(200, automaticWatch({ enabled: false, slots: [] })),
    });
    renderSection();
    const user = userEvent.setup();
    const group = await slotsGroup();

    await user.click(within(group).getByRole('checkbox', { name: 'Midi · 13 h' }));

    expect(bodiesOf(calls, 'PUT /watch/automatic')).toEqual([{ enabled: false, slots: [] }]);
    const watchSwitch = await screen.findByRole('switch', { name: 'Lancer la veille automatiquement' });
    await waitFor(() => expect(watchSwitch).toBeDisabled());
    expect(screen.getByText('Cochez au moins un créneau pour activer la veille.')).toBeInTheDocument();
  });

  it('[EF-CFG-07] offers the activation again as soon as a slot is ticked', async () => {
    mockApi({
      'GET /watch/automatic': watchOf({ enabled: false, slots: [] }),
      'PUT /watch/automatic': () => json(200, automaticWatch({ enabled: false, slots: ['evening'] })),
    });
    renderSection();
    const user = userEvent.setup();

    expect(await screen.findByRole('switch', { name: 'Lancer la veille automatiquement' })).toBeDisabled();
    await user.click(within(await slotsGroup()).getByRole('checkbox', { name: 'Soir · 19 h' }));

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Lancer la veille automatiquement' })).toBeEnabled(),
    );
  });

  it('[EF-CFG-07] shows the refusal of the API, in French, and keeps the choice as it was', async () => {
    mockApi({
      'GET /watch/automatic': watchOf({ slots: ['noon', 'evening'] }),
      'PUT /watch/automatic': () =>
        json(400, { error: 'Choisissez au moins un créneau pour que la veille se lance d’elle-même.' }),
    });
    renderSection();
    const user = userEvent.setup();
    const group = await slotsGroup();

    await user.click(within(group).getByRole('checkbox', { name: 'Midi · 13 h' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choisissez au moins un créneau pour que la veille se lance d’elle-même.',
    );
    expect(within(group).getByRole('checkbox', { name: 'Midi · 13 h' })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'Midi · 13 h' })).toBeEnabled();
  });

  it('[EF-CFG-07] [ENF-UTI-03] disables the controls while the choice is saved', async () => {
    mockApi({
      'GET /watch/automatic': watchOf(),
      'PUT /watch/automatic': () => new Promise<Response>(() => undefined),
    });
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: 'Lancer la veille automatiquement' }));

    expect(screen.getByRole('switch', { name: 'Lancer la veille automatiquement' })).toBeDisabled();
    expect(within(await slotsGroup()).getByRole('checkbox', { name: 'Matin · 7 h' })).toBeDisabled();
  });

  it('[ENF-UTI-03] shows a waiting state while the watch is read', () => {
    mockApi({ 'GET /watch/automatic': () => new Promise<Response>(() => undefined) });

    renderSection();

    expect(screen.getByText('Chargement des créneaux et des passages…')).toBeInTheDocument();
  });

  it('[ENF-UTI-03] shows the reason the watch cannot be read, and lets the candidate try again', async () => {
    let isDown = true;
    mockApi({
      'GET /watch/automatic': () =>
        isDown ? json(500, { error: 'Une erreur inattendue est survenue.' }) : json(200, automaticWatch()),
    });
    renderSection();
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur inattendue est survenue.');
    isDown = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await slotsGroup()).toBeInTheDocument();
  });
});

describe('WatchSettings — the passes of the day (EF-CFG-08, EF-CFG-09)', () => {
  it('[EF-CFG-08] shows the three slots of the day in order, each with the state of its pass in words', async () => {
    mockApi({
      'GET /watch/automatic': watchOf({
        passes: [
          pass('morning', 'success'),
          pass('noon', 'failure', { message: 'Aucun service d’IA n’a répondu.' }),
        ],
      }),
    });

    renderSection();
    const list = await screen.findByRole('list', { name: 'Passages du jour' });
    const [morning, noon, evening] = within(list).getAllByRole('listitem');

    expect(morning).toHaveTextContent('Matin · 7 h');
    expect(morning).toHaveTextContent('Réussi');
    expect(noon).toHaveTextContent('Midi · 13 h');
    expect(noon).toHaveTextContent('En échec');
    expect(evening).toHaveTextContent('Soir · 19 h');
    expect(evening).toHaveTextContent('À venir');
  });

  it.each([
    ['queued', 'En file'],
    ['running', 'En cours'],
    ['success', 'Réussi'],
    ['failure', 'En échec'],
    ['skipped', 'Ignoré'],
  ] as const)('[EF-CFG-08] says « %s » of a pass as « %s »', async (outcome, word) => {
    mockApi({ 'GET /watch/automatic': watchOf({ passes: [pass('noon', outcome)] }) });

    renderSection();

    expect(await rowOf('Midi')).toHaveTextContent(word);
  });

  it('[EF-CFG-08] says « À venir » of a slot whose hour has not come in Paris, and « Aucun passage » of one that went by', async () => {
    mockApi({ 'GET /watch/automatic': watchOf() });

    renderSection();

    expect(await rowOf('Matin')).toHaveTextContent('Aucun passage');
    expect(await rowOf('Midi')).toHaveTextContent('À venir');
    expect(await rowOf('Soir')).toHaveTextContent('À venir');
  });

  it('[EF-CFG-07] says « Non utilisé » of a slot the candidate did not tick', async () => {
    mockApi({ 'GET /watch/automatic': watchOf({ slots: ['morning', 'evening'] }) });

    renderSection();

    expect(await rowOf('Midi')).toHaveTextContent('Non utilisé');
    expect(await rowOf('Soir')).toHaveTextContent('À venir');
  });

  it('[EF-CFG-07] says « Veille arrêtée » of the slots with no pass while the watch is stopped', async () => {
    mockApi({ 'GET /watch/automatic': watchOf({ enabled: false, passes: [pass('morning', 'success')] }) });

    renderSection();

    expect(await rowOf('Matin')).toHaveTextContent('Réussi');
    expect(await rowOf('Midi')).toHaveTextContent('Veille arrêtée');
  });

  it('[EF-CFG-08] counts what a pass did: sources, new offers, those above the threshold, those waiting for a score', async () => {
    mockApi({
      'GET /watch/automatic': watchOf({
        passes: [
          pass('morning', 'success', {
            counters: { sources_checked: 6, offers_new: 14, offers_relevant: 5, offers_unscored: 2 },
          }),
        ],
      }),
    });

    renderSection();
    const morning = await rowOf('Matin');

    expect(morning).toHaveTextContent('6 sources consultées');
    expect(morning).toHaveTextContent('14 offres nouvelles');
    expect(morning).toHaveTextContent('5 au-dessus de votre seuil');
    expect(morning).toHaveTextContent('2 en attente de note');
  });

  it('[EF-CFG-08] dates the end of a pass, and the last pass that succeeded, whichever day it was', async () => {
    const lastSuccessAt = '2026-10-01T17:12:00.000Z';
    mockApi({ 'GET /watch/automatic': watchOf({ lastSuccessAt, passes: [pass('morning', 'success')] }) });

    renderSection();

    expect(await rowOf('Matin')).toHaveTextContent(/Terminé à \d{2}:\d{2}/);
    expect(screen.getByText(`Dernier passage réussi : ${formatDateTime(lastSuccessAt)}`)).toBeInTheDocument();
  });

  it('[EF-CFG-08] says no pass has succeeded yet when there is no date', async () => {
    mockApi({ 'GET /watch/automatic': watchOf() });

    renderSection();

    expect(await screen.findByText('Aucun passage réussi pour l’instant.')).toBeInTheDocument();
  });

  it('[EF-VEI-55] [EF-CFG-08] tells why a pass was ignored — no criteria yet — and why one failed', async () => {
    mockApi({
      'GET /watch/automatic': watchOf({
        passes: [
          pass('morning', 'skipped', {
            message: 'Aucun critère enregistré ni profil validé : la veille n’a rien cherché.',
          }),
          pass('noon', 'failure', { message: 'Aucun service d’IA n’a pu traiter la demande.' }),
        ],
      }),
    });

    renderSection();

    const morning = await rowOf('Matin');
    expect(morning).toHaveTextContent('Ignoré');
    expect(morning).toHaveTextContent(
      'Aucun critère enregistré ni profil validé : la veille n’a rien cherché.',
    );
    expect(await rowOf('Midi')).toHaveTextContent('Aucun service d’IA n’a pu traiter la demande.');
  });

  it('[EF-CFG-09] says « Modèle local » of a pass led by the local model, and « Secours » of one a hosted provider took over', async () => {
    mockApi({
      'GET /watch/automatic': watchOf({
        passes: [
          pass('morning', 'success', { ledBy: 'local' }),
          pass('noon', 'success', { ledBy: 'fallback' }),
        ],
      }),
    });

    renderSection();

    expect(within(await rowOf('Matin')).getByText('Modèle local')).toBeInTheDocument();
    expect(within(await rowOf('Midi')).getByText('Secours')).toBeInTheDocument();
    expect(within(await rowOf('Matin')).queryByText('Secours')).not.toBeInTheDocument();
    expect(screen.getByText(/un fournisseur hébergé a pris le relais/)).toBeInTheDocument();
  });

  it('[EF-CFG-09] says nothing of the model for a pass that asked none, nor for a slot with no pass', async () => {
    mockApi({
      'GET /watch/automatic': watchOf({ passes: [pass('morning', 'skipped', { ledBy: null })] }),
    });

    renderSection();

    expect(await rowOf('Matin')).not.toHaveTextContent(/Modèle local|Secours/);
    expect(screen.queryByText(/un fournisseur hébergé a pris le relais/)).not.toBeInTheDocument();
  });

  it('[EF-CFG-06] [ENF-SEC-25] shows no address, no token, no name of a model, and no number of calls to a model', async () => {
    mockApi({
      'GET /watch/automatic': watchOf({
        passes: [
          pass('morning', 'success', {
            ledBy: 'fallback',
            counters: { sources_checked: 2, offers_new: 3, model_calls_local: 41, model_calls_fallback: 77 },
          }),
        ],
      }),
    });

    renderSection();
    const section = await screen.findByRole('region', { name: 'Créneaux et passages' });
    await rowOf('Matin');

    expect(section.textContent).not.toMatch(
      /https?:\/\/|localhost|jeton|token|clé d’api|api[_ ]key|LOCAL_LLM|ollama|model_calls/iu,
    );
    // The numbers of calls made to a model are the API's: only « Secours » says which kind led the pass.
    expect(section).not.toHaveTextContent('41');
    expect(section).not.toHaveTextContent('77');
    expect(section).toHaveTextContent('Secours');
  });

  it('[EF-EXE-04] [EF-CFG-08] reads the passes again when a scheduled pass changes state, and only then', async () => {
    let passes = [pass('morning', 'running')];
    const calls = mockApi({ 'GET /watch/automatic': () => json(200, automaticWatch({ passes })) });
    renderSection();
    expect(await rowOf('Matin')).toHaveTextContent('En cours');
    const reads = () => keysOf(calls).filter((key) => key === 'GET /watch/automatic').length;
    const before = reads();

    // The candidate's own pass, and the runs of other jobs, are not the passes of the day.
    emitRun({ id: 40, job: 'scraper', outcome: 'running', trigger: 'manual' });
    emitRun({ id: 41, job: 'gmail_sync', outcome: 'success', trigger: 'schedule' });
    expect(reads()).toBe(before);

    passes = [pass('morning', 'success', { counters: { sources_checked: 3, offers_new: 1 } })];
    emitRun({ id: 42, job: 'scraper', outcome: 'success', trigger: 'schedule' });

    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Passages du jour' })).getAllByRole('listitem')[0],
      ).toHaveTextContent('Réussi'),
    );
    expect(reads()).toBe(before + 1);
  });

  it('[EF-EXE-04] asks only once for a change of state seen again, such as the counters of a pass that goes on', async () => {
    const calls = mockApi({ 'GET /watch/automatic': watchOf({ passes: [pass('morning', 'running')] }) });
    renderSection();
    await rowOf('Matin');
    const reads = () => keysOf(calls).filter((key) => key === 'GET /watch/automatic').length;

    emitRun({ id: 50, job: 'scraper', outcome: 'running', trigger: 'schedule' });
    await waitFor(() => expect(reads()).toBe(2));
    emitRun({
      id: 50,
      job: 'scraper',
      outcome: 'running',
      trigger: 'schedule',
      counters: { sources_checked: 2 },
    });
    emitRun({
      id: 50,
      job: 'scraper',
      outcome: 'running',
      trigger: 'schedule',
      counters: { sources_checked: 3 },
    });

    expect(reads()).toBe(2);
  });
});
