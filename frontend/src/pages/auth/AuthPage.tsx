import { createScope, createTimeline, type Scope, stagger } from 'animejs';
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { Noise } from '../../components/reactbits/Noise';
import { LegalLinks } from '../../components/LegalLinks';
import { SpotlightCard } from '../../components/reactbits/SpotlightCard';
import { REDUCED_MOTION_QUERY } from '../../lib/motion';
import { usePageMeta } from '../../lib/pageMeta';
import { ApplicationsScene } from './ApplicationsScene';
import { AuthForm } from './AuthForm';
import './AuthPage.css';

const HEADLINE_WORDS = ['Chaque', 'candidature', 'mérite'];

/**
 * Login / account creation page (EF-AUT-01 to 03). Palette 60 / 30 / 10: light canvas for the form,
 * ink panel for the story and the 3D scene, rust accent for actions only. French interface (ENF-UTI-01),
 * usable from 360 px wide (ENF-UTI-02).
 */
export function AuthPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<Scope | null>(null);
  usePageMeta({
    title: 'Connexion — Tracandi',
    description:
      'Connectez-vous à Tracandi ou créez un compte pour suivre vos candidatures depuis Gmail et préparer vos relances.',
  });

  // The SOFT and WONK axes of Fraunces are used by this page only (271 kB). They come once the page is painted: the
  // title shows first in the Fraunces already loaded, then softens — the page no longer waits for them (ENF-PERF-07).
  useEffect(() => {
    // Unreachable fonts are no failure: the title simply keeps the standard Fraunces.
    void Promise.all([
      import('@fontsource-variable/fraunces/full.css'),
      import('@fontsource-variable/fraunces/full-italic.css'),
    ]).catch(() => undefined);
  }, []);

  // Layout effect: the entrance starts before the first paint, so nothing flashes in its final state.
  useLayoutEffect(() => {
    scopeRef.current = createScope({
      root: rootRef,
      mediaQueries: { reduceMotion: REDUCED_MOTION_QUERY },
    }).add((scope) => {
      if (scope?.matches.reduceMotion) return;
      createTimeline({ defaults: { ease: 'outExpo', duration: 1100 } })
        .add('.auth-story__brand', { opacity: [0, 1], translateY: [-12, 0] })
        .add(
          '.auth-story__word',
          { opacity: [0, 1], translateY: ['0.6em', 0], rotateX: [-40, 0], delay: stagger(70) },
          '-=850',
        )
        // ENF-PERF-07: the lede is painted at once, not faded in — it is the largest text of the page.
        .add('.scene', { opacity: [0, 1], scale: [0.94, 1], duration: 1600 }, '-=900')
        .add('.auth-card', { opacity: [0, 1], translateY: [28, 0] }, '-=1500');
    });
    return () => scopeRef.current?.revert();
  }, []);

  return (
    <div ref={rootRef} className="auth-page">
      <section className="auth-story" data-parallax-root aria-labelledby="auth-story-title">
        <Noise />
        <p className="auth-story__brand">
          <span className="auth-story__logo">Tracandi</span>
          <span className="auth-story__tag">Carnet de candidatures</span>
        </p>
        <h1 id="auth-story-title" className="auth-story__title">
          {/* Spaces stay outside the animated inline blocks, otherwise they collapse. */}
          {HEADLINE_WORDS.map((word) => (
            <Fragment key={word}>
              <span className="auth-story__word">{word}</span>{' '}
            </Fragment>
          ))}
          <em className="auth-story__word">une suite.</em>
        </h1>
        <p className="auth-story__lede">
          Envois, réponses, relances : tout votre parcours vers le CDI, le CDD, l’alternance ou le job
          étudiant, réuni et lisible.
        </p>
        <ApplicationsScene />
      </section>

      <main className="auth-main">
        <SpotlightCard className="auth-card">
          <AuthForm />
        </SpotlightCard>
        <LegalLinks className="legal-links auth-main__legal" />
      </main>
    </div>
  );
}
