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
| ADR-05 | Routeur IA avec table tâche × mode (v1.35) → fournisseurs ordonnés | Bascule automatique (EF-IA-02), ajout de tâche sans toucher aux fournisseurs (ENF-MAI-04) | Appels directs aux SDK |
| ADR-06 | Adaptateurs de veille enregistrés dans un registre | Ouvert/fermé (ENF-MAI-03) | `switch` sur le type |
| ADR-07 | Dates stockées en `timestamp(3) with time zone`, sessions en UTC | Instant absolu sans ambiguïté de fuseau | `timestamp without time zone` |
| ADR-08 | Encodage `UTF8` ; comparaisons insensibles à la casse et aux accents faites sur les clés normalisées (RG-14), recherche par sous-chaîne via index trigramme `pg_trgm` | Accents français, emojis ; recherche EF-CAN-03 sans parcours complet (ENF-PERF-04, Q-05) | Collations non déterministes (pas d'index `LIKE`) |
| ADR-09 | Comptes utilisateurs (v1.2) : session serveur (table `sessions`, jeton aléatoire 256 bits haché SHA-256) portée par un cookie `HttpOnly`, `SameSite=Strict` ; mots de passe scrypt ; garde d'authentification globale sur `/api` avec liste blanche ; exposition limitée à 127.0.0.1 | Multi-utilisateur (BES-14) ; révocation immédiate à la déconnexion (EF-AUT-04), jeton inutilisable en cas de fuite de la base ; `SameSite=Strict` + garde JSON + garde d'origine contre le CSRF | JWT (révocation impossible sans liste noire), bibliothèque d'authentification (dépendance) |
| ADR-13 | Documentation OpenAPI 3 générée depuis les schémas zod (`@asteasolutions/zod-to-openapi`), servie par `swagger-ui-express` | Une seule source de vérité : le schéma qui valide la requête la documente (EF-DOC-01) | Fichier OpenAPI écrit à la main (dérive) |
| ADR-10 | Sauvegarde logique quotidienne (`pg_dump`, rôle en lecture seule) vers le poste, rétention 30 jours ; restauration Neon à un instant donné en complément | RPO 24 h indépendant de l'offre Neon (Q-03, Q-13), copie hors hébergeur | Seule restauration Neon (fenêtre courte en offre gratuite) |
| ADR-11 | Base hébergée par Neon, région UE, connexion `sslmode=verify-full` ; API et interface restent locales | Décision du Business Owner (BES-10, C-02, C-05) ; ENF-SEC-15, ENF-RGP-03 | MySQL local en Docker (version 1.0) |
| ADR-14 | Fonctionnalités facultatives (`watch`, `cv`) activées par `ENABLED_FEATURES` au démarrage du serveur ; le serveur est la seule source de vérité, l'interface la lit sur `GET /api/settings/features`. Branches : `dev` intègre tout ; `main` porte les versions déployées, avec le même code et une configuration différente | Une production réduite au périmètre de BES-29 sans que `main` diverge de `dev` : une version `dev` → `main` reste sans conflit ; une fonctionnalité éteinte n'a aucune surface d'attaque (routes non montées, ENF-SEC) | Supprimer la veille et le CV de `main` (conflits « modifié/supprimé » à chaque version) ; drapeau de compilation Vite (deux sources de vérité) |
| ADR-15 | Hébergement (BES-39) : interface statique sur Vercel, qui **relaie `/api/*`** (réécriture) vers l'API sur Northflank ; une seule instance d'API ; migrations par une tâche Northflank avec le rôle propriétaire ; `TRUST_PROXY=2` pour lire l'adresse du visiteur derrière les deux relais | Une seule origine pour le navigateur : cookie `SameSite=Strict`, garde d'origine et retour OAuth Gmail fonctionnent sans CORS ni cookie tiers ; le planificateur et la file d'exécution sont dans le processus, deux instances doubleraient les passes | API appelée en direct depuis l'interface (cookie tiers bloqué par les navigateurs, `SameSite=None`, CORS) ; plusieurs instances (verrou distribué à construire) |
| ADR-12 | Tests d'intégration et restauration de contrôle sur un PostgreSQL local en Docker (`postgres:18`), même version majeure que Neon (18, constaté le 22/09/2026) | Tests hors réseau et rapides, aucune donnée réelle hors du poste ; aucun appel à Neon en test | Branche Neon de test (réseau, quotas) |
| ADR-16 | Fournisseur IA `local` (v1.35) : valeur `local` ajoutée à l'énumération `llm_provider` (migration générée par `drizzle-kit`, jamais d'édition d'une migration commitée) ; branché par `llm/providers/openaiCompatible.ts` avec une URL de base propre (`server.ts` ne fixe plus `GROQ_BASE_URL` pour tout fournisseur autre que Claude et Gemini) ; **délai, plafond de sortie et taille de lot par fournisseur** (`LLM_TIMEOUT_MS` 60 s et `DEFAULT_MAX_OUTPUT_TOKENS` 16 000 sont globaux dans `router.ts`) ; **routes par mode** (planifié ou attendu) au lieu d'une seule entrée par tâche dans `TASK_ROUTES`. Les modèles à réflexion d'Ollama (Qwen 3.5, Granite 4.2) raisonnent par défaut sur l'interface `/v1` et épuisent le plafond de sortie avant de répondre (constaté le 02/10/2026 : 333 s et contenu vide) : l'appel au fournisseur local porte `reasoning_effort: "none"` (le paramètre `think` est ignoré par `/v1`) ; ce paramètre n'est envoyé qu'au fournisseur local, car les autres services n'acceptent pas cette valeur. Une **température de 0,2** est aussi fixée pour le local : à la température par défaut, qwen3.5:4b a vu quatre réponses sur six refusées pour une énumération mal écrite (« junor »), un objet tronqué ou la chaîne « null » ; à 0,2, six sur six étaient valides (mesure du 02/10/2026 sur l'invite de déduction). Les schémas de réponse de la déduction et de l'extraction sont par ailleurs tolérants sur la forme, jamais sur le fond : une offre mal formée est écartée du lot au lieu de faire refuser toute la réponse, un contrat inventé est retiré, un niveau illisible prend celui du candidat, « null » ou « présent » vaut « expérience en cours », 09/2023 vaut 2023-09 ; une période encore fausse fait refuser la réponse, car des années mal comptées en silence valent moins qu'un second fournisseur. | Gratuit (BES-20 étendu), données sur du matériel de l'exploitant, aucune dépendance nouvelle (le fournisseur compatible OpenAI sait déjà parler à Ollama). | Un SDK dédié (dépendance à justifier) ; une variable d'environnement seule (impossible : l'énumération vient de la base). |
| ADR-17 | Accès de l'API au modèle local (v1.35, Q-25) : le fournisseur lit une adresse et un jeton, quel que soit le chemin réseau ; hypothèse par défaut : tunnel gratuit vers un proxy à jeton (Nginx) puis Ollama ; jamais le port d'Ollama ouvert sur Internet. | L'API hébergée (ADR-15) ne joint pas le réseau domestique ; Ollama n'a aucune authentification. | Ouvrir le port 11434 sur Internet (exclu) ; travailleur de veille chez l'exploitant (modifie C-05) ; local réservé au déploiement local (ne sert pas « chaque utilisateur » en production). |
| ADR-18 | Passages par créneau et fenêtre par source (v1.35) : `job_runs` porte le créneau ; `watched_sites` porte la date du **début de la dernière consultation réussie**, distincte de `last_checked_at` qui note aussi les échecs ; une offre lue mais non notée est enregistrée avec une note vide et reprise au passage suivant ; compteur « en attente de note ». | Corrige la perte d'offres après un échec (la fenêtre de France Travail repartait de l'heure de l'échec) et rend la reprise sans perte vérifiable. | Rejouer au démarrage les créneaux manqués (plus complexe, inutile : la fenêtre suffit). |

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
    settings/                réglages en lecture (fournisseurs d'IA, EF-CFG-02)
  jobs/                      scheduler.ts (node-cron), journal.ts (job_runs)
  app.ts                     assemblage Express (testable sans écouter de port)
  server.ts                  démarrage + scheduler
backend/tests/
  integration/               Supertest + PostgreSQL local de test (Docker)
  fixtures/                  mails, réponses ATS, réponses IA simulées
```

## 4. Modèle de données (v1.2, 3e forme normale)

Source de vérité : `backend/src/db/schema.ts` ; migrations générées dans `backend/drizzle/`.
Propriété des données (EF-AUT-06) : `user_id` figure uniquement sur les entités racines ; les autres tables en héritent
par clé étrangère (`applications → companies → users`, `job_offers → watched_sites → companies → users`…).

```
users ──< sessions
  ├──< companies ──< applications ──< application_status_history
  │         │            └──< emails >── processed_messages >── users
  │         ├──< watched_sites ──< job_offers
  │         └──< cv_versions ──< cv_keywords
  ├── app_settings (1)   gmail_accounts (0..1)   gmail_labels   prefilter_keywords
  ├──< job_runs ──< job_run_counters
  └──< llm_calls >── llm_model_prices (référentiel)
platforms ──< platform_domains (référentiel commun) ; platforms ──< applications, emails
```

| Table | Rôle | Clés et contraintes principales |
|---|---|---|
| users | Comptes | `email` unique (minuscules), `password_hash` scrypt |
| sessions | Sessions ouvertes | `token_hash` unique, `expires_at` (EF-AUT-07) |
| companies | Employeurs d'un utilisateur | unique (`user_id`, `name_key`) — RG-14 |
| platforms, platform_domains | Plateformes intermédiaires et domaines d'expéditeur (RG-10) | `name_key` unique, `domain` unique |
| prefilter_keywords | Mots-clés d'emploi du pré-filtre (RG-10, Q-09) | PK (`user_id`, `keyword`) |
| app_settings | Paramètres D, S, T, N, écriture des libellés ; veille automatique et créneaux choisis (v1.35, EF-CFG-07) | PK `user_id` ; au moins un créneau si la veille est activée |
| chosen_offers | Offres choisies par niveau : intitulé, mots-clés, années exigées — jamais le texte collé ni les coordonnées du recruteur (v1.35, ENF-RGP-14) | 3 au plus par utilisateur et par niveau (service) ; 1 à 15 mots-clés |
| cv_types | CV types d'un utilisateur : libellé, années (comptées par le code) et niveau — jamais le fichier, son texte ni les offres proposées, qui restent 30 minutes en mémoire (v1.35, ENF-RGP-14) | 4 au plus par utilisateur (service) ; années de 0 à 50 |
| applications | Candidatures | unique (`company_id`, `job_title_key`) ; `offer_id` unique ; `status`, `last_activity_at` = redondance contrôlée (RG-06) |
| application_status_history | Historique des statuts (Q-06) | origine `email` / `manual` / `offer` |
| processed_messages | Messages Gmail déjà traités, sans contenu (Q-08) | PK (`user_id`, `gmail_message_id`) |
| emails | Métadonnées des messages retenus | unique (`user_id`, `gmail_message_id`) → `processed_messages` ; extrait ≤ 300 car. |
| watched_sites | Sources surveillées | unique (`company_id`, `adapter`, `identifier`) |
| job_offers | Offres détectées | unique (`site_id`, `external_id`) ; score 0–100 |
| cv_versions | CV générés (instantané : entreprise et intitulé visés) | `file_stem` UUID unique ; `provider` obligatoire |
| cv_keywords | Mots-clés de l'offre, couverts ou non (EF-CVX-16) | PK (`cv_version_id`, `keyword`) ; taux calculé |
| gmail_accounts | Connexion Gmail d'un utilisateur | PK `user_id` ; jeton chiffré AES-256-GCM |
| gmail_labels | Cache des libellés créés | PK (`user_id`, `name`) |
| job_runs, job_run_counters | Journal des exécutions et compteurs ; créneau d'un passage planifié (v1.35, EF-VEI-51) | PK (`run_id`, `counter`) |
| llm_calls, llm_model_prices | Journal IA et tarifs (coût calculé, EF-CFG-03) | PK tarifs (`provider`, `model`, `valid_from`) |

Valeurs calculées, jamais stockées : « à relancer » (RG-06), taux de réponse (RG-07), taux de couverture (EF-CVX-16),
coût IA (EF-CFG-03). Seule redondance assumée : `applications.status` et `last_activity_at`, mis à jour dans la même
transaction que l'historique, pour les index de filtre et de relance.

## 5. Rôles PostgreSQL (moindre privilège, ENF-SEC-09, ENF-SEC-17)

| Rôle | Droits | Utilisé par |
|---|---|---|
| `tracandi_owner` | Propriétaire du schéma (DDL) | service `migrate` uniquement |
| `tracandi_app` | SELECT, INSERT, UPDATE, DELETE sur les tables, USAGE sur les séquences (`ALTER DEFAULT PRIVILEGES`) | backend (exécution) |
| `tracandi_backup` | SELECT sur les tables et séquences | `pg_dump` quotidien |
| `tracandi_test` | Propriétaire de `tracandi_test` sur le PostgreSQL **local** | tests d'intégration |

Chaque rôle a sa propre chaîne de connexion (`DATABASE_URL_APP`, `DATABASE_URL_MIGRATOR`, `DATABASE_URL_BACKUP`),
révocable séparément depuis la console Neon.
