import { describe, expect, it } from 'vitest';
import { REMOVED_EMAIL, REMOVED_PHONE, withoutContacts } from './contacts.js';

describe('contacts in an offer (ENF-RGP-09)', () => {
  it.each([
    ['Écrivez à recrutement@exemple.fr.', `Écrivez à ${REMOVED_EMAIL}.`],
    ['Contact : jean.dupont+rh@exemple.co.uk', `Contact : ${REMOVED_EMAIL}`],
    ['Appelez le 01 23 45 67 89', `Appelez le ${REMOVED_PHONE}`],
    ['Tél. 06.12.34.56.78 ou 0612345678', `Tél. ${REMOVED_PHONE} ou ${REMOVED_PHONE}`],
    ['Joignable au +33 1 23 45 67 89', `Joignable au ${REMOVED_PHONE}`],
    ['Joignable au +33 (0)1 23 45 67 89', `Joignable au ${REMOVED_PHONE}`],
  ])('[ENF-RGP-09] removes the contact from « %s »', (text, expected) => {
    expect(withoutContacts(text)).toBe(expected);
  });

  it.each([
    'Salaire : 38 000 à 45 000 € par an.',
    'Poste à pourvoir le 01/10/2026, 35 heures.',
    'Référence 2026-0412, code ROME M1419.',
  ])('[ENF-RGP-09] keeps « %s » as it is', (text) => {
    expect(withoutContacts(text)).toBe(text);
  });
});
