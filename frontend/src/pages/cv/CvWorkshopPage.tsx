import { type FormEvent, useId, useState } from 'react';
import { CV_MAX_BYTES, OFFER_MAX_LENGTH, OFFER_MIN_LENGTH } from '../../api/cvWorkshop';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { DiagnosisResult } from './DiagnosisResult';
import { type AnalysisStep, useCvAnalysis } from './useCvAnalysis';
import './CvWorkshopPage.css';

const PDF_TYPE = 'application/pdf';
const numberFormat = new Intl.NumberFormat('fr-FR');

/** EF-CVX-21: checked here to answer at once; the API checks the content again (ENF-SEC-22). */
const describeFileRefusal = (file: File): string | null => {
  const isPdf = file.type === PDF_TYPE || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Ce fichier n’est pas un PDF. Exportez votre CV en PDF, puis réessayez.';
  if (file.size > CV_MAX_BYTES) return 'Votre CV dépasse 5 Mo : essayez une version plus légère.';
  return null;
};

/** EF-CVX-23: same bounds and words as the API. */
const describeOfferRefusal = (offer: string): string | null => {
  const length = offer.trim().length;
  if (length < OFFER_MIN_LENGTH) return 'L’offre semble incomplète : collez le texte entier de l’annonce.';
  if (length > OFFER_MAX_LENGTH) return 'L’offre dépasse 20 000 caractères : gardez l’essentiel de l’annonce.';
  return null;
};

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
      <p className="form-field__hint">Comptez une minute environ, un peu plus pour un scan.</p>
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
  const fileId = useId();
  const fileHintId = useId();
  const fileErrorId = useId();
  const offerId = useId();
  const offerHintId = useId();
  const offerErrorId = useId();
  const [hasTriedOffer, setHasTriedOffer] = useState(false);
  // The field shows the file it was given; a CV kept from the previous analysis is named under an empty field.
  const [hasPickedHere, setHasPickedHere] = useState(false);
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
        <label htmlFor={fileId} className="form-field__label">
          1. Votre CV
        </label>
        <p id={fileHintId} className="form-field__hint">
          En PDF, 5 Mo au plus. Un scan marche aussi, c’est juste un peu plus long.
        </p>
        <input
          id={fileId}
          className="control"
          type="file"
          accept={`${PDF_TYPE},.pdf`}
          aria-describedby={fileRefusal ? `${fileHintId} ${fileErrorId}` : fileHintId}
          aria-invalid={fileRefusal !== null}
          disabled={isRunning}
          onChange={(event) => {
            setHasPickedHere(true);
            onFileChange(event.target.files?.[0] ?? null);
          }}
        />
        {file && !fileRefusal && !hasPickedHere && (
          <p className="form-field__hint">Votre CV : {file.name}. Choisissez-en un autre si besoin.</p>
        )}
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
          Collez le texte complet de l’annonce : missions, profil recherché, outils.
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
        <p>Déposez votre CV, collez une offre : on vous dit ce qui colle et ce qui manque.</p>
      </PageHeader>
      <div className="cv-workshop">
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
