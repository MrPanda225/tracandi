import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYSIS_TTL_MS, createAnalysisResults } from './results.js';

const RESULT = { reading: { text: 'Data Analyst', contacts: null, ocrPageCount: 0 } };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createAnalysisResults', () => {
  it('[EF-CVX-32] hands the result of an analysis back to the candidate who asked for it', () => {
    const results = createAnalysisResults<typeof RESULT>();

    results.save(7, 41, RESULT);

    expect(results.find(7, 41)).toEqual(RESULT);
  });

  it('[EF-AUT-06] never hands it to another account', () => {
    const results = createAnalysisResults<typeof RESULT>();

    results.save(7, 41, RESULT);

    expect(results.find(8, 41)).toBeNull();
  });

  it('[ENF-RGP-06] erases it after 30 minutes, even when nobody asks for it again', () => {
    const results = createAnalysisResults<typeof RESULT>();
    results.save(7, 41, RESULT);

    vi.advanceTimersByTime(ANALYSIS_TTL_MS - 1);
    expect(results.size()).toBe(1);
    vi.advanceTimersByTime(1);

    expect(ANALYSIS_TTL_MS).toBe(30 * 60 * 1000);
    expect(results.size()).toBe(0);
    expect(results.find(7, 41)).toBeNull();
  });
});
