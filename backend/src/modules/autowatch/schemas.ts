import { z } from '../../lib/openapi.js';
import { WATCH_SLOTS } from './slots.js';

const WatchSlotSchema = z.enum(WATCH_SLOTS);

/** Each slot once, in the order of the day: what is stored and what is given back. */
const inOrderOfTheDay = (slots: readonly (typeof WATCH_SLOTS)[number][]) =>
  WATCH_SLOTS.filter((slot) => slots.includes(slot));

const AT_LEAST_ONE_SLOT = 'Choisissez au moins un créneau pour que la veille se lance d’elle-même.';

/**
 * EF-CFG-07: the candidate activates or stops the watch and chooses the slots they use. A replacement, like the
 * criteria: both parts are always given, and the slots are kept while the watch is stopped.
 * @req EF-CFG-07
 */
export const AutomaticWatchBodySchema = z
  .object({
    enabled: z.boolean(),
    slots: z.array(WatchSlotSchema).max(WATCH_SLOTS.length * 2),
  })
  .transform((body) => ({ ...body, slots: inOrderOfTheDay(body.slots) }))
  .refine((body) => !body.enabled || body.slots.length > 0, {
    message: AT_LEAST_ONE_SLOT,
    path: ['slots'],
  })
  .openapi('AutomaticWatchBody');

/** EF-CFG-08: one scheduled pass of the day, as the settings show it — never an offer nor a text of the candidate. */
const PassSchema = z
  .object({
    slot: WatchSlotSchema,
    outcome: z.enum(['queued', 'running', 'success', 'failure', 'skipped']),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    counters: z.record(z.string(), z.number().int()),
    /** Why a pass was ignored or failed (EF-VEI-55). */
    message: z.string().nullable(),
  })
  .openapi('AutomaticWatchPass');

export const AutomaticWatchSchema = z
  .object({
    enabled: z.boolean(),
    slots: z.array(WatchSlotSchema),
    /** The scheduled passes of today, Paris time, in the order they were started. */
    passes: z.array(PassSchema),
  })
  .openapi('AutomaticWatch');

export type AutomaticWatchBody = z.infer<typeof AutomaticWatchBodySchema>;
export type AutomaticWatch = z.infer<typeof AutomaticWatchSchema>;
export type AutomaticWatchPass = z.infer<typeof PassSchema>;
