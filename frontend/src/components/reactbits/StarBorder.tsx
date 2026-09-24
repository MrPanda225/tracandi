/*
 * Adapted from React Bits — StarBorder (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: a frame around any action (a link here) instead of rendering its own element, typed without `any`,
 * colours from the design tokens, still when the user prefers reduced motion.
 */
import type { ReactNode } from 'react';
import './StarBorder.css';

interface StarBorderProps {
  children: ReactNode;
  className?: string;
  /** Seconds a light takes to cross the border. */
  speed?: number;
}

/** Two small lights travelling along the border of its content: draws the eye to the one main action. */
export function StarBorder({ children, className = '', speed = 6 }: StarBorderProps) {
  return (
    <span className={`star-border ${className}`} style={{ '--star-speed': `${speed}s` } as React.CSSProperties}>
      <span className="star-border__light star-border__light--bottom" aria-hidden="true" />
      <span className="star-border__light star-border__light--top" aria-hidden="true" />
      <span className="star-border__content">{children}</span>
    </span>
  );
}
