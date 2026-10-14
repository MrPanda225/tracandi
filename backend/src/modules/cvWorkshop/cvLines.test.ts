import { describe, expect, it } from 'vitest';
import { CV_LINES_MAX, numberCvLines } from './cvLines.js';

describe('numberCvLines', () => {
  it('[EF-CVX-46] numbers the lines from 1 in reading order, trimmed', () => {
    expect(numberCvLines('  Data analyst \nSQL, Python')).toEqual([
      { id: 1, text: 'Data analyst' },
      { id: 2, text: 'SQL, Python' },
    ]);
  });

  it('[EF-CVX-46] skips blank lines without leaving a gap in the numbers', () => {
    expect(numberCvLines('A\n\n   \r\nB\n')).toEqual([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
  });

  it('[EF-CVX-46] keeps the first lines only beyond the cap', () => {
    const lines = numberCvLines(Array.from({ length: CV_LINES_MAX + 50 }, (_, i) => `ligne ${i}`).join('\n'));

    expect(lines).toHaveLength(CV_LINES_MAX);
    expect(lines.at(-1)).toEqual({ id: CV_LINES_MAX, text: `ligne ${CV_LINES_MAX - 1}` });
  });
});
