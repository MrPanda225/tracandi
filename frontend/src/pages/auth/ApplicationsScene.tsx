import { animate, createScope, type Scope, stagger } from 'animejs';
import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from '../../lib/motion';

// The journey of an application, as Tracandi tracks it (RG-01).
const STEPS = ['Envoyée', 'Accusé reçu', 'Entretien', 'Proposition'] as const;
const STEP_INTERVAL_MS = 2600;
const RESTING_STEP = 2;

// Fictional companies: the login page never shows real data.
const CARDS = [
  { company: 'Studio Ardent', role: 'Data Analyst — CDI', initial: 'A' },
  { company: 'Maison Lumen', role: 'Alternance BI', initial: 'L' },
  { company: 'Atelier Nova', role: 'Data Engineer junior', initial: 'N' },
] as const;

const PARALLAX_DEGREES = 8;

/**
 * Decorative 3D scene of the login page: a stack of application cards floating in perspective, the front one
 * moving through the application statuses. CSS 3D transforms driven by anime.js; hidden from assistive
 * technologies; static when the user prefers reduced motion.
 */
export function ApplicationsScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<Scope | null>(null);
  const [step, setStep] = useState(prefersReducedMotion() ? RESTING_STEP : 0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    scopeRef.current = createScope({
      root: rootRef,
      mediaQueries: { reduceMotion: REDUCED_MOTION_QUERY },
    }).add((scope) => {
      if (scope?.matches.reduceMotion) return;
      animate('.scene-card', {
        translateY: [{ to: -10 }, { to: 6 }],
        rotateZ: [{ to: -0.8 }, { to: 0.6 }],
        duration: 4200,
        delay: stagger(700),
        ease: 'inOutSine',
        alternate: true,
        loop: true,
      });
      animate('.scene-envelope', {
        translateY: [-14, 10],
        rotateY: [-18, 12],
        duration: 5200,
        ease: 'inOutSine',
        alternate: true,
        loop: true,
      });
    });

    const panel = root.closest<HTMLElement>('[data-parallax-root]') ?? root;
    const handlePointerMove = (event: PointerEvent) => {
      if (prefersReducedMotion()) return;
      const rect = panel.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      animate(root.querySelector('.scene-parallax') ?? [], {
        rotateY: x * PARALLAX_DEGREES,
        rotateX: -y * PARALLAX_DEGREES,
        duration: 900,
        ease: 'outQuart',
      });
    };
    panel.addEventListener('pointermove', handlePointerMove);

    const timer = prefersReducedMotion()
      ? undefined
      : window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), STEP_INTERVAL_MS);

    return () => {
      panel.removeEventListener('pointermove', handlePointerMove);
      window.clearInterval(timer);
      scopeRef.current?.revert();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const chip = root.querySelector('.scene-slot--front .scene-chip');
    const fill = root.querySelector('.scene-slot--front .scene-progress__fill');
    const flip = animate(chip ?? [], {
      rotateX: [90, 0],
      opacity: [0, 1],
      duration: 700,
      ease: 'outBack(1.6)',
    });
    const grow = animate(fill ?? [], { scaleX: (step + 1) / STEPS.length, duration: 900, ease: 'outExpo' });
    return () => {
      flip.revert();
      grow.pause();
    };
  }, [step]);

  return (
    <div ref={rootRef} className="scene" aria-hidden="true">
      <div className="scene-parallax">
        <div className="scene-stage">
          <div className="scene-slot scene-slot--envelope">
            <div className="scene-envelope">
              <span className="scene-envelope__flap" />
            </div>
          </div>
          {CARDS.map((card, index) => {
            const isFront = index === CARDS.length - 1;
            const status = isFront ? STEPS[step] : STEPS[index];
            return (
              // The slot holds the 3D position (CSS); the card inside is animated by anime.js.
              <div
                key={card.company}
                className={`scene-slot scene-slot--${isFront ? 'front' : `back-${index}`}`}
              >
                <div className="scene-card">
                  <div className="scene-card__header">
                    <span className="scene-card__logo">{card.initial}</span>
                    <div>
                      <p className="scene-card__company">{card.company}</p>
                      <p className="scene-card__role">{card.role}</p>
                    </div>
                  </div>
                  <div className="scene-card__footer">
                    <span className={`scene-chip ${status === 'Proposition' ? 'scene-chip--offer' : ''}`}>
                      {status}
                    </span>
                    <span className="scene-progress">
                      {/* The front bar is driven by anime.js (see the step effect); a static value would cancel it. */}
                      <span
                        className="scene-progress__fill"
                        style={
                          isFront && !prefersReducedMotion()
                            ? undefined
                            : { transform: `scaleX(${((isFront ? step : index) + 1) / STEPS.length})` }
                        }
                      />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
