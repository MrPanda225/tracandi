import { type ReactNode, useState } from 'react';
import { messageOf } from '../../../api/client';
import {
  CV_TYPES_RECOMMENDED,
  type CvType,
  type CvTypeList,
  deleteCvType,
  importCvType,
  replaceCvType,
} from '../../../api/cvTypes';
import { Flash } from '../../../components/Flash';
import { toBase64 } from '../../../lib/cvFile';
import { LEVEL_LABELS } from '../../../lib/experience';
import { plural } from '../../../lib/format';
import type { Notice } from '../GmailSettings';
import { ConfirmDeletion, ImportForm, ReplaceForm } from './CvTypeForms';
import { LoadFailure, PanelLoading, WatchSection } from './SectionParts';
import type { Resource } from './useResource';
import { type FollowedRun, isOngoing, useRunFollower } from './useRunFollower';

/** What the panel is busy with: while it is, nothing else of the CV types can be asked (ENF-UTI-03). */
type Activity =
  { kind: 'import'; label: string } | { kind: 'replace'; id: number; label: string } | { kind: 'delete' };

/** The row whose form is open — replacing its file, or confirming its deletion; one at a time. */
type OpenForm = { kind: 'replace' | 'delete'; id: number };

const READING_FAILED = 'La lecture du CV n’a pas abouti. Réessayez dans un instant.';

/** EF-CVX-39: where the candidate stands with the three or four CV types they are invited to provide. */
const describeCount = (count: number, maxItems: number): string => {
  const held = `${plural(count, 'CV type')} sur ${String(maxItems)}`;
  if (count >= maxItems) return `${held} : supprimez-en un pour en importer un autre.`;
  if (count >= CV_TYPES_RECOMMENDED) {
    return `${held} : c’est ce que nous vous conseillons. Vous pouvez en ajouter un de plus.`;
  }
  const start = count === 0 ? 'Aucun CV type pour l’instant.' : `${held}.`;
  return `${start} Importez-en ${String(CV_TYPES_RECOMMENDED)} ou ${String(maxItems)} pour que Tracandi cerne bien votre profil.`;
};

const STEPS = ['Lecture du CV', 'Déduction du profil'];

/** EF-CVX-43: the reading, then the deduction — the steps the API publishes in `cv_steps_done` (ENF-UTI-03). */
function ReadingProgress({ run }: { run: FollowedRun }) {
  return (
    <div className="watch-progress" role="status" aria-live="polite" aria-label="Avancement de l’import">
      <ol className="watch-progress__steps">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className="watch-progress__step"
            aria-current={index === run.stepsDone ? 'step' : undefined}
          >
            <span className="watch-progress__marker" aria-hidden="true">
              {index < run.stepsDone ? '✓' : String(index + 1)}
            </span>
            <span>{index < run.stepsDone ? `${step} : fait.` : `${step}…`}</span>
          </li>
        ))}
      </ol>
      <p className="gmail-card__hint">
        {run.outcome === 'queued'
          ? 'En attente de son tour…'
          : 'Cela peut prendre quelques minutes : vous pouvez rester sur cette page.'}
      </p>
    </div>
  );
}

/** One CV type: what is kept of it, and what the candidate can do with it (EF-CVX-39, EF-CVX-41, EF-CVX-42). */
function CvTypeRow({
  cv,
  isBusy,
  onOpen,
  children,
}: {
  cv: CvType;
  isBusy: boolean;
  onOpen: (kind: OpenForm['kind']) => void;
  children?: ReactNode;
}) {
  return (
    <li className="watch-item">
      <div className="watch-item__main">
        <div className="watch-item__title">
          <strong>{cv.label}</strong>
          {cv.deductionReady && <span className="watch-tag">Profil à valider</span>}
        </div>
        <p className="gmail-card__hint">
          {cv.years !== null && cv.level !== null
            ? `${plural(cv.years, 'an')} d’expérience · ${LEVEL_LABELS[cv.level]}`
            : 'Années et niveau non déterminés'}
        </p>
      </div>
      <div className="watch-item__actions">
        <button
          type="button"
          className="btn btn--quiet btn--small"
          disabled={isBusy}
          aria-label={`Remplacer le fichier du CV type ${cv.label}`}
          onClick={() => onOpen('replace')}
        >
          Remplacer le fichier
        </button>
        <button
          type="button"
          className="btn btn--quiet btn--small btn--quiet-danger"
          disabled={isBusy}
          aria-label={`Supprimer le CV type ${cv.label}`}
          onClick={() => onOpen('delete')}
        >
          Supprimer
        </button>
      </div>
      {children}
    </li>
  );
}

interface CvTypesPanelProps {
  cvTypes: Resource<CvTypeList>;
  /** Reads the CV types again: after an import, a replacement or a deletion. */
  onChange: () => Promise<void>;
}

/**
 * EF-CVX-39 to EF-CVX-43: the CV types the candidate keeps — three or four, a label each and the years and level
 * deduced from the file, which is never kept. An import or a replacement is queued: the API answers at once with the
 * run, the panel follows its two steps and disables its buttons until it ends (ENF-UTI-03, EF-EXE-04).
 */
export function CvTypesPanel({ cvTypes, onChange }: CvTypesPanelProps) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [openForm, setOpenForm] = useState<OpenForm | null>(null);
  const [importKey, setImportKey] = useState(0);
  const isBusy = activity !== null;

  const handleRunEnd = async (run: FollowedRun) => {
    const ended = activity;
    setActivity(null);
    if (run.outcome !== 'success') {
      setNotice({ tone: 'error', text: run.error ?? READING_FAILED });
      return;
    }
    if (ended?.kind === 'import') {
      setNotice({
        tone: 'success',
        text: `« ${ended.label} » est importé : son profil est à valider ci-dessous.`,
      });
      setImportKey((key) => key + 1);
    } else if (ended?.kind === 'replace') {
      setNotice({
        tone: 'success',
        text: `Le fichier de « ${ended.label} » est remplacé : son profil est à valider ci-dessous.`,
      });
      setOpenForm(null);
    }
    await onChange();
  };

  const { followed, follow } = useRunFollower((run) => void handleRunEnd(run));

  /** Sends the PDF, then follows the run the API queued; a refusal ends the activity at once, with its message. */
  const handleQueue = async (
    started: Activity,
    send: (fileBase64: string) => Promise<{ runId: number }>,
    file: File,
  ) => {
    setActivity(started);
    setNotice(null);
    try {
      follow((await send(await toBase64(file))).runId);
    } catch (failure) {
      setActivity(null);
      setNotice({ tone: 'error', text: messageOf(failure) });
    }
  };

  const handleImport = (label: string, file: File) =>
    void handleQueue({ kind: 'import', label }, (fileBase64) => importCvType(label, fileBase64), file);

  const handleReplace = (cv: CvType, file: File) =>
    void handleQueue(
      { kind: 'replace', id: cv.id, label: cv.label },
      (fileBase64) => replaceCvType(cv.id, fileBase64),
      file,
    );

  const handleDelete = async (cv: CvType) => {
    setActivity({ kind: 'delete' });
    setNotice(null);
    try {
      await deleteCvType(cv.id);
      setNotice({
        tone: 'success',
        text: `« ${cv.label} » est supprimé, avec le profil qui en avait été déduit. Vos critères validés restent.`,
      });
    } catch (failure) {
      setNotice({ tone: 'error', text: messageOf(failure) });
    } finally {
      setOpenForm(null);
      setActivity(null);
      await onChange();
    }
  };

  const list = cvTypes.status === 'ready' ? cvTypes.value : null;
  const isFull = list !== null && list.items.length >= list.maxItems;

  return (
    <WatchSection title="CV types">
      <p className="gmail-card__hint">
        Un CV par métier que vous visez. Tracandi les lit pour en déduire vos années d’expérience, votre
        niveau et les offres à chercher. Le fichier n’est jamais conservé : seuls le libellé et ce qui en est
        déduit le sont.
      </p>
      {cvTypes.status === 'loading' && <PanelLoading label="Chargement de vos CV types…" />}
      {cvTypes.status === 'error' && (
        <LoadFailure message={cvTypes.message} onRetry={() => void onChange()} />
      )}
      {list && <p className="watch-count">{describeCount(list.items.length, list.maxItems)}</p>}
      {notice && <Flash tone={notice.tone}>{notice.text}</Flash>}
      {list && list.items.length > 0 && (
        <ul className="watch-items" aria-label="Vos CV types">
          {list.items.map((cv) => {
            const form = openForm?.id === cv.id ? openForm.kind : null;
            return (
              <CvTypeRow
                key={cv.id}
                cv={cv}
                isBusy={isBusy}
                onOpen={(kind) => {
                  setNotice(null);
                  setOpenForm({ kind, id: cv.id });
                }}
              >
                {form === 'replace' && (
                  <ReplaceForm
                    cv={cv}
                    isBusy={isBusy}
                    isReplacing={activity?.kind === 'replace' && activity.id === cv.id}
                    onReplace={(file) => handleReplace(cv, file)}
                    onCancel={() => setOpenForm(null)}
                  />
                )}
                {form === 'delete' && (
                  <ConfirmDeletion
                    isBusy={isBusy}
                    onConfirm={() => void handleDelete(cv)}
                    onCancel={() => setOpenForm(null)}
                  />
                )}
              </CvTypeRow>
            );
          })}
        </ul>
      )}
      {followed && isOngoing(followed) && <ReadingProgress run={followed} />}
      {list && !isFull && <ImportForm key={importKey} isBusy={isBusy} onImport={handleImport} />}
    </WatchSection>
  );
}
