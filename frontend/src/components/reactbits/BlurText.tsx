/*
 * Adapted from React Bits — BlurText (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: renders as any heading or paragraph, reads as one sentence to assistive technologies (the animated words
 * are hidden from them), plain text when the user prefers reduced motion; words only.
 */
import { motion, useInView } from 'motion/react';
import { type ElementType, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

interface BlurTextProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** Milliseconds between two words. */
  delay?: number;
}

const FROM = { filter: 'blur(10px)', opacity: 0, y: -30 };
const TO = { filter: ['blur(10px)', 'blur(4px)', 'blur(0px)'], opacity: [0, 0.6, 1], y: [-30, 4, 0] };
const STEP_SECONDS = 0.35;
const MS_PER_SECOND = 1000;

/** Text whose words come into focus one after the other, from a blur, when it scrolls into view. */
export function BlurText({ text, as: Tag = 'p', className = '', delay = 120 }: BlurTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  if (prefersReducedMotion()) return <Tag className={className}>{text}</Tag>;
  const words = text.split(' ');
  return (
    <Tag className={className}>
      <span className="visually-hidden">{text}</span>
      <span ref={ref} aria-hidden="true">
        {words.map((word, index) => (
          <motion.span
            key={`${index}-${word}`}
            initial={FROM}
            animate={isInView ? TO : FROM}
            transition={{ duration: STEP_SECONDS * 2, times: [0, 0.5, 1], delay: (index * delay) / MS_PER_SECOND }}
            style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
          >
            {word}
            {index < words.length - 1 && ' '}
          </motion.span>
        ))}
      </span>
    </Tag>
  );
}
