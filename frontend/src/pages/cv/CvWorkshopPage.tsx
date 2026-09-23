import { useEffect, useState } from 'react';
import { ApiError, isAbortError, messageOf } from '../../api/client';
import {
  type CandidateProfile,
  CONTRACT_LABELS,
  emptyProfile,
  fetchProfile,
  saveProfile,
  STUDY_LEVEL_LABELS,
} from '../../api/profile';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { ProfileForm } from './ProfileForm';
import './CvWorkshopPage.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'absent' }
  | { status: 'ready'; profile: CandidateProfile };

const NOT_FOUND = 404;

/** EF-CVX-01 : le profil tel qu'il est enregistré, section par section. */
function ProfileView({ profile }: { profile: CandidateProfile }) {
  const { identity, cvSource } = profile;
  return (
    <div className="profile">
      <section className="profile__block" aria-labelledby="profil-identite">
        <h2 id="profil-identite">Identité</h2>
        <p className="profile__name">{identity.name}</p>
        <p className="profile__meta">
          {[identity.city, identity.phone, identity.email, identity.extra].filter(Boolean).join(' · ')}
        </p>
        <p className="profile__meta">Zone de recherche : {profile.location.searchArea}</p>
        <p className="profile__meta">Disponibilités : {profile.availability}</p>
      </section>

      <section className="profile__block" aria-labelledby="profil-cibles">
        <h2 id="profil-cibles">Cibles</h2>
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

      <section className="profile__block" aria-labelledby="profil-cv">
        <h2 id="profil-cv">CV</h2>
        <p className="profile__name">{cvSource.defaultTitle}</p>
        <p className="profile__meta">{cvSource.defaultSubtitle}</p>
        <p>{cvSource.profile}</p>
      </section>

      <section className="profile__block" aria-labelledby="profil-experiences">
        <h2 id="profil-experiences">Expériences professionnelles</h2>
        <ul className="profile__list">
          {cvSource.experiences.map((experience) => (
            <li key={`${experience.company}-${experience.dates}`}>
              <strong>{experience.role}</strong> — {experience.company}
              <p className="profile__meta">
                {[experience.dates, experience.place, experience.duration].filter(Boolean).join(' · ')}
              </p>
              <ul className="profile__bullets">
                {experience.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="profile__block" aria-labelledby="profil-formation">
        <h2 id="profil-formation">Formation</h2>
        <ul className="profile__list">
          {cvSource.education.map((degree) => (
            <li key={`${degree.school}-${degree.dates}`}>
              <strong>{degree.degree ?? degree.school}</strong>
              <p className="profile__meta">
                {[degree.dates, degree.degree ? degree.school : null, degree.place, degree.detail]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {profile.studyLevel.level !== null && (
        <section className="profile__block" aria-labelledby="profil-niveau">
          <h2 id="profil-niveau">Niveau d’études</h2>
          <p className="profile__name">
            {STUDY_LEVEL_LABELS[profile.studyLevel.level]}
            {profile.studyLevel.isInProgress ? ' — en cours' : ' — obtenu'}
          </p>
        </section>
      )}

      <section className="profile__block" aria-labelledby="profil-competences">
        <h2 id="profil-competences">Compétences</h2>
        <ul className="profile__list">
          {cvSource.skills.map((skill) => (
            <li key={skill.label}>
              <strong>{skill.label}</strong> : {skill.value}
            </li>
          ))}
        </ul>
      </section>

      {cvSource.certifications.length > 0 && (
        <section className="profile__block" aria-labelledby="profil-certifications">
          <h2 id="profil-certifications">Certifications</h2>
          <ul className="profile__list">
            {cvSource.certifications.map((certification) => (
              <li key={certification.name}>
                <strong>{certification.name}</strong>
                {[certification.issuer, certification.year].filter(Boolean).length > 0 && (
                  <p className="profile__meta">
                    {[certification.issuer, certification.year].filter(Boolean).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cvSource.interests.length > 0 && (
        <section className="profile__block" aria-labelledby="profil-interets">
          <h2 id="profil-interets">Centres d’intérêt</h2>
          <ul className="profile__list">
            {cvSource.interests.map((interest) => (
              <li key={interest}>{interest}</li>
            ))}
          </ul>
        </section>
      )}
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
          <ProfileView profile={state.profile} />
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
