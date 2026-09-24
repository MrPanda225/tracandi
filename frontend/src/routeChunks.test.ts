import { describe, expect, it, vi } from 'vitest';
import { preloadEntryScreen } from './routeChunks';

describe('preloadEntryScreen', () => {
  it('[ENF-PERF-07] starts fetching the screen of a public address at once', () => {
    const load = vi.fn(() => Promise.resolve());

    preloadEntryScreen('/connexion', { '/connexion': load });

    expect(load).toHaveBeenCalledOnce();
  });

  it('[ENF-PERF-07] fetches nothing for a screen of the application', () => {
    const load = vi.fn(() => Promise.resolve());

    for (const path of ['/candidatures', '/reglages', '/offres']) preloadEntryScreen(path, { '/': load });

    expect(load).not.toHaveBeenCalled();
  });

  it('[ENF-PERF-07] leaves a failed fetch to the route, without an unhandled rejection', async () => {
    const load = vi.fn(() => Promise.reject(new Error('offline')));

    expect(() => preloadEntryScreen('/connexion', { '/connexion': load })).not.toThrow();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
  });
});
