import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePageMeta } from './pageMeta';

const canonicalLinks = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')];

describe('usePageMeta', () => {
  it('[EF-SEO-01] names the canonical address of a public page, without its query, and takes it away after', () => {
    window.history.replaceState(null, '', '/connexion?mode=inscription');

    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'Connexion — Tracandi', description: 'Se connecter.' }),
    );

    expect(canonicalLinks().map((link) => link.href)).toEqual([`${window.location.origin}/connexion`]);
    unmount();
    expect(canonicalLinks()).toHaveLength(0);
  });

  it('[EF-SEO-01] names none for a screen behind a session', () => {
    renderHook(() => usePageMeta({ title: 'Candidatures — Tracandi' }));

    expect(canonicalLinks()).toHaveLength(0);
  });
});
