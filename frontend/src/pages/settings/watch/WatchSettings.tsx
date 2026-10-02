import { useId } from 'react';
import { fetchCvTypes } from '../../../api/cvTypes';
import { AutomaticWatchPanel } from './AutomaticWatchPanel';
import { ChosenOffersPanel } from './ChosenOffersPanel';
import { CvTypesPanel } from './CvTypesPanel';
import { ProfilePanel } from './ProfilePanel';
import { RunFeedProvider } from './runFeed';
import { useResource } from './useResource';
import './WatchSettings.css';

/**
 * « Veille automatique » of the settings (EF-CFG-06): what the candidate sets for the watch that runs by itself — the
 * slots and the passes of the day first (EF-CFG-07 to EF-CFG-09), as the state comes before the preferences on this
 * screen (EF-CFG-05), then their CV types, the profile deduced from them to validate, and the offers chosen by level.
 * Only shown when the `watch` feature runs (ENF-MAI-07); the settings load it on demand. It shows nothing of the model
 * that runs the watch — no address, no token, no server setting: those are the publisher's (Q-24).
 */
export function WatchSettings() {
  const titleId = useId();
  const { resource: cvTypes, reload: reloadCvTypes } = useResource(fetchCvTypes);

  return (
    <RunFeedProvider>
      <section className="settings-card" aria-labelledby={titleId}>
        <h2 id={titleId} className="settings-card__title">
          Veille automatique
        </h2>
        <p className="settings-card__lede">
          Tracandi relit à heures fixes les sources que vous surveillez et note les offres selon votre profil.
          Ici, vous choisissez les créneaux, vous suivez les passages du jour et vous préparez votre profil :
          vos CV types, le niveau qui en est déduit et quelques offres qui vous ressemblent.
        </p>
        <AutomaticWatchPanel />
        <CvTypesPanel cvTypes={cvTypes} onChange={reloadCvTypes} />
        <ProfilePanel cvTypes={cvTypes} />
        <ChosenOffersPanel />
      </section>
    </RunFeedProvider>
  );
}
