import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** What a follow-up is written from (EF-CAN-17): the application alone, never the content of a message. */
export interface FollowUpToWrite {
  company: string;
  jobTitle: string;
  appliedAt: Date;
  /** RG-06: only these two statuses are followed up. */
  status: 'sent' | 'acknowledged';
  daysSinceActivity: number;
  /** Display name of the candidate in the thread, null when unknown. */
  candidateName: string | null;
  /**
   * EF-CAN-15: the offer as the candidate saved it, null when he saved none. The only material the model has to
   * say something true about this job rather than a compliment it made up (EF-CAN-17 v1.34).
   */
  offerDescription: string | null;
}

// ENF-COU-01: bounded input, same bounds as the data model (companies.name 160, applications.job_title 300).
const COMPANY_MAX_LENGTH = 160;
const JOB_TITLE_MAX_LENGTH = 300;
const NAME_MAX_LENGTH = 120;
// The column holds 20 000 characters; the missions are at the top, and a follow-up needs one of them, not the
// legal notice at the bottom (ENF-COU-01: one follow-up must not cost more than a batch of ten classifications).
const OFFER_DESCRIPTION_MAX_LENGTH = 1200;

const STATUS_WORDING: Readonly<Record<FollowUpToWrite['status'], string>> = {
  sent: 'candidature envoyée, sans réponse',
  acknowledged: 'accusé de réception reçu',
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

// EF-CAN-17 (v1.34, BES-47): the first version produced letters that would have fit any company. Warmth is asked
// for here, but it is fenced in: the only thing the model may be enthusiastic *about* is the offer the candidate
// saved. Everything else about the employer is unknown to it, and an invented compliment reads worse than none.
const SYSTEM = [
  'Tu rédiges, pour un candidat à la recherche d’un emploi, un e-mail de relance au sujet d’une candidature restée ' +
    'sans nouvelles. Il sera envoyé en réponse dans le fil de la candidature, par le candidat lui-même.',
  'Les faits de la candidature sont placés entre balises <application>.',
  'But du message : que le recruteur sente une personne qui tient à ce poste-là, dans cette entreprise-là, et non ' +
    'un texte envoyé à vingt entreprises. Écris à la première personne (« je »), en vouvoyant le destinataire.',
  'Ton : courtois, chaleureux et confiant ; jamais plaintif, jamais insistant, jamais obséquieux. Phrases courtes, ' +
    'mots de tous les jours. Bannis les formules de catalogue : « je me permets de revenir vers vous », « sauf ' +
    'erreur de ma part », « dans l’attente de votre retour », « je reste à votre entière disposition ».',
  'Longueur : 80 à 150 mots, en trois courts paragraphes.',
  '- Paragraphe 1 — rappelle la candidature en une phrase : le poste et l’entreprise nommés, la date d’envoi.',
  '- Paragraphe 2 — le cœur du message : dis concrètement ce qui donne envie de ce poste. Quand la description de ' +
    'l’offre est donnée, reprends-en **un** élément précis (une mission, un outil, un terrain, une responsabilité) ' +
    'et dis en une phrase pourquoi il parle au candidat. Sans description, tiens-toi à l’intitulé du poste et au ' +
    'fait que l’intérêt n’a pas faibli : ne comble jamais le vide par un compliment sur l’entreprise.',
  '- Paragraphe 3 — demande où en est le recrutement et rends-toi disponible pour un échange, à la convenance du ' +
    'recruteur, sans fixer de date ni réclamer de réponse pour une échéance.',
  '- Commence par « Bonjour, » : n’invente aucun nom de destinataire.',
  '- Termine par « Bien cordialement, » suivi de la signature donnée, ou sans signature s’il n’y en a pas.',
  'Interdits. N’affirme rien qui ne figure pas dans les faits : ni compétence, ni expérience, ni diplôme, ni ' +
    'chiffre, ni nom, ni référence, ni date. Ne flatte pas l’entreprise sur ce que tu ignores d’elle — valeurs, ' +
    'réputation, croissance, « leader de son secteur », « vos projets ambitieux ». Ne fais pas du silence un ' +
    'reproche. Pas d’objet, pas de mise en forme, pas d’emoji.',
  'Réponds uniquement par un objet JSON de la forme {"body":"<le texte de l’e-mail, paragraphes séparés par une ' +
    'ligne vide>"}.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

/**
 * Prompt of the `write_follow_up` task for one application. The facts are framed and declared untrusted: company
 * and job title come from received messages, the offer description is typed by the candidate (ENF-SEC-06).
 * Expected answer: `FollowUpDraftSchema` (modules/emails), whose length the code checks, not the model.
 * @req EF-CAN-17, ENF-SEC-06, ENF-COU-01
 */
export const buildWriteFollowUpPrompt = (
  application: FollowUpToWrite,
): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: frameUntrusted(
    'application',
    [
      `Entreprise : ${truncate(application.company, COMPANY_MAX_LENGTH)}`,
      `Poste : ${truncate(application.jobTitle, JOB_TITLE_MAX_LENGTH)}`,
      `Candidature envoyée le : ${dateFormat.format(application.appliedAt)}`,
      `Dernier état : ${STATUS_WORDING[application.status]}`,
      `Sans nouvelles depuis : ${application.daysSinceActivity} jours`,
      // Said even when empty: a missing line invites the model to fill the gap on its own (EF-CAN-17 v1.34).
      `Description de l’offre : ${
        application.offerDescription
          ? truncate(application.offerDescription, OFFER_DESCRIPTION_MAX_LENGTH)
          : '(aucune)'
      }`,
      `Signature : ${
        application.candidateName
          ? truncate(application.candidateName, NAME_MAX_LENGTH)
          : '(aucune, termine par la formule de politesse)'
      }`,
    ].join('\n'),
  ),
});
