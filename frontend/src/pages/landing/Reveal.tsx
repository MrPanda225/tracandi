import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * Content that rises into place the first time it scrolls into view — shown as is when the user prefers reduced
 * motion (ENF-UTI-04).
 */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  if (prefersReducedMotion()) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
