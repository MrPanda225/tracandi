import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { LegalLinks } from '../LegalLinks';
import { GmailExpiryBanner } from './GmailExpiryBanner';
import { NAV_ITEMS } from './navigation';
import './AppShell.css';

const MAIN_ID = 'contenu';

/**
 * Frame of every signed-in page: ink side panel (30 %) with the navigation of the 6 screens, light canvas (60 %)
 * for the content. On a phone the frame becomes that of an application: a slim top bar for the name and the
 * account, and a fixed bottom bar holding the same six destinations, thumb-reachable (ENF-UTI-02).
 */
export function AppShell() {
  const { state, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const email = state.status === 'authenticated' ? state.account.email : '';

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
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                {/* The accessible name stays the full one, whichever label the screen is wide enough to show. */}
                <NavLink to={item.path} end={item.path === '/'} className="shell__link" aria-label={item.label}>
                  {item.icon}
                  <span className="shell__label" aria-hidden="true">
                    {item.label}
                  </span>
                  <span className="shell__label shell__label--short" aria-hidden="true">
                    {item.shortLabel}
                  </span>
                </NavLink>
              </li>
            ))}
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
