import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LegalLinks } from '../../components/LegalLinks';
import { BlurText } from '../../components/reactbits/BlurText';
import { ClickSpark } from '../../components/reactbits/ClickSpark';
import { CountUp } from '../../components/reactbits/CountUp';
import { GlareHover } from '../../components/reactbits/GlareHover';
import { Magnet } from '../../components/reactbits/Magnet';
import { ShinyText } from '../../components/reactbits/ShinyText';
import { SpotlightCard } from '../../components/reactbits/SpotlightCard';
import { StarBorder } from '../../components/reactbits/StarBorder';
import { usePageMeta } from '../../lib/pageMeta';
import { DashboardPreview } from './DashboardPreview';
import { LandingLoader } from './LandingLoader';
import { Reveal } from './Reveal';
import './LandingPage.css';

const LOGIN = '/connexion';
// Non-breaking spaces keep « On s’occupe » and « du suivi » together: the title breaks as the sentence is said.
const HERO_TITLE = 'Postulez. On\u00a0s’occupe du\u00a0suivi.';
// EF-SEO-01: the same words as index.html, which search engines read before any script runs.
const LANDING_META = {
  title: 'Tracandi — suivi de candidatures depuis Gmail',
  description:
    'Tracandi lit vos e-mails de candidature, classe chaque réponse (accusé de réception, entretien, refus) et ' +
    'prépare vos relances en brouillon Gmail, sans jamais rien envoyer à votre place.',
};
const REGISTER = '/connexion?mode=inscription';

// Written for someone in the middle of a job search: what changes for them, in plain words — the guarantees come
// later, where people look for them (ux-design: benefits before mechanics).
const STEPS = [
  {
    title: 'Branchez votre Gmail',
    text: 'Deux clics sur la page de Google, et Tracandi lit vos e-mails de candidature. Il n’en supprime aucun.',
  },
  {
    title: 'Les réponses se rangent',
    text: 'Accusé de réception, entretien, refus : chaque réponse rejoint la bonne candidature, au bon statut.',
  },
  {
    title: 'Relancez au bon moment',
    text: 'Dix jours sans nouvelles ? La candidature remonte, et votre relance vous attend dans Gmail, déjà rédigée.',
  },
];

const FEATURES: { title: string; text: string; wide?: boolean }[] = [
  {
    title: 'Votre recherche d’un coup d’œil',
    text: 'Candidatures envoyées, entretiens décrochés, taux de réponse : vos cinq dernières semaines sur un seul écran.',
    wide: true,
  },
  {
    title: 'Une boîte mail enfin rangée',
    text: 'Chaque fil porte le nom de l’entreprise et son statut. Vous retrouvez tout en une seconde.',
  },
  { title: 'Les refus démasqués', text: 'Même noyés sous trois paragraphes de politesse. Vous savez à quoi vous en tenir.' },
  {
    title: 'L’entreprise retrouvée',
    text: 'Le message ne dit pas qui vous écrit ? Son adresse suffit à la reconnaître.',
  },
  {
    title: 'Des relances prêtes à partir',
    text: 'Courtes, polies, écrites pour votre candidature. Vous relisez, vous envoyez : c’est vous qui décidez.',
  },
];

// Facts about the product, not a claim about its users (ux-design: no invented social proof).
const FACTS = [
  { value: 5, unit: 'semaines', text: 'de recherche sous les yeux' },
  { value: 10, unit: 'jours', text: 'sans nouvelles, et la relance est prête' },
  { value: 0, unit: 'e-mail', text: 'envoyé sans votre accord' },
  { value: 300, unit: 'caractères', text: 'gardés par e-mail, pas un de plus' },
];

/** The one main action, framed by travelling lights, pulled toward the pointer, sparking on click. */
function PrimaryAction({ children }: { children: ReactNode }) {
  return (
    <Magnet padding={40} magnetStrength={6}>
      <ClickSpark sparkColor="#9b4e35">
        <StarBorder>
          <Link to={REGISTER} className="btn landing__cta">
            {children}
          </Link>
        </StarBorder>
      </ClickSpark>
    </Magnet>
  );
}

/**
 * Presentation of the service for a visitor (EF-AUT-09): what Tracandi does, how, and what it keeps, with the two
 * ways in. Asks nothing of the API; all its motion stops when the user prefers reduced motion (ENF-UTI-04).
 */
export function LandingPage() {
  usePageMeta(LANDING_META);
  return (
    <div className="landing">
      <LandingLoader />

      <header className="landing__header">
        <Link to="/" className="landing__brand" aria-label="Tracandi, accueil">
          Tracandi
        </Link>
        <nav className="landing__nav" aria-label="Sections de la page">
          <a href="#fonctionnement">Fonctionnement</a>
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#donnees">Données</a>
        </nav>
        <div className="landing__access">
          <Link to={LOGIN} className="landing__login">
            Se connecter
          </Link>
          <Link to={REGISTER} className="btn btn--small">
            Créer un compte
          </Link>
        </div>
      </header>

      <main>
        <section className="landing__hero" aria-labelledby="landing-title">
          <div className="landing__hero-copy">
            <p className="landing__eyebrow">Recherche d’emploi</p>
            <BlurText as="h1" id="landing-title" className="landing__title" text={HERO_TITLE} />
            {/* ENF-PERF-07: the promise and the ways in are painted at once — only the title plays. */}
            <p className="landing__lede">
              Tracandi range chaque réponse de vos candidatures à sa place. Vous savez où vous en êtes, et qui
              relancer.
            </p>
            <div className="landing__actions">
              <PrimaryAction>Créer mon compte</PrimaryAction>
              <Link to={LOGIN} className="btn btn--quiet">
                J’ai déjà un compte
              </Link>
            </div>
          </div>
          <Reveal delay={0.25} className="landing__hero-visual">
            <DashboardPreview />
          </Reveal>
        </section>

        <section id="fonctionnement" className="landing__section" aria-labelledby="steps-title">
          <Reveal>
            <p className="landing__eyebrow">Trois étapes, c’est tout</p>
            <h2 id="steps-title">Comment ça marche</h2>
          </Reveal>
          <ol className="landing__steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 0.12}>
                  <GlareHover className="landing__step">
                    <span className="landing__step-number" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </GlareHover>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section id="fonctionnalites" className="landing__section" aria-labelledby="features-title">
          <Reveal>
            <p className="landing__eyebrow">Au quotidien</p>
            <h2 id="features-title">Ce qui change pour vous</h2>
          </Reveal>
          <div className="landing__bento">
            {FEATURES.map((feature, index) => (
              <Reveal
                key={feature.title}
                delay={(index % 3) * 0.1}
                className={feature.wide ? 'landing__bento-item landing__bento-item--wide' : 'landing__bento-item'}
              >
                <SpotlightCard className="landing__feature">
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing__facts" aria-label="Tracandi en chiffres">
          {FACTS.map((fact) => (
            <Reveal key={fact.text} className="landing__fact">
              <p>
                <CountUp to={fact.value} className="landing__fact-value" />
                <span className="landing__fact-unit"> {fact.unit}</span>
              </p>
              <p className="landing__fact-text">{fact.text}</p>
            </Reveal>
          ))}
        </section>

        <section id="donnees" className="landing__section landing__privacy" aria-labelledby="privacy-title">
          <Reveal>
            <p className="landing__eyebrow">Confidentialité</p>
            <h2 id="privacy-title">Vos données restent les vôtres</h2>
            <ul className="landing__promises">
              <li>On ne garde que l’essentiel de chaque e-mail : l’expéditeur, l’objet, la date et quelques lignes.</li>
              <li>Votre accès à Gmail est chiffré, et coupé dès que vous déconnectez votre boîte.</li>
              <li>Rien n’est supprimé, et rien ne part sans vous.</li>
            </ul>
          </Reveal>
        </section>

        <section className="landing__final" aria-labelledby="final-title">
          <Reveal>
            <h2 id="final-title">
              <ShinyText text="Votre prochaine réponse mérite d’être vue." />
            </h2>
            <p>Deux minutes pour commencer. Le suivi, lui, se fait tout seul.</p>
            <div className="landing__final-action">
              <PrimaryAction>Commencer maintenant</PrimaryAction>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="landing__footer">
        <p>Tracandi — carnet de candidatures.</p>
        {/* EF-LEG-01 */}
        <LegalLinks />
      </footer>
    </div>
  );
}
