import { useEffect } from 'react';

/** Title and description a page gives itself in search results and shared links (EF-SEO-01). */
export interface PageMeta {
  title: string;
  /** Left as it is when absent: the screens behind a session are not indexed. */
  description?: string;
}

/** The `<meta name="description">` of the document, created when the page was served without one. */
const descriptionElement = (): HTMLMetaElement => {
  const existing = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (existing) return existing;
  const created = document.createElement('meta');
  created.name = 'description';
  return document.head.appendChild(created);
};

/**
 * The canonical address of a public page: its own address, without query nor fragment, on whatever domain serves it —
 * so that « /connexion?mode=inscription » and « /connexion » count as one page for search engines.
 */
const addCanonicalLink = (): HTMLLinkElement => {
  const link = document.createElement('link');
  link.rel = 'canonical';
  link.href = `${window.location.origin}${window.location.pathname}`;
  return document.head.appendChild(link);
};

/**
 * Gives the page its title and description while it is shown, and puts back those it found when it goes, so that the
 * next page never inherits them. A page with a description is public: it also names its canonical address.
 * @req EF-SEO-01
 */
export function usePageMeta({ title, description }: PageMeta): void {
  useEffect(() => {
    const element = descriptionElement();
    const previous = { title: document.title, description: element.content };
    document.title = title;
    if (description !== undefined) element.content = description;
    const canonical = description === undefined ? null : addCanonicalLink();
    return () => {
      document.title = previous.title;
      element.content = previous.description;
      canonical?.remove();
    };
  }, [title, description]);
}
