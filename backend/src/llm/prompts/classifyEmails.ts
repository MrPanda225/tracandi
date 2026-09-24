import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** What the classification sees of a message: metadata and the start of its body (BES-30). */
export interface MessageToClassify {
  direction: 'inbound' | 'outbound';
  receivedAt: Date;
  from: string | null;
  subject: string | null;
  /** Gmail's excerpt, at most 300 characters: what is read when the body is not. */
  snippet: string;
  /** Start of the body as plain text, empty when unreadable; never stored (ENF-RGP-01). */
  text: string;
}

// ENF-COU-01: bounded input per message. 1 000 characters of the body carry a refusal written after a long
// opening (BES-30) while a batch of 10 stays within the tokens per minute of the free Groq models.
export const SUBJECT_MAX_LENGTH = 300;
export const TEXT_MAX_LENGTH = 1000;
const SENDER_MAX_LENGTH = 320;

const SYSTEM = [
  'Tu classes les e-mails de la boîte d’un candidat à la recherche d’un emploi.',
  'Chaque message est placé entre balises <email ref="N" sens="reçu|envoyé" date="AAAA-MM-JJ">.',
  'Pour chaque message, détermine :',
  '- "category" : sent_application (le candidat envoie une candidature), acknowledged (accusé de réception d’une ' +
    'candidature), interview (invitation ou organisation d’un entretien, d’un test ou d’un échange avec un recruteur), ' +
    'offer (proposition d’embauche), rejected (refus de la candidature), job_alert (alerte ou suggestion d’offres ' +
    'envoyée par un site d’emploi), off_topic (sans rapport avec une candidature) ;',
  'Un refus commence souvent par une formule d’accusé de réception (« nous avons bien reçu votre candidature ») : ' +
    'c’est la suite du message qui décide. Candidature non retenue, sans suite, poste pourvu, processus arrêté → ' +
    '"rejected".',
  'Une invitation à un entretien annonce un rendez-vous, un créneau ou demande des disponibilités ; une phrase ' +
    'conditionnelle (« si votre profil correspond, nous reviendrons vers vous ») reste "acknowledged".',
  '- "employer" : l’employeur réel visé, tel qu’il est écrit dans le message, même quand le message vient d’une ' +
    'plateforme ou d’un cabinet (APEC, LHH, Indeed…) ; null s’il n’apparaît pas ;',
  '- "platform" : la plateforme ou le cabinet qui a envoyé ou relayé le message ; null pour un échange direct avec ' +
    'l’employeur ;',
  '- "jobTitle" : l’intitulé du poste mentionné ; null s’il n’y en a pas ;',
  '- "contractType" : cdi, cdd, alternance, job_etudiant ou autre si le message mentionne le type de contrat ; ' +
    'null sinon.',
  'Réponds uniquement par un objet JSON de la forme ' +
    '{"messages":[{"ref":1,"category":"acknowledged","employer":"Innova Solutions","platform":"APEC",' +
    '"jobTitle":"Data analyst","contractType":"alternance"}]}, avec un élément par message, dans l’ordre des références.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

/** The start of the body, or Gmail's excerpt when the body could not be read. */
const bodyOf = (message: MessageToClassify): string => message.text || message.snippet;

const describeMessage = (message: MessageToClassify): string =>
  [
    `De : ${message.from ? truncate(message.from, SENDER_MAX_LENGTH) : '(inconnu)'}`,
    `Objet : ${message.subject ? truncate(message.subject, SUBJECT_MAX_LENGTH) : '(sans objet)'}`,
    `Texte : ${bodyOf(message) ? truncate(bodyOf(message), TEXT_MAX_LENGTH) : '(vide)'}`,
  ].join('\n');

/**
 * Prompt of the `classify_emails` task for one batch of messages, referenced 1, 2… in their order. Every message is
 * framed and declared untrusted (ENF-SEC-06). Expected answer: `ClassificationSchema` (modules/emails).
 * @req EF-GML-08, EF-GML-09, EF-GML-10, EF-GML-19, ENF-SEC-06, RG-17
 */
export const buildClassifyEmailsPrompt = (
  messages: readonly MessageToClassify[],
): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: messages
    .map((message, index) =>
      frameUntrusted('email', describeMessage(message), {
        ref: index + 1,
        sens: message.direction === 'outbound' ? 'envoyé' : 'reçu',
        date: message.receivedAt.toISOString().slice(0, 10),
      }),
    )
    .join('\n\n'),
});
