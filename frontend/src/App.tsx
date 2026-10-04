import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LOGIN_PATH, RedirectIfAuthenticated, RequireAuth } from './auth/guards';
import { AppShell } from './components/layout/AppShell';
import { ApplicationsPage } from './pages/applications/ApplicationsPage';
import { ApplicationsCacheProvider } from './pages/applications/useApplications';
import { DashboardCacheProvider } from './pages/dashboard/useDashboard';
import { SettingsPage } from './pages/settings/SettingsPage';
import { CookieNotice } from './components/CookieNotice';
import { ScreenLoading } from './components/ScreenLoading';
import { FeaturesProvider, RequireFeature } from './features/FeaturesContext';
import { loadAuthPage, loadDashboardPage, loadLandingPage, loadLegalPages } from './routeChunks';

// ENF-PERF-01: these two screens carry what weighs on the first load — the dashboard (its chart apart), and the
// fonts, animations and decor of the login page. They are fetched when their route is opened, or preloaded at entry.
const AuthPage = lazy(async () => ({ default: (await loadAuthPage()).AuthPage }));
const DashboardPage = lazy(async () => ({ default: (await loadDashboardPage()).DashboardPage }));
// L'Atelier CV et son suivi d'analyse voyagent avec leur écran (ENF-PERF-01).
const CvWorkshopPage = lazy(async () => ({
  default: (await import('./pages/cv/CvWorkshopPage')).CvWorkshopPage,
}));
// EF-AUT-09: the presentation page is for visitors only; its motion and decor never weigh on the application.
const LandingPage = lazy(async () => ({ default: (await loadLandingPage()).LandingPage }));
// EF-LEG-01: the legal pages travel together, apart from the application.
const LegalNoticePage = lazy(async () => ({ default: (await loadLegalPages()).LegalNoticePage }));
const PrivacyPage = lazy(async () => ({ default: (await loadLegalPages()).PrivacyPage }));
const CookiesPage = lazy(async () => ({ default: (await loadLegalPages()).CookiesPage }));
const SitesPage = lazy(async () => ({ default: (await import('./pages/sites/SitesPage')).SitesPage }));
const OffersPage = lazy(async () => ({ default: (await import('./pages/offers/OffersPage')).OffersPage }));

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
          <Route
            path="/offres"
            element={
              <RequireFeature
                feature="watch"
                title="Offres"
                promise="Les offres détectées par la veille des sites carrières, triées par pertinence."
              >
                <Suspense fallback={<ScreenLoading label="Chargement des offres…" />}>
                  <OffersPage />
                </Suspense>
              </RequireFeature>
            }
          />
          <Route path="/reglages" element={<SettingsPage />} />
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
