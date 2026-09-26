import { HttpError } from '../../lib/errors.js';

/** Why an imported CV could not be read (EF-CVX-34). */
export type UnreadableReason = 'locked' | 'damaged' | 'noText' | 'tooManyScannedPages' | 'ocrTooSlow' | 'ocrFailed';

// Written for the candidate: what happened, and what to do about it.
const MESSAGES: Readonly<Record<UnreadableReason, string>> = {
  locked: 'Ce PDF est protégé par un mot de passe : exportez-le sans protection, puis importez-le à nouveau.',
  damaged: 'Ce fichier PDF est endommagé et ne peut pas être lu. Exportez à nouveau votre CV en PDF.',
  noText:
    'Aucun texte n’a pu être lu dans ce CV, même par reconnaissance de caractères. Vérifiez la netteté du scan, ' +
    'ou importez un PDF exporté depuis votre traitement de texte.',
  tooManyScannedPages:
    'Ce CV scanné compte plus de 3 pages sans texte : la reconnaissance de caractères est limitée à 3 pages.',
  ocrTooSlow:
    'La lecture de votre CV scanné a pris trop de temps. Réessayez, ou importez un PDF qui contient du texte.',
  ocrFailed: 'La lecture de votre CV scanné a échoué. Réessayez, ou importez un PDF qui contient du texte.',
};

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
