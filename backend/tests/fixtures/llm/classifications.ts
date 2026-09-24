import type { ClassifiedMessage } from '../../../src/modules/emails/classification.js';
import type { LlmProvider, LlmRequest, ProviderName } from '../../../src/llm/types.js';

type Classification = Omit<ClassifiedMessage, 'ref'>;

const answer = (fields: Partial<Classification> & Pick<Classification, 'category'>): Classification => ({
  employer: null,
  platform: null,
  jobTitle: null,
  contractType: null,
  ...fields,
});

/**
 * Recorded answers of the `classify_emails` task for the email fixtures (tests/fixtures/emails), keyed by subject:
 * what a provider answers for each message. A subject missing here is answered « off_topic ».
 */
export const CLASSIFICATION_BY_SUBJECT: Readonly<Record<string, Classification>> = {
  'Candidature — Équipier polyvalent': answer({
    category: 'sent_application',
    employer: "McDonald's",
    jobTitle: 'Équipier polyvalent',
  }),
  'Nous avons bien reçu votre candidature': answer({
    category: 'acknowledged',
    employer: "McDonald's",
    jobTitle: 'équipier polyvalent',
  }),
  'Invitation à un entretien': answer({ category: 'interview', employer: "McDonald's" }),
  'Innova Solutions a bien reçu votre dossier': answer({
    category: 'acknowledged',
    employer: 'Innova Solutions',
    platform: 'APEC',
    jobTitle: 'Data analyst',
  }),
  'Votre candidature — Chargé de projet digital': answer({
    category: 'acknowledged',
    employer: 'Studio Ardent',
    platform: 'LHH',
    jobTitle: 'Chargé de projet digital',
    contractType: 'cdd',
  }),
  'Suite à votre candidature': answer({
    category: 'rejected',
    employer: 'Maison Lumen',
    jobTitle: 'UX designer',
  }),
  'Accusé de réception — Alternance Data Analyst': answer({
    category: 'acknowledged',
    employer: 'Atelier Nova',
    jobTitle: 'Data Analyst',
    contractType: 'alternance',
  }),
  // RG-17: the AI reads the polite opening and answers « acknowledged »; the wording says otherwise.
  'Votre candidature chez Atelier Nova': answer({
    category: 'acknowledged',
    employer: 'Atelier Nova',
    jobTitle: 'Data Analyst',
    contractType: 'alternance',
  }),
  // BES-30: read from their opening alone, these refusals pass for acknowledgements.
  'Maison Lumen - Votre candidature au poste de Alternance Data analytics et IA H/F': answer({
    category: 'acknowledged',
    employer: 'Maison Lumen',
    jobTitle: 'Alternance Data analytics et IA',
    contractType: 'alternance',
  }),
  'Alex, votre candidature au poste de chef de projet électricité': answer({
    category: 'acknowledged',
    platform: 'LHH',
    jobTitle: 'Chef de projet électricité',
  }),
  'Candidature spontanée': answer({ category: 'sent_application' }),
  // BES-32: the AI finds the title, not the employer, which only the domain of the recipient tells.
  'Candidature – Data Analyst Poste de Travail': answer({ category: 'sent_application', jobTitle: 'Data Analyst' }),
  'Les offres d’emploi de la semaine': answer({ category: 'job_alert' }),
  'Candidat au marathon : votre dossard': answer({ category: 'off_topic' }),
};

const JOB_ALERT_SUBJECT = /^Alerte emploi n° \d+/;
// One message of the prompt (llm/prompts/classifyEmails.ts): its reference, then its subject on the second line.
const FRAMED_MESSAGE = /<email ref="(\d+)"[^>]*>\n[^\n]*\nObjet : ([^\n]*)\n/g;

const classify = (subject: string): Classification =>
  CLASSIFICATION_BY_SUBJECT[subject] ??
  (JOB_ALERT_SUBJECT.test(subject) ? answer({ category: 'job_alert' }) : answer({ category: 'off_topic' }));

/** A provider that answers `classify_emails` from the recorded classifications, and records its requests. */
export interface ScriptedClassifier {
  provider: LlmProvider;
  requests: LlmRequest[];
  /** Makes every call from now on fail, like a provider outage; `undefined` restores it. */
  setFailure: (error: Error | undefined) => void;
  /** Answers without the message of this reference, like a model skipping one. */
  forgetRef: (ref: number | undefined) => void;
}

/** Scripted provider for the classification, never reaching any AI service (testing.md). */
export const createScriptedClassifier = (name: ProviderName = 'gemini'): ScriptedClassifier => {
  const requests: LlmRequest[] = [];
  let failure: Error | undefined;
  let forgottenRef: number | undefined;

  const provider: LlmProvider = {
    name,
    model: `${name}-test`,
    complete: (request) => {
      requests.push(request);
      if (failure) return Promise.reject(failure);
      const messages = [...request.prompt.matchAll(FRAMED_MESSAGE)]
        .map(([, ref, subject]) => ({ ref: Number(ref), ...classify(subject ?? '') }))
        .filter((message) => message.ref !== forgottenRef);
      return Promise.resolve({ text: JSON.stringify({ messages }), inputTokens: 1200, outputTokens: 300 });
    },
  };

  return {
    provider,
    requests,
    setFailure: (error) => {
      failure = error;
    },
    forgetRef: (ref) => {
      forgottenRef = ref;
    },
  };
};
