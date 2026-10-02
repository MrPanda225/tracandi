import type { AutomaticWatch, AutomaticWatchPass, WatchSlot } from '../../../api/autowatch';
import type { RunState } from '../../../api/jobs';
import { formatInteger, plural } from '../../../lib/format';

const SLOT_NAMES: Readonly<Record<WatchSlot, string>> = { morning: 'Matin', noon: 'Midi', evening: 'Soir' };

/** EF-VEI-06: the hour of Paris each slot runs at. */
const SLOT_HOURS: Readonly<Record<WatchSlot, number>> = { morning: 7, noon: 13, evening: 19 };

/** « Matin · 7 h »: the name of a slot, and the hour of Paris it runs at (EF-CFG-07). */
export const describeSlot = (slot: WatchSlot): string =>
  `${SLOT_NAMES[slot]} · ${String(SLOT_HOURS[slot])} h`;

const HOURS_OF_THE_DAY = 24;
const parisHourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hourCycle: 'h23',
  hour: 'numeric',
});

/** The hour of an instant on the wall clock of Paris, from 0 to 23: the slots are set in Paris time, whatever the browser's. */
export const parisHourOf = (instant: Date): number =>
  Number(parisHourFormat.formatToParts(instant).find((part) => part.type === 'hour')?.value ?? 0) %
  HOURS_OF_THE_DAY;

/**
 * Where a slot of the day stands. The five states of a pass (EF-CFG-08), and what a slot with no pass is: still to
 * come, gone by without a pass recorded, not used by the candidate, or under a watch that is stopped.
 */
export type SlotState = RunState['outcome'] | 'upcoming' | 'missed' | 'unused' | 'stopped';

/** Each state in a word: it is never told by its colour alone (WCAG 1.4.1). */
export const STATE_LABELS: Readonly<Record<SlotState, string>> = {
  upcoming: 'À venir',
  queued: 'En file',
  running: 'En cours',
  success: 'Réussi',
  failure: 'En échec',
  skipped: 'Ignoré',
  missed: 'Aucun passage',
  unused: 'Non utilisé',
  stopped: 'Veille arrêtée',
};

/** The last pass started for a slot today, or null: the API lists them in the order they were started. */
export const passOfSlot = (
  passes: readonly AutomaticWatchPass[],
  slot: WatchSlot,
): AutomaticWatchPass | null => passes.findLast((pass) => pass.slot === slot) ?? null;

/**
 * EF-CFG-08: the state of a slot of today. A pass tells its own; without one, the choice of the candidate and the hour
 * of Paris say whether the slot is still to come.
 */
export const slotStateOf = (slot: WatchSlot, watch: AutomaticWatch, now: Date): SlotState => {
  const pass = passOfSlot(watch.passes, slot);
  if (pass) return pass.outcome;
  if (!watch.enabled) return 'stopped';
  if (!watch.slots.includes(slot)) return 'unused';
  return parisHourOf(now) < SLOT_HOURS[slot] ? 'upcoming' : 'missed';
};

/** The counters a pass shows, in the order they are read, and how each is told. */
const COUNTER_WORDS: readonly (readonly [string, (count: number) => string])[] = [
  ['sources_checked', (count) => plural(count, 'source consultée', 'sources consultées')],
  ['offers_new', (count) => plural(count, 'offre nouvelle', 'offres nouvelles')],
  ['offers_relevant', (count) => `${formatInteger(count)} au-dessus de votre seuil`],
  ['offers_unscored', (count) => `${formatInteger(count)} en attente de note`],
];

/**
 * EF-CFG-08: what a pass counted, in words — numbers only, never an offer nor a text. The counters of the calls made
 * to a model (EF-CFG-09) are the API's, not shown.
 */
export const describeCounters = (counters: Readonly<Record<string, number>>): string[] =>
  COUNTER_WORDS.flatMap(([name, say]) => {
    const count = counters[name];
    return count === undefined ? [] : [say(count)];
  });
