import { normalizeKey } from '../../lib/text.js';
import type { ClassifiedMessage } from './classification.js';

/**
 * RG-17: wordings only a refusal uses, already normalized (lower case, no accents, one space between words), so
 * that a message is compared to them through `normalizeKey`. « votre candidature a été retenue » holds none.
 */
const REJECTION_CUES: readonly string[] = [
  // Candidature écartée
  'pas retenue',
  'pas retenu',
  'pas ete retenue',
  'pas ete retenu',
  'non retenue',
  'non retenu',
  'ne pas retenir votre candidature',
  'ne pas retenir votre profil',
  'retenu un autre candidat',
  'un autre candidat',
  'une autre candidature',
  // Pas de suite
  'ne donnons pas suite',
  'ne donnerons pas suite',
  'ne pas donner suite',
  'ne pouvons donner suite',
  'ne pouvons pas donner suite',
  'ne pouvons y donner',
  'ne pourrons pas donner suite',
  'sans suite',
  'ne pas poursuivre',
  'ne pas donner de suite',
  'mettre fin au processus',
  'clore votre candidature',
  'cloture de votre candidature',
  // Regrets
  'avons le regret',
  'au regret de',
  'au regret de vous informer',
  'sommes au regret',
  'nous regrettons',
  'reponse negative',
  'reponse defavorable',
  'issue defavorable',
  // Profil différent
  'ne correspond malheureusement pas',
  'ne correspond pas au profil',
  'ne correspond pas au poste',
  'ne correspond pas a ce poste',
  'ne correspond pas a nos besoins',
  'ne correspond pas aux besoins',
  'ne correspond pas aux attentes',
  'ne correspond pas a notre recherche',
  'profil plus en adequation',
  // Poste fermé
  'poste a ete pourvu',
  'poste est pourvu',
  'poste pourvu',
  'offre est pourvue',
  'offre a ete pourvue',
  // English
  'we regret to inform',
  'not been selected',
  'were not selected',
  'not moving forward',
  'not be moving forward',
  'decided not to proceed',
  'not to proceed with your application',
  'was unsuccessful',
  'were unsuccessful',
  'not be progressing',
  'another candidate',
  'other candidates',
  'has been filled',
  'no longer available',
  'not the right fit',
  'not a fit for this role',
  'keep your resume on file',
  'keep your cv on file',
];

/**
 * RG-17: wordings that mark a refusal only when they are denied — « nous ne pouvons donner une suite favorable »
 * refuses, « votre candidature a reçu une suite favorable » does the opposite.
 */
const NEGATED_REJECTION_CUES: readonly string[] = [
  'suite favorable',
  'suite positive',
  'en mesure de donner',
  'positive response',
  'moving forward with your application',
];

/** Words that deny what follows them, within `NEGATION_WINDOW` characters. */
const NEGATIONS = ['ne', 'n', 'pas', 'sans', 'aucun', 'aucune', 'impossible', 'regret', 'refus', 'not'];
const NEGATION_WINDOW = 60;

/**
 * RG-17: wordings of an acknowledgement. They are weaker than every refusal wording: a refusal usually opens with
 * one of them.
 */
const ACKNOWLEDGEMENT_CUES: readonly string[] = [
  'bien recu votre candidature',
  'bien recu votre dossier',
  'nous avons bien recu',
  'candidature bien recue',
  'candidature a bien ete',
  'accuse de reception',
  'candidature enregistree',
  'candidature prise en compte',
  'prise en compte',
  'merci pour votre candidature',
  'merci de votre candidature',
  'remercions pour votre candidature',
  'etudions votre candidature',
  'examen de votre candidature',
  'en cours d examen',
  'etude de votre candidature',
  'nous reviendrons vers vous',
  // English
  'received your application',
  'application has been received',
  'application received',
  'thank you for applying',
  'thanks for applying',
  'thank you for your application',
  'reviewing your application',
  'we will be in touch',
];

/** What a category can be read from: the subject and the excerpt kept of a message (ENF-RGP-01). */
export interface MessageWording {
  subject: string | null;
  snippet: string;
}

const wordingOf = ({ subject, snippet }: MessageWording): string =>
  normalizeKey(`${subject ?? ''} ${snippet}`);

/** True when one of the words that deny a phrase stands within the window before it. */
const isDenied = (wording: string, at: number): boolean => {
  const before = ` ${wording.slice(Math.max(0, at - NEGATION_WINDOW), at)} `;
  return NEGATIONS.some((word) => before.includes(` ${word} `));
};

const holdsDeniedCue = (wording: string, cue: string): boolean => {
  for (let at = wording.indexOf(cue); at !== -1; at = wording.indexOf(cue, at + 1)) {
    if (isDenied(wording, at)) return true;
  }
  return false;
};

/**
 * RG-17: true when the subject or the excerpt carries a wording that only a refusal uses, or a wording that refuses
 * once denied. Accents, case and punctuation are ignored; nothing beyond the 300 characters kept of the message is
 * read (ENF-RGP-01).
 * @req RG-17
 */
export const hasRejectionCue = (message: MessageWording): boolean => {
  const wording = wordingOf(message);
  return (
    REJECTION_CUES.some((cue) => wording.includes(cue)) ||
    NEGATED_REJECTION_CUES.some((cue) => holdsDeniedCue(wording, cue))
  );
};

/**
 * RG-17: true when the subject or the excerpt carries a wording of an acknowledgement. A refusal carries one too,
 * so `hasRejectionCue` decides first.
 * @req RG-17
 */
export const hasAcknowledgementCue = (message: MessageWording): boolean => {
  const wording = wordingOf(message);
  return ACKNOWLEDGEMENT_CUES.some((cue) => wording.includes(cue));
};

/**
 * Categories a refusal wording may correct. A job alert is left out: such a letter lists positions, and one of them
 * being filled would turn the whole alert into a refusal attached to an application.
 */
const CORRECTED_BY_REJECTION: readonly ClassifiedMessage['category'][] = [
  'acknowledged',
  'interview',
  'sent_application',
  'off_topic',
];

/** Categories an acknowledgement wording may correct: the ones that lose the message or mistake its direction. */
const CORRECTED_BY_ACKNOWLEDGEMENT: readonly ClassifiedMessage['category'][] = [
  'off_topic',
  'sent_application',
  'job_alert',
];

/**
 * RG-17: files a received message from its own wording when the AI read it otherwise. A refusal wins over an
 * acknowledgement, since a refusal usually opens with one. A job offer the AI recognised is never replaced, an
 * interview is never downgraded to an acknowledgement, a job alert is never turned into a refusal, and a message
 * the candidate sent is never corrected.
 * @returns the classification, unchanged when no wording decides.
 * @req RG-17, EF-GML-08, EF-GML-11
 */
export const applyCategoryCues = (
  message: MessageWording & { direction: 'inbound' | 'outbound' },
  classification: ClassifiedMessage,
): ClassifiedMessage => {
  if (message.direction !== 'inbound') return classification;
  const { category } = classification;
  if (CORRECTED_BY_REJECTION.includes(category) && hasRejectionCue(message)) {
    return { ...classification, category: 'rejected' };
  }
  if (CORRECTED_BY_ACKNOWLEDGEMENT.includes(category) && hasAcknowledgementCue(message)) {
    return { ...classification, category: 'acknowledged' };
  }
  return classification;
};
