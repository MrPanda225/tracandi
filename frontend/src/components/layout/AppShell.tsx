import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { OptionalFeature } from '../../api/settings';
import { useAuth } from '../../auth/AuthContext';
import { useFeature } from '../../features/FeaturesContext';
import { LegalLinks } from '../LegalLinks';
import { GmailExpiryBanner } from './GmailExpiryBanner';
import { NAV_ITEMS } from './navigation';
import './AppShell.css';

const MAIN_ID = 'contenu';

/**
 * Accessible name of a destination: its full label, followed by the short one of a phone when that one is not already
 * a part of it — the words on screen are then always in the name a voice command can say (WCAG 2.5.3).
 */
const accessibleNameOf = (
  { label, shortLabel }: { label: string; shortLabel: string },
  isUpcoming: boolean,
): string => `${label.includes(shortLabel) ? label : `${label} (${shortLabel})`}${isUpcoming ? ', bientôt' : ''}`;

/**
 * Frame of every signed-in page: ink side panel (30 %) with the navigation of the 6 screens, light canvas (60 %)
 * for the content. On a phone the frame becomes that of an application: a slim top bar for the name and the
 * account, and a fixed bottom bar holding the destinations that are open, thumb-reachable (ENF-UTI-02); a screen
 * still in preparation is marked « Bientôt » in the side panel and left out of that bar (MD3: five items at most).
 */
export function AppShell() {
  const { state, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const email = state.status === 'authenticated' ? state.account.email : '';
  const enabled: Record<OptionalFeature, boolean | null> = { watch: useFeature('watch'), cv: useFeature('cv') };
  // Announced, not yet open (ENF-MAI-07): only once the server said so, never while the list is on its way.
  const isUpcoming = (feature: OptionalFeature | undefined): boolean =>
    feature !== undefined && enabled[feature] === false;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
  };

  return (
    <div className="shell">
      <a className="shell__skip" href={`#${MAIN_ID}`}>
        Aller au contenu
      </a>

      <aside className="shell__panel">
        <div className="shell__bar">
          <p className="shell__brand">
            <span className="shell__logo">Tracandi</span>
            <span className="shell__tag">Carnet de candidatures</span>
          </p>
        </div>

        <nav className="shell__nav-wrap" aria-label="Navigation principale">
          <ul className="shell__nav">
            {NAV_ITEMS.map((item) => {
              const upcoming = isUpcoming(item.feature);
              return (
                <li key={item.path} className={upcoming ? 'shell__item--upcoming' : undefined}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className="shell__link"
                    aria-label={accessibleNameOf(item, upcoming)}
                  >
                    {item.icon}
                    <span className="shell__label" aria-hidden="true">
                      {item.label}
                    </span>
                    <span className="shell__label shell__label--short" aria-hidden="true">
                      {item.shortLabel}
                    </span>
                    {upcoming && (
                      <span className="shell__soon" aria-hidden="true">
                        Bientôt
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shell__account">
          <p className="shell__email" title={email}>
            {email}
          </p>
          <button
            type="button"
            className="shell__signout"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
            aria-busy={isSigningOut}
          >
            {isSigningOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
          <LegalLinks className="legal-links shell__legal" />
        </div>
      </aside>

      <main id={MAIN_ID} className="shell__main" tabIndex={-1}>
        <GmailExpiryBanner />
        <Outlet />
      </main>
    </div>
  );
}
