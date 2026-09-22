import type { ReactNode } from 'react';
import './PageHeader.css';

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
}

/** Title block of a page: the only `h1` of the screen, an optional eyebrow line and a lede. */
export function PageHeader({ title, eyebrow, children }: PageHeaderProps) {
  return (
    <header className="page-header">
      {eyebrow && <p className="page-header__eyebrow">{eyebrow}</p>}
      <h1 className="page-header__title">{title}</h1>
      {children && <div className="page-header__lede">{children}</div>}
    </header>
  );
}
