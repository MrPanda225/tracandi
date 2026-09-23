import { z } from 'zod';
import { emailCategory } from '../../db/schema.js';
import { normalizeKey } from '../../lib/text.js';

/** EF-GML-08: categories answered by the classification; `off_topic` messages are never stored (Q-08). */
export const CLASSIFICATION_CATEGORIES = [...emailCategory.enumValues, 'off_topic'] as const;

/** EF-GML-19: contract types a message can mention (glossary v1.1; « non précisé » is expressed by null). */
const MENTIONED_CONTRACT_TYPES = ['cdi', 'cdd', 'alternance', 'job_etudiant', 'autre'] as const;
type MentionedContractType = (typeof MENTIONED_CONTRACT_TYPES)[number];

/** Wordings a model answers for a contract, under their normalized key (RG-14), mapped to the glossary. */
const CONTRACT_SYNONYMS: Readonly<Record<string, MentionedContractType>> = {
  'contrat a duree indeterminee': 'cdi',
  'contrat a duree determinee': 'cdd',
  apprentissage: 'alternance',
  'contrat d apprentissage': 'alternance',
  'contrat de professionnalisation': 'alternance',
  professionnalisation: 'alternance',
  'contrat pro': 'alternance',
  'job etudiant': 'job_etudiant',
  'emploi etudiant': 'job_etudiant',
  'student job': 'job_etudiant',
  stage: 'autre',
  'stage conventionne': 'autre',
  internship: 'autre',
  freelance: 'autre',
  independant: 'autre',
  interim: 'autre',
  interimaire: 'autre',
  'service civique': 'autre',
  'temps partiel': 'autre',
  'temps plein': 'autre',
};

const CONTRACT_BY_KEY = new Map<string, MentionedContractType>([
  ...MENTIONED_CONTRACT_TYPES.map((type) => [normalizeKey(type), type] as const),
  ...Object.entries(CONTRACT_SYNONYMS),
]);

/**
 * EF-GML-19: the contract type of the glossary an answer designates, a known wording mapped to it (« stage » →
 * autre, « apprentissage » → alternance). Anything else — an unknown wording, « non précisé », no answer at all —
 * is « non précisé » (null): a secondary field must not make the classification of a whole batch of 10 messages
 * unusable, and the result stays bounded by the enumeration (EF-IA-03).
 */
const toContractType = (value: unknown): MentionedContractType | null =>
  typeof value === 'string' ? (CONTRACT_BY_KEY.get(normalizeKey(value)) ?? null) : null;

// Same bounds as the data model: companies.name 160, platforms.name 120, applications.job_title 300.
const EMPLOYER_MAX_LENGTH = 160;
const PLATFORM_MAX_LENGTH = 120;
const JOB_TITLE_MAX_LENGTH = 300;

/** A name, or null when absent; an empty or blank answer counts as absent. */
const optionalName = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullable()
    .transform((value) => value || null);

/** Classification of one message of a batch, referenced by its position in the prompt (1, 2…). */
export const ClassifiedMessageSchema = z.object({
  ref: z.number().int().positive(),
  category: z.enum(CLASSIFICATION_CATEGORIES),
  // EF-GML-09: the real employer, even when the message comes from a platform.
  employer: optionalName(EMPLOYER_MAX_LENGTH),
  // EF-GML-10
  platform: optionalName(PLATFORM_MAX_LENGTH),
  jobTitle: optionalName(JOB_TITLE_MAX_LENGTH),
  contractType: z.preprocess(toContractType, z.enum(MENTIONED_CONTRACT_TYPES).nullable()),
});

/**
 * Output of the `classify_emails` task (prompt `llm/prompts/classifyEmails.ts`): the only barrier against an
 * aberrant answer (EF-IA-03).
 */
export const ClassificationSchema = z.object({ messages: z.array(ClassifiedMessageSchema) });

export type ClassifiedMessage = z.infer<typeof ClassifiedMessageSchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
