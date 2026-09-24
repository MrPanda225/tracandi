import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BlurText } from '../../components/reactbits/BlurText';
import { ClickSpark } from '../../components/reactbits/ClickSpark';
import { CountUp } from '../../components/reactbits/CountUp';
import { GlareHover } from '../../components/reactbits/GlareHover';
import { Magnet } from '../../components/reactbits/Magnet';
import { ShinyText } from '../../components/reactbits/ShinyText';
import { SpotlightCard } from '../../components/reactbits/SpotlightCard';
import { StarBorder } from '../../components/reactbits/StarBorder';
import { DashboardPreview } from './DashboardPreview';
import { LandingLoader } from './LandingLoader';
import { Reveal } from './Reveal';
import './LandingPage.css';

const LOGIN = '/connexion';
const REGISTER = '/connexion?mode=inscription';

const STEPS = [
  {
    title: 'Connectez votre boîte Gmail',
    text: 'Une autorisation depuis la page de Google, révocable à tout moment. Tracandi lit, ne supprime rien.',
  },
  {
    title: 'Chaque réponse est classée',
    text: 'Accusé de réception, entretien, refus : l’IA lit le début de chaque e-mail et range la candidature au bon statut.',
  },
  {
    title: 'Relancez au bon moment',
    text: 'Après 10 jours de silence, la candidature remonte. Un clic, et la relance vous attend en brouillon dans Gmail.',
  },
];

const FEATURES: { title: string; text: string; wide?: boolean }[] = [
  {
    title: 'Un tableau de bord qui se tient à jour',
    text: 'Candidatures, entretiens, taux de réponse, et vos 5 dernières semaines comparées d’un coup d’œil.',
    wide: true,
  },
  { title: 'Des libellés Gmail rangés pour vous', text: '« Candidatures/Entreprise » et « Statut/… », sur chaque fil.' },
  { title: 'Les refus reconnus', text: 'Même quand la mauvaise nouvelle arrive après trois paragraphes de politesse.' },
  { title: 'L’entreprise retrouvée', text: 'Par son nom, ou par le domaine de l’adresse quand le message ne le dit pas.' },
  {
    title: 'Des relances rédigées, jamais envoyées seules',
    text: 'Un texte court et fidèle à votre candidature, en réponse dans le bon fil : vous relisez, vous envoyez.',
  },
];

// Facts about the product, not a claim about its users (ux-design: no invented social proof).
const FACTS = [
  { value: 300, unit: 'caractères', text: 'au plus conservés par e-mail' },
  { value: 0, unit: 'e-mail', text: 'envoyé à votre place' },
  { value: 5, unit: 'semaines', text: 'de suivi d’un coup d’œil' },
  { value: 10, unit: 'jours', text: 'de silence avant de proposer une relance' },
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
            <p className="landing__eyebrow">Carnet de candidatures</p>
            <BlurText as="h1" className="landing__title" text="Vos candidatures, suivies toutes seules." />
            <Reveal delay={0.35}>
              <p className="landing__lede">
                Tracandi lit vos e-mails de candidature, classe chaque réponse et vous dit qui relancer — sans jamais
                rien envoyer à votre place.
              </p>
            </Reveal>
            <Reveal delay={0.5} className="landing__actions">
              <PrimaryAction>Créer un compte</PrimaryAction>
              <Link to={LOGIN} className="btn btn--quiet">
                J’ai déjà un compte
              </Link>
            </Reveal>
          </div>
          <Reveal delay={0.25} className="landing__hero-visual">
            <DashboardPreview />
          </Reveal>
        </section>

        <section id="fonctionnement" className="landing__section" aria-labelledby="steps-title">
          <Reveal>
            <p className="landing__eyebrow">Trois étapes</p>
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
            <h2 id="features-title">Ce que Tracandi fait pour vous</h2>
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
              <li>Seuls l’expéditeur, l’objet, la date et un extrait de 300 caractères sont conservés.</li>
              <li>Le jeton d’accès à Gmail est chiffré, et révoqué dès que vous vous déconnectez.</li>
              <li>Aucun e-mail n’est supprimé, aucun n’est envoyé sans vous.</li>
            </ul>
          </Reveal>
        </section>

        <section className="landing__final" aria-labelledby="final-title">
          <Reveal>
            <h2 id="final-title">
              <ShinyText text="Votre prochaine réponse mérite d’être vue." />
            </h2>
            <p>Deux minutes pour créer un compte et connecter Gmail.</p>
            <div className="landing__final-action">
              <PrimaryAction>Commencer maintenant</PrimaryAction>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="landing__footer">
        <p>Tracandi — carnet de candidatures.</p>
        <Link to={LOGIN}>Se connecter</Link>
      </footer>
    </div>
  );
}
