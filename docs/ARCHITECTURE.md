# Architecture

## 1. Vue d'ensemble

```
┌──────────────┐  HTTP JSON   ┌──────────────────────────────┐   SQL   ┌────────────┐
│  frontend    │ ───────────▶ │  backend (Node 22, Express)  │ ──────▶ │ MySQL 8.4  │
│  React + TS  │  127.0.0.1   │  modules métier + scheduler  │         │  InnoDB    │
└──────────────┘              └──────┬─────────┬─────────┬───┘         └────────────┘
                                     │         │         │
                              Gmail API   Claude/Gemini  Sites carrières (ATS)
```

## 2. Décisions d'architecture (ADR courts)

| # | Décision | Justification | Alternative écartée |
|---|---|---|---|
| ADR-01 | TypeScript strict partout, `zod` aux frontières | Skill clean-code (pas de `any`, données externes parsées) | JavaScript + JSDoc |
| ADR-02 | SQL écrit à la main avec `mysql2`, repositories par module, pas d'ORM | Contrôle des requêtes et des plans d'exécution (skill dba-mysql), requêtes paramétrées | Prisma / TypeORM |
| ADR-03 | Migrations SQL versionnées, appliquées par un compte DDL distinct du compte applicatif | Moindre privilège (ENF-SEC-09) | `synchronize` d'ORM |
| ADR-04 | Organisation par module métier (`modules/<domaine>/{routes,service,repository,schemas}`) | Haute cohésion, faible couplage | Découpage par couche technique |
| ADR-05 | Routeur IA avec table tâche → fournisseurs ordonnés | Bascule automatique (EF-IA-02), ajout de tâche sans toucher aux fournisseurs (ENF-MAI-04) | Appels directs aux SDK |
| ADR-06 | Adaptateurs de veille enregistrés dans un registre | Ouvert/fermé (ENF-MAI-03) | `switch` sur le type |
| ADR-07 | Dates stockées en `DATETIME(3)` UTC, fuseau de session forcé à `+00:00` | Pas de limite 2038 (`TIMESTAMP`), pas d'ambiguïté de fuseau | `TIMESTAMP` |
| ADR-08 | Jeu de caractères `utf8mb4`, collation `utf8mb4_0900_ai_ci` | Accents français, emojis dans les objets de mails | `utf8` (3 octets) |
| ADR-09 | Pas d'authentification applicative ; exposition limitée à 127.0.0.1 | Mono-utilisateur local (C-05) ; documenté comme interdit de déploiement public | Login JWT |
| ADR-10 | Sauvegarde logique quotidienne (`mysqldump --single-transaction`) + binlogs activés | RPO 24 h aujourd'hui, PITR possible plus tard (Q-03) | Sauvegarde physique (arrêt requis) |

## 3. Arborescence cible du backend

```
backend/src/
  config/env.ts              validation des variables d'environnement
  db/                        pool, transaction, runner de migrations
  lib/                       erreurs, logger, helpers HTTP, crypto, texte
  llm/                       providers/, router.ts, prompts/
  scraper/                   http.ts (collecte responsable), adapters/ + registre
  modules/
    applications/            candidatures + entreprises (RG-03, RG-04)
    emails/                  Gmail : auth, sync, classement, libellés
    sites/                   sources surveillées
    offers/                  offres, notation, récapitulatif
    cv/                      profil, rendu docx, pdf, adaptation, motivation
    stats/                   indicateurs du tableau de bord
  jobs/scheduler.ts
  app.ts                     assemblage Express (testable sans écouter de port)
  server.ts                  démarrage + scheduler
backend/tests/
  integration/               Supertest + MySQL de test
  fixtures/                  mails, réponses ATS, réponses IA simulées
```

## 4. Modèle de données

Modèle physique : `database/migrations/001_initial_schema.sql` (source de vérité).

```
companies 1───n applications n───1 job_offers n───1 watched_sites
                    │  1                  │ 1
                    │                     └──n cv_versions
                    n
                 emails

settings (clé/valeur JSON)   job_runs (journal des tâches)   llm_calls (journal IA)
```

| Table | Rôle | Volume estimé (H-01) |
|---|---|---|
| companies | Employeurs, dédoublonnés par clé normalisée | < 2 000 |
| applications | Candidatures (couple entreprise + intitulé) | < 5 000 |
| emails | Métadonnées des messages rattachés | < 50 000 |
| watched_sites | Sources surveillées | < 200 |
| job_offers | Offres détectées | < 50 000 |
| cv_versions | CV générés | < 2 000 |
| job_runs | Journal des synchros et veilles | ~ 60 / jour |
| llm_calls | Journal des appels IA | < 200 000 |

## 5. Comptes MySQL (moindre privilège)

| Compte | Droits | Utilisé par |
|---|---|---|
| `jobpilot_app` | SELECT, INSERT, UPDATE, DELETE sur `jobpilot.*` | backend (exécution) |
| `jobpilot_migrator` | ALL sur `jobpilot.*` | runner de migrations uniquement |
| `jobpilot_backup` | SELECT, SHOW VIEW, TRIGGER, EVENT, LOCK TABLES, PROCESS, RELOAD | scripts de sauvegarde |
| `jobpilot_test` | ALL sur `jobpilot_test.*` | tests d'intégration |
