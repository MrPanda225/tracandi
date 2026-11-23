import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
  CSV_MAX_BYTES,
  IMPORT_FIELDS,
  type ImportField,
  type ImportMapping,
  type ImportPreview,
  type ImportResult,
  importApplications,
  previewApplicationsImport,
} from '../../api/applications';
import { ApiError, messageOf } from '../../api/client';
import { Flash } from '../../components/Flash';
import { toBase64 } from '../../lib/cvFile';
import { fieldErrorsFrom } from '../../lib/fieldErrors';
import { plural } from '../../lib/format';
import './CsvImportPanel.css';

const STEPS = ['Fichier', 'Colonnes', 'Résultat'] as const;
type Step = 0 | 1 | 2;

const FIELD_LABELS: Record<ImportField, string> = {
  company: 'Entreprise',
  jobTitle: 'Intitulé du poste',
  link: 'Lien de l’offre',
  appliedAt: 'Date de candidature',
  status: 'Statut',
  notes: 'Notes',
};

const FIELD_HINTS: Partial<Record<ImportField, string>> = {
  company: 'Obligatoire.',
  jobTitle: '« Candidature » quand la case est vide.',
  link: 'Ajouté en tête des notes de la candidature.',
  appliedAt: 'JJ/MM/AAAA, AAAA-MM-JJ ou JJ/MM/AA ; aujourd’hui quand la case est vide.',
  status: 'Libellé en français ou en anglais ; « Envoyée » quand la case est vide.',
};

type MappingErrors = Partial<Record<ImportField, string>>;
const API_MAPPING_FIELDS: Readonly<Record<string, ImportField>> = Object.fromEntries(
  IMPORT_FIELDS.map((field) => [`body.mapping.${field}`, field]),
);

const CSV_TYPES = 'text/csv,.csv';

/** EF-CAN-23: why a chosen file is refused before sending it, or null; the API checks the content again. */
const describeCsvRefusal = (file: File | null): string | null => {
  if (!file) return 'Choisissez le fichier CSV de votre tableau.';
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
  if (!isCsv) return 'Ce fichier n’est pas un CSV. Exportez votre tableau au format CSV, puis réessayez.';
  if (file.size > CSV_MAX_BYTES) return 'Le fichier dépasse 1 Mo : gardez seulement les colonnes utiles.';
  return null;
};

/** Name of a column on screen: its header, or its position when the header is blank. */
const columnName = (headers: readonly string[], column: number): string =>
  headers[column]?.trim() || `Colonne ${String(column + 1)}`;

/** EF-CAN-23: the company is required, and a column fills one field at most. */
const mappingErrorsOf = (mapping: ImportMapping): MappingErrors => {
  const errors: MappingErrors = {};
  if (mapping.company === null) errors.company = 'Choisissez la colonne qui donne l’entreprise.';
  const seen = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field];
    if (column === null) continue;
    if (seen.has(column)) errors[field] = 'Cette colonne remplit déjà un autre champ.';
    seen.add(column);
  }
  return errors;
};

function StepList({ step }: { step: Step }) {
  return (
    <ol className="csv-import__steps">
      {STEPS.map((label, index) => (
        <li key={label} className="csv-import__step" aria-current={index === step ? 'step' : undefined}>
          <span className="csv-import__step-number" aria-hidden="true">
            {index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

interface FileStepProps {
  onRead: (read: { file: string; fileName: string; preview: ImportPreview }) => void;
  onCancel: () => void;
}

/** Step 1: the file, checked here then read by the API. */
function FileStep({ onRead, onCancel }: FileStepProps) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const refusal = describeCsvRefusal(file);
    setError(refusal);
    if (refusal || !file) return;
    setIsReading(true);
    try {
      const content = await toBase64(file);
      onRead({ file: content, fileName: file.name, preview: await previewApplicationsImport(content) });
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : 'Votre navigateur n’a pas pu lire ce fichier.',
      );
      setIsReading(false);
    }
  };

  return (
    <form className="csv-import__form" noValidate onSubmit={(event) => void handleSubmit(event)}>
      <div className="form-field">
        <label className="form-field__label" htmlFor={inputId}>
          Fichier CSV
        </label>
        <input
          id={inputId}
          className="control csv-import__file"
          type="file"
          accept={CSV_TYPES}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        {error ? (
          <p id={`${inputId}-error`} className="form-field__error">
            {error}
          </p>
        ) : (
          <p id={`${inputId}-hint`} className="form-field__hint">
            Depuis Google Sheets : Fichier › Télécharger › Valeurs séparées par des virgules. 1 Mo et 1 000
            lignes au plus ; la première ligne nomme les colonnes.
          </p>
        )}
      </div>
      <div className="csv-import__actions">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={isReading} aria-busy={isReading}>
          {isReading ? 'Lecture…' : 'Lire le fichier'}
        </button>
      </div>
    </form>
  );
}

const LINK_PATTERN = /^https?:\/\/\S+$/iu;

/**
 * A cell of the preview. A link is cut with an ellipsis, its full address in its title, so that it never squeezes
 * the other columns on a phone.
 */
function PreviewCell({ value }: { value: string }) {
  if (!LINK_PATTERN.test(value)) return <td>{value}</td>;
  return (
    <td>
      <span className="csv-import__link" title={value}>
        {value}
      </span>
    </td>
  );
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  const captionId = useId();
  return (
    // Scrolls sideways on a phone instead of widening the page; focusable so that the keyboard can scroll it.
    <div className="csv-import__preview" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className="csv-import__table">
        <caption id={captionId} className="csv-import__caption">
          Aperçu :{' '}
          {plural(Math.min(preview.rows.length, preview.totalRows), 'première ligne', 'premières lignes')} sur{' '}
          {plural(preview.totalRows, 'ligne')}
        </caption>
        <thead>
          <tr>
            {preview.headers.map((_, column) => (
              <th key={column} scope="col">
                {columnName(preview.headers, column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, index) => (
            <tr key={index}>
              {preview.headers.map((_, column) => (
                <PreviewCell key={column} value={row[column] ?? ''} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ColumnSelectProps {
  field: ImportField;
  headers: readonly string[];
  value: number | null;
  error: string | undefined;
  onChange: (column: number | null) => void;
}

function ColumnSelect({ field, headers, value, error, onChange }: ColumnSelectProps) {
  const id = useId();
  const hint = FIELD_HINTS[field];
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {FIELD_LABELS[field]}
      </label>
      <select
        id={id}
        className="control"
        value={value === null ? '' : String(value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      >
        <option value="">Aucune colonne</option>
        {headers.map((_, column) => (
          <option key={column} value={column}>
            {columnName(headers, column)}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className="form-field__error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="form-field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

interface MappingStepProps {
  file: string;
  fileName: string;
  preview: ImportPreview;
  onImported: (result: ImportResult) => void;
  onBack: () => void;
}

/** Step 2: the column of each field, proposed by the API from the column names, beside the first rows. */
function MappingStep({ file, fileName, preview, onImported, onBack }: MappingStepProps) {
  const [mapping, setMapping] = useState<ImportMapping>(preview.mapping);
  const [errors, setErrors] = useState<MappingErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const localErrors = mappingErrorsOf(mapping);
    setErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;
    setIsImporting(true);
    setError(null);
    try {
      onImported(await importApplications(file, mapping));
    } catch (failure) {
      setError(messageOf(failure));
      if (failure instanceof ApiError) setErrors(fieldErrorsFrom(failure.details, API_MAPPING_FIELDS));
      setIsImporting(false);
    }
  };

  return (
    <form className="csv-import__form" noValidate onSubmit={(event) => void handleSubmit(event)}>
      <p className="csv-import__file-name">
        {fileName} · {plural(preview.totalRows, 'ligne')} de candidatures
      </p>
      {error && <Flash>{error}</Flash>}
      <PreviewTable preview={preview} />
      <fieldset className="csv-import__mapping">
        <legend className="csv-import__legend">Quelle colonne donne chaque information ?</legend>
        {IMPORT_FIELDS.map((field) => (
          <ColumnSelect
            key={field}
            field={field}
            headers={preview.headers}
            value={mapping[field]}
            error={errors[field]}
            onChange={(column) => setMapping((current) => ({ ...current, [field]: column }))}
          />
        ))}
      </fieldset>
      <div className="csv-import__actions">
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          Changer de fichier
        </button>
        <button type="submit" className="btn" disabled={isImporting} aria-busy={isImporting}>
          {isImporting ? 'Import…' : `Importer ${plural(preview.totalRows, 'ligne')}`}
        </button>
      </div>
    </form>
  );
}

/** Step 3: what was created, ignored and refused, each refused row with its line. */
function ResultStep({
  result,
  onRestart,
  onClose,
}: {
  result: ImportResult;
  onRestart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="csv-import__form">
      <ul className="csv-import__summary">
        <li>
          <strong>{plural(result.created, 'candidature ajoutée', 'candidatures ajoutées')}</strong>
        </li>
        <li>
          {plural(result.duplicates, 'ligne ignorée', 'lignes ignorées')} : candidature déjà enregistrée ou
          répétée dans le fichier
        </li>
        <li>{plural(result.rejected.length, 'ligne refusée', 'lignes refusées')}</li>
      </ul>
      {result.rejected.length > 0 && (
        <ul className="csv-import__rejected" aria-label="Lignes refusées">
          {result.rejected.map((row) => (
            <li key={row.line}>
              <span className="csv-import__line">Ligne {row.line}</span> {row.reason}
            </li>
          ))}
        </ul>
      )}
      <div className="csv-import__actions">
        <button type="button" className="btn btn--quiet" onClick={onRestart}>
          Importer un autre fichier
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

const STEP_TITLES: Record<Step, string> = {
  0: 'Choisir le fichier',
  1: 'Associer les colonnes',
  2: 'Résultat de l’import',
};

interface CsvImportPanelProps {
  id: string;
  /** Called once applications were created, so that the list behind the panel shows them. */
  onImported: () => void;
  onClose: () => void;
}

/**
 * EF-CAN-23: imports the applications of a CSV file in three steps — the file, the column of each field beside the
 * first rows, the result (created, ignored as duplicates, refused with their line and reason).
 */
export function CsvImportPanel({ id, onImported, onClose }: CsvImportPanelProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>(0);
  const [read, setRead] = useState<{ file: string; fileName: string; preview: ImportPreview } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Each step replaces the previous one: focus goes to its title, so that the keyboard and screen reader follow.
  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  const restart = () => {
    setRead(null);
    setResult(null);
    setStep(0);
  };

  return (
    <section id={id} className="csv-import" aria-labelledby={titleId}>
      <StepList step={step} />
      <h2 id={titleId} ref={titleRef} className="csv-import__title" tabIndex={-1}>
        {STEP_TITLES[step]}
      </h2>
      {step === 0 && (
        <FileStep
          onRead={(fileRead) => {
            setRead(fileRead);
            setStep(1);
          }}
          onCancel={onClose}
        />
      )}
      {step === 1 && read && (
        <MappingStep
          {...read}
          onBack={restart}
          onImported={(imported) => {
            setResult(imported);
            setStep(2);
            if (imported.created > 0) onImported();
          }}
        />
      )}
      {step === 2 && result && <ResultStep result={result} onRestart={restart} onClose={onClose} />}
    </section>
  );
}
