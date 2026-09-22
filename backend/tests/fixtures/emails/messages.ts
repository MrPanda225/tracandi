import type { gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';

/**
 * Recorded answers of Gmail `users.messages.get` (format `metadata`), anonymised: fictitious people, `.example`
 * domains for employers; platform domains are the public ones, matched by RG-10.
 * Gmail escapes the excerpt (`snippet`) as HTML: the entities below are the ones Gmail really sends.
 */
const metadata = (fields: {
  id: string;
  threadId: string;
  receivedAt: string;
  from: string;
  subject: string;
  snippet: string;
  labelIds?: string[];
}): gmail_v1.Schema$Message => ({
  id: fields.id,
  threadId: fields.threadId,
  labelIds: fields.labelIds ?? ['INBOX', 'UNREAD'],
  snippet: fields.snippet,
  internalDate: String(Date.parse(fields.receivedAt)),
  payload: {
    mimeType: 'multipart/alternative',
    headers: [
      { name: 'From', value: fields.from },
      { name: 'Subject', value: fields.subject },
    ],
  },
});

/** Outbound application of the McDonald's scenario (EF-GML-11). */
export const SENT_APPLICATION = metadata({
  id: '18f0a1b2c3d4e501',
  threadId: '18f0a1b2c3d4e501',
  receivedAt: '2026-09-01T09:00:00.000Z',
  labelIds: ['SENT'],
  from: 'Alex Martin <alex.martin@example.com>',
  subject: 'Candidature — Équipier polyvalent',
  snippet:
    'Madame, Monsieur, je vous adresse ma candidature pour le poste d&#39;équipier polyvalent au restaurant ' +
    'McDonald&#39;s de Lyon Part-Dieu.',
});

/** Acknowledgement of the McDonald's scenario: the excerpt carries HTML entities. */
export const MCDONALDS_ACKNOWLEDGEMENT = metadata({
  id: '18f0a1b2c3d4e502',
  threadId: '18f0a1b2c3d4e501',
  receivedAt: '2026-09-02T14:30:00.000Z',
  from: '"McDonald\'s Recrutement" <recrutement@mcdonalds.example>',
  subject: 'Nous avons bien reçu votre candidature',
  snippet:
    'Bonjour Alex, merci pour votre candidature au poste d&#39;équipier polyvalent chez McDonald&#39;s Lyon ' +
    'Part-Dieu. Nous reviendrons vers vous &quot;très vite&quot; &amp; au plus tard sous 15 jours.',
});

/** EF-GML-07: a bank message, without any job keyword nor platform sender. */
export const BANK_STATEMENT = metadata({
  id: '18f0a1b2c3d4e503',
  threadId: '18f0a1b2c3d4e503',
  receivedAt: '2026-09-05T07:15:00.000Z',
  from: 'Banque Exemple <no-reply@banque-exemple.example>',
  subject: 'Votre relevé de compte de septembre est disponible',
  snippet: 'Bonjour, votre relevé est disponible dans votre espace client. Connectez-vous pour le consulter.',
});

/** EF-GML-09: relayed by APEC, retained by its sender alone (no job keyword); the employer is in the text. */
export const APEC_INNOVA = metadata({
  id: '18f0a1b2c3d4e504',
  threadId: '18f0a1b2c3d4e504',
  receivedAt: '2026-09-10T11:00:00.000Z',
  from: 'APEC <ne-pas-repondre@mail.apec.fr>',
  subject: 'Innova Solutions a bien reçu votre dossier',
  snippet:
    'Bonne nouvelle : votre dossier pour le poste de data analyst a été transmis à Innova Solutions, ' +
    'qui reviendra vers vous.',
});

/** EF-GML-05: 83 days before the test clock (2026-09-22): read back with N = 120, not with N = 30. */
export const OLD_SPONTANEOUS_APPLICATION = metadata({
  id: '18f0a1b2c3d4e505',
  threadId: '18f0a1b2c3d4e505',
  receivedAt: '2026-07-01T08:00:00.000Z',
  labelIds: ['SENT'],
  from: 'Alex Martin <alex.martin@example.com>',
  subject: 'Candidature spontanée',
  snippet: 'Bonjour, je me permets de vous adresser ma candidature spontanée.',
});

/** ENF-RGP-01: an excerpt longer than the 300 characters kept. */
export const LONG_NEWSLETTER = metadata({
  id: '18f0a1b2c3d4e506',
  threadId: '18f0a1b2c3d4e506',
  receivedAt: '2026-09-12T18:00:00.000Z',
  from: 'Emplois Lyon <lettre@emplois-lyon.example>',
  subject: 'Les offres d’emploi de la semaine',
  snippet: `${'Nouvelles offres   à Lyon : développeur, data analyst, chargé de projet. '.repeat(6)}Fin.`,
});

/** Interview of the McDonald's scenario: no job title in it, attached by RG-03 (c). */
export const MCDONALDS_INTERVIEW = metadata({
  id: '18f0a1b2c3d4e507',
  threadId: '18f0a1b2c3d4e507',
  receivedAt: '2026-09-08T09:30:00.000Z',
  from: '"McDonald\'s Recrutement" <recrutement@mcdonalds.example>',
  subject: 'Invitation à un entretien',
  snippet: 'Bonjour Alex, nous souhaitons vous rencontrer jeudi à 14 h au restaurant de Lyon Part-Dieu.',
});

/** EF-GML-10: relayed by the LHH firm for its client Studio Ardent, fixed-term contract. */
export const LHH_STUDIO_ARDENT = metadata({
  id: '18f0a1b2c3d4e508',
  threadId: '18f0a1b2c3d4e508',
  receivedAt: '2026-09-14T08:45:00.000Z',
  from: 'LHH Recruitment Solutions <talents@lhh.com>',
  subject: 'Votre candidature — Chargé de projet digital',
  snippet:
    'Bonjour, notre client Studio Ardent a bien reçu votre candidature au poste de chargé de projet digital ' +
    'en CDD de 12 mois.',
});

/** EF-GML-12: a refusal from a company without any application yet. */
export const MAISON_LUMEN_REJECTION = metadata({
  id: '18f0a1b2c3d4e509',
  threadId: '18f0a1b2c3d4e509',
  receivedAt: '2026-09-16T16:20:00.000Z',
  from: 'Maison Lumen <rh@maison-lumen.example>',
  subject: 'Suite à votre candidature',
  snippet:
    'Nous vous remercions de l&#39;intérêt porté à Maison Lumen. Après étude, nous ne donnerons pas suite à ' +
    'votre candidature au poste d&#39;UX designer.',
});

/** EF-GML-19: the contract type is written in the subject. */
export const ALTERNANCE_ACKNOWLEDGEMENT = metadata({
  id: '18f0a1b2c3d4e50a',
  threadId: '18f0a1b2c3d4e50a',
  receivedAt: '2026-09-18T07:05:00.000Z',
  from: 'Atelier Nova <jobs@atelier-nova.example>',
  subject: 'Accusé de réception — Alternance Data Analyst',
  snippet: 'Votre candidature en alternance au poste de Data Analyst a bien été reçue par Atelier Nova.',
});

/** Q-08: holds a keyword, yet unrelated to any application (classified off topic). */
export const MARATHON_REGISTRATION = metadata({
  id: '18f0a1b2c3d4e50b',
  threadId: '18f0a1b2c3d4e50b',
  receivedAt: '2026-09-19T12:00:00.000Z',
  from: 'Marathon de Lyon <inscriptions@marathon-lyon.example>',
  subject: 'Candidat au marathon : votre dossard',
  snippet: 'Votre dossard numéro 4812 est prêt. Retrait au village du marathon samedi.',
});

/** `count` job alerts from the same site, one a day from 2026-09-01, to fill several classification batches. */
export const jobAlerts = (count: number): gmail_v1.Schema$Message[] =>
  Array.from({ length: count }, (_, index) =>
    metadata({
      id: `18f0b0000000${String(index).padStart(4, '0')}`,
      threadId: `18f0b0000000${String(index).padStart(4, '0')}`,
      receivedAt: new Date(Date.UTC(2026, 8, 1 + index, 6)).toISOString(),
      from: 'Emplois Lyon <lettre@emplois-lyon.example>',
      subject: `Alerte emploi n° ${index + 1} : 5 nouvelles offres`,
      snippet: 'Cinq nouvelles offres correspondent à votre recherche de data analyst à Lyon.',
    }),
  );

/**
 * `count` messages without any job keyword (set aside by RG-10), one a minute from 2026-09-20: a mailbox large
 * enough for one synchronisation pass not to read it whole.
 */
export const otherMessages = (count: number): gmail_v1.Schema$Message[] =>
  Array.from({ length: count }, (_, index) =>
    metadata({
      id: `18f0c0000000${String(index).padStart(4, '0')}`,
      threadId: `18f0c0000000${String(index).padStart(4, '0')}`,
      receivedAt: new Date(Date.UTC(2026, 8, 20, 0, index)).toISOString(),
      from: 'Le Panier Bio <lettre@panier-bio.example>',
      subject: `Votre panier de la semaine n° ${index + 1}`,
      snippet: 'Les paniers de légumes de la semaine sont en ligne, retrait samedi au point relais.',
    }),
  );
