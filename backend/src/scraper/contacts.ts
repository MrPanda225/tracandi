/** Addresses as they appear in an offer: « recrutement@exemple.fr », « jean.dupont+rh@exemple.co.uk ». */
const EMAILS = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
/**
 * French and international numbers: « 01 23 45 67 89 », « 01.23.45.67.89 », « +33 1 23 45 67 89 »,
 * « +33 (0)1 23 45 67 89 », « 0123456789 ». A salary or a date never has ten digits in pairs like these.
 */
const PHONES = /(?:\+\d{2,3}[\s.-]?(?:\(0\)[\s.-]?)?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/gu;

export const REMOVED_EMAIL = '[adresse retirée]';
export const REMOVED_PHONE = '[téléphone retiré]';

/**
 * ENF-RGP-09: the text of an offer without the e-mail addresses and phone numbers it may carry — a recruiter's
 * contact is never stored, nor sent to an AI. The rest of the text is kept as it is.
 * @req ENF-RGP-09
 */
export const withoutContacts = (text: string): string =>
  text.replace(EMAILS, REMOVED_EMAIL).replace(PHONES, REMOVED_PHONE);
