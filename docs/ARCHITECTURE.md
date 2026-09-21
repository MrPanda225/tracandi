# Architecture

## 1. Vue d'ensemble

```
┌──────────────┐  HTTP JSON   ┌──────────────────────────────┐  TLS   ┌──────────────────┐
│  frontend    │ ───────────▶ │  backend (Node 22, Express)  │ ─────▶ │ PostgreSQL, Neon │
│  React + TS  │  127.0.0.1   │  modules métier + scheduler  │ Drizzle│  région UE       │
└──────────────┘              └──────┬─────────┬─────────┬───┘        └──────────────────┘
        poste du candidat (Docker)   │         │         │                 hébergé
                                     │         │         │
                              Gmail API   Claude/Gemini  Sites carrières (ATS)
```

## 2. Décisions d'architecture (ADR courts)

| # | Décision | Justification | Alternative écartée |
|---|---|---|---|
| ADR-01 | TypeScript strict partout, `zod` aux frontières | Skill clean-code (pas de `any`, données externes parsées) | JavaScript + JSDoc |
| ADR-02 | Accès aux données par Drizzle ORM (pilote `pg`), repositories par module ; pas de SQL assemblé à la main, `sql.raw` interdit | Valeurs toujours paramétrées, tables et colonnes vérifiées par TypeScript (ENF-SEC-16, C-09) ; SQL généré lisible (`toSQL()`) pour `EXPLAIN` | SQL à la main (`mysql2`, version 1.0), Prisma (moteur binaire, migrations propriétaires) |
| ADR-03 | Schéma décrit dans `backend/src/db/schema.ts` (source de vérité) ; migrations SQL générées par `drizzle-kit generate`, relues et commitées dans `backend/drizzle/`, appliquées par le service `migrate` avec le rôle propriétaire, distinct du rôle applicatif | Moindre privilège (ENF-SEC-09), migrations versionnées (ENF-MAI-05), pas de dérive entre types et base | `drizzle-kit push` (pas d'historique), SQL écrit à la main |
| ADR-04 | Organisation par module métier (`modules/<domaine>/{routes,service,repository,schemas}`) | Haute cohésion, faible couplage | Découpage par couche technique |
| ADR-05 | Routeur IA avec table tâche → fournisseurs ordonnés | Bascule automatique (EF-IA-02), ajout de tâche sans toucher aux fournisseurs (ENF-MAI-04) | Appels directs aux SDK |
| ADR-06 | Adaptateurs de veille enregistrés dans un registre | Ouvert/fermé (ENF-MAI-03) | `switch` sur le type |
| ADR-07 | Dates stockées en `timestamp(3) with time zone`, sessions en UTC | Instant absolu sans ambiguïté de fuseau | `timestamp without time zone` |
| ADR-08 | Encodage `UTF8` ; comparaisons insensibles à la casse et aux accents faites sur les clés normalisées (RG-14), recherche par sous-chaîne via index trigramme `pg_trgm` | Accents français, emojis ; recherche EF-CAN-03 sans parcours complet (ENF-PERF-04, Q-05) | Collations non déterministes (pas d'index `LIKE`) |
| ADR-09 | Pas d'authentification applicative ; exposition limitée à 127.0.0.1 | Mono-utilisateur local (C-05) ; documenté comme interdit de déploiement public | Login JWT |
| ADR-10 | Sauvegarde logique quotidienne (`pg_dump`, rôle en lecture seule) vers le poste, rétention 30 jours ; restauration Neon à un instant donné en complément | RPO 24 h indépendant de l'offre Neon (Q-03, Q-13), copie hors hébergeur | Seule restauration Neon (fenêtre courte en offre gratuite) |
| ADR-11 | Base hébergée par Neon, région UE, connexion `sslmode=verify-full` ; API et interface restent locales | Décision du Business Owner (BES-10, C-02, C-05) ; ENF-SEC-15, ENF-RGP-03 | MySQL local en Docker (version 1.0) |
| ADR-12 | Tests d'intégration et restauration de contrôle sur un PostgreSQL local en Docker (`postgres:18`), même version majeure que Neon (18, constaté le 22/09/2026) | Tests hors réseau et rapides, aucune donnée réelle hors du poste ; aucun appel à Neon en test | Branche Neon de test (réseau, quotas) |

## 3. Arborescence cible du backend

```
backend/src/
  config/env.ts              validation des variables d'environnement
  db/                        client Drizzle, schema.ts (source de vérité), transaction, migrate.ts
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
  integration/               Supertest + PostgreSQL local de test (Docker)
  fixtures/                  mails, réponses ATS, réponses IA simulées
```

## 4. Modèle de données

Modèle physique : `backend/src/db/schema.ts` (source de vérité, T-002) et migrations générées dans `backend/drizzle/`.
`database/migrations/001_initial_schema.sql` (syntaxe MySQL, jamais appliquée) sert de référence fonctionnelle
pour écrire `schema.ts` : mêmes tables, contraintes et index justifiés ; il est retiré en T-002.
Écart v1.1 à intégrer dans `schema.ts` : type de contrat (`contract_type` : cdi, cdd, alternance, job_etudiant, autre, non_precise)
sur `applications` et `job_offers` (BES-12, EXM-11).
`cv_versions.provider` devient obligatoire : plus de CV générique sans IA (EF-CVX-03 supprimée) ; ajout du taux de couverture
des mots-clés (`keyword_coverage`, 0–100) et des mots-clés non couverts (`jsonb`) (EF-CVX-16).

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

## 5. Rôles PostgreSQL (moindre privilège, ENF-SEC-09, ENF-SEC-17)

| Rôle | Droits | Utilisé par |
|---|---|---|
| `jobpilot_owner` | Propriétaire du schéma (DDL) | service `migrate` uniquement |
| `jobpilot_app` | SELECT, INSERT, UPDATE, DELETE sur les tables, USAGE sur les séquences (`ALTER DEFAULT PRIVILEGES`) | backend (exécution) |
| `jobpilot_backup` | SELECT sur les tables et séquences | `pg_dump` quotidien |
| `jobpilot_test` | Propriétaire de `jobpilot_test` sur le PostgreSQL **local** | tests d'intégration |

Chaque rôle a sa propre chaîne de connexion (`DATABASE_URL_APP`, `DATABASE_URL_MIGRATOR`, `DATABASE_URL_BACKUP`),
révocable séparément depuis la console Neon.
