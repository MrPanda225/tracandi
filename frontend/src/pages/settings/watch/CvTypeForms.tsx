import { type FormEvent, useId, useState } from 'react';
import { CV_TYPE_LABEL_MAX_LENGTH, type CvType } from '../../../api/cvTypes';
import { describeFileRefusal, PDF_TYPE } from '../../../lib/cvFile';

/** EF-CVX-39: same bounds and words as the API. */
const describeLabelRefusal = (label: string): string | null => {
  const length = label.trim().length;
  if (length === 0) return 'Donnez un libellé à ce CV type.';
  return length > CV_TYPE_LABEL_MAX_LENGTH ? 'Le libellé dépasse 80 caractères : gardez l’essentiel.' : null;
};

/** The PDF field, with the refusal under it as soon as a file is chosen (EF-CVX-21 words, ENF-SEC-22). */
function PdfField({
  label,
  hint,
  problem,
  isDisabled,
  onChange,
}: {
  label: string;
  hint: string;
  problem: string | null;
  isDisabled: boolean;
  onChange: (file: File | null) => void;
}) {
  const fileId = useId();
  const hintId = useId();
  const errorId = useId();
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={fileId}>
        {label}
      </label>
      <input
        id={fileId}
        className="control"
        type="file"
        accept={`${PDF_TYPE},.pdf`}
        disabled={isDisabled}
        aria-invalid={problem !== null}
        aria-describedby={problem ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <p id={hintId} className="form-field__hint">
        {hint}
      </p>
      {problem && (
        <p id={errorId} className="form-field__error">
          {problem}
        </p>
      )}
    </div>
  );
}

/** EF-CVX-39: a label and a PDF; the label is checked when the candidate sends, the file as soon as it is chosen. */
export function ImportForm({
  isBusy,
  onImport,
}: {
  isBusy: boolean;
  onImport: (label: string, file: File) => void;
}) {
  const labelId = useId();
  const labelHintId = useId();
  const labelErrorId = useId();
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [hasTried, setHasTried] = useState(false);
  const labelProblem = hasTried ? describeLabelRefusal(label) : null;
  const fileProblem =
    (file && describeFileRefusal(file)) ?? (hasTried && !file ? 'Choisissez le PDF de ce CV.' : null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setHasTried(true);
    if (!file || describeFileRefusal(file) || describeLabelRefusal(label)) return;
    onImport(label.trim(), file);
  };

  return (
    <form className="watch-form" aria-label="Importer un CV type" noValidate onSubmit={handleSubmit}>
      <div className="form-field">
        <label className="form-field__label" htmlFor={labelId}>
          Libellé du CV type
        </label>
        <input
          id={labelId}
          className="control"
          value={label}
          disabled={isBusy}
          aria-invalid={labelProblem !== null}
          aria-describedby={labelProblem ? `${labelHintId} ${labelErrorId}` : labelHintId}
          onChange={(event) => setLabel(event.target.value)}
        />
        <p id={labelHintId} className="form-field__hint">
          Le métier que ce CV vise, par exemple « Data analyst » ou « Développeur ». 80 caractères au plus.
        </p>
        {labelProblem && (
          <p id={labelErrorId} className="form-field__error">
            {labelProblem}
          </p>
        )}
      </div>
      <PdfField
        label="Fichier PDF"
        hint="PDF de 5 Mo au plus, scan accepté."
        problem={fileProblem}
        isDisabled={isBusy}
        onChange={setFile}
      />
      <div>
        <button type="submit" className="btn" disabled={isBusy} aria-busy={isBusy}>
          {isBusy ? 'Import en cours…' : 'Importer ce CV type'}
        </button>
      </div>
    </form>
  );
}

/** EF-CVX-41: the new file of a CV type; the profile deduced from the old one is wiped and worked out again. */
export function ReplaceForm({
  cv,
  isBusy,
  isReplacing,
  onReplace,
  onCancel,
}: {
  cv: CvType;
  isBusy: boolean;
  isReplacing: boolean;
  onReplace: (file: File) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const problem = file ? describeFileRefusal(file) : null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (file && !problem) onReplace(file);
  };

  return (
    <form
      className="watch-form"
      aria-label={`Remplacer le fichier du CV type ${cv.label}`}
      onSubmit={handleSubmit}
    >
      <PdfField
        label={`Nouveau fichier du CV type ${cv.label}`}
        hint="PDF de 5 Mo au plus. Le profil déduit de l’ancien fichier est effacé, puis recalculé."
        problem={problem}
        isDisabled={isBusy}
        onChange={setFile}
      />
      <div className="gmail-card__buttons">
        <button type="button" className="btn btn--quiet" disabled={isBusy} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="submit"
          className="btn"
          disabled={isBusy || file === null || problem !== null}
          aria-busy={isReplacing}
        >
          {isReplacing ? 'Remplacement en cours…' : 'Remplacer'}
        </button>
      </div>
    </form>
  );
}

/** EF-CVX-42: the deletion says what goes with the CV type and what stays (HIG: destructive, confirmed). */
export function ConfirmDeletion({
  isBusy,
  onConfirm,
  onCancel,
}: {
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="watch-confirm">
      <p className="gmail-card__hint">
        Supprimer ce CV type efface aussi le profil qui en a été déduit ; les critères que vous avez déjà
        validés restent.
      </p>
      <div className="gmail-card__buttons">
        <button type="button" className="btn btn--quiet" disabled={isBusy} onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn--danger"
          disabled={isBusy}
          aria-busy={isBusy}
          onClick={onConfirm}
        >
          {isBusy ? 'Suppression…' : 'Confirmer la suppression'}
        </button>
      </div>
    </div>
  );
}
