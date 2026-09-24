import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LegalLinks } from '../../components/LegalLinks';
import { LEGAL, LEGAL_UPDATED_ON } from '../../lib/legal';
import { usePageMeta } from '../../lib/pageMeta';
import './LegalPages.css';

/** Frame of a legal page: readable measure, a way back, the other legal pages at the foot; its own title (EF-SEO-01). */
function LegalLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  usePageMeta({ title: `${title} — Tracandi`, description });
  return (
    <div className="legal">
      <header className="legal__header">
        <Link to="/" className="legal__brand">
          Tracandi
        </Link>
      </header>
      <main className="legal__main">
        <h1>{title}</h1>
        <p className="legal__updated">Dernière mise à jour : {LEGAL_UPDATED_ON}</p>
        {children}
      </main>
      <footer className="legal__footer">
        <LegalLinks />
      </footer>
    </div>
  );
}

/** The contact address of the publisher, as a link that opens the mail application. */
function ContactLink() {
  return <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>;
}

/** EF-LEG-01: legal notice (LCEN, art. 6). */
export function LegalNoticePage() {
  return (
    <LegalLayout
      title="Mentions légales"
      description="Mentions légales de Tracandi : éditeur du service, contact et hébergeurs de l’interface, de l’application et des données."
    >
      <h2>Éditeur du site</h2>
      <p>
        Tracandi est un service édité à titre personnel par {LEGAL.publisher}. Pour toute question, vous pouvez écrire à{' '}
        <ContactLink />.
      </p>

      <h2>Directeur de la publication</h2>
      <p>{LEGAL.publisher}.</p>

      <h2>Hébergement</h2>
      <p>Le site est hébergé par {LEGAL.host}.</p>
      <p>Les données sont stockées par Neon (neon.tech), dans un centre de données de l’Union européenne, à Francfort.</p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Les textes, le code et l’identité visuelle de Tracandi appartiennent à leur auteur. Certains composants
        d’interface sont adaptés de React Bits, sous licence MIT avec Commons Clause ; les polices Fraunces et Manrope sont
        distribuées sous licence SIL Open Font License.
      </p>

      <h2>Données personnelles</h2>
      <p>
        La manière dont vos données sont traitées est décrite dans la{' '}
        <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>
    </LegalLayout>
  );
}

const RECIPIENTS: { name: string; role: string; place: string }[] = [
  {
    name: 'Vercel',
    role: 'héberge l’interface et achemine vos requêtes vers le serveur de l’application',
    place: 'réseau mondial, société établie aux États-Unis',
  },
  { name: 'Northflank', role: 'héberge le serveur de l’application', place: 'Union européenne' },
  { name: 'Neon', role: 'héberge la base de données', place: 'Union européenne, Francfort' },
  {
    name: 'Google (API Gmail)',
    role: 'donne accès à votre boîte, à votre demande : lecture des e-mails, libellés, brouillons de relance',
    place: 'Union européenne et États-Unis',
  },
  { name: 'Groq', role: 'classe vos e-mails et rédige vos relances', place: 'États-Unis' },
  { name: 'Google (Gemini)', role: 'prend le relais de Groq lorsqu’il est indisponible', place: 'États-Unis' },
  { name: 'Anthropic (Claude)', role: 'prend le relais en dernier recours', place: 'États-Unis' },
];

/** EF-LEG-01, ENF-RGP-05: what is processed, why, how long, by whom, and the rights of the user. */
export function PrivacyPage() {
  return (
    <LegalLayout
      title="Politique de confidentialité"
      description="Comment Tracandi traite vos données : ce qui est lu dans Gmail, ce qui est conservé, les destinataires, les durées et vos droits."
    >
      <p>
        Tracandi vous aide à suivre vos candidatures à partir de votre boîte Gmail. Cette page explique quelles données
        sont utilisées pour cela, dans quel but, pendant combien de temps, et comment garder la main sur elles.
      </p>

      <h2>Responsable du traitement</h2>
      <p>
        Le responsable du traitement est {LEGAL.publisher}, que vous pouvez joindre à <ContactLink />.
      </p>

      <h2>Les données utilisées</h2>
      <ul>
        <li>
          <strong>Votre compte</strong> : votre adresse e-mail et votre mot de passe, conservé uniquement sous forme
          d’empreinte chiffrée — personne, pas même l’éditeur, ne peut le lire.
        </li>
        <li>
          <strong>Votre boîte Gmail</strong>, si vous choisissez de la connecter : pour chaque e-mail lié à une
          candidature, Tracandi garde l’expéditeur, l’objet, la date, l’adresse à laquelle répondre et un court extrait
          (300 caractères au plus). Pour classer un message, il en lit le début (2 000 caractères au plus) sans jamais
          l’enregistrer.
        </li>
        <li>
          <strong>Vos candidatures</strong> : entreprises, postes, statuts et leur historique, ainsi que les notes et
          descriptions d’offres que vous saisissez vous-même.
        </li>
        <li>
          <strong>Le journal de fonctionnement</strong> : dates des synchronisations et utilisation de l’intelligence
          artificielle, sans le contenu des messages.
        </li>
      </ul>

      <h2>Pourquoi et sur quelle base</h2>
      <p>
        Ces données servent uniquement à vous rendre le service : suivre vos candidatures, classer les réponses que vous
        recevez, préparer vos relances et tenir votre tableau de bord à jour. Ce traitement est nécessaire au service
        que vous avez demandé en créant votre compte (article 6.1.b du RGPD). Le journal de fonctionnement répond à
        l’intérêt légitime de garantir la sécurité et le bon fonctionnement du service (article 6.1.f).
      </p>
      <p>Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.</p>

      <h2>Qui y a accès</h2>
      <p>Seuls les prestataires nécessaires au fonctionnement de Tracandi, chacun pour son rôle :</p>
      <ul>
        {RECIPIENTS.map((recipient) => (
          <li key={recipient.name}>
            <strong>{recipient.name}</strong> — {recipient.role} ({recipient.place}).
          </li>
        ))}
      </ul>
      <p>
        L’intelligence artificielle ne reçoit que le strict nécessaire : l’objet et le début d’un e-mail (1 000
        caractères au plus) pour le classer, et les seules informations d’une candidature pour rédiger une relance.
        Aucun e-mail n’est envoyé en votre nom : les relances vous attendent en brouillon dans Gmail.
      </p>

      <h2>Transferts hors de l’Union européenne</h2>
      <p>
        Vercel, Google et les fournisseurs d’intelligence artificielle peuvent traiter certaines données aux
        États-Unis. Ces transferts sont encadrés par les garanties prévues par chacun d’eux : clauses contractuelles
        types de la Commission européenne ou adhésion au Data Privacy Framework.
      </p>

      <h2>Données provenant des API Google</h2>
      <p>
        L’utilisation et le transfert des informations reçues des API Google respectent la{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">
          politique relative aux données des utilisateurs des services d’API Google
        </a>
        , y compris ses exigences d’utilisation limitée : ces informations ne servent qu’aux fonctions de Tracandi que
        vous utilisez.
      </p>

      <h2>Combien de temps</h2>
      <ul>
        <li>Vos données sont conservées tant que votre compte existe, et supprimées avec lui.</li>
        <li>Une session de connexion dure 7 jours au plus.</li>
        <li>
          Les sauvegardes de la base sont gardées 30 jours au plus : une donnée supprimée en disparaît au plus tard à
          l’issue de ce délai.
        </li>
      </ul>

      <h2>Sécurité</h2>
      <p>
        Toutes les connexions sont chiffrées. L’accès à votre boîte Gmail est protégé par un jeton lui-même chiffré
        (AES-256-GCM), révoqué dès que vous déconnectez Gmail. Les mots de passe sont protégés par une fonction de
        hachage lente (scrypt), et chaque utilisateur n’accède qu’à ses propres données.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez à tout moment accéder à vos données, les faire rectifier ou effacer, en demander la limitation,
        vous opposer à leur traitement ou les récupérer dans un format réutilisable.
      </p>
      <p>
        Deux de ces droits s’exercent directement dans l’application, depuis Réglages → Mes données : «&nbsp;Télécharger
        mes données&nbsp;» vous remet l’ensemble de vos données, et «&nbsp;Supprimer mon compte&nbsp;» efface tout et
        révoque l’accès à Gmail. Pour toute autre demande, écrivez à <ContactLink /> ; une réponse vous est apportée
        dans un délai d’un mois.
      </p>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (
        <a href="https://www.cnil.fr" rel="noopener noreferrer">
          www.cnil.fr
        </a>
        ).
      </p>

      <h2>Cookies</h2>
      <p>
        Tracandi n’utilise qu’un seul cookie, indispensable pour vous garder connecté. Le détail se trouve sur la{' '}
        <Link to="/cookies">page consacrée aux cookies</Link>.
      </p>
    </LegalLayout>
  );
}

/** EF-LEG-01, ENF-RGP-04: the one cookie, and why no consent is asked. */
export function CookiesPage() {
  return (
    <LegalLayout
      title="Cookies"
      description="Tracandi ne dépose qu’un cookie, strictement nécessaire à la session : ni mesure d’audience, ni publicité, ni consentement à donner."
    >
      <p>
        Tracandi n’utilise qu’un seul cookie, et uniquement parce qu’il est indispensable : c’est lui qui vous garde
        connecté d’une page à l’autre. Les cookies strictement nécessaires au service ne demandent pas de consentement,
        conformément aux recommandations de la CNIL ; c’est pourquoi aucun bandeau ne vous demande de les accepter.
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
              <td>
                Maintenir votre session ouverte. Il est inaccessible aux scripts de la page et n’est jamais transmis à un
                autre site.
              </td>
              <td>7 jours au plus ; supprimé dès que vous vous déconnectez</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Aucun outil de mesure d’audience, aucune publicité et aucun service tiers ne sont chargés dans votre navigateur.
      </p>
      <p>
        Pour ne pas vous afficher le message d’information à chaque visite, votre navigateur retient simplement que vous
        l’avez lu ; de même, il retient pendant la visite en cours que l’animation d’ouverture de la page d’accueil a
        déjà été jouée. Ces informations restent sur votre appareil et ne sont jamais envoyées.
      </p>
    </LegalLayout>
  );
}
