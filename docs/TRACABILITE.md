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
| ENF-MAI-05 | T-002 | | à faire |
| ENF-SEC-09 | T-002 | | à faire |
| ENF-SEC-15 | T-002 | | à faire |
| ENF-SEC-16 | T-002 | | à faire |
| ENF-SEC-17 | T-002 | | à faire |
| RG-03 | T-101 | | à faire |
| RG-04 | T-101 | | à faire |
| RG-14 | T-101 | | à faire |
| EF-CAN-13 | T-102 | | à faire |
| EF-CAN-14 | T-102 | | à faire |

<!-- Ajouter une ligne par exigence au fur et à mesure. Statuts : à faire | couverte | vérifiée (démo BO) -->
