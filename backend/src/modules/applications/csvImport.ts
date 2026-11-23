import { type CsvDelimiter, CsvSyntaxError, parseCsv } from '../../lib/csv.js';
import { HttpError } from '../../lib/errors.js';
import { parisDayBounds } from '../../lib/parisTime.js';
import { normalizeKey } from '../../lib/text.js';
import { type ApplicationStatus, DEFAULT_JOB_TITLE } from './rules.js';
import { IMPORT_FIELDS, type ImportField, type ImportMapping } from './schemas.js';

/** EF-CAN-23: largest file accepted, in bytes, and most rows of applications (header excluded). */
export const CSV_MAX_BYTES = 1024 * 1024;
export const CSV_MAX_ROWS = 1000;
/** EF-CAN-23: rows shown in the preview. */
export const CSV_PREVIEW_ROWS = 5;

const BASE64_CHARS_PER_BLOCK = 4;
const BYTES_PER_BLOCK = 3;
/** Longest base64 text a file of CSV_MAX_BYTES can take, padding included. */
export const CSV_MAX_BASE64_LENGTH = Math.ceil(CSV_MAX_BYTES / BYTES_PER_BLOCK) * BASE64_CHARS_PER_BLOCK;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/u;
const NUL_BYTE = 0;

// Same bounds as a manual application (schemas.ts, EF-CAN-08, EF-CAN-19).
const COMPANY_MAX_LENGTH = 160;
const JOB_TITLE_MAX_LENGTH = 300;
const NOTES_MAX_LENGTH = 2000;
const LINK_MAX_LENGTH = 1000;
const LINK_PROTOCOLS = new Set(['http:', 'https:']);
const EARLIEST_YEAR = 2000;
const CENTURY = 2000;
const DEFAULT_STATUS: ApplicationStatus = 'sent';

const TOO_LARGE = 'Le fichier dépasse 1 Mo : gardez seulement les colonnes utiles, puis réessayez.';
const TOO_MANY_ROWS = 'Le fichier dépasse 1 000 lignes de candidatures : découpez-le en plusieurs fichiers.';
const NOT_TEXT =
  'Ce fichier n’est pas un CSV en texte (UTF-8). Exportez votre tableau au format CSV, puis réessayez.';
const DATE_FORMATS = 'formats acceptés JJ/MM/AAAA, AAAA-MM-JJ ou JJ/MM/AA';

/**
 * Turns the base64 content of an imported CSV file into its text. The size is checked on the base64 text first, so
 * that an oversized upload is never decoded.
 * @throws HttpError 413 beyond 1 MB; 415 when the content is not UTF-8 text (a binary file, a Latin-1 export);
 * 400 when the content is not base64.
 * @req EF-CAN-23
 */
export const decodeCsvFile = (base64: string): string => {
  if (base64.length > CSV_MAX_BASE64_LENGTH) throw new HttpError(413, TOO_LARGE);
  if (base64.length % BASE64_CHARS_PER_BLOCK !== 0 || !BASE64_PATTERN.test(base64)) {
    throw new HttpError(400, 'Le fichier n’est pas arrivé en entier. Réessayez.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > CSV_MAX_BYTES) throw new HttpError(413, TOO_LARGE);
  if (bytes.includes(NUL_BYTE)) throw new HttpError(415, NOT_TEXT);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(415, NOT_TEXT);
  }
};

/** One row of applications of the file, with its line in the spreadsheet (the header is line 1). */
export interface CsvRow {
  line: number;
  cells: string[];
}

/** Header and non-empty rows of an imported file. */
export interface CsvTable {
  delimiter: CsvDelimiter;
  headers: string[];
  rows: CsvRow[];
}

/**
 * Reads the header and the rows of an imported file; rows whose cells are all blank are dropped (a spreadsheet
 * exports its empty rows).
 * @throws HttpError 400 for an empty file or an invalid CSV (the line is named); 413 beyond 1 000 rows.
 * @req EF-CAN-23
 */
export const readCsvTable = (text: string): CsvTable => {
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvSyntaxError) throw new HttpError(400, `Fichier CSV illisible. ${error.message}.`);
    throw error;
  }
  const [header, ...records] = parsed.records;
  if (!header) throw new HttpError(400, 'Le fichier est vide.');
  const rows = records
    .map((cells, index) => ({ line: index + 2, cells }))
    .filter((row) => row.cells.some((cell) => cell.trim() !== ''));
  if (rows.length > CSV_MAX_ROWS) throw new HttpError(413, TOO_MANY_ROWS);
  return { delimiter: parsed.delimiter, headers: header.map((cell) => cell.trim()), rows };
};

/** EF-CAN-23: column names (RG-14 keys) that announce each field, in French and in English. */
const FIELD_NAMES: Record<ImportField, readonly string[]> = {
  company: ['entreprise', 'societe', 'company', 'employeur', 'employer', 'organisation', 'organization'],
  jobTitle: ['intitule', 'poste', 'titre', 'job title', 'title', 'position', 'job', 'role', 'emploi'],
  link: ['lien', 'url', 'link', 'annonce', 'adresse'],
  appliedAt: ['date de candidature', 'date', 'applied', 'applied on', 'postule le'],
  status: ['statut', 'status', 'etat', 'state'],
  notes: ['notes', 'note', 'commentaires', 'commentaire', 'remarques', 'remarque', 'comments', 'comment'],
};

const containsName = (headerKey: string, name: string): boolean => ` ${headerKey} `.includes(` ${name} `);

/**
 * EF-CAN-23: proposes a column for each field from the column names — first the columns named exactly as the field,
 * then the columns whose name contains it; a column is proposed for one field at most, a field without a matching
 * column gets null. The candidate validates or corrects the proposal.
 * @req EF-CAN-23
 */
export const suggestMapping = (headers: readonly string[]): Record<ImportField, number | null> => {
  const keys = headers.map(normalizeKey);
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((field) => [field, null])) as Record<
    ImportField,
    number | null
  >;
  const used = new Set<number>();
  const matchers = [
    (key: string, name: string) => key === name,
    (key: string, name: string) => containsName(key, name),
  ];
  for (const matches of matchers) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] !== null) continue;
      const column = keys.findIndex(
        (key, index) => !used.has(index) && FIELD_NAMES[field].some((name) => matches(key, name)),
      );
      if (column === -1) continue;
      mapping[field] = column;
      used.add(column);
    }
  }
  return mapping;
};

/** EF-CAN-23: labels (RG-14 keys) of each status, in French and in English. */
const STATUS_LABELS: Record<ApplicationStatus, readonly string[]> = {
  to_apply: ['a postuler', 'postuler', 'to apply'],
  sent: ['envoyee', 'envoye', 'candidature envoyee', 'postule', 'postulee', 'sent', 'applied'],
  acknowledged: ['accuse recu', 'accuse de reception', 'acknowledged', 'received'],
  interview: ['entretien', 'interview'],
  offer: ['proposition', 'offre', 'offer'],
  rejected: ['refusee', 'refuse', 'refus', 'rejetee', 'rejected', 'declined'],
};
const STATUS_OF_LABEL = new Map(
  Object.entries(STATUS_LABELS).flatMap(([status, labels]) =>
    labels.map((label) => [label, status as ApplicationStatus] as const),
  ),
);

/** A row read into an application, or the reason it is refused. */
export type RowReading<T> = { ok: true; value: T } | { ok: false; reason: string };

/** What a valid row creates. */
export interface ImportedApplication {
  companyName: string;
  jobTitle: string;
  status: ApplicationStatus;
  appliedAt: Date;
  notes: string | null;
}

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const accept = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

const DAY_PATTERNS: readonly { pattern: RegExp; toDay: (parts: string[]) => [string, string, string] }[] = [
  {
    pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/u,
    toDay: ([year = '', month = '', day = '']) => [year, month, day],
  },
  {
    pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u,
    toDay: ([day = '', month = '', year = '']) => [year, month, day],
  },
  {
    pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/u,
    toDay: ([day = '', month = '', year = '']) => [String(CENTURY + Number(year)), month, day],
  },
];

/** « YYYY-MM-DD » of a cell in one of the accepted formats, or null when the cell matches none. */
const dayOf = (cell: string): string | null => {
  for (const { pattern, toDay } of DAY_PATTERNS) {
    const match = pattern.exec(cell);
    if (!match) continue;
    const [year, month, day] = toDay(match.slice(1));
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
};

const isExistingDay = (day: string): boolean => {
  const noon = new Date(`${day}T12:00:00.000Z`);
  return !Number.isNaN(noon.getTime()) && noon.toISOString().startsWith(day);
};

/**
 * EF-CAN-16, EF-CAN-23: the application date of a cell — midnight of that Paris day, so that the day filter
 * (EF-CAN-24) finds it; now for an empty cell.
 */
const readAppliedAt = (cell: string, now: Date): RowReading<Date> => {
  if (cell === '') return accept(now);
  const day = dayOf(cell);
  if (!day) return refuse(`Date « ${cell} » illisible : ${DATE_FORMATS}`);
  if (!isExistingDay(day)) return refuse(`Date « ${cell} » inexistante`);
  if (Number(day.slice(0, 4)) < EARLIEST_YEAR)
    return refuse('Date de candidature antérieure au 1er janvier 2000');
  const { start } = parisDayBounds(day);
  return start > now ? refuse('Date de candidature dans le futur') : accept(start);
};

const readStatus = (cell: string): RowReading<ApplicationStatus> => {
  if (cell === '') return accept(DEFAULT_STATUS);
  const status = STATUS_OF_LABEL.get(normalizeKey(cell));
  return status ? accept(status) : refuse(`Statut « ${cell} » inconnu`);
};

const isValidLink = (link: string): boolean => {
  if (link.length > LINK_MAX_LENGTH || !URL.canParse(link)) return false;
  return LINK_PROTOCOLS.has(new URL(link).protocol);
};

/** T-903: until the application has a link column (T-902), the link opens its notes. */
const readNotes = (link: string, notes: string): RowReading<string | null> => {
  if (link !== '' && !isValidLink(link)) {
    return refuse('Lien invalide : adresse http ou https de 1 000 caractères au plus');
  }
  const text = [link === '' ? '' : `Lien : ${link}`, notes].filter(Boolean).join('\n\n');
  if (text.length > NOTES_MAX_LENGTH)
    return refuse('Notes trop longues (2 000 caractères au plus, lien compris)');
  return accept(text === '' ? null : text);
};

const readCompany = (cell: string): RowReading<string> => {
  if (normalizeKey(cell) === '') return refuse('Entreprise manquante');
  return cell.length > COMPANY_MAX_LENGTH
    ? refuse('Nom d’entreprise trop long (160 caractères au plus)')
    : accept(cell);
};

const readJobTitle = (cell: string): RowReading<string> => {
  if (cell === '') return accept(DEFAULT_JOB_TITLE);
  if (normalizeKey(cell) === '') return refuse('Intitulé sans lettre ni chiffre');
  return cell.length > JOB_TITLE_MAX_LENGTH
    ? refuse('Intitulé trop long (300 caractères au plus)')
    : accept(cell);
};

/**
 * EF-CAN-23: reads one row with the validated mapping. An unmapped field or an empty cell takes the default of a
 * manual application: « Candidature » (RG-03 (d)), Envoyée, today (EF-CAN-16), no notes. The link, until it has its
 * own column (T-902), opens the notes.
 * @returns the application to create, or the first reason the row is refused (in French, shown to the candidate).
 * @req EF-CAN-23, EF-CAN-16, EF-CAN-19
 */
export const readImportRow = (
  cells: readonly string[],
  { mapping, now }: { mapping: ImportMapping; now: Date },
): RowReading<ImportedApplication> => {
  const cellOf = (field: ImportField): string => {
    const column = mapping[field];
    return column === null ? '' : (cells[column] ?? '').trim();
  };
  const companyName = readCompany(cellOf('company'));
  if (!companyName.ok) return companyName;
  const jobTitle = readJobTitle(cellOf('jobTitle'));
  if (!jobTitle.ok) return jobTitle;
  const appliedAt = readAppliedAt(cellOf('appliedAt'), now);
  if (!appliedAt.ok) return appliedAt;
  const status = readStatus(cellOf('status'));
  if (!status.ok) return status;
  const notes = readNotes(cellOf('link'), cellOf('notes'));
  if (!notes.ok) return notes;
  return accept({
    companyName: companyName.value,
    jobTitle: jobTitle.value,
    status: status.value,
    appliedAt: appliedAt.value,
    notes: notes.value,
  });
};
