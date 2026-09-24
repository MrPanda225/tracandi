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
import { CookieNotice } from './components/CookieNotice';
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
// EF-AUT-09: the presentation page is for visitors only; its motion and decor never weigh on the application.
const LandingPage = lazy(async () => ({ default: (await import('./pages/landing/LandingPage')).LandingPage }));
const SitesPage = lazy(async () => ({ default: (await import('./pages/sites/SitesPage')).SitesPage }));

/** The screens not built yet (T-003 shell), each stating what it will offer instead of an empty page. */
const UPCOMING_SCREENS = [
  {
    path: '/offres',
    title: 'Offres',
    promise: 'Les offres détectées par la veille des sites carrières, triées par pertinence.',
  },
] as const;

const LEGAL_ROUTES = [
  { path: '/mentions-legales', Page: LegalNoticePage },
  { path: '/confidentialite', Page: PrivacyPage },
  { path: '/cookies', Page: CookiesPage },
] as const;

/**
 * Application routes: the login page is public (EF-AUT-05), the screens of the shell require a session
 * and share the navigation frame (T-003); those of a disabled optional feature show « En préparation » (ENF-MAI-07).
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
            <RequireAuth
              anonymousHome={
                <Suspense fallback={<ScreenLoading label="Chargement de la page d’accueil…" />}>
                  <LandingPage />
                </Suspense>
              }
            >
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
              <RequireFeature
                feature="cv"
                title="Atelier CV"
                promise="Un CV adapté à chaque offre, au format de votre modèle Word, et vos réponses de motivation."
              >
                <Suspense fallback={<ScreenLoading label="Chargement de l’Atelier CV…" />}>
                  <CvWorkshopPage />
                </Suspense>
              </RequireFeature>
            }
          />
          <Route
            path="/sites"
            element={
              <RequireFeature
                feature="watch"
                title="Sites surveillés"
                promise="Les sites carrières des entreprises qui vous intéressent, consultés pour vous trois fois par jour."
              >
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
              element={<UpcomingPage title={screen.title} promise={screen.promise} />}
            />
          ))}
        </Route>
        {/* EF-LEG-01: public, with or without a session. */}
        {LEGAL_ROUTES.map(({ path, Page }) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<ScreenLoading label="Chargement de la page…" />}>
                <Page />
              </Suspense>
            }
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* EF-LEG-02: once, on whatever page the visit starts. */}
      <CookieNotice />
    </AuthProvider>
  );
}
