import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export const LOGIN_PATH = '/connexion';

function SessionPending() {
  return (
    <div role="status" aria-live="polite" className="session-pending">
      <span className="visually-hidden">Chargement de votre session…</span>
    </div>
  );
}

/** Renders its children only for a signed-in user; otherwise redirects to the login page (EF-AUT-05). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <SessionPending />;
  if (state.status === 'anonymous')
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  return children;
}

/** Keeps a signed-in user away from the login page. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <SessionPending />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}
