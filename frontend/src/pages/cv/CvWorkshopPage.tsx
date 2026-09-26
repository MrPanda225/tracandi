import { type FormEvent, useId, useState } from 'react';
import { CV_MAX_BYTES, type CvAnalysis, type CvContacts } from '../../api/cvWorkshop';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { useCvAnalysis } from './useCvAnalysis';
import './CvWorkshopPage.css';

const PDF_TYPE = 'application/pdf';

/** EF-CVX-21: checked here to answer at once; the API checks the content again (ENF-SEC-22). */
const describeRefusal = (file: File): string | null => {
  const isPdf = file.type === PDF_TYPE || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Seul un CV au format PDF est accepté.';
  if (file.size > CV_MAX_BYTES) return 'Le CV dépasse 5 Mo.';
  return null;
};

const CONTACT_ROWS: { label: string; valuesOf: (contacts: CvContacts) => string[] }[] = [
  { label: 'Nom', valuesOf: (contacts) => (contacts.name ? [contacts.name] : []) },
  { label: 'E-mail', valuesOf: (contacts) => contacts.emails },
  { label: 'Téléphone', valuesOf: (contacts) => contacts.phones },
  { label: 'Adresse', valuesOf: (contacts) => (contacts.address ? [contacts.address] : []) },
  { label: 'Liens', valuesOf: (contacts) => contacts.links },
];

/** ENF-RGP-07: what is kept aside, so that the candidate sees what the AI will never receive. */
function ContactsCard({ contacts }: { contacts: CvContacts }) {
  const titleId = useId();
  return (
    <section className="cv-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="cv-card__title">
        Coordonnées mises à part
      </h2>
      <p className="cv-card__lede">Jamais envoyées à l’IA : elles reviendront telles quelles dans votre CV adapté.</p>
      <dl className="cv-contacts">
        {CONTACT_ROWS.map(({ label, valuesOf }) => {
          const values = valuesOf(contacts);
          return (
            <div key={label} className="cv-contacts__row">
              <dt>{label}</dt>
              <dd>{values.length > 0 ? values.join(', ') : <span className="cv-contacts__none">non repéré</span>}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/** The text read, exactly as the AI will receive it (ENF-RGP-07). */
function ReadingResult({ analysis, onRestart }: { analysis: CvAnalysis; onRestart: () => void }) {
  const titleId = useId();
  const { text, contacts, ocrPageCount } = analysis.reading;
  return (
    <>
      <Flash tone="success">
        Votre CV est lu.
        {ocrPageCount > 0 &&
          ` ${String(ocrPageCount)} page${ocrPageCount > 1 ? 's' : ''} lue${ocrPageCount > 1 ? 's' : ''} par ` +
            'reconnaissance de caractères : relisez le texte ci-dessous.'}
      </Flash>
      <ContactsCard contacts={contacts} />
      <section className="cv-card" aria-labelledby={titleId}>
        <h2 id={titleId} className="cv-card__title">
          Texte lu, tel que l’IA le recevra
        </h2>
        <p className="cv-card__lede">
          Si une coordonnée apparaît encore ici, elle n’a pas été repérée : signalez-le avant d’aller plus loin.
        </p>
        <pre className="cv-text" tabIndex={0}>
          {text}
        </pre>
      </section>
      <p className="cv-workshop__note">
        Rien n’est conservé : ce résultat est effacé 30 minutes après la lecture. L’analyse d’une offre et le CV adapté
        arrivent aux prochaines étapes.
      </p>
      <button type="button" className="btn btn--quiet" onClick={onRestart}>
        Lire un autre CV
      </button>
    </>
  );
}

/**
 * Atelier CV, first step (EF-CVX-21, EF-CVX-22, EF-CVX-32): the candidate imports a PDF CV, the API reads it in the
 * queue — scanned pages by OCR on the server — and the screen shows the text the AI will receive and the contact
 * details kept aside. Nothing is stored (ENF-RGP-06).
 */
export function CvWorkshopPage() {
  const inputId = useId();
  const hintId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { state, analyse, reset } = useCvAnalysis();
  const isReading = state.status === 'reading';

  const handleChoose = (chosen: File | null) => {
    setFile(chosen);
    setRefusal(chosen ? describeRefusal(chosen) : null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || refusal) return;
    void analyse(file);
  };

  const handleRestart = () => {
    setFile(null);
    setRefusal(null);
    reset();
  };

  return (
    <>
      <PageHeader title="Atelier CV">
        <p>Importez votre CV en PDF : Tracandi le lit, puis l’adaptera à une offre. Rien n’est conservé.</p>
      </PageHeader>
      <div className="cv-workshop">
        {state.status === 'done' ? (
          <ReadingResult analysis={state.analysis} onRestart={handleRestart} />
        ) : (
          <form className="cv-card" onSubmit={handleSubmit} noValidate aria-label="Votre CV">
            <h2 className="cv-card__title">1. Votre CV</h2>
            <div className="form-field">
              <label htmlFor={inputId} className="form-field__label">
                CV au format PDF, 5 Mo au plus
              </label>
              <input
                id={inputId}
                className="control"
                type="file"
                accept={`${PDF_TYPE},.pdf`}
                aria-describedby={hintId}
                aria-invalid={refusal !== null}
                disabled={isReading}
                onChange={(event) => handleChoose(event.target.files?.[0] ?? null)}
              />
              <p id={hintId} className="form-field__hint">
                Un CV scanné est lu par reconnaissance de caractères, sur notre serveur : comptez jusqu’à une minute
                par page.
              </p>
            </div>
            {refusal && <Flash>{refusal}</Flash>}
            {state.status === 'failed' && <Flash>{state.message}</Flash>}
            <div>
              <button type="submit" className="btn" disabled={!file || refusal !== null || isReading}>
                {isReading ? 'Lecture en cours…' : 'Lire mon CV'}
              </button>
            </div>
            {isReading && (
              <p className="form-field__hint" role="status" aria-live="polite">
                Lecture de votre CV dans la file d’attente…
              </p>
            )}
          </form>
        )}
      </div>
    </>
  );
}
