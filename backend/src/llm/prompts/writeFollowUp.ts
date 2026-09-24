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
}

// ENF-COU-01: bounded input, same bounds as the data model (companies.name 160, applications.job_title 300).
const COMPANY_MAX_LENGTH = 160;
const JOB_TITLE_MAX_LENGTH = 300;
const NAME_MAX_LENGTH = 120;

const STATUS_WORDING: Readonly<Record<FollowUpToWrite['status'], string>> = {
  sent: 'candidature envoyée, sans réponse',
  acknowledged: 'accusé de réception reçu',
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const SYSTEM = [
  'Tu rédiges, pour un candidat à la recherche d’un emploi, un e-mail de relance au sujet d’une candidature restée ' +
    'sans nouvelles. Il sera envoyé en réponse dans le fil de la candidature, par le candidat lui-même.',
  'Les faits de la candidature sont placés entre balises <application>.',
  'Écris en français, en vouvoyant, sur un ton courtois, direct et confiant : 80 à 150 mots, trois courts paragraphes.',
  '- Commence par « Bonjour, » : n’invente aucun nom de destinataire.',
  '- Rappelle la candidature (poste, entreprise, date d’envoi) et redis ton intérêt pour le poste.',
  '- Demande où en est le processus de recrutement et propose un échange à la convenance du recruteur.',
  '- Termine par « Bien cordialement, » suivi de la signature donnée, ou sans signature s’il n’y en a pas.',
  'N’affirme rien qui ne figure pas dans les faits : n’invente ni compétence, ni expérience, ni nom, ni référence, ' +
    'ni date. Pas d’objet, pas de mise en forme, pas d’emoji.',
  'Réponds uniquement par un objet JSON de la forme {"body":"<le texte de l’e-mail, paragraphes séparés par une ' +
    'ligne vide>"}.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

/**
 * Prompt of the `write_follow_up` task for one application. The facts are framed and declared untrusted: company
 * and job title come from received messages (ENF-SEC-06). Expected answer: `FollowUpDraftSchema` (modules/emails),
 * whose length the code checks, not the model.
 * @req EF-CAN-17, ENF-SEC-06, ENF-COU-01
 */
export const buildWriteFollowUpPrompt = (application: FollowUpToWrite): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: frameUntrusted(
    'application',
    [
      `Entreprise : ${truncate(application.company, COMPANY_MAX_LENGTH)}`,
      `Poste : ${truncate(application.jobTitle, JOB_TITLE_MAX_LENGTH)}`,
      `Candidature envoyée le : ${dateFormat.format(application.appliedAt)}`,
      `Dernier état : ${STATUS_WORDING[application.status]}`,
      `Sans nouvelles depuis : ${application.daysSinceActivity} jours`,
      `Signature : ${
        application.candidateName
          ? truncate(application.candidateName, NAME_MAX_LENGTH)
          : '(aucune, termine par la formule de politesse)'
      }`,
    ].join('\n'),
  ),
});
