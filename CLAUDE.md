# JobPilot — instructions pour Claude Code

Application web locale, mono-utilisateur, qui automatise la recherche d'emploi de Sahiré YAPI :
suivi des candidatures depuis Gmail, veille des sites carrières, CV adaptés au format de son modèle Word.

**Le cahier des charges fait foi : `docs/CAHIER_DES_CHARGES.md`.** Aucune fonctionnalité hors de ce document.
Toute nouvelle demande passe par `/project:change-request` avant le code.

## Documents
| Fichier | Contenu |
|---|---|
| `docs/CAHIER_DES_CHARGES.md` | Besoins, exigences (EF-/ENF-), règles de gestion (RG-), contraintes, questions ouvertes |
| `docs/ROADMAP.md` | Lots et tâches ordonnés (T-xxx), exigences couvertes, définition de fini par tâche |
| `docs/TRACABILITE.md` | Exigence → tâche → test (tenu à jour à chaque tâche) |
| `docs/ARCHITECTURE.md` | Décisions (ADR), arborescence cible, modèle de données, comptes MySQL |

## Stack
- **Backend** : Node 22, TypeScript strict, Express 4, `mysql2/promise` (SQL écrit à la main, pas d'ORM), zod, Vitest + Supertest.
- **Frontend** : React 18, TypeScript strict, Vite, React Router, Vitest + Testing Library.
- **Base** : MySQL 8.4 LTS (Docker), migrations SQL versionnées dans `database/migrations/`.
- **IA** : Claude (`@anthropic-ai/sdk`) et Gemini (`@google/genai`) derrière un routeur avec bascule.
- **Intégrations** : Gmail API (`googleapis`), API publiques des ATS.

## Commandes
```bash
scripts/setup.sh                        # une seule fois : .env et database/conf/*.cnf avec secrets générés
docker compose up -d db                 # MySQL local (127.0.0.1:3306)
cd backend  && npm run check            # typecheck + lint + tests unitaires
cd backend  && npm run test:integration # tests sur jobpilot_test (MySQL requis)
cd backend  && npm run db:migrate       # applique les migrations (compte jobpilot_migrator)
cd backend  && npm run dev              # API sur :4000
cd frontend && npm run check
cd frontend && npm run dev              # interface sur :5173
scripts/db/backup.sh && scripts/db/restore-check.sh
```

## Méthode de travail (obligatoire)
1. **Une tâche à la fois**, dans l'ordre de `docs/ROADMAP.md`, via `/project:next-task`.
2. Lire les exigences de la tâche **avant** d'écrire du code. Ambiguïté → poser la question, ne rien inventer.
3. **Tests d'abord**, titrés avec l'identifiant d'exigence : `it('[EF-CAN-07] ...')`.
4. Implémenter le minimum, refactorer, respecter `.claude/rules/`.
5. `npm run check` vert dans chaque package touché ; tests d'intégration si la base est concernée.
6. Mettre à jour `docs/TRACABILITE.md` et cocher la tâche dans `docs/ROADMAP.md`.
7. Un commit par tâche : `T-xxx <type>(<module>): <summary>` + exigences couvertes dans le corps.
8. **S'arrêter et faire un rapport.** Ne jamais enchaîner la tâche suivante sans accord.

## Définition de fini (toute tâche)
- [ ] Chaque critère d'acceptation des exigences de la tâche est couvert par un test qui passe.
- [ ] `npm run check` vert (typecheck strict, lint typé sans erreur, tests unitaires ; côté backend, couverture ≥ 80 %
  sur `modules/`, `llm/`, `scraper/` incluse dans `check`) dans les packages modifiés.
- [ ] `npm run audit` sans vulnérabilité haute ou critique si une dépendance a été ajoutée (ENF-SEC-10).
- [ ] Nouvelles requêtes SQL vérifiées par `EXPLAIN` ; nouvelle structure = nouvelle migration.
- [ ] Aucun secret, aucune donnée personnelle réelle dans le code, les fixtures ou les journaux.
- [ ] `docs/TRACABILITE.md` et `docs/ROADMAP.md` à jour.
- [ ] `/project:review` : verdict « Prêt à commiter ».

## Règles (chargées selon les fichiers touchés)
`.claude/rules/` : `clean-code.md`, `security.md`, `database-mysql.md`, `testing.md`, `api-conventions.md`,
`llm.md`, `scraping.md`, `frontend.md`.
Skills de référence : `.claude/skills/` (`clean-code`, `security`, `dba-mysql`, `requirements-engineering`,
`add-llm-task`, `add-scraper-adapter`).

## Interdits
- Lire ou afficher `.env`, `database/conf/*.cnf`, `backend/data/profile.json` (données réelles du candidat).
  Pour les tests, utiliser `backend/tests/fixtures/profile.example.json`.
- Modifier une migration commitée (bloqué par hook) ; exécuter `scripts/db/restore.sh` ; `git push`.
- Appeler une API réelle (Claude, Gemini, Gmail, site carrières) dans un test.
- Ajouter une dépendance sans accord explicite ni justification (voir security.md).
- Affaiblir un test, désactiver une règle lint/TS, ou élargir le périmètre pour « faire passer ».
- Collecter LinkedIn, Indeed, Welcome to the Jungle.

## Dépendances pré-approuvées (à installer au moment de la tâche qui en a besoin)
| Tâche | Paquets |
|---|---|
| T-201 | `@anthropic-ai/sdk`, `@google/genai` |
| T-301 | `googleapis` |
| T-305 | `node-cron` |
| T-401 | `robots-parser` |
| T-403 | `cheerio` |
| T-502 | `docx` |
| T-003+ (frontend) | `recharts` (T-602 uniquement) |
Toute autre dépendance : demander.

## Conventions rapides
- Code et identifiants en anglais ; interface et documentation en français.
- Dates en UTC (`DATETIME(3)`), affichage en `fr-FR` côté interface.
- Chaque fonction exportée a un JSDoc indiquant garanties, cas `null`, exceptions, et l'exigence servie (`@req`).

