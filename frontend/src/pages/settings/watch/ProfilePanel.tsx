import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { messageOf } from '../../../api/client';
import { fetchCriteria, type WatchCriteria } from '../../../api/criteria';
import { type CvType, type CvTypeList, fetchDeduction, type ProfileDeduction } from '../../../api/cvTypes';
import { Flash } from '../../../components/Flash';
import { LEVEL_LABELS } from '../../../lib/experience';
import { plural } from '../../../lib/format';
import type { DeductionOfCv } from './profileDraft';
import { ProfileForm } from './ProfileForm';
import { LoadFailure, PanelLoading, WatchSection } from './SectionParts';
import { type Resource, useResource } from './useResource';

/** What reading the profile deduced from one CV type gave: the profile, or why it is not available. */
type DeductionResult = { cv: CvType; deduction: ProfileDeduction } | { cv: CvType; message: string };

const NO_CV_TYPES: readonly CvType[] = [];

/** Identifies the deductions on offer: a CV type read again has a new `updatedAt`, so a new profile to correct. */
const keyOf = (ready: readonly CvType[]): string =>
  ready.map((cv) => `${String(cv.id)}@${cv.updatedAt}`).join(',');

const readDeduction = async (cv: CvType, signal: AbortSignal): Promise<DeductionResult> => {
  try {
    return { cv, deduction: await fetchDeduction(cv.id, signal) };
  } catch (failure) {
    // 404 once the 30 minutes in memory are over: the API says so in French, and what to do.
    return { cv, message: messageOf(failure) };
  }
};

/**
 * EF-VEI-45: reads what each CV type with a profile to validate deduced. `null` while it is on its way; the key says
 * which CV types the answer is for, so that the form restarts from a new deduction and never from a stale one.
 */
function useDeductions(ready: readonly CvType[]) {
  const [state, setState] = useState<{ key: string; results: readonly DeductionResult[] } | null>(null);

  useEffect(() => {
    if (ready.length === 0) return;
    const controller = new AbortController();
    void Promise.all(ready.map((cv) => readDeduction(cv, controller.signal))).then((results) => {
      if (!controller.signal.aborted) setState({ key: keyOf(ready), results });
    });
    return () => controller.abort();
  }, [ready]);

  const key = keyOf(ready);
  return state?.key === key ? state : null;
}

/** EF-VEI-47: the years and the level of the criteria the watch uses, and the offers they look for. */
function CurrentProfile({ criteria }: { criteria: WatchCriteria | null }) {
  if (criteria === null) {
    return (
      <p className="gmail-card__hint">
        Aucun critère enregistré pour l’instant : la veille ne se lance pas tant que vous n’avez pas validé un
        profil ou enregistré vos critères.
      </p>
    );
  }
  const level = criteria.level ? LEVEL_LABELS[criteria.level] : null;
  const experience =
    criteria.years === undefined
      ? null
      : `${plural(criteria.years, 'an')} d’expérience${level ? `, niveau ${level}` : ''}`;
  const used = experience ?? (level ? `niveau ${level}` : null);
  return (
    <div className="watch-current">
      <p className="watch-current__line">
        {used
          ? `Profil utilisé par la veille : ${used}.`
          : 'Vos critères enregistrés ne précisent ni années ni niveau.'}
      </p>
      <p className="gmail-card__hint">
        Offres types : {criteria.targets.map((target) => target.label).join(', ')}
      </p>
    </div>
  );
}

/**
 * EF-VEI-43 to EF-VEI-47: the profile deduced from the CV types, to validate. Says plainly that the watch uses nothing
 * of it before the candidate validates (EF-VEI-46), and shows the years and level of the criteria it does use.
 */
export function ProfilePanel({ cvTypes }: { cvTypes: Resource<CvTypeList> }) {
  const { resource: criteria, reload: reloadCriteria } = useResource(fetchCriteria);
  const [validated, setValidated] = useState<WatchCriteria | null>(null);
  const items = cvTypes.status === 'ready' ? cvTypes.value.items : NO_CV_TYPES;
  const ready = useMemo(() => items.filter((cv) => cv.deductionReady), [items]);
  const deductions = useDeductions(ready);

  const proposals: DeductionOfCv[] = (deductions?.results ?? []).flatMap((result) =>
    'deduction' in result
      ? [{ cvId: result.cv.id, cvLabel: result.cv.label, deduction: result.deduction }]
      : [],
  );
  const unavailable = (deductions?.results ?? []).flatMap((result) => ('message' in result ? [result] : []));
  const used = validated ?? (criteria.status === 'ready' ? criteria.value : null);

  return (
    <WatchSection title="Profil déduit à valider">
      <p className="gmail-card__hint">
        Tracandi propose, d’après vos CV types, vos années d’expérience, votre niveau et des offres types à
        chercher. Corrigez ce qui doit l’être, puis validez.
      </p>
      {criteria.status === 'loading' && <PanelLoading label="Chargement de vos critères…" />}
      {criteria.status === 'error' && validated === null && (
        <LoadFailure message={criteria.message} onRetry={() => void reloadCriteria()} />
      )}
      {(criteria.status === 'ready' || validated !== null) && <CurrentProfile criteria={used} />}
      <p className="gmail-card__hint">
        La commune, le rayon et le télétravail se règlent dans <Link to="/sites">Sites surveillés</Link>.
      </p>

      {validated && (
        <Flash tone="success">
          Profil validé : la veille s’en sert désormais, avec ces offres types, ces années et ce niveau.
        </Flash>
      )}
      {ready.length === 0 && cvTypes.status === 'ready' && (
        <p className="gmail-card__hint">
          Aucun profil à valider pour l’instant. Importez un CV type : son profil vous est proposé ici pendant
          30 minutes.
        </p>
      )}
      {ready.length > 0 && deductions === null && <PanelLoading label="Chargement du profil déduit…" />}
      {unavailable.map(({ cv, message }) => (
        <Flash key={cv.id}>{`${cv.label} : ${message}`}</Flash>
      ))}
      {proposals.length > 0 && deductions && (
        <>
          {!validated && (
            <p className="watch-note">
              Tant que vous n’avez pas validé, la veille n’utilise rien de ce profil : elle continue avec vos
              critères enregistrés.
            </p>
          )}
          <ProfileForm key={deductions.key} deductions={proposals} onValidated={setValidated} />
        </>
      )}
    </WatchSection>
  );
}
