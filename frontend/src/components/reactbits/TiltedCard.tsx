/*
 * Adapted from React Bits — TiltedCard (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: tilts any content instead of an image, no caption nor English mobile warning, still (no tilt) on touch
 * screens and when the user prefers reduced motion.
 */
import { motion, type SpringOptions, useMotionValue, useSpring } from 'motion/react';
import { type MouseEvent, type ReactNode, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';
import './TiltedCard.css';

interface TiltedCardProps {
  children: ReactNode;
  className?: string;
  /** Largest rotation, in degrees, when the pointer reaches an edge. */
  rotateAmplitude?: number;
  scaleOnHover?: number;
}

const SPRING: SpringOptions = { damping: 30, stiffness: 100, mass: 2 };
// A pointer that hovers: a finger never does, and a tilt that follows nothing would only get in the way.
const HOVER_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

const canTilt = (): boolean =>
  !prefersReducedMotion() && typeof window.matchMedia === 'function' && window.matchMedia(HOVER_POINTER_QUERY).matches;

/** Content that leans toward the pointer in 3D, with a spring, and settles back when the pointer leaves. */
export function TiltedCard({ children, className = '', rotateAmplitude = 10, scaleOnHover = 1.03 }: TiltedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), SPRING);
  const rotateY = useSpring(useMotionValue(0), SPRING);
  const scale = useSpring(1, SPRING);
  const isActive = canTilt();

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    scale.set(1);
  };

  if (!isActive) return <div className={`tilted-card ${className}`}>{children}</div>;
  return (
    <div
      ref={ref}
      className={`tilted-card ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => scale.set(scaleOnHover)}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div className="tilted-card__inner" style={{ rotateX, rotateY, scale }}>
        {children}
      </motion.div>
    </div>
  );
}
