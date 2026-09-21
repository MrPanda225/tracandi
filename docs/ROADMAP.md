# Roadmap de réalisation

Claude Code traite **une tâche à la fois**, dans l'ordre, via `/project:next-task`.
Une tâche n'est cochée que lorsque sa **définition de fini** est entièrement satisfaite (voir `CLAUDE.md`).
Chaque lot se termine par une démonstration au Business Owner avant d'ouvrir le suivant.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` terminée · `[!]` bloquée (raison notée en dessous)

---

## Lot 0 — Socle technique

- [ ] **T-001 Bootstrap backend** — `app.ts` / `server.ts`, `config/env.ts` (validation zod, arrêt si invalide),
  `lib/errors.ts`, `lib/logger.ts`, `lib/http.ts` (asyncHandler, validate), helmet, CORS, rate limit,
  garde JSON-only, route `GET /api/health`, gestionnaire d'erreurs central.
  *Exigences* : ENF-SEC-03, ENF-SEC-08, ENF-SEC-11, ENF-SEC-12, ENF-MAI-02.
  *Fini quand* : tests Supertest sur health, CORS refusé, 415 sur non-JSON, 500 masqué ; `npm run check` vert.
- [ ] **T-002 Accès MySQL et migrations** — pool `mysql2/promise`, helper transaction, runner de migrations
  (`database/migrations/*.sql`, table `schema_migrations`, compte DDL séparé), application de `001_initial_schema.sql`.
  *Exigences* : ENF-MAI-05, ENF-SEC-05, ENF-SEC-09.
  *Fini quand* : test d'intégration qui migre une base vide, relance sans effet (idempotent), et vérifie que le compte
  applicatif reçoit une erreur sur `CREATE TABLE`.
- [ ] **T-003 Shell frontend** — routes des 6 pages (contenu vide), client API typé, composants de base
  (Flash, StatusTag, PageHeader), styles de base, gestion d'erreur réseau explicite.
  *Exigences* : ENF-UTI-01, ENF-UTI-02, ENF-UTI-03.
  *Fini quand* : test de rendu de chaque route ; `npm run check` vert côté frontend.

## Lot 1 — Suivi manuel des candidatures

- [ ] **T-101 Domaine candidatures** — `normalizeKey` (RG-14), `shouldReplaceStatus` (RG-04), repository
  entreprises/candidatures, service de rattachement (RG-03).
  *Exigences* : EF-CAN-11, RG-03, RG-04, RG-14.
  *Fini quand* : tests unitaires couvrant chaque branche de RG-03 et RG-04 ; tests d'intégration du repository.
- [ ] **T-102 API candidatures** — `GET/POST/PATCH/DELETE /api/applications`, `GET /api/applications/:id/emails`,
  `PATCH /api/emails/:id` (rattachement manuel).
  *Exigences* : EF-CAN-02, 03, 04, 06, 07, 08, 09, 10, 12, ENF-SEC-04.
  *Fini quand* : un test par exigence ; validation 400 testée pour chaque corps de requête.
- [ ] **T-103 Écran Candidatures** — groupement par entreprise, filtres, recherche, chronologie, lien Gmail,
  ajout manuel, changement de statut, badge « à relancer ».
  *Exigences* : EF-CAN-01 à 05, 12.
  *Fini quand* : tests Testing Library sur filtre, recherche, ouverture de chronologie.

## Lot 2 — Orchestration IA

- [ ] **T-201 Fournisseurs et routeur** — interface `LlmProvider`, adaptateurs Claude et Gemini, table de routage
  (RG-13), délai 60 s, validation zod, bascule, journal `llm_calls`, erreur 502 finale.
  *Exigences* : EF-IA-01 à 06, ENF-MAI-04.
  *Fini quand* : tests avec fournisseurs simulés pour chaque cas de bascule ; aucun appel réseau réel en test.
- [ ] **T-202 Prompts** — module `prompts/` : un fichier par tâche, contenu externe délimité et déclaré non fiable.
  *Exigences* : ENF-SEC-06.
  *Fini quand* : test vérifiant que chaque prompt encadre le contenu externe par des balises.

## Lot 3 — Synchronisation Gmail

- [ ] **T-301 Connexion OAuth** — URL d'autorisation avec `state`, callback, chiffrement AES-256-GCM du jeton,
  révocation, statut.
  *Exigences* : EF-GML-01, 02, EF-CFG-01, ENF-SEC-02, ENF-SEC-07, ENF-SEC-14.
  *Fini quand* : tests du chiffrement (aller-retour, altération détectée) et du `state` (absent, faux, expiré).
- [ ] **T-302 Récupération incrémentale** — liste des messages depuis la dernière synchro, exclusion des connus,
  extraction métadonnées + extrait 300 car., pré-filtre RG-10.
  *Exigences* : EF-GML-04 à 07, ENF-RGP-01, ENF-FIA-03.
  *Fini quand* : tests sur client Gmail simulé avec fixtures (dont un message bancaire écarté).
- [ ] **T-303 Classement et rattachement** — tâche IA de classement par lots de 10, rattachement RG-03,
  statuts RG-04, persistance des messages.
  *Exigences* : EF-GML-08 à 12, EF-CAN-11.
  *Fini quand* : scénario McDonald's (envoi → accusé → entretien) et fixture APEC/LHH passent.
- [ ] **T-304 Libellés Gmail** — gestionnaire de libellés (cache, création à la demande), RG-05, alertes, mode lecture seule.
  *Exigences* : EF-GML-13 à 17.
  *Fini quand* : appels `threads.modify` vérifiés pour chaque statut.
- [ ] **T-305 Planification et suivi** — scheduler (fuseau `SCHEDULER_TIMEZONE`), verrou anti-concurrence, journal `job_runs`, écran Réglages.
  *Exigences* : EF-GML-03, EF-GML-18, ENF-FIA-01, EF-CFG-01, 02.
  *Fini quand* : test d'une exception dans la tâche sans arrêt du scheduler.

## Lot 4 — Veille des offres

- [ ] **T-401 Client HTTP de collecte** — robots.txt (cache par origine), 3 s par hôte, agent identifiant,
  délai 15 s, limite 3 Mo, https uniquement.
  *Exigences* : ENF-COL-01 à 04.
  *Fini quand* : tests avec serveur HTTP local simulé.
- [ ] **T-402 Adaptateurs ATS** — Greenhouse, Lever, SmartRecruiters, Recruitee, Workday ; registre d'adaptateurs.
  *Exigences* : EF-VEI-08, ENF-MAI-03.
  *Fini quand* : un test par adaptateur sur réponse enregistrée dans `tests/fixtures/ats/`.
- [ ] **T-403 Adaptateur générique** — HTML → texte + liens, extraction IA, filtrage des URL hors domaine.
  *Exigences* : EF-VEI-08.
  *Fini quand* : test où l'IA simulée renvoie une URL externe, qui est écartée.
- [ ] **T-404 Exécution et notation** — gestion des sources (API), dédoublonnage, pré-filtre RG-10, notation RG-09 par lots.
  *Exigences* : EF-VEI-01 à 07, 09 à 14, ENF-FIA-02.
  *Fini quand* : une source en échec n'empêche pas les autres (test).
- [ ] **T-405 Récapitulatif e-mail** — envoi via Gmail des offres de score ≥ S.
  *Exigences* : EF-VEI-15.
- [ ] **T-406 Écrans Sites et Offres** — ajout/suspension/retrait, liste triée, filtre score, garder/écarter,
  « J'ai postulé ».
  *Exigences* : EF-VEI-16 à 20.

## Lot 5 — CV et réponses

- [ ] **T-501 Profil de référence** — schéma zod, lecture/écriture `data/profile.json`, API.
  *Exigences* : EF-CVX-01, 02.
- [ ] **T-502 Rendu Word** — rendu conforme RG-11 à partir d'un contenu validé.
  *Exigences* : EF-CVX-03, 06, 08.
  *Fini quand* : test de structure du .docx + comparaison visuelle manuelle avec le modèle (capture jointe à la PR).
- [ ] **T-503 Conversion PDF** — LibreOffice sans shell (`execFile`), délai 60 s, contrôle 1 page A4.
  *Exigences* : EF-CVX-07, ENF-SEC-13.
- [ ] **T-504 CV adapté** — tâche IA, contrôle de fidélité RG-12, historique des versions, téléchargement.
  *Exigences* : EF-CVX-04, 05, 09, 10, 11.
  *Fini quand* : test avec entreprise inventée rejetée.
- [ ] **T-505 Réponse de motivation** — tâche IA, contrôle 80–140 mots.
  *Exigences* : EF-CVX-12.
- [ ] **T-506 Écran Atelier CV** — génération, téléchargement, réponse de motivation modifiable.
  *Exigences* : EF-CVX-13.

## Lot 6 — Tableau de bord

- [ ] **T-601 API statistiques** — indicateurs EF-TDB-01 à 08, RG-07.
  *Fini quand* : chaque requête vérifiée par `EXPLAIN` (pas de `type = ALL`) — ENF-PERF-04.
- [ ] **T-602 Écran tableau de bord**.

## Lot 7 — Exploitation

- [ ] **T-701 Sauvegardes** — brancher `scripts/db/backup.sh` et `restore-check.sh` (fournis), planification quotidienne.
  *Exigences* : ENF-FIA-04 à 08.
  *Fini quand* : une sauvegarde puis une restauration de contrôle réussissent ; durée de restauration mesurée.
- [ ] **T-702 Purge RGPD** — commande `npm run data:purge` avec confirmation.
  *Exigences* : ENF-RGP-02.
- [ ] **T-703 Jeu de charge et performance** — script de génération de données, mesures ENF-PERF-01 à 03.
- [ ] **T-704 Revue de sécurité finale** — checklist du skill `security`, `npm audit`, revue des journaux,
  exposition réseau, localisation des données, démarrage `docker compose up` après `scripts/setup.sh`.
  *Exigences* : ENF-SEC-01, ENF-SEC-10, ENF-RGP-03, ENF-POR-01.
- [ ] **T-705 Coûts IA** — agrégat mensuel `llm_calls`, affichage EF-CFG-03, contrôle ENF-COU-01.
