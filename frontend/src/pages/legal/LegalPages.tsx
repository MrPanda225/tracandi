import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LegalLinks } from '../../components/LegalLinks';
import { LEGAL, LEGAL_VERSION_DATE } from '../../lib/legal';
import './LegalPages.css';

/** Frame of a legal page: readable measure, a way back, the other legal pages at the foot. */
function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="legal">
      <header className="legal__header">
        <Link to="/" className="legal__brand">
          Tracandi
        </Link>
      </header>
      <main className="legal__main">
        <h1>{title}</h1>
        <p className="legal__updated">Version du {LEGAL_VERSION_DATE}</p>
        {children}
      </main>
      <footer className="legal__footer">
        <LegalLinks />
      </footer>
    </div>
  );
}

/** EF-LEG-01: legal notice (LCEN, art. 6). */
export function LegalNoticePage() {
  return (
    <LegalLayout title="Mentions légales">
      <h2>Éditeur</h2>
      <p>
        Le site Tracandi est édité par {LEGAL.publisher}, à titre personnel. Contact : {LEGAL.contact}.
      </p>
      <h2>Directeur de la publication</h2>
      <p>{LEGAL.publisher}.</p>
      <h2>Hébergement</h2>
      <p>Application : {LEGAL.host}.</p>
      <p>
        Base de données : Neon (neon.tech), données hébergées dans l’Union européenne (région de Francfort,
        Allemagne).
      </p>
      <h2>Propriété intellectuelle</h2>
      <p>
        Les textes et le code de Tracandi appartiennent à leur éditeur. Certains composants d’interface sont adaptés de
        React Bits (licence MIT + Commons Clause) ; les polices Fraunces et Manrope sont distribuées sous licence SIL Open
        Font License.
      </p>
      <h2>Données personnelles</h2>
      <p>
        Leur traitement est décrit dans la <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>
    </LegalLayout>
  );
}

const RECIPIENTS: { name: string; role: string; place: string }[] = [
  { name: 'Neon', role: 'hébergement de la base de données', place: 'Union européenne, Francfort' },
  {
    name: 'Google (Gmail API)',
    role: 'lecture de vos e-mails, pose des libellés et enregistrement des brouillons, à votre demande',
    place: 'Union européenne et États-Unis',
  },
  {
    name: 'Groq',
    role: 'classement des e-mails et rédaction des relances par l’intelligence artificielle',
    place: 'États-Unis',
  },
  { name: 'Google (Gemini)', role: 'même usage, en secours de Groq', place: 'États-Unis' },
  { name: 'Anthropic (Claude)', role: 'même usage, en second secours', place: 'États-Unis' },
];

/** EF-LEG-01, ENF-RGP-05: what is processed, why, how long, by whom, and the rights of the user. */
export function PrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité">
      <h2>Responsable du traitement</h2>
      <p>
        {LEGAL.publisher}, joignable à {LEGAL.contact}.
      </p>

      <h2>Données traitées</h2>
      <ul>
        <li>Votre compte : adresse e-mail et mot de passe, conservé sous forme d’empreinte (jamais en clair).</li>
        <li>
          Votre boîte Gmail, si vous la connectez : pour chaque e-mail de candidature, l’expéditeur, l’objet, la date,
          l’adresse à qui répondre et un extrait de 300 caractères au plus. Le début du corps (2 000 caractères au plus)
          est lu en mémoire pour classer le message, puis oublié : il n’est jamais conservé.
        </li>
        <li>
          Vos candidatures : entreprises, postes, statuts et leur historique, notes et descriptions d’offres que vous
          saisissez ; le cas échéant, votre profil (expériences, formations) et les sites que vous surveillez.
        </li>
        <li>Le journal technique des traitements : dates des synchronisations, usage de l’intelligence artificielle.</li>
      </ul>

      <h2>Finalités et bases légales</h2>
      <p>
        Ces données servent uniquement à vous rendre le service que vous demandez : suivre vos candidatures, classer vos
        e-mails, préparer vos relances et vous montrer votre tableau de bord. Leur traitement repose sur l’exécution de ce
        service (article 6.1.b du RGPD). Le journal technique repose sur l’intérêt légitime d’assurer la sécurité et le
        bon fonctionnement du service (article 6.1.f). Aucune donnée n’est vendue, ni utilisée à des fins publicitaires.
      </p>

      <h2>Destinataires</h2>
      <ul>
        {RECIPIENTS.map((recipient) => (
          <li key={recipient.name}>
            <strong>{recipient.name}</strong> — {recipient.role} ({recipient.place}).
          </li>
        ))}
      </ul>
      <p>
        L’intelligence artificielle ne reçoit que ce qui est nécessaire à la tâche : l’objet et 1 000 caractères au plus
        d’un e-mail pour le classer, les seuls faits d’une candidature pour rédiger une relance. Rien n’est envoyé en votre
        nom : les relances restent des brouillons dans votre boîte.
      </p>

      <h2>Transferts hors de l’Union européenne</h2>
      <p>
        Les fournisseurs d’intelligence artificielle et Google peuvent traiter ces données aux États-Unis. Ces transferts
        sont encadrés par les garanties que chacun propose : clauses contractuelles types de la Commission européenne ou
        adhésion au Data Privacy Framework.
      </p>

      <h2>Données issues des API Google</h2>
      <p>
        L’utilisation et le transfert des informations reçues des API Google respectent la{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">
          politique relative aux données des utilisateurs des services d’API Google
        </a>
        , y compris ses exigences d’utilisation limitée : elles ne servent qu’aux fonctions de Tracandi que vous utilisez.
      </p>

      <h2>Durées de conservation</h2>
      <ul>
        <li>Vos données : tant que votre compte existe, supprimées avec lui.</li>
        <li>Vos sessions : 7 jours au plus.</li>
        <li>Les sauvegardes de la base : 30 jours au plus ; une donnée supprimée en disparaît au plus tard après ce délai.</li>
      </ul>

      <h2>Sécurité</h2>
      <p>
        Connexions chiffrées, jeton d’accès à Gmail chiffré (AES-256-GCM) et révoqué à la déconnexion, mots de passe
        protégés par une fonction lente (scrypt), accès limité aux seules données de votre compte.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité.
        Deux s’exercent directement depuis les Réglages : « Télécharger mes données » (accès et portabilité) et « Supprimer
        mon compte » (effacement, avec révocation de l’accès à Gmail). Pour les autres, écrivez à {LEGAL.contact}. Vous
        pouvez aussi introduire une réclamation auprès de la CNIL (
        <a href="https://www.cnil.fr" rel="noopener noreferrer">
          www.cnil.fr
        </a>
        ).
      </p>

      <h2>Cookies</h2>
      <p>
        Un seul cookie, strictement nécessaire : voir la <Link to="/cookies">page des cookies</Link>.
      </p>
    </LegalLayout>
  );
}

/** EF-LEG-01, ENF-RGP-04: the one cookie, and why no consent is asked. */
export function CookiesPage() {
  return (
    <LegalLayout title="Cookies">
      <p>
        Tracandi ne dépose qu’un seul cookie. Il est strictement nécessaire au service : il vous garde connecté. Selon les
        lignes directrices de la CNIL, un tel cookie ne demande pas de consentement.
      </p>
      <div className="legal__table-wrap">
        <table className="legal__table">
          <thead>
            <tr>
              <th scope="col">Nom</th>
              <th scope="col">Rôle</th>
              <th scope="col">Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>tracandi_session</code>
              </td>
              <td>Maintenir votre session ouverte. Inaccessible aux scripts (HttpOnly), jamais envoyé à un autre site.</td>
              <td>7 jours au plus, effacé à la déconnexion</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Aucune mesure d’audience, aucune publicité, aucun service tiers dans votre navigateur. Le fait que vous ayez lu
        l’information sur les cookies est retenu dans votre navigateur (stockage local), sans rien envoyer.
      </p>
    </LegalLayout>
  );
}
