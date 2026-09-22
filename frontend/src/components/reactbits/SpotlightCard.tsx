/*
 * Adapted from React Bits — SpotlightCard (https://reactbits.dev), © David Haz, MIT + Commons Clause (see LICENSE.md).
 * Changes: themable through CSS variables, forwards `className`, no default dark styling.
 */
import { type MouseEventHandler, type PropsWithChildren, useRef } from 'react';
import './SpotlightCard.css';

interface SpotlightCardProps extends PropsWithChildren {
  className?: string;
  spotlightColor?: string;
}

/** Card whose surface is lit by a soft radial spotlight following the pointer. */
export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgb(155 78 53 / 0.10)',
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove: MouseEventHandler<HTMLDivElement> = (event) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
    card.style.setProperty('--spotlight-color', spotlightColor);
  };

  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} className={`card-spotlight ${className}`}>
      {children}
    </div>
  );
}
