# Tracandi — instructions pour Claude Code

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
| `docs/ARCHITECTURE.md` | Décisions (ADR), arborescence cible, modèle de données, rôles PostgreSQL |
| `docs/CONVENTIONS_GIT.md` | Branches, commits (Conventional Commits + préfixe `T-xxx`), pull requests |

## Stack
- **Backend** : Node 22, TypeScript strict, Express 4, Drizzle ORM (pilote `pg`, aucun SQL assemblé à la main), zod, Vitest + Supertest.
- **Frontend** : React 18, TypeScript strict, Vite, React Router, Vitest + Testing Library.
- **Base** : PostgreSQL hébergé par **Neon** (région UE, TLS). Schéma dans `backend/src/db/schema.ts`, migrations générées
  par `drizzle-kit` dans `backend/drizzle/`. Tests d'intégration sur un PostgreSQL **local** (Docker), jamais sur Neon.
  *Transition* : `scripts/db/` est encore en version MySQL jusqu'à T-701.
- **IA** : Groq (trois emplacements de modèles gratuits, via `fetch` sur l'API compatible OpenAI), Claude
  (`@anthropic-ai/sdk`) et Gemini (`@google/genai`) derrière un routeur avec bascule (RG-13).
- **Intégrations** : Gmail API (`googleapis`), API publiques des ATS.

## Commandes
```bash
scripts/setup.sh                        # une seule fois : .env avec secrets générables (test, chiffrement)
docker compose up -d db                 # PostgreSQL 18 local de test (127.0.0.1:5432)
cd backend  && npm run check            # typecheck + lint + tests unitaires (sans base)
cd backend  && npm run test:coverage    # tous les tests + couverture ≥ 80 % (base locale requise)
cd backend  && npm run test:integration # tests sur tracandi_test (base locale Docker)
cd backend  && npm run db:migrate       # applique les migrations (rôle propriétaire tracandi_owner)
cd backend  && npm run dev              # API sur :4000
cd frontend && npm run check
cd frontend && npm run dev              # interface sur :5173
scripts/db/backup.sh && scripts/db/restore-check.sh
```

## Méthode de travail (obligatoire)
1. **Une tâche à la fois**, dans l'ordre de `docs/ROADMAP.md`, via `/project:next-task`, sur une **branche dédiée**
   `<type>/T-xxx-<résumé>` créée depuis **`dev`** à jour (`main` ne reçoit que les versions, voir `docs/CONVENTIONS_GIT.md`).
2. Lire les exigences de la tâche **avant** d'écrire du code. Ambiguïté → poser la question, ne rien inventer.
3. **Tests d'abord**, titrés avec l'identifiant d'exigence : `it('[EF-CAN-07] ...')`.
4. Implémenter le minimum, refactorer, respecter `.claude/rules/`.
5. `npm run check` vert dans chaque package touché ; tests d'intégration si la base est concernée.
6. Mettre à jour `docs/TRACABILITE.md` et cocher la tâche dans `docs/ROADMAP.md`.
7. Commits sur la branche : `T-xxx <type>(<module>): <summary>` + exigences couvertes dans le corps. Tâche finie :
   push de la branche et pull request vers `dev` décrite avec `.github/pull_request_template.md` ; le Business Owner
   fusionne en « Squash and merge » (un commit par tâche sur `dev`). Détails : `docs/CONVENTIONS_GIT.md`.
   Périmètre de `main` et `dev` (BES-29) : tableau de bord, candidatures, réglages Gmail ; veille et CV désactivés par
   `ENABLED_FEATURES` (ENF-MAI-07), écrans « En préparation », code jamais retiré.
8. **S'arrêter et faire un rapport.** Ne jamais enchaîner la tâche suivante sans accord.

## Définition de fini (toute tâche)
- [ ] Chaque critère d'acceptation des exigences de la tâche est couvert par un test qui passe.
- [ ] `npm run check` vert (typecheck strict, lint typé sans erreur, tests unitaires) dans les packages modifiés.
- [ ] Backend : `npm run test:coverage` vert (unitaires + intégration, couverture ≥ 80 % sur `modules/`, `llm/`, `scraper/`).
- [ ] `npm run audit` sans vulnérabilité haute ou critique si une dépendance a été ajoutée (ENF-SEC-10).
- [ ] Nouvelles requêtes vérifiées par `EXPLAIN` (SQL obtenu par `.toSQL()`) ; nouvelle structure = `schema.ts` modifié + migration générée.
- [ ] Aucun secret, aucune donnée personnelle réelle dans le code, les fixtures ou les journaux.
- [ ] `docs/TRACABILITE.md` et `docs/ROADMAP.md` à jour.
- [ ] `/project:review` : verdict « Prêt à commiter ».

## Règles (chargées selon les fichiers touchés)
`.claude/rules/` : `clean-code.md`, `security.md`, `database.md`, `testing.md`, `api-conventions.md`,
`llm.md`, `scraping.md`, `frontend.md`.
Skills de référence : `.claude/skills/` (`clean-code`, `security`, `requirements-engineering`,
`add-llm-task`, `add-scraper-adapter`).

## Interdits
- Lire ou afficher `.env`, `database/conf/*.cnf`, `backend/data/profile.json` (données réelles du candidat).
- Se connecter à la base Neon (données réelles) : seul le service `migrate` et le backend le font, jamais Claude Code ni un test.
  Pour les tests, utiliser `backend/tests/fixtures/profile.example.json`.
- Modifier une migration commitée (bloqué par hook) ; exécuter `scripts/db/restore.sh`.
- Commit ou push direct sur `main` ou `dev`, `git push --force`, fusionner une pull request (réservé au Business Owner).
- Appeler une API réelle (Claude, Gemini, Gmail, site carrières) dans un test.
- Ajouter une dépendance sans accord explicite ni justification (voir security.md).
- Affaiblir un test, désactiver une règle lint/TS, ou élargir le périmètre pour « faire passer ».
- Collecter LinkedIn, Indeed, Welcome to the Jungle.

## Dépendances pré-approuvées (à installer au moment de la tâche qui en a besoin)
| Tâche | Paquets |
|---|---|
| T-002 | `drizzle-orm`, `pg` ; dev : `drizzle-kit`, `@types/pg` (installés) |
| T-005 | `@asteasolutions/zod-to-openapi`, `swagger-ui-express` ; dev : `@types/swagger-ui-express` (installés) |
| T-201 | `@anthropic-ai/sdk`, `@google/genai` (installés) |
| T-301 | `googleapis` (installé) |
| T-305 | `node-cron` (installé) |
| T-401 | `robots-parser` |
| T-403 | `cheerio` |
| T-502 | `docx` |
| T-006 (frontend) | `animejs` (animations), `@fontsource-variable/fraunces`, `@fontsource-variable/manrope` (polices auto-hébergées) — installés |
| T-003+ (frontend) | `recharts` (T-602 uniquement) — installé |

Composants React Bits : copiés et adaptés dans `frontend/src/components/reactbits/` (licence MIT + Commons Clause, `LICENSE.md`),
uniquement ceux sans dépendance ; toute version exigeant GSAP, Motion ou Three.js demande un accord.
Toute autre dépendance : demander.

## Conventions rapides
- Code et identifiants en anglais ; interface et documentation en français.
- Dates en UTC (`DATETIME(3)`), affichage en `fr-FR` côté interface.
- Chaque fonction exportée a un JSDoc indiquant garanties, cas `null`, exceptions, et l'exigence servie (`@req`).

