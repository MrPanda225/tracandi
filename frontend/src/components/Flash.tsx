import type { ReactNode } from 'react';
import './Flash.css';

/**
 * Page-level error message, announced at once so that a failure is never silent (rules/frontend.md, ENF-UTI-03).
 * The text itself carries the meaning, not the colour (WCAG 1.4.1).
 */
export function Flash({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flash">
      {children}
    </p>
  );
}
