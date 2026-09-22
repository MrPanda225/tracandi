import { useEffect, useId, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { NAV_ITEMS } from './navigation';
import './AppShell.css';

const MAIN_ID = 'contenu';

/**
 * Frame of every signed-in page: ink side panel (30 %) with the navigation of the 6 screens, light canvas (60 %)
 * for the content. Below 900 px the panel becomes a top bar whose menu opens on demand (ENF-UTI-02).
 */
export function AppShell() {
  const { state, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const location = useLocation();
  const menuId = useId();
  const email = state.status === 'authenticated' ? state.account.email : '';

  // A navigation closes the mobile menu.
  useEffect(() => setIsMenuOpen(false), [location.pathname]);

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
          <button
            type="button"
            className="shell__menu-button"
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span className="shell__menu-icon" aria-hidden="true" />
            {isMenuOpen ? 'Fermer' : 'Menu'}
          </button>
        </div>

        <div id={menuId} className={`shell__menu ${isMenuOpen ? 'shell__menu--open' : ''}`}>
          <nav aria-label="Navigation principale">
            <ul className="shell__nav">
              {NAV_ITEMS.map((item) => (
                <li key={item.path}>
                  <NavLink to={item.path} end={item.path === '/'} className="shell__link">
                    {item.icon}
                    <span>{item.label}</span>
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
          </div>
        </div>
      </aside>

      <main id={MAIN_ID} className="shell__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
