import { HttpError } from '../../lib/errors.js';

/** Why an imported CV could not be read (EF-CVX-34). */
export type UnreadableReason = 'locked' | 'damaged' | 'noText' | 'tooManyScannedPages' | 'ocrTooSlow' | 'ocrFailed' | 'noStructure';

// Written for the candidate: what happened, and what to do about it.
const MESSAGES: Readonly<Record<UnreadableReason, string>> = {
  locked: 'Ce PDF est protégé par un mot de passe. Enregistrez-le sans protection, puis réessayez.',
  damaged: 'Ce PDF semble abîmé. Exportez de nouveau votre CV en PDF, puis réessayez.',
  noText:
    'On n’a trouvé aucun texte dans ce CV, même en lisant l’image. Essayez un scan plus net, ou le PDF exporté ' +
    'depuis votre traitement de texte.',
  tooManyScannedPages:
    'Ce scan compte plus de 3 pages sans texte, et on en lit 3 au maximum. Essayez plutôt le PDF exporté depuis ' +
    'votre traitement de texte.',
  ocrTooSlow: 'La lecture de votre scan a pris trop de temps. Réessayez, ou importez le PDF exporté de votre CV.',
  ocrFailed: 'On n’a pas réussi à lire votre scan. Réessayez, ou importez le PDF exporté de votre CV.',
  noStructure: 'Nous n’avons pas pu retrouver vos expériences et formations dans ce CV. Essayez le PDF exporté depuis votre traitement de texte.',
}

/**
 * An imported CV the workshop cannot turn into text (422). Nothing of it has been sent anywhere (EF-CVX-34).
 * @req EF-CVX-34
 */
export class CvUnreadableError extends HttpError {
  readonly reason: UnreadableReason;

  constructor(reason: UnreadableReason) {
    super(422, MESSAGES[reason]);
    this.reason = reason;
  }
}
