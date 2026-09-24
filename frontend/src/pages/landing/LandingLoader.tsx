import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

// Long enough to read the name, short enough never to feel like a wait.
const LOADER_MS = 1100;
const LETTERS = Array.from('Tracandi');

/**
 * Opening of the presentation page: the name rises letter by letter over a filling line, then the curtain lifts on
 * the page, already rendered underneath. Skipped when the user prefers reduced motion (ENF-UTI-04).
 */
export function LandingLoader() {
  const [isVisible, setIsVisible] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    if (!isVisible) return;
    const timer = window.setTimeout(() => setIsVisible(false), LOADER_MS);
    return () => window.clearTimeout(timer);
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="landing-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: '-4%' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="visually-hidden" role="status">
            Chargement de Tracandi…
          </p>
          <p className="landing-loader__name" aria-hidden="true">
            {LETTERS.map((letter, index) => (
              <motion.span
                key={`${index}-${letter}`}
                initial={{ opacity: 0, y: '0.6em', rotateX: -60 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ duration: 0.5, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] }}
              >
                {letter}
              </motion.span>
            ))}
          </p>
          <span className="landing-loader__track" aria-hidden="true">
            <motion.span
              className="landing-loader__fill"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: (LOADER_MS - 150) / 1000, ease: [0.65, 0, 0.35, 1] }}
            />
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
