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
 * Gives the page its title and description while it is shown, and puts back those it found when it goes, so that the
 * next page never inherits them.
 * @req EF-SEO-01
 */
export function usePageMeta({ title, description }: PageMeta): void {
  useEffect(() => {
    const element = descriptionElement();
    const previous = { title: document.title, description: element.content };
    document.title = title;
    if (description !== undefined) element.content = description;
    return () => {
      document.title = previous.title;
      element.content = previous.description;
    };
  }, [title, description]);
}
