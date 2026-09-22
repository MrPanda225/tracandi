import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LOGIN_PATH, RedirectIfAuthenticated, RequireAuth } from './auth/guards';
import { AppShell } from './components/layout/AppShell';
import { ApplicationsPage } from './pages/applications/ApplicationsPage';
import { AuthPage } from './pages/auth/AuthPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { DashboardCacheProvider } from './pages/dashboard/useDashboard';
import { UpcomingPage } from './pages/UpcomingPage';

/** The screens not built yet (T-003 shell), each stating what it will offer instead of an empty page. */
const UPCOMING_SCREENS = [
  {
    path: '/offres',
    title: 'Offres',
    promise: 'Les offres détectées par la veille des sites carrières, triées par pertinence.',
  },
  {
    path: '/sites',
    title: 'Sites surveillés',
    promise: 'La liste des entreprises et sites carrières suivis, et l’ajout de nouvelles sources.',
  },
  {
    path: '/atelier-cv',
    title: 'Atelier CV',
    promise: 'La génération d’un CV adapté à chaque offre et d’une réponse de motivation.',
  },
  {
    path: '/reglages',
    title: 'Réglages',
    promise: 'La connexion de votre boîte Gmail et les seuils de suivi.',
  },
] as const;

/**
 * Application routes: the login page is public (EF-AUT-05), the 6 screens of the shell require a session
 * and share the navigation frame (T-003).
 */
export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path={LOGIN_PATH}
          element={
            <RedirectIfAuthenticated>
              <AuthPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          element={
            <RequireAuth>
              <DashboardCacheProvider>
                <AppShell />
              </DashboardCacheProvider>
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/candidatures" element={<ApplicationsPage />} />
          {UPCOMING_SCREENS.map((screen) => (
            <Route
              key={screen.path}
              path={screen.path}
              element={<UpcomingPage title={screen.title} promise={screen.promise} />}
            />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
