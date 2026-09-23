import { useEffect, useState } from 'react';
import { ApiError, isAbortError, messageOf } from '../../api/client';
import {
  type CandidateProfile,
  CONTRACT_LABELS,
  emptyProfile,
  fetchProfile,
  saveProfile,
} from '../../api/profile';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { CvPreview } from './CvPreview';
import { ProfileForm } from './ProfileForm';
import './CvWorkshopPage.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'absent' }
  | { status: 'ready'; profile: CandidateProfile };

const NOT_FOUND = 404;

/**
 * EF-CVX-01 : ce que le profil porte et que le CV n'affiche pas — la zone de recherche et les cibles, qui
 * servent à noter les offres (RG-09). Tout le reste se lit sur l'aperçu du CV, tel qu'il sera envoyé.
 */
function WatchSettings({ profile }: { profile: CandidateProfile }) {
  return (
    <div className="profile">
      <section className="profile__block" aria-labelledby="profil-recherche">
        <h2 id="profil-recherche">Ce que vous cherchez</h2>
        <p className="profile__meta">Zone de recherche : {profile.location.searchArea}</p>
        <ul className="profile__list">
          {profile.targets.map((target) => (
            <li key={target.label}>
              <strong>{target.label}</strong>{' '}
              <span className="profile__meta">
                {target.contractTypes.map((type) => CONTRACT_LABELS[type]).join(', ')}
              </span>
              <p className="profile__meta">{target.keywords.join(', ')}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Atelier CV : le profil de référence du candidat, source unique des CV générés (RG-12) et des cibles qui notent
 * les offres (RG-09). Consultation (EF-CVX-01) et modification (EF-CVX-02) ; la génération d'un CV adapté arrive
 * avec T-504.
 */
export function CvWorkshopPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [draft, setDraft] = useState<CandidateProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [rejected, setRejected] = useState<readonly { path: string; message: string }[]>([]);

  const load = (signal?: AbortSignal) =>
    fetchProfile(signal)
      .then((profile) => setState({ status: 'ready', profile }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        // EF-CVX-01 : 404 tant qu'aucun profil n'est enregistré ; ce n'est pas une panne.
        if (error instanceof ApiError && error.status === NOT_FOUND) setState({ status: 'absent' });
        else setState({ status: 'error', message: messageOf(error) });
      });

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const handleSave = async (profile: CandidateProfile) => {
    setIsSaving(true);
    setRejected([]);
    try {
      await saveProfile(profile);
      setDraft(null);
      setNotice({ tone: 'success', text: 'Profil enregistré.' });
      await load();
    } catch (failure) {
      setNotice({ tone: 'error', text: messageOf(failure) });
      if (failure instanceof ApiError) setRejected(failure.details);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Atelier CV" eyebrow="Profil de référence">
        <p>
          Tout CV généré est écrit à partir de ce profil, et de lui seul : rien n’y est inventé. Les cibles servent
          aussi à noter les offres repérées.
        </p>
      </PageHeader>

      {notice && <Flash tone={notice.tone}>{notice.text}</Flash>}
      {rejected.length > 0 && (
        <ul className="profile__rejected" aria-label="Champs refusés">
          {rejected.map((issue) => (
            <li key={issue.path}>
              <code>{issue.path}</code> — {issue.message}
            </li>
          ))}
        </ul>
      )}

      {state.status === 'loading' && (
        <div role="status" aria-live="polite" className="profile__loading">
          <span className="visually-hidden">Chargement du profil de référence…</span>
          <Skeleton width="40%" height="1.4rem" />
          <Skeleton width="70%" height="1rem" />
          <Skeleton width="60%" height="1rem" />
        </div>
      )}
      {state.status === 'error' && <Flash>{state.message}</Flash>}

      {state.status === 'absent' && draft === null && (
        <div className="profile__absent" role="note">
          <p>Aucun profil de référence n’est enregistré. Sans lui, aucun CV ne peut être écrit.</p>
          <button type="button" className="btn" onClick={() => setDraft(emptyProfile())}>
            Créer mon profil
          </button>
        </div>
      )}

      {state.status === 'ready' && draft === null && (
        <>
          <div className="profile__actions">
            <button type="button" className="btn" onClick={() => setDraft(state.profile)}>
              Modifier le profil
            </button>
          </div>
          <CvPreview profile={state.profile} />
          <WatchSettings profile={state.profile} />
        </>
      )}

      {draft !== null && (
        <ProfileForm
          profile={draft}
          isSaving={isSaving}
          onSave={(profile) => void handleSave(profile)}
          onCancel={() => {
            setDraft(null);
            setRejected([]);
          }}
        />
      )}
    </>
  );
}
