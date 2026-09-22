import { describe, expect, it } from 'vitest';
import { appliedAtFromInput, appliedDateProblem, toDateInputValue } from './dates';

const now = new Date(2026, 8, 22, 10, 30, 0);

describe('application date helpers', () => {
  it('[EF-CAN-16] reads an instant as a local day for the date input', () => {
    expect(toDateInputValue(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toDateInputValue(now)).toBe('2026-09-22');
  });

  it('[EF-CAN-16] keeps the real hour for today and sends local noon for a past day', () => {
    expect(appliedAtFromInput('2026-09-22', now)).toBe(now.toISOString());
    expect(appliedAtFromInput('2026-09-07', now)).toBe(new Date(2026, 8, 7, 12, 0, 0).toISOString());
  });

  it('[EF-CAN-16] refuses an empty day, a future day and a day before 2000', () => {
    expect(appliedDateProblem('', now)).toBe('Indiquez la date de candidature.');
    expect(appliedDateProblem('2026-09-23', now)).toBe('La date de candidature ne peut pas être dans le futur.');
    expect(appliedDateProblem('1999-12-31', now)).toBe(
      'La date de candidature doit être postérieure au 1er janvier 2000.',
    );
    expect(appliedDateProblem('2026-09-22', now)).toBeNull();
    expect(appliedDateProblem('2000-01-01', now)).toBeNull();
  });
});
