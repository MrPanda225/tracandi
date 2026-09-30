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

/**
 * Renders its children only for a signed-in user (EF-AUT-05). A visitor gets `anonymousHome` at the root of the
 * application, the presentation of the service (EF-AUT-09), and is redirected to the login page anywhere else.
 */
export function RequireAuth({ children, anonymousHome }: { children: ReactNode; anonymousHome?: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <SessionPending />;
  if (state.status === 'anonymous') {
    if (anonymousHome && location.pathname === '/') return anonymousHome;
    return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />;
  }
  return children;
}

/**
 * Keeps a signed-in user away from the login page. While the session is being checked, the page is shown at once:
 * whoever opens it is nearly always a visitor, who no longer waits for the check (ENF-PERF-07); a signed-in user is
 * sent to the dashboard as soon as the answer arrives.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}
