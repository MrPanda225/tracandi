import { ValidationError } from '../../lib/errors.js';
import { companyKey, jobTitleKey, normalizeKey } from '../../lib/text.js';
import {
  CSV_PREVIEW_ROWS,
  type CsvTable,
  decodeCsvFile,
  type ImportedApplication,
  readCsvTable,
  readImportRow,
  suggestMapping,
} from './csvImport.js';
import * as repository from './repository.js';
import type { Executor } from './repository.js';
import {
  IMPORT_FIELDS,
  type ImportBody,
  type ImportMapping,
  type ImportPreview,
  type ImportResult,
} from './schemas.js';

/** A row ready to be created, with the keys RG-03 (a) and (b) identify it by. */
interface ImportCandidate extends ImportedApplication {
  companyKey: string;
  identity: string;
}

/**
 * EF-CAN-23: the header of the file, its first rows and a mapping proposed from the column names. Nothing is stored.
 * @throws HttpError 413 beyond 1 MB or 1 000 rows, 415 for a file that is not UTF-8 text, 400 for an invalid CSV.
 * @req EF-CAN-23
 */
export const previewCsvImport = (file: string): ImportPreview => {
  const table = readCsvTable(decodeCsvFile(file));
  return {
    delimiter: table.delimiter,
    headers: table.headers,
    rows: table.rows.slice(0, CSV_PREVIEW_ROWS).map((row) => row.cells),
    totalRows: table.rows.length,
    mapping: suggestMapping(table.headers),
  };
};

/** @throws ValidationError naming each field mapped to a column the file does not have. */
const assertMappingFits = (mapping: ImportMapping, table: CsvTable): void => {
  const issues = IMPORT_FIELDS.filter((field) => {
    const column = mapping[field];
    return column !== null && column >= table.headers.length;
  }).map((field) => ({
    path: `body.mapping.${field}`,
    message: 'Cette colonne n’existe pas dans le fichier',
  }));
  if (issues.length > 0) throw new ValidationError(issues);
};

/** RG-03 (a), (b): the same company (RG-26) and the same job title (RG-25) designate the same application. */
const identityOf = (company: string, jobTitle: string): string => `${company}\u0000${jobTitleKey(jobTitle)}`;

/** Splits the rows into applications to create and refused rows, in the order of the file. */
const readRows = (table: CsvTable, { mapping, now }: { mapping: ImportMapping; now: Date }) => {
  const candidates: ImportCandidate[] = [];
  const rejected: ImportResult['rejected'] = [];
  for (const row of table.rows) {
    const reading = readImportRow(row.cells, { mapping, now });
    if (!reading.ok) {
      rejected.push({ line: row.line, reason: reading.reason });
      continue;
    }
    const key = companyKey(reading.value.companyName);
    candidates.push({ ...reading.value, companyKey: key, identity: identityOf(key, reading.value.jobTitle) });
  }
  return { candidates, rejected };
};

/**
 * Company id of each company key — the user's companies first (RG-26: « Capgemini SE » goes to « Capgemini »), then
 * the companies of the rows, created in one statement, with the spelling of their first row.
 */
const resolveCompanyIds = async (
  tx: Executor,
  { userId, known, fresh }: { userId: number; known: Map<string, number>; fresh: readonly ImportCandidate[] },
): Promise<Map<string, number>> => {
  const missing = new Map<string, string>();
  for (const candidate of fresh) {
    if (!known.has(candidate.companyKey) && !missing.has(candidate.companyKey)) {
      missing.set(candidate.companyKey, candidate.companyName);
    }
  }
  const created = await repository.upsertCompanies(
    tx,
    [...missing.values()].map((name) => ({ userId, name, nameKey: normalizeKey(name) })),
  );
  const ids = new Map(known);
  for (const company of created) ids.set(companyKey(company.nameKey), company.id);
  return ids;
};

const idOf = (companyIds: ReadonlyMap<string, number>, key: string): number => {
  const id = companyIds.get(key);
  if (id === undefined) throw new Error('company of an imported row not resolved');
  return id;
};

/**
 * EF-CAN-23: creates, in the caller's transaction, an application for each valid row of the file that designates
 * none of the user's applications (RG-03 (a), (b)) nor an earlier row. The existing applications are read in one
 * query, the companies, applications and status histories written in one statement each.
 * @returns the created, ignored (duplicates) and refused rows — each refused row with its line and reason.
 * @throws HttpError 413, 415 or 400 for the file (see `previewCsvImport`); ValidationError for a mapping naming a
 * column the file does not have.
 * @req EF-CAN-23, RG-03, RG-25, RG-26, EF-AUT-06
 */
export const importCsvApplications = async (
  tx: Executor,
  { userId, body, now }: { userId: number; body: ImportBody; now: Date },
): Promise<ImportResult> => {
  const table = readCsvTable(decodeCsvFile(body.file));
  assertMappingFits(body.mapping, table);
  const { candidates, rejected } = readRows(table, { mapping: body.mapping, now });

  const known = new Map<string, number>();
  const taken = new Set<string>();
  for (const row of await repository.listApplicationKeys(tx, userId)) {
    const key = companyKey(row.companyNameKey);
    if (!known.has(key)) known.set(key, row.companyId);
    if (row.jobTitleKey !== null) taken.add(identityOf(key, row.jobTitleKey));
  }
  const fresh = candidates.filter((candidate) => {
    if (taken.has(candidate.identity)) return false;
    taken.add(candidate.identity);
    return true;
  });

  const companyIds = await resolveCompanyIds(tx, { userId, known, fresh });
  const inserted = await repository.insertApplications(
    tx,
    fresh.map((candidate) => ({
      companyId: idOf(companyIds, candidate.companyKey),
      jobTitle: candidate.jobTitle,
      jobTitleKey: normalizeKey(candidate.jobTitle),
      status: candidate.status,
      source: 'manual' as const,
      notes: candidate.notes,
      appliedAt: candidate.appliedAt,
      lastActivityAt: candidate.appliedAt,
    })),
  );
  await repository.insertStatusChanges(
    tx,
    inserted.map((application) => ({
      applicationId: application.id,
      status: application.status,
      changedAt: application.appliedAt,
      origin: 'manual' as const,
    })),
  );
  return { created: inserted.length, duplicates: candidates.length - inserted.length, rejected };
};
