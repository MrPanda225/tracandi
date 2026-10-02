import { useId } from 'react';
import { fetchCvTypes } from '../../../api/cvTypes';
import { ChosenOffersPanel } from './ChosenOffersPanel';
import { CvTypesPanel } from './CvTypesPanel';
import { ProfilePanel } from './ProfilePanel';
import { RunFeedProvider } from './runFeed';
import { useResource } from './useResource';
import './WatchSettings.css';

/**
 * « Veille automatique » of the settings (EF-CFG-06): what the candidate sets for the watch that runs by itself — their
 * CV types, the profile deduced from them to validate, and the offers chosen by level. Only shown when the `watch`
 * feature runs (ENF-MAI-07); the settings load it on demand. It shows nothing of the model that runs the watch — no
 * address, no token, no server setting: those are the publisher's (Q-24).
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
          Ici, vous préparez ce profil : vos CV types, le niveau qui en est déduit et quelques offres qui vous
          ressemblent.
        </p>
        <CvTypesPanel cvTypes={cvTypes} onChange={reloadCvTypes} />
        <ProfilePanel cvTypes={cvTypes} />
        <ChosenOffersPanel />
      </section>
    </RunFeedProvider>
  );
}
