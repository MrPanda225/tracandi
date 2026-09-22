import type { ReactNode } from 'react';
import './Flash.css';

interface FlashProps {
  /** `error` (default) is announced at once; `success` politely, once the current reading is over. */
  tone?: 'error' | 'success';
  children: ReactNode;
}

/**
 * Page-level message: a failure is never silent (rules/frontend.md, ENF-UTI-03), a completed action is confirmed.
 * The text itself carries the meaning, not the colour (WCAG 1.4.1).
 */
export function Flash({ tone = 'error', children }: FlashProps) {
  return tone === 'error' ? (
    <p role="alert" className="flash flash--error">
      {children}
    </p>
  ) : (
    <p role="status" aria-live="polite" className="flash flash--success">
      {children}
    </p>
  );
}
