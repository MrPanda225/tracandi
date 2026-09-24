/*
 * Adapted from React Bits — GlareHover (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: sized by its layout rather than fixed dimensions, colours from the design tokens, no glare when the user
 * prefers reduced motion; the glare also plays on keyboard focus inside it.
 */
import type { ReactNode } from 'react';
import './GlareHover.css';

interface GlareHoverProps {
  children: ReactNode;
  className?: string;
}

/** A surface a band of light sweeps across when the pointer, or the keyboard focus, enters it. */
export function GlareHover({ children, className = '' }: GlareHoverProps) {
  return <div className={`glare-hover ${className}`}>{children}</div>;
}
