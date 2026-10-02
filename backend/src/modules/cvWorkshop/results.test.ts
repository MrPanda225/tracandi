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

  it('[EF-CVX-41] erases a result on demand, for its owner only', () => {
    const results = createAnalysisResults<typeof RESULT>();
    results.save(7, 41, RESULT);

    results.erase(8, 41);
    expect(results.find(7, 41)).toEqual(RESULT);
    results.erase(7, 41);

    expect(results.find(7, 41)).toBeNull();
    expect(results.size()).toBe(0);
  });

  it('[ENF-RGP-06] keeps a result saved again under the same key for 30 minutes from the new save, not the old one', () => {
    const results = createAnalysisResults<typeof RESULT>();
    results.save(7, 41, RESULT);
    vi.advanceTimersByTime(ANALYSIS_TTL_MS - 1000);

    results.save(7, 41, { reading: { text: 'Data Engineer', contacts: null, ocrPageCount: 0 } });
    vi.advanceTimersByTime(2000);

    expect(results.find(7, 41)?.reading.text).toBe('Data Engineer');
    vi.advanceTimersByTime(ANALYSIS_TTL_MS);
    expect(results.find(7, 41)).toBeNull();
  });
});
