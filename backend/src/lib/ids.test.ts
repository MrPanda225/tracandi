import { describe, expect, it } from 'vitest';
import { idParam, INT4_MAX } from './ids.js';

describe('idParam', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    [String(INT4_MAX), INT4_MAX],
  ])('[ENF-SEC-04] reads « %s » as %i', (text, id) => {
    expect(idParam().parse(text)).toBe(id);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc'], [String(INT4_MAX + 1)], ['99999999999'], ['']])(
    '[ENF-SEC-04] refuses « %s »: it is no identifier the database could hold',
    (text) => {
      expect(idParam().safeParse(text).success).toBe(false);
    },
  );
});
