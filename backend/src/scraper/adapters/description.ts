import { contractType } from '../../db/schema.js';
import { decodeHtmlEntities } from '../../lib/html.js';
import { normalizeKey } from '../../lib/text.js';
import { clamp, DESCRIPTION_MAX_LENGTH, type OfferContractType } from './types.js';

type NamedContractType = Exclude<OfferContractType, 'non_precise'>;

/**
 * A wording a source may state for a contract, and whether it may also be looked for inside a free text.
 * `inText` is false for the generic nouns of an ATS — « contract », « permanent », « student » — which say
 * nothing certain inside a job title (« Contract Manager » is not a CDD).
 */
interface ContractWording {
  type: NamedContractType;
  inText: boolean;
}

const exact = (type: NamedContractType): ContractWording => ({ type, inText: false });
const anywhere = (type: NamedContractType): ContractWording => ({ type, inText: true });

/**
 * Wordings ATS use for a contract, under their normalized key (RG-14), mapped to the glossary. English wordings
 * sit beside the French ones: the same board answers « Alternance » or « Apprenticeship » depending on its locale.
 *
 * « Full-time » and « Part-time » are absent on purpose: an offer can be full time under any contract, and
 * reading one as a CDI would put a wrong type on the candidate's follow-up (EF-VEI-22).
 */
const CONTRACT_WORDINGS: Readonly<Record<string, ContractWording>> = {
  cdi: anywhere('cdi'),
  'contrat a duree indeterminee': anywhere('cdi'),
  'permanent contract': exact('cdi'),
  permanent: exact('cdi'),
  cdd: anywhere('cdd'),
  'contrat a duree determinee': anywhere('cdd'),
  'fixed term': exact('cdd'),
  'fixed term contract': exact('cdd'),
  'fixed term employee': exact('cdd'),
  temporary: exact('cdd'),
  contractor: exact('cdd'),
  contract: exact('cdd'),
  alternance: anywhere('alternance'),
  apprentissage: anywhere('alternance'),
  'contrat d apprentissage': anywhere('alternance'),
  'contrat de professionnalisation': anywhere('alternance'),
  apprentice: exact('alternance'),
  apprenticeship: anywhere('alternance'),
  'work study': exact('alternance'),
  'job etudiant': anywhere('job_etudiant'),
  'emploi etudiant': anywhere('job_etudiant'),
  'student job': anywhere('job_etudiant'),
  student: exact('job_etudiant'),
  // Personio's « working_student » (v1.33).
  'working student': exact('job_etudiant'),
  stage: anywhere('autre'),
  internship: anywhere('autre'),
  intern: exact('autre'),
  trainee: exact('autre'),
  freelance: anywhere('autre'),
  independant: exact('autre'),
  interim: anywhere('autre'),
  'service civique': anywhere('autre'),
  volunteer: exact('autre'),
};

const WORDINGS = new Map<string, ContractWording>([
  ...contractType.enumValues
    .filter((value): value is NamedContractType => value !== 'non_precise')
    .map((value) => [normalizeKey(value), exact(value)] as const),
  ...Object.entries(CONTRACT_WORDINGS),
]);

/** Longest first, so « contrat d apprentissage » is recognised before « apprentissage ». */
const SEARCHABLE = [...WORDINGS.entries()]
  .filter(([, wording]) => wording.inText)
  .sort(([left], [right]) => right.length - left.length);

/** Whether `key` appears in `text` as a whole word: « intern » must not be found inside « internal ». */
const containsWord = (text: string, key: string): boolean => {
  let at = text.indexOf(key);
  while (at !== -1) {
    const before = at === 0 ? ' ' : text[at - 1];
    const after = text[at + key.length] ?? ' ';
    if (before === ' ' && after === ' ') return true;
    at = text.indexOf(key, at + 1);
  }
  return false;
};

interface ContractSources {
  /** What the source states for the contract, in the order it should be trusted. */
  labels?: readonly (string | null | undefined)[];
  /** Free text — a job title — scanned only for the wordings that leave no doubt. */
  text?: string | null;
}

/**
 * EF-VEI-22: the contract type a source designates, through the field it fills for it, and failing that through
 * an unambiguous wording of the job title (« Alternance — Ingénieur Données »). Anything else is « non précisé »:
 * never a guess, since the candidate filters their offers on this.
 */
export const contractTypeOf = ({ labels = [], text = null }: ContractSources): OfferContractType => {
  for (const label of labels) {
    const known = label ? WORDINGS.get(normalizeKey(label)) : undefined;
    if (known) return known.type;
  }
  const normalized = text ? ` ${normalizeKey(text)} ` : '';
  const found = normalized === '' ? undefined : SEARCHABLE.find(([key]) => containsWord(normalized, key));
  return found?.[1].type ?? 'non_precise';
};

// A block-level tag ends a line; anything else simply disappears.
const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer)\b[^>]*>/gi;
const ANY_TAG = /<[^>]*>/g;
const NEWLINE_RUNS = /\n+/g;
const TRAILING_SPACES = /[ \t]+\n/g;

/**
 * The readable text of a description an ATS publishes as HTML. Tags are removed rather than interpreted: what is
 * wanted here is the wording of the offer, for the candidate to read and for the scoring prompt (RG-09) — the
 * generic career page, which needs a real parse, is read by T-403.
 *
 * Entities are decoded twice on purpose: a board that publishes escaped HTML (Greenhouse) hides its tags behind
 * a first layer, and the accented characters of the text behind a second.
 *
 * The result is bounded, and null when the source published nothing.
 * @req EF-VEI-08
 */
export const htmlToText = (html: string | null | undefined): string | null => {
  if (!html) return null;
  const text = decodeHtmlEntities(html)
    .replace(BLOCK_TAGS, '\n')
    .replace(ANY_TAG, '')
    .replace(TRAILING_SPACES, '\n')
    .replace(NEWLINE_RUNS, '\n');
  return clamp(decodeHtmlEntities(text), DESCRIPTION_MAX_LENGTH);
};
