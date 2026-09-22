# Matrice de traçabilité exigence → tâche → vérification

Tenue à jour par Claude Code à la fin de chaque tâche (commande `/project:next-task`, étape « Traçabilité »).
Un test référence son exigence dans son nom : `it('[EF-CAN-07] updates the status of an application', ...)`.
Commande de contrôle : `/project:check-req EF-CAN-07`.

| Exigence | Tâche | Vérification (fichier de test ou procédure) | Statut |
|---|---|---|---|
| ENF-SEC-03 | T-001 | `backend/src/config/env.test.ts` (secrets lus depuis l'environnement uniquement) + hook `guard-edits.mjs` + revue | couverte |
| ENF-SEC-08 | T-001 | `backend/src/lib/logger.test.ts`, `backend/src/app.test.ts` (500 masqué, journal sans identifiants ni chaîne de requête), `config/env.test.ts` | couverte |
| ENF-SEC-11 | T-001 | `backend/src/app.test.ts` › cross-origin guard, GET /api/health | couverte |
| ENF-SEC-12 | T-001 | `backend/src/app.test.ts` › JSON-only guard | couverte |
| ENF-SEC-04 | T-001 (socle), T-102, T-404… | `backend/src/lib/http.test.ts` (`validate`), `app.test.ts` (JSON invalide, 404) — reste à couvrir route par route | partielle |
| ENF-MAI-02 | T-001 | `npm run check` (tsc strict + ESLint typé), vert | couverte |
| ENF-MAI-05 | T-002 | `tests/integration/migrations.test.ts` (schéma complet, idempotence) | couverte |
| ENF-SEC-09 | T-002 | — rôles séparés non encore créés sur Neon | à faire |
| ENF-SEC-15 | T-002 | `src/db/url.test.ts`, `src/config/env.test.ts` | couverte |
| ENF-SEC-16 | T-002 | Revue : repositories en API Drizzle uniquement, aucun `sql.raw` ; `tests/integration/applications.test.ts` (recherche) | couverte |
| ENF-SEC-17 | T-002 | — une seule URL (rôle propriétaire) en phase de développement | à faire |
| RG-03 | T-101 | `src/modules/applications/rules.test.ts` (b, c, d, entreprise inconnue) ; `applications.test.ts` (unicité) | couverte |
| RG-04 | T-101 | `rules.test.ts` (shouldReplaceStatus) ; `applications.test.ts` (accusé tardif) | couverte |
| RG-14 | T-101 | `rules.test.ts` (normalizeKey) ; `applications.test.ts` (dédoublonnage entreprise) | couverte |
| EF-CAN-13 | T-102 | `tests/integration/applications.test.ts` | couverte |
| EF-CAN-14 | T-102 | `tests/integration/applications.test.ts` | couverte |

| RG-02 | T-101 | `rules.test.ts` (statusOfCategory) | couverte |
| RG-06 | T-101 | `rules.test.ts` (isFollowUpDue, bornes) | couverte |
| EF-CAN-01 | T-102 | `applications.test.ts` (ordre alphabétique) | couverte |
| EF-CAN-02 | T-102 | `applications.test.ts` | couverte |
| EF-CAN-03 | T-102 | `applications.test.ts` (« mcdo », intitulé) | couverte |
| EF-CAN-04 | T-102 | `applications.test.ts` (chronologie) | couverte |
| EF-CAN-05 | T-102 | `applications.test.ts` (lien Gmail) | couverte |
| EF-CAN-06 | T-102 | `applications.test.ts` | couverte |
| EF-CAN-07 | T-102 | `applications.test.ts` | couverte |
| EF-CAN-08 | T-102 | `applications.test.ts` (2 001 caractères, effacement) | couverte |
| EF-CAN-09 | T-102 | `applications.test.ts` (messages détachés) | couverte |
| EF-CAN-10 | T-102 | `applications.test.ts` (rattachement, détachement) | couverte |
| EF-CAN-11 | T-102 | `applications.test.ts` (RG-04 au rattachement) | couverte |
| EF-CAN-12 | T-102 | `rules.test.ts`, `applications.test.ts` (11 jours, D = 10) | couverte |
| EF-AUT-01 | T-004 | `tests/integration/auth.test.ts` | couverte |
| EF-AUT-02 | T-004 | `auth.test.ts` (11, 12, 129 caractères) | couverte |
| EF-AUT-03 | T-004 | `auth.test.ts` (cookie HttpOnly, SameSite=Strict, Secure) | couverte |
| EF-AUT-04 | T-004 | `auth.test.ts` | couverte |
| EF-AUT-05 | T-004 | `src/app.test.ts` › session guard ; `applications.test.ts` | couverte |
| EF-AUT-06 | T-004 | `applications.test.ts` (404 pour chaque méthode, messages) | couverte |
| EF-AUT-07 | T-004 | `auth.test.ts` (horloge simulée à J+7) | couverte |
| EF-AUT-08 | T-004 | `auth.test.ts` | couverte |
| ENF-SEC-18 | T-004 | `src/modules/auth/credentials.test.ts`, `auth.test.ts` | couverte |
| ENF-SEC-19 | T-004 | `auth.test.ts` (réponse identique, 429 à la 11e tentative) | couverte |
| ENF-SEC-20 | T-004 | `credentials.test.ts`, `auth.test.ts` | couverte |
| EF-DOC-01 | T-005 | `src/app.test.ts`, `migrations.test.ts` (chaque route documentée) | couverte |
| EF-DOC-02 | T-005 | `src/app.test.ts` (page Swagger) + démonstration `/api/docs` | couverte |
| EF-AUT-01 (interface) | T-006 | `frontend/src/pages/auth/AuthPage.test.tsx` (inscription, adresse déjà utilisée) | couverte |
| EF-AUT-02 (interface) | T-006 | `AuthPage.test.tsx` (11 caractères refusés localement, jauge 12) | couverte |
| EF-AUT-03 (interface) | T-006 | `AuthPage.test.tsx` (connexion, identifiants refusés) | couverte |
| EF-AUT-04 (interface) | T-006 | `AuthPage.test.tsx` › HomePage (déconnexion) | couverte |
| EF-AUT-05 (interface) | T-006 | `AuthPage.test.tsx` (redirection vers `/connexion` sans session) | couverte |
| ENF-UTI-01 | T-006 | `AuthPage.test.tsx` (libellés français) + revue | couverte |
| ENF-UTI-02 | T-006 | Captures 1440 px et 390 px (Chrome sans interface) | couverte |
| ENF-UTI-03 | T-006 | `AuthPage.test.tsx` (bouton désactivé, `aria-busy`, API injoignable) ; `frontend/src/api/client.test.ts` | couverte |
| ENF-UTI-01 (shell) | T-003 | `frontend/src/components/layout/AppShell.test.tsx` (6 écrans, navigation et titres en français) | couverte |
| ENF-UTI-02 (shell) | T-003 | `AppShell.test.tsx` (écran courant signalé) ; captures 360 px et 1440 px (Chrome sans interface, menu fermé) | couverte |
| ENF-UTI-03 (shell) | T-003 | `frontend/src/components/Flash.test.tsx` (erreur en alerte) ; `DashboardPage.test.tsx` (squelette au premier chargement, derniers chiffres conservés si l'actualisation échoue) ; `api/client.test.ts` (API injoignable) | couverte |
| EF-AUT-06 (interface) | T-003 | `AppShell.test.tsx` (chiffres de la session précédente jamais montrés au compte suivant) | couverte |
| ENF-PERF-01 | T-003, T-703 | `DashboardPage.test.tsx` (retour au tableau de bord : derniers chiffres affichés aussitôt) — mesure sur le jeu de charge en T-703 | partielle |
| EF-TDB-01 à 09 (API) | T-601 | `backend/tests/integration/stats.test.ts` (un test par indicateur, isolation EF-AUT-06, 401) ; `src/modules/stats/rules.test.ts` (RG-07, semaines) | couverte |
| RG-07 | T-601 | `stats/rules.test.ts` (arrondi, total nul) ; `stats.test.ts` (taux global et par type de contrat) | couverte |
| ENF-PERF-05 | T-601 | `tests/integration/stats-query-plans.test.ts` (`EXPLAIN ANALYZE` de chaque requête du tableau de bord sur le jeu de charge : < 50 ms) | couverte |
| ENF-PERF-04 | T-102, T-703 | Agrégats du tableau de bord exclus (Q-17) ; requêtes sélectives : jeu de charge `tests/integration/load-dataset.ts` disponible, vérification à étendre en T-703 | partielle |
| EF-TDB-01 à 09 (écran) | T-602 | `frontend/src/pages/dashboard/DashboardPage.test.tsx` — tâche en cours | à faire |
<!-- Ajouter une ligne par exigence au fur et à mesure. Statuts : à faire | couverte | vérifiée (démo BO) -->
