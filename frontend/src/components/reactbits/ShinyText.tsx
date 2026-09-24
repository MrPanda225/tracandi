/*
 * Adapted from React Bits — ShinyText (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: the CSS version of the effect (no animation library), colours from the design tokens, still when the
 * user prefers reduced motion.
 */
import './ShinyText.css';

interface ShinyTextProps {
  text: string;
  className?: string;
}

/** Text crossed by a slow sheen, for one accent line. */
export function ShinyText({ text, className = '' }: ShinyTextProps) {
  return <span className={`shiny-text ${className}`}>{text}</span>;
}
