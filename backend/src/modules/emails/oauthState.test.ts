import { describe, expect, it } from 'vitest';
import { createOAuthStateStore, OAUTH_STATE_TTL_MS } from './oauthState.js';

const MINUTE_MS = 60_000;

const setup = () => {
  let now = new Date('2026-09-22T10:00:00.000Z');
  const store = createOAuthStateStore({ clock: () => now });
  return {
    store,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
};

describe('OAuth state store', () => {
  it('[ENF-SEC-14] issues an unguessable state of 24 random bytes, different each time', () => {
    const { store } = setup();

    const first = store.issue(7);
    const second = store.issue(7);

    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first).not.toBe(second);
  });

  it('[ENF-SEC-14] accepts a state issued less than 10 minutes ago, once, and gives back its user', () => {
    const { store, advance } = setup();
    const state = store.issue(7);
    advance(OAUTH_STATE_TTL_MS - 1);

    expect(store.consume(state)).toBe(7);
    expect(store.consume(state)).toBeNull();
  });

  it('[ENF-SEC-14] refuses a state issued more than 10 minutes ago', () => {
    const { store, advance } = setup();
    const state = store.issue(7);
    advance(OAUTH_STATE_TTL_MS + 1);

    expect(store.consume(state)).toBeNull();
    expect(OAUTH_STATE_TTL_MS).toBe(10 * MINUTE_MS);
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['forged', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
  ])('[ENF-SEC-14] refuses an %s state', (_case, state) => {
    const { store } = setup();
    store.issue(7);

    expect(store.consume(state)).toBeNull();
  });

  it('[ENF-SEC-14] keeps the states of two users apart', () => {
    const { store } = setup();
    const alice = store.issue(1);
    const bob = store.issue(2);

    expect(store.consume(bob)).toBe(2);
    expect(store.consume(alice)).toBe(1);
  });
});
