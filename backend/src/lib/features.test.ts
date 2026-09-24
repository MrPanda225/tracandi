import { describe, expect, it } from 'vitest';
import { onlyIf } from './features.js';

describe('onlyIf', () => {
  it('[ENF-MAI-07] keeps what an enabled feature brings', () => {
    expect(onlyIf(new Set(['watch']), 'watch', 'sites', 'scraper')).toEqual(['sites', 'scraper']);
  });

  it('[ENF-MAI-07] leaves out what a disabled feature brings', () => {
    expect(onlyIf(new Set(['watch']), 'cv', 'profile')).toEqual([]);
  });
});
