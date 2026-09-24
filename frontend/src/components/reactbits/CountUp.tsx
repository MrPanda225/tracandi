/*
 * Adapted from React Bits — CountUp (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: a timed ease-out instead of a spring, so that the count lands exactly on its value (a spring only nears
 * it); French number format; final value at once when the user prefers reduced motion; up only.
 */
import { animate, useInView } from 'motion/react';
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

interface CountUpProps {
  to: number;
  /** Seconds the count takes. */
  duration?: number;
  className?: string;
}

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** A number counting up from 0 to its value the first time it scrolls into view. */
export function CountUp({ to, duration = 1.6, className = '' }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const isStill = prefersReducedMotion();

  useEffect(() => {
    if (!isInView || isStill) return;
    const controls = animate(0, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        if (ref.current) ref.current.textContent = numberFormat.format(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [isInView, isStill, to, duration]);

  return (
    <span ref={ref} className={className}>
      {numberFormat.format(isStill ? to : 0)}
    </span>
  );
}
