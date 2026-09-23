import { normalizeKey } from '../../lib/text.js';
import type { ClassifiedMessage } from './classification.js';

/**
 * RG-17: wordings that mark a refusal, already normalized (lower case, no accents, one space between words), so
 * that a message is compared to them through `normalizeKey`. Each one is a phrase a refusal carries and an
 * acknowledgement does not: « votre candidature a été retenue » holds none of them.
 */
const REJECTION_CUES: readonly string[] = [
  'ne donnons pas suite',
  'ne donnerons pas suite',
  'ne pas donner suite',
  'sans suite a votre candidature',
  'pas ete retenue',
  'pas ete retenu',
  'non retenue',
  'non retenu',
  'ne pas retenir votre candidature',
  'avons le regret',
  'au regret de',
  'nous regrettons',
  'ne correspond pas au profil',
  'ne correspond pas aux attentes',
  'ne correspond pas a nos besoins',
  'ne correspond pas aux besoins',
  'ne pas poursuivre',
  'mettre fin au processus',
  'poste a ete pourvu',
  'poste est pourvu',
  'offre est pourvue',
  'nous poursuivons avec un autre',
  'we regret to inform',
  'not been selected',
  'not moving forward',
  'decided not to proceed',
  'application was unsuccessful',
];

/** What a refusal can be read from: the subject and the excerpt kept of a message (ENF-RGP-01). */
export interface MessageWording {
  subject: string | null;
  snippet: string;
}

/**
 * RG-17: true when the subject or the excerpt carries a wording that only a refusal uses. Accents, case and
 * punctuation are ignored; nothing beyond the 300 characters kept of the message is read (ENF-RGP-01).
 * @req RG-17
 */
export const hasRejectionCue = ({ subject, snippet }: MessageWording): boolean => {
  const wording = normalizeKey(`${subject ?? ''} ${snippet}`);
  return REJECTION_CUES.some((cue) => wording.includes(cue));
};

/**
 * RG-17: files a received message as a refusal when its wording says so, whatever the AI answered — a refusal often
 * opens with an acknowledgement, and the AI reads that opening first. A job offer the AI recognised is never
 * replaced, and a message the candidate sent is never corrected.
 * @returns the classification, unchanged when no refusal wording is found.
 * @req RG-17, EF-GML-08, EF-GML-11
 */
export const applyRejectionCue = (
  message: MessageWording & { direction: 'inbound' | 'outbound' },
  classification: ClassifiedMessage,
): ClassifiedMessage => {
  const isCorrectable =
    message.direction === 'inbound' &&
    classification.category !== 'offer' &&
    classification.category !== 'rejected';
  if (!isCorrectable || !hasRejectionCue(message)) return classification;
  return { ...classification, category: 'rejected' };
};
