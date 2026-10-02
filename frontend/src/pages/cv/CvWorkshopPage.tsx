import { type DragEvent, type FormEvent, useId, useState } from 'react';
import { OFFER_MAX_LENGTH, OFFER_MIN_LENGTH } from '../../api/cvWorkshop';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { describeFileRefusal, PDF_TYPE } from '../../lib/cvFile';
import { DiagnosisResult } from './DiagnosisResult';
import { type AnalysisStep, useCvAnalysis } from './useCvAnalysis';
import './CvWorkshopPage.css';

const numberFormat = new Intl.NumberFormat('fr-FR');

/** EF-CVX-23: same bounds and words as the API. */
const describeOfferRefusal = (offer: string): string | null => {
  const length = offer.trim().length;
  if (length < OFFER_MIN_LENGTH) return 'L’offre semble incomplète : collez le texte entier de l’annonce.';
  if (length > OFFER_MAX_LENGTH) return 'L’offre dépasse 20 000 caractères : gardez l’essentiel de l’annonce.';
  return null;
};

const sizeFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

/** « 245 Ko », « 1,2 Mo »: the size the way a file explorer says it. */
const describeSize = (bytes: number): string =>
  bytes >= BYTES_PER_MB
    ? `${sizeFormat.format(bytes / BYTES_PER_MB)} Mo`
    : `${String(Math.max(1, Math.round(bytes / BYTES_PER_KB)))} Ko`;

/**
 * EF-CVX-21: the CV, dropped or chosen, in French words rather than the browser's own button. The native field stays
 * inside, visually hidden: keyboard, screen readers and the file picker work as usual (WCAG 2.1.1).
 */
function CvFileZone({
  file,
  isDisabled,
  refusal,
  labelId,
  hintId,
  errorId,
  onFileChange,
}: {
  file: File | null;
  isDisabled: boolean;
  refusal: string | null;
  labelId: string;
  hintId: string;
  errorId: string;
  onFileChange: (file: File | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (!isDisabled && dropped) onFileChange(dropped);
  };
  return (
    <label
      className="cv-drop"
      data-dragging={isDragging || undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isDisabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        className="visually-hidden"
        type="file"
        accept={`${PDF_TYPE},.pdf`}
        aria-labelledby={labelId}
        aria-describedby={refusal ? `${hintId} ${errorId}` : hintId}
        aria-invalid={refusal !== null}
        disabled={isDisabled}
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      <svg className="cv-drop__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </svg>
      {file ? (
        <span className="cv-drop__text">
          <span className="cv-drop__name">{file.name}</span>
          <span className="cv-drop__meta">
            {describeSize(file.size)} · <span className="cv-drop__link">Changer de fichier</span>
          </span>
        </span>
      ) : (
        <span className="cv-drop__text">
          <span className="cv-drop__name">Glissez votre CV ici</span>
          <span className="cv-drop__meta">
            ou <span className="cv-drop__link">choisissez un fichier</span>
          </span>
        </span>
      )}
    </label>
  );
}

const STEPS: readonly string[] = ['On lit votre CV…', 'On le compare à l’offre…', 'On l’adapte à l’offre…'];

/** EF-CVX-32: where the analysis stands, in words (ENF-UTI-03). */
function Progress({ step }: { step: AnalysisStep }) {
  return (
    <div className="cv-progress" role="status" aria-live="polite">
      <ol className="cv-progress__steps">
        {STEPS.map((label, index) => (
          <li key={label} className="cv-progress__step" aria-current={index === step ? 'step' : undefined}>
            <span className="cv-progress__marker" aria-hidden="true">
              {index < step ? '✓' : String(index + 1)}
            </span>
            {index < step ? <span>{label.replace('…', '')} : c’est fait.</span> : <span>{label}</span>}
          </li>
        ))}
      </ol>
      <p className="form-field__hint">Environ une minute.</p>
    </div>
  );
}

/** The form: the CV, then the offer, in the order the candidate thinks of them. */
function AnalysisForm({
  file,
  offer,
  isRunning,
  failure,
  onFileChange,
  onOfferChange,
  onSubmit,
}: {
  file: File | null;
  offer: string;
  isRunning: boolean;
  failure: string | null;
  onFileChange: (file: File | null) => void;
  onOfferChange: (offer: string) => void;
  onSubmit: () => void;
}) {
  const fileLabelId = useId();
  const fileHintId = useId();
  const fileErrorId = useId();
  const offerId = useId();
  const offerHintId = useId();
  const offerErrorId = useId();
  const [hasTriedOffer, setHasTriedOffer] = useState(false);
  const fileRefusal = file ? describeFileRefusal(file) : null;
  const offerRefusal = hasTriedOffer ? describeOfferRefusal(offer) : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasTriedOffer(true);
    if (!file || fileRefusal || describeOfferRefusal(offer)) return;
    onSubmit();
  };

  return (
    <form className="cv-card" onSubmit={handleSubmit} noValidate aria-label="Votre CV face à une offre">
      <div className="form-field">
        <p id={fileLabelId} className="form-field__label">
          1. Votre CV
        </p>
        <p id={fileHintId} className="form-field__hint">
          PDF de 5 Mo au plus, scan accepté.
        </p>
        <CvFileZone
          file={file}
          isDisabled={isRunning}
          refusal={fileRefusal}
          labelId={fileLabelId}
          hintId={fileHintId}
          errorId={fileErrorId}
          onFileChange={onFileChange}
        />
        {fileRefusal && (
          <p id={fileErrorId} className="form-field__error">
            {fileRefusal}
          </p>
        )}
      </div>

      <div className="form-field">
        <label htmlFor={offerId} className="form-field__label">
          2. L’offre qui vous intéresse
        </label>
        <p id={offerHintId} className="form-field__hint">
          L’annonce entière : missions, profil, outils.
        </p>
        <textarea
          id={offerId}
          className="control cv-offer"
          rows={8}
          value={offer}
          aria-describedby={offerRefusal ? `${offerHintId} ${offerErrorId}` : offerHintId}
          aria-invalid={offerRefusal !== null}
          disabled={isRunning}
          onChange={(event) => onOfferChange(event.target.value)}
          onBlur={() => offer.trim() !== '' && setHasTriedOffer(true)}
        />
        <p className="form-field__hint cv-offer__count">
          {numberFormat.format(offer.trim().length)} / {numberFormat.format(OFFER_MAX_LENGTH)} caractères
        </p>
        {offerRefusal && (
          <p id={offerErrorId} className="form-field__error">
            {offerRefusal}
          </p>
        )}
      </div>

      {failure && <Flash>{failure}</Flash>}
      <div>
        <button type="submit" className="btn" disabled={!file || fileRefusal !== null || isRunning}>
          {isRunning ? 'Analyse en cours…' : 'Analyser'}
        </button>
      </div>
    </form>
  );
}

/**
 * Atelier CV (EF-CVX-21 to 35): the candidate gives a PDF CV and the text of an offer; the API reads the CV in the
 * queue — scanned pages by OCR on the server — and diagnoses it against the offer. The result shows the overall
 * score, the four sub-scores explained, what to strengthen, and what the AI received. Nothing is stored (ENF-RGP-06).
 */
export function CvWorkshopPage() {
  const [file, setFile] = useState<File | null>(null);
  const [offer, setOffer] = useState('');
  const { state, analyse, reset } = useCvAnalysis();

  const handleAnotherOffer = () => {
    setOffer('');
    reset();
  };

  const done = state.status === 'done' ? state : null;
  return (
    <>
      <PageHeader title="Atelier CV">
        <p>Votre CV face à une offre : un score, et un CV adapté d’une page.</p>
      </PageHeader>
      <div className={done ? 'cv-workshop cv-workshop--result' : 'cv-workshop'}>
        {done ? (
          <DiagnosisResult runId={done.runId} analysis={done.analysis} onAnotherOffer={handleAnotherOffer} />
        ) : (
          <>
            <AnalysisForm
              file={file}
              offer={offer}
              isRunning={state.status === 'running'}
              failure={state.status === 'failed' ? state.message : null}
              onFileChange={setFile}
              onOfferChange={setOffer}
              onSubmit={() => {
                if (file) void analyse(file, offer.trim());
              }}
            />
            {state.status === 'running' && <Progress step={state.step} />}
          </>
        )}
      </div>
    </>
  );
}
