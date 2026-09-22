import { describe, expect, it } from 'vitest';
import { readCookie } from './cookies.js';

describe('readCookie', () => {
  it('[EF-AUT-05] reads the named cookie among others', () => {
    expect(readCookie('theme=dark; tracandi_session=abc123; lang=fr', 'tracandi_session')).toBe('abc123');
  });

  it.each([undefined, '', 'theme=dark', 'tracandi_session=', 'xtracandi_session=abc', '=abc'])(
    '[EF-AUT-05] returns null for %j',
    (header) => {
      expect(readCookie(header, 'tracandi_session')).toBeNull();
    },
  );
});
