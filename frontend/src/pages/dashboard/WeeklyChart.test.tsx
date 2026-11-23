import { describe, expect, it } from 'vitest';
import { statusColorVar } from '../../components/StatusTag';
import { WEEKLY_SERIES } from './WeeklyChart';

const colorOf = (key: string) => WEEKLY_SERIES.find((series) => series.key === key)?.color;

describe('WeeklyChart', () => {
  it('[EF-CAN-22] draws the interviews in the orange of the Entretien tag', () => {
    expect(colorOf('interviews')).toBe(statusColorVar('interview'));
  });

  it('[EF-CAN-22] draws the sent applications in a lighter orange and the refusals in red, three distinct bars', () => {
    expect(colorOf('sent')).toBe('var(--application-in-progress-light)');
    expect(colorOf('rejected')).toBe('var(--application-rejected-bright)');
    expect(new Set(WEEKLY_SERIES.map((series) => series.color)).size).toBe(WEEKLY_SERIES.length);
  });
});
