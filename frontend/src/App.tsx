import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LOGIN_PATH, RedirectIfAuthenticated, RequireAuth } from './auth/guards';
import { AppShell } from './components/layout/AppShell';
import { ApplicationsPage } from './pages/applications/ApplicationsPage';
import { ApplicationsCacheProvider } from './pages/applications/useApplications';
import { DashboardCacheProvider } from './pages/dashboard/useDashboard';
import { SettingsPage } from './pages/settings/SettingsPage';
import { UpcomingPage } from './pages/UpcomingPage';
import { ScreenLoading } from './components/ScreenLoading';
import { FeaturesProvider, RequireFeature } from './features/FeaturesContext';

// ENF-PERF-01: these two screens carry what weighs on the first load — the charts of the dashboard, and the fonts,
// animations and decor of the login page. They are fetched when their route is opened, not before.
const AuthPage = lazy(async () => ({ default: (await import('./pages/auth/AuthPage')).AuthPage }));
const DashboardPage = lazy(async () => ({
  default: (await import('./pages/dashboard/DashboardPage')).DashboardPage,
}));
// Le formulaire du profil ne sert qu'à l'Atelier CV : il voyage avec son écran (ENF-PERF-01).
const CvWorkshopPage = lazy(async () => ({
  default: (await import('./pages/cv/CvWorkshopPage')).CvWorkshopPage,
}));
const SitesPage = lazy(async () => ({ default: (await import('./pages/sites/SitesPage')).SitesPage }));

/** The screens not built yet (T-003 shell), each stating what it will offer instead of an empty page. */
const UPCOMING_SCREENS = [
  {
    path: '/offres',
    feature: 'watch',
    title: 'Offres',
    promise: 'Les offres détectées par la veille des sites carrières, triées par pertinence.',
  },
] as const;

/**
 * Application routes: the login page is public (EF-AUT-05), the screens of the shell require a session
 * and share the navigation frame (T-003); those of a disabled optional feature open nothing (ENF-MAI-07).
 */
export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path={LOGIN_PATH}
          element={
            <RedirectIfAuthenticated>
              <Suspense fallback={<ScreenLoading label="Chargement de la page de connexion…" />}>
                <AuthPage />
              </Suspense>
            </RedirectIfAuthenticated>
          }
        />
        <Route
          element={
            <RequireAuth>
              <FeaturesProvider>
                <DashboardCacheProvider>
                  <ApplicationsCacheProvider>
                    <AppShell />
                  </ApplicationsCacheProvider>
                </DashboardCacheProvider>
              </FeaturesProvider>
            </RequireAuth>
          }
        >
          <Route
            path="/"
            element={
              <Suspense fallback={<ScreenLoading label="Chargement du tableau de bord…" />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route path="/candidatures" element={<ApplicationsPage />} />
          <Route
            path="/atelier-cv"
            element={
              <RequireFeature feature="cv">
                <Suspense fallback={<ScreenLoading label="Chargement de l’Atelier CV…" />}>
                  <CvWorkshopPage />
                </Suspense>
              </RequireFeature>
            }
          />
          <Route
            path="/sites"
            element={
              <RequireFeature feature="watch">
                <Suspense fallback={<ScreenLoading label="Chargement des sites surveillés…" />}>
                  <SitesPage />
                </Suspense>
              </RequireFeature>
            }
          />
          <Route path="/reglages" element={<SettingsPage />} />
          {UPCOMING_SCREENS.map((screen) => (
            <Route
              key={screen.path}
              path={screen.path}
              element={
                <RequireFeature feature={screen.feature}>
                  <UpcomingPage title={screen.title} promise={screen.promise} />
                </RequireFeature>
              }
            />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
