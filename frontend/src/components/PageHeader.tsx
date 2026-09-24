import type { ReactNode } from 'react';
import { usePageMeta } from '../lib/pageMeta';
import './PageHeader.css';

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
}

/**
 * Title block of a page: the only `h1` of the screen, an optional eyebrow line and a lede. The browser tab and the
 * history carry the same title (EF-SEO-01).
 */
export function PageHeader({ title, eyebrow, children }: PageHeaderProps) {
  usePageMeta({ title: `${title} — Tracandi` });
  return (
    <header className="page-header">
      {eyebrow && <p className="page-header__eyebrow">{eyebrow}</p>}
      <h1 className="page-header__title">{title}</h1>
      {children && <div className="page-header__lede">{children}</div>}
    </header>
  );
}
