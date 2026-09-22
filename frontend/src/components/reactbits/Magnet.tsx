/*
 * Adapted from React Bits — Magnet (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: transform written directly to the element (no React re-render on every mouse move),
 * disabled on touch devices and when the user prefers reduced motion.
 */
import { type ReactNode, useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

interface MagnetProps {
  children: ReactNode;
  padding?: number;
  magnetStrength?: number;
  disabled?: boolean;
  className?: string;
}

const ACTIVE_TRANSITION = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
const RESTING_TRANSITION = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';

/** Gently pulls its content toward the pointer when the pointer comes close. */
export function Magnet({
  children,
  padding = 60,
  magnetStrength = 6,
  disabled = false,
  className = '',
}: MagnetProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasFinePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
    if (disabled || !hasFinePointer || prefersReducedMotion()) return;

    const handleMouseMove = (event: MouseEvent) => {
      const wrapper = wrapperRef.current;
      const inner = innerRef.current;
      if (!wrapper || !inner) return;
      const { left, top, width, height } = wrapper.getBoundingClientRect();
      const offsetX = event.clientX - (left + width / 2);
      const offsetY = event.clientY - (top + height / 2);
      const isNear = Math.abs(offsetX) < width / 2 + padding && Math.abs(offsetY) < height / 2 + padding;
      inner.style.transition = isNear ? ACTIVE_TRANSITION : RESTING_TRANSITION;
      inner.style.transform = isNear
        ? `translate3d(${offsetX / magnetStrength}px, ${offsetY / magnetStrength}px, 0)`
        : 'translate3d(0, 0, 0)';
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [disabled, padding, magnetStrength]);

  return (
    <div ref={wrapperRef} className={className} style={{ position: 'relative' }}>
      <div ref={innerRef} style={{ willChange: 'transform' }}>
        {children}
      </div>
    </div>
  );
}
