import { describe, expect, it } from 'vitest';
import { startOfParisDay } from './quota.js';

describe('startOfParisDay', () => {
  it('[EF-CVX-33] starts the day at midnight in Paris, in summer (UTC+2)', () => {
    expect(startOfParisDay(new Date('2026-09-26T15:30:00Z')).toISOString()).toBe('2026-09-25T22:00:00.000Z');
  });

  it('[EF-CVX-33] and in winter (UTC+1)', () => {
    expect(startOfParisDay(new Date('2026-12-02T08:00:00Z')).toISOString()).toBe('2026-12-01T23:00:00.000Z');
  });

  it('[EF-CVX-33] belongs to the next day just after midnight in Paris', () => {
    expect(startOfParisDay(new Date('2026-09-26T22:05:00Z')).toISOString()).toBe('2026-09-26T22:00:00.000Z');
  });
});
