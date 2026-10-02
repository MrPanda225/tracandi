import { describe, expect, it } from 'vitest';
import type { AutomaticWatch, AutomaticWatchPass, WatchSlot } from '../../../api/autowatch';
import { describeCounters, describeSlot, parisHourOf, passOfSlot, slotStateOf } from './passes';

const watch = (changes: Partial<AutomaticWatch> = {}): AutomaticWatch => ({
  enabled: true,
  slots: ['morning', 'noon', 'evening'],
  lastSuccessAt: null,
  passes: [],
  ...changes,
});

const pass = (slot: WatchSlot, outcome: AutomaticWatchPass['outcome']): AutomaticWatchPass => ({
  slot,
  outcome,
  startedAt: '2026-10-02T05:00:00.000Z',
  finishedAt: null,
  counters: {},
  message: null,
  ledBy: null,
});

// 2 October 2026 is in summer time: Paris is two hours ahead of UTC.
const AT_10_IN_PARIS = new Date('2026-10-02T08:00:00.000Z');

describe('describeSlot', () => {
  it('[EF-CFG-07] names each slot with its hour: morning 7 h, noon 13 h, evening 19 h', () => {
    expect(describeSlot('morning')).toBe('Matin · 7 h');
    expect(describeSlot('noon')).toBe('Midi · 13 h');
    expect(describeSlot('evening')).toBe('Soir · 19 h');
  });
});

describe('parisHourOf', () => {
  it('[EF-VEI-51] reads the hour on the wall clock of Paris, in summer and in winter', () => {
    expect(parisHourOf(new Date('2026-10-02T05:00:00.000Z'))).toBe(7);
    expect(parisHourOf(new Date('2026-01-15T06:00:00.000Z'))).toBe(7);
    expect(parisHourOf(new Date('2026-10-02T22:30:00.000Z'))).toBe(0);
  });
});

describe('passOfSlot', () => {
  it('[EF-CFG-08] gives the last pass started for the slot, and none when there is none', () => {
    const passes = [pass('morning', 'skipped'), pass('noon', 'success'), pass('morning', 'success')];

    expect(passOfSlot(passes, 'morning')).toBe(passes[2]);
    expect(passOfSlot(passes, 'evening')).toBeNull();
  });
});

describe('slotStateOf', () => {
  it.each(['queued', 'running', 'success', 'failure', 'skipped'] as const)(
    '[EF-CFG-08] is the state of the pass when there is one: %s',
    (outcome) => {
      expect(slotStateOf('noon', watch({ passes: [pass('noon', outcome)] }), AT_10_IN_PARIS)).toBe(outcome);
    },
  );

  it('[EF-CFG-08] is « upcoming » for a slot of the day whose hour has not come, in Paris time', () => {
    expect(slotStateOf('noon', watch(), AT_10_IN_PARIS)).toBe('upcoming');
    expect(slotStateOf('evening', watch(), AT_10_IN_PARIS)).toBe('upcoming');
  });

  it('[EF-CFG-08] is « missed » for a slot whose hour went by with no pass recorded', () => {
    expect(slotStateOf('morning', watch(), AT_10_IN_PARIS)).toBe('missed');
  });

  it('[EF-CFG-07] is « unused » for a slot the candidate did not tick, whatever the hour', () => {
    const noMidday = watch({ slots: ['morning', 'evening'] });

    expect(slotStateOf('noon', noMidday, AT_10_IN_PARIS)).toBe('unused');
    expect(slotStateOf('noon', noMidday, new Date('2026-10-02T20:00:00.000Z'))).toBe('unused');
  });

  it('[EF-CFG-07] is « stopped » for a slot with no pass while the watch is stopped', () => {
    expect(slotStateOf('evening', watch({ enabled: false }), AT_10_IN_PARIS)).toBe('stopped');
  });

  it('[EF-CFG-08] keeps the state of a pass that ran before the watch was stopped', () => {
    expect(
      slotStateOf('morning', watch({ enabled: false, passes: [pass('morning', 'success')] }), AT_10_IN_PARIS),
    ).toBe('success');
  });
});

describe('describeCounters', () => {
  it('[EF-CFG-08] says what a pass did in words: sources, new offers, above the threshold, waiting for a score', () => {
    expect(
      describeCounters({ sources_checked: 6, offers_new: 14, offers_relevant: 5, offers_unscored: 2 }),
    ).toEqual([
      '6 sources consultées',
      '14 offres nouvelles',
      '5 au-dessus de votre seuil',
      '2 en attente de note',
    ]);
  });

  it('[EF-CFG-08] uses the singular for one, and says zero', () => {
    expect(
      describeCounters({ sources_checked: 1, offers_new: 1, offers_relevant: 0, offers_unscored: 0 }),
    ).toEqual([
      '1 source consultée',
      '1 offre nouvelle',
      '0 au-dessus de votre seuil',
      '0 en attente de note',
    ]);
  });

  it('[EF-CFG-09] leaves out the counters that are not about the offers, such as the calls made to a model', () => {
    expect(describeCounters({ sources_checked: 2, model_calls_local: 3, model_calls_fallback: 1 })).toEqual([
      '2 sources consultées',
    ]);
  });

  it('[EF-CFG-08] says nothing for a pass that has counted nothing', () => {
    expect(describeCounters({})).toEqual([]);
  });
});
