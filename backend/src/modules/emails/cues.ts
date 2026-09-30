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
  'choisi un autre candidat',
  'retenu une autre candidature',
  'privilegie une autre candidature',
  'privilegie un autre profil',
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
  'nous regrettons de vous informer',
  'nous regrettons de ne pas',
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
  'with another candidate',
  'selected another candidate',
  'with other candidates',
  'has been filled',
  'position is no longer available',
  'role is no longer available',
  'not the right fit',
  'not a fit for this role',
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
/** « pas encore », « not yet »: a delay, not a refusal — the answer is still to come. */
const NOT_YET = ['pas encore', 'not yet'];

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

/**
 * What a category can be read from: the subject, the excerpt kept, and the start of the body when the message was
 * just read from Gmail (in memory only, ENF-RGP-01, BES-30).
 */
export interface MessageWording {
  subject: string | null;
  snippet: string;
  text?: string;
}

/**
 * RG-17 (v1.18): words that make what follows them a mere condition. An acknowledgement often warns « sans réponse
 * sous 4 semaines, considérez que votre candidature n'a pas été retenue »: that sentence refuses nothing.
 */
const CONDITIONS = [
  'si',
  's il',
  'sans reponse',
  'sans retour',
  'au cas ou',
  'dans le cas ou',
  'a defaut',
  // Future only: « lorsque », « quand » open refusals told in the past (« lorsque nous avons étudié… »).
  'en cas de',
  'des que',
  'if',
  'unless',
  'in case',
];

// Sentences are cut before normalizing, which drops the punctuation that ends them.
const SENTENCE_END = /[.!?;\n]+/;

/** The subject, the excerpt and the start of the body, one normalized sentence per entry. */
const sentencesOf = ({ subject, snippet, text = '' }: MessageWording): string[] =>
  [subject ?? '', snippet, text]
    .flatMap((part) => part.split(SENTENCE_END))
    .map((sentence) => normalizeKey(sentence))
    .filter(Boolean);

/** True when one of `words` stands in the sentence before `at` (whole words only). */
const isPrecededBy = (sentence: string, at: number, words: readonly string[]): boolean => {
  const before = ` ${sentence.slice(0, at)} `;
  return words.some((word) => before.includes(` ${word} `));
};

/** True when one of the words that deny a phrase stands within the window before it, and does not say « not yet ». */
const isDenied = (sentence: string, at: number): boolean => {
  const window = sentence.slice(Math.max(0, at - NEGATION_WINDOW), at);
  return isPrecededBy(window, window.length, NEGATIONS) && !isPrecededBy(window, window.length, NOT_YET);
};

/** The positions of `cue` in the sentence that assert it: none follows a condition (RG-17 v1.18). */
const assertedAt = (sentence: string, cue: string): number[] => {
  const positions: number[] = [];
  for (let at = sentence.indexOf(cue); at !== -1; at = sentence.indexOf(cue, at + 1)) {
    if (!isPrecededBy(sentence, at, CONDITIONS)) positions.push(at);
  }
  return positions;
};

const holdsRejection = (sentence: string): boolean =>
  REJECTION_CUES.some((cue) => assertedAt(sentence, cue).length > 0) ||
  NEGATED_REJECTION_CUES.some((cue) => assertedAt(sentence, cue).some((at) => isDenied(sentence, at)));

/**
 * RG-17: true when the subject, the excerpt or the start of the body carries a wording that only a refusal uses, or
 * a wording that refuses once denied — unless a condition opens its sentence (« si », « sans réponse », « if »…).
 * Accents, case and punctuation are ignored; nothing beyond the 2 000 characters of the body read is ever seen
 * (ENF-RGP-01).
 * @req RG-17
 */
export const hasRejectionCue = (message: MessageWording): boolean =>
  sentencesOf(message).some(holdsRejection);

/**
 * RG-17: true when the subject, the excerpt or the start of the body carries a wording of an acknowledgement. A refusal carries one too,
 * so `hasRejectionCue` decides first.
 * @req RG-17
 */
export const hasAcknowledgementCue = (message: MessageWording): boolean =>
  sentencesOf(message).some((sentence) => ACKNOWLEDGEMENT_CUES.some((cue) => sentence.includes(cue)));

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
