// ENF-PERF-01: the screens fetched on demand. App.tsx and the preloading below share these loaders, so that a screen
// started early is the very module its route waits for.
export const loadAuthPage = () => import('./pages/auth/AuthPage');
// EF-AUT-14: reached straight from the activation e-mail link, so it is worth preloading like the login page.
export const loadActivationPage = () => import('./pages/auth/ActivationPage');
export const loadLegalPages = () => import('./pages/legal/LegalPages');
export const loadLandingPage = () => import('./pages/landing/LandingPage');
export const loadDashboardPage = () => import('./pages/dashboard/DashboardPage');

/**
 * Public addresses and the screen fetched for them before the session is known. At the root, both answers are
 * started: the presentation for a visitor, and the dashboard — light since its chart travels apart — for a signed-in
 * user, who no longer waits for the session check to start fetching his screen.
 */
const ENTRY_CHUNKS: Record<string, () => Promise<unknown>> = {
  '/': () => Promise.all([loadLandingPage(), loadDashboardPage()]),
  '/connexion': loadAuthPage,
  '/activation': loadActivationPage,
  '/mentions-legales': loadLegalPages,
  '/confidentialite': loadLegalPages,
  '/cookies': loadLegalPages,
};

/**
 * Starts fetching the screen of the address the visit opens on, alongside the session check instead of after it
 * (ENF-PERF-07). Does nothing for any other address. A failed fetch is left to the route, which asks again and shows
 * its own error.
 * @req ENF-PERF-07
 */
export const preloadEntryScreen = (pathname: string, chunks = ENTRY_CHUNKS): void => {
  const load = chunks[pathname];
  if (load) load().catch(() => undefined);
};
