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

/** EF-GML-09: forwarded by APEC, retained by its sender alone (no job keyword). */
export const APEC_INNOVA = metadata({
  id: '18f0a1b2c3d4e504',
  threadId: '18f0a1b2c3d4e504',
  receivedAt: '2026-09-10T11:00:00.000Z',
  from: 'APEC <ne-pas-repondre@mail.apec.fr>',
  subject: 'Innova Solutions a consulté votre profil',
  snippet:
    'Bonne nouvelle : Innova Solutions s&#39;intéresse à votre profil de data analyst. Consultez son message.',
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
