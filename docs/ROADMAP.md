# Roadmap de réalisation

Claude Code traite **une tâche à la fois**, dans l'ordre, via `/project:next-task`.
Une tâche n'est cochée que lorsque sa **définition de fini** est entièrement satisfaite (voir `CLAUDE.md`).
Chaque lot se termine par une démonstration au Business Owner avant d'ouvrir le suivant.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` terminée · `[!]` bloquée (raison notée en dessous)

---

## Lot 0 — Socle technique

- [x] **T-001 Bootstrap backend** — `app.ts` / `server.ts`, `config/env.ts` (validation zod, arrêt si invalide),
  `lib/errors.ts`, `lib/logger.ts`, `lib/http.ts` (asyncHandler, validate), helmet, CORS, rate limit,
  garde JSON-only, route `GET /api/health`, gestionnaire d'erreurs central.
  *Exigences* : ENF-SEC-03, ENF-SEC-08, ENF-SEC-11, ENF-SEC-12, ENF-MAI-02.
  *Fini quand* : tests Supertest sur health, CORS refusé, 415 sur non-JSON, 500 masqué ; `npm run check` vert.
- [~] **T-002 Accès PostgreSQL (Neon) et migrations** — client Drizzle (pilote `pg`, TLS `verify-full`), `db/schema.ts`
  reprenant le modèle de `database/migrations/001_initial_schema.sql` (puis retrait de ce fichier MySQL et de `database/init/`),
  migration initiale générée par `drizzle-kit`, `db/migrate.ts` (rôle propriétaire), helper transaction, rôles
  `tracandi_app` / `tracandi_backup` créés par migration, PostgreSQL local en Docker pour les tests,
  règle ESLint interdisant `sql.raw` et tout import de `pg` hors de `db/`.
  Ajout au modèle de référence : énumération `contract_type` (cdi, cdd, alternance, job_etudiant, autre, non_precise) sur `applications`
  et `job_offers` (remplace `job_offers.contract`), index `(contract_type, status)` sur `applications` (EF-CAN-14).
  `cv_versions` : `provider` obligatoire, `keyword_coverage` et mots-clés non couverts (EF-CVX-16).
  *Exigences* : ENF-MAI-05, ENF-SEC-05, ENF-SEC-09, ENF-SEC-15, ENF-SEC-16, ENF-SEC-17.
  *Fini quand* : test d'intégration (PostgreSQL local) qui migre une base vide, relance sans effet, vérifie que le rôle
  applicatif reçoit une erreur sur `CREATE TABLE` ; test unitaire refusant une URL de connexion sans `sslmode=verify-full`.
  *Reste à faire* : rôles `tracandi_app` / `tracandi_backup` sur Neon (mots de passe à créer dans la console) et test
  ENF-SEC-09 ; en attendant, le backend utilise le rôle propriétaire (phase de développement, sans donnée réelle).
- [x] **T-004 Comptes et sessions** — tables `users`, `sessions` ; inscription, connexion, déconnexion, `me` ;
  mots de passe scrypt, jeton de session aléatoire haché, cookie `HttpOnly` `SameSite=Strict`, garde d'authentification
  globale, limite de tentatives ; toutes les données rattachées à un utilisateur.
  *Exigences* : EF-AUT-01 à 08, ENF-SEC-18, 19, 20.
  *Fini quand* : tests d'intégration inscription → connexion → accès → déconnexion → 401 ; isolation entre deux comptes (404).
- [x] **T-005 Documentation OpenAPI** — description générée depuis les schémas zod des routes, `/api/openapi.json`,
  interface Swagger `/api/docs`.
  *Exigences* : EF-DOC-01, 02.
  *Fini quand* : test vérifiant que chaque route montée figure dans la description.
- [x] **T-006 Écran d'authentification** — connexion / création de compte, client API (`request()` unique, cookie de
  session), garde des routes, système visuel 60/30/10 (tokens), animations anime.js, composants React Bits adaptés
  (SpotlightCard, ClickSpark, Magnet, Noise), scène 3D CSS des candidatures, page d'accueil provisoire.
  *Exigences* : EF-AUT-01 à 05 (interface), ENF-UTI-01, 02, 03.
  *Fini quand* : tests Testing Library du parcours (connexion, inscription, erreurs, attente, déconnexion) ; captures 1440 et 390 px.
- [x] **T-003 Shell frontend** — routes des 6 pages (contenu vide), client API typé, composants de base
  (Flash, StatusTag, PageHeader), styles de base, gestion d'erreur réseau explicite.
  *Exigences* : ENF-UTI-01, ENF-UTI-02, ENF-UTI-03.
  *Fini quand* : test de rendu de chaque route ; `npm run check` vert côté frontend.

## Lot 1 — Suivi manuel des candidatures

- [x] **T-101 Domaine candidatures** — `normalizeKey` (RG-14), `shouldReplaceStatus` (RG-04), repository
  entreprises/candidatures, service de rattachement (RG-03).
  *Exigences* : EF-CAN-11, RG-03, RG-04, RG-14.
  *Fini quand* : tests unitaires couvrant chaque branche de RG-03 et RG-04 ; tests d'intégration du repository.
- [x] **T-102 API candidatures** — `GET/POST/PATCH/DELETE /api/applications`, `GET /api/applications/:id/emails`,
  `PATCH /api/emails/:id` (rattachement manuel).
  *Exigences* : EF-CAN-02, 03, 04, 06, 07, 08, 09, 10, 12, 13, 14, ENF-SEC-04.
  *Fini quand* : un test par exigence ; validation 400 testée pour chaque corps de requête.
- [x] **T-103 Écran Candidatures** — groupement par entreprise, filtres, recherche, chronologie, lien Gmail,
  ajout manuel, changement de statut, badge « à relancer ».
  *Exigences* : EF-CAN-01 à 05, 12 ; interface d'EF-CAN-06, 07, 14.
  *Fini quand* : tests Testing Library sur filtre, recherche, ouverture de chronologie.
- [x] **T-104 Description de l'offre et date de candidature** — colonne `offer_description` (migration), création et
  modification de la description et de la date (RG-16), détail d'une candidature `GET /api/applications/:id` avec la
  description (absente de la liste), saisie dans le formulaire d'ajout et modification dans le détail.
  *Exigences* : EF-CAN-15, EF-CAN-16, RG-16 (demande du Business Owner du 22/09/2026, cahier des charges v1.4).
  *Fini quand* : tests d'intégration (20 001 caractères → 400, date future → 400, relance avec une date antérieure
  de 15 jours, description absente de la liste) ; tests Testing Library (saisie à la création, modification dans le détail).

## Lot 2 — Orchestration IA

- [x] **T-201 Fournisseurs et routeur** — interface `LlmProvider`, adaptateurs Claude et Gemini, table de routage
  (RG-13), délai 60 s, validation zod, bascule, journal `llm_calls`, erreur 502 finale.
  *Exigences* : EF-IA-01 à 06, ENF-MAI-04.
  *Fini quand* : tests avec fournisseurs simulés pour chaque cas de bascule ; aucun appel réseau réel en test.
  *Correctif du 22/09/2026* : raison du fournisseur écarté journalisée (erreur, délai, champs refusés par le schéma,
  sans le prompt ni la réponse) ; un fournisseur momentanément surchargé est redemandé 3 fois (2 s puis 5 s) avant la
  bascule (ENF-FIA-10, cahier v1.6).
  *Évolution du 22/09/2026 (cahier v1.7 puis v1.8, BES-20)* : adaptateur unique pour les API compatibles OpenAI
  (`llm/providers/openaiCompatible.ts`, par `fetch`, sans dépendance nouvelle) et trois **emplacements** Groq
  (`groq_1/2/3`, modèles configurés) en tête de RG-13, Gemini puis Claude en secours ; migrations 0005 à 0007
  (énumérations `llm_provider` et `classifier`). Les emplacements ne nomment pas de famille de modèle : le catalogue
  gratuit de Groq change (ni Llama 3.3 70B ni Kimi K2 sur le compte du candidat le 23/09/2026).

- [x] **T-202 Prompts** — module `prompts/` : un fichier par tâche, contenu externe délimité et déclaré non fiable.
  *Exigences* : ENF-SEC-06.
  *Fini quand* : test vérifiant que chaque prompt encadre le contenu externe par des balises.
  *Livré* : `frameUntrusted`, `truncate`, `UNTRUSTED_CONTENT_NOTICE` et le prompt `classify_emails` (avec son schéma
  `modules/emails/classification.ts`, utilisé par T-303). Les prompts des autres tâches arrivent avec leur tâche
  (T-403, T-404, T-504, T-505), sur le même modèle et avec le même test (procédure `add-llm-task`).

## Lot 3 — Synchronisation Gmail

- [x] **T-301 Connexion OAuth** — URL d'autorisation avec `state`, callback, chiffrement AES-256-GCM du jeton,
  révocation, statut.
  *Exigences* : EF-GML-01, 02, EF-CFG-01, ENF-SEC-02, ENF-SEC-07, ENF-SEC-14.
  *Fini quand* : tests du chiffrement (aller-retour, altération détectée) et du `state` (absent, faux, expiré).
  *Livré* : routes `/api/gmail/*` et écran Réglages (connexion, statut, déconnexion confirmée). Le callback est public :
  le cookie de session `SameSite=Strict` n'accompagne pas la redirection de Google, l'utilisateur est retrouvé par le `state`.
- [x] **T-302 Récupération incrémentale** — liste des messages depuis la dernière synchro, exclusion des connus,
  extraction métadonnées + extrait 300 car., pré-filtre RG-10.
  *Exigences* : EF-GML-04 à 07, ENF-RGP-01, ENF-FIA-03.
  *Fini quand* : tests sur client Gmail simulé avec fixtures (dont un message bancaire écarté).
  *Livré* : `modules/emails/fetcher.ts` (messages lus depuis une heure avant la dernière synchronisation, ou N jours),
  `mailbox.ts` (format `metadata` uniquement), `prefilter.ts` (listes initiales Q-09 : mots-clés donnés à la première
  synchronisation, plateformes connues enregistrées dans `platforms`). Les messages retenus ne sont marqués traités
  qu'après leur classement : la route `POST /api/gmail/sync`, ses compteurs et la date de dernière synchronisation
  arrivent donc avec T-303.
  *Correctif du 22/09/2026* : quota Gmail (`lib/rateLimiter.ts`, `modules/emails/quota.ts`) — appels espacés à
  200 unités/seconde (limite Google : 250), réessais avec attente exponentielle sur 429, 403 de quota et 5xx,
  passe bornée à 400 messages lus (`MAX_MESSAGES_PER_PASS`) avec reprise au passage suivant ; refus persistant
  renvoyé en 503 explicite au lieu d'une erreur interne.
- [x] **T-303 Classement et rattachement** — tâche IA de classement par lots de 10, rattachement RG-03,
  statuts RG-04, persistance des messages.
  *Exigences* : EF-GML-08 à 12, EF-GML-19, EF-CAN-11 ; fin d'EF-GML-04 et 06, ENF-FIA-03 (route de synchronisation).
  *Fini quand* : scénario McDonald's (envoi → accusé → entretien) et fixture APEC/LHH passent.
  *Livré* : `modules/emails/sync.ts` (lots de 10 par le routeur, un lot = une transaction, date de dernière
  synchronisation avancée seulement quand tout est classé), `attachIncomingMessage` (service candidatures),
  `POST /api/gmail/sync` et bouton « Synchroniser maintenant » dans Réglages. Une synchronisation à la fois par
  utilisateur (verrou en mémoire, repris par T-305).
- [x] **T-304 Libellés Gmail** — gestionnaire de libellés (cache, création à la demande), RG-05, alertes, mode lecture seule.
  *Exigences* : EF-GML-13 à 17.
  *Fini quand* : appels `threads.modify` vérifiés pour chaque statut.
  *Livré* : `modules/emails/labels.ts` (cache `gmail_labels`, création à la demande avec le parent), libellés posés
  après chaque lot enregistré sur tous les fils des candidatures touchées ; un refus de Gmail n'annule pas la
  synchronisation. Lecture seule : `PATCH /api/gmail/settings` et case à cocher dans Réglages.
  *Correctifs du 23/09/2026 (journaux de production)* : un type de contrat hors glossaire (« stage ») faisait rejeter
  tout un lot de 10 classements par le schéma ; il est désormais ramené au glossaire ou à « non précisé ». Un libellé
  Gmail déjà présent sous une autre casse, ou créé entre la lecture et l'écriture, faisait échouer l'étiquetage
  (409 « Label name exists or conflicts ») ; la création est devenue idempotente.
  *Correctif du 23/09/2026 (cahier v1.9, BES-21)* : RG-17 — un refus ouvert par une formule d'accusé de réception
  était classé « accusé de réception » par l'IA (l'extrait de 300 caractères commence par la politesse). Contrôle
  déterministe `modules/emails/cues.ts` appliqué après l'IA, et consigne renforcée dans le prompt.
  *Extension du 23/09/2026 (cahier v1.10, BES-22)* : listes d'expressions données par le Business Owner, complétées
  en français et en anglais ; les accusés de réception ont leur propre liste ; « suite favorable » ne vaut refus que
  sous une négation proche. Un changement de statut
  manuel n'est reporté dans Gmail qu'au prochain message de la candidature.
- [x] **T-305 Planification et suivi** — scheduler (fuseau `SCHEDULER_TIMEZONE`), verrou anti-concurrence, journal `job_runs`, écran Réglages.
  *Exigences* : EF-GML-03, EF-GML-18, ENF-FIA-01, EF-CFG-01, 02.
  *Fini quand* : test d'une exception dans la tâche sans arrêt du scheduler.
  *Livré* : `jobs/scheduler.ts` (node-cron, `CRON_GMAIL` dans `SCHEDULER_TIMEZONE`, sans chevauchement),
  `jobs/journal.ts` (`job_runs` + compteurs, manuel et planifié), verrou par utilisateur (exécution `skipped`),
  Q-11 (migration 0003 `authorization_expired_at`, bandeau « Reconnecter Gmail »), carte « Fournisseurs d'IA »
  (`GET /api/settings/ai`). La liste des mots-clés RG-10 n'est pas encore modifiable dans Réglages (Q-09) : aucune
  tâche ne la prévoit.

- [x] **T-306 Période de synchronisation réglable et quotas Gmail** — `PATCH /api/gmail/settings` accepte `lookbackDays`
  (1 à 365), `GET /api/gmail/status` l'expose, sélecteur « Période à synchroniser » dans Réglages ; migration 0004
  (défaut 30 jours, contrainte 1–365, reprise des boîtes restées à 120) ; gouverneur de quota Gmail
  (`lib/rateLimiter.ts`, `modules/emails/quota.ts`) : 50 unités/seconde, attente partagée par la boîte sur un refus,
  réessais 4/8/16/32 s, passe bornée à 200 messages, passage interrompu conservant les messages déjà lus.
  *Exigences* : EF-CFG-04, EF-GML-05 (v1.5), ENF-FIA-09 (demande du Business Owner du 22/09/2026, cahier v1.5).
  *Fini quand* : tests d'intégration (période par défaut 30 jours, réglage enregistré et refusé hors bornes, passe
  partielle sur refus de quota) et tests Testing Library (sélecteur, refus de l'API) ; `npm run check` vert.
- [x] **T-307 Classement lu sur le corps du message** — *demande du Business Owner du 24/09/2026 (cahier v1.18,
  BES-30) : deux refus étiquetés « Statut/En attente ».* Gmail lu au format `full` ; début du corps extrait en texte
  (`modules/emails/bodyText.ts` : partie `text/plain`, sinon HTML sans balises ni styles ; citations et pièces
  jointes exclues ; jeu de caractères de la partie) ; indices RG-17 sur 2 000 caractères, phrase par phrase, une
  expression de refus sous condition ignorée ; 1 000 caractères transmis à l'IA ; seul l'extrait de 300 caractères
  est conservé. Décodage des entités HTML mis en commun (`lib/html.ts`) avec la veille.
  *Exigences* : EF-GML-08 (précisée), RG-17 (v1.18), ENF-RGP-01 (précisée), ENF-COU-01.
  *Fini quand* : les deux refus du Business Owner, reproduits anonymisés, sont classés « refus » malgré une réponse
  « accusé de réception » de l'IA ; un accusé de réception annonçant un refus conditionnel le reste.
  *Hors périmètre* : les messages déjà traités ne sont pas relus (EF-GML-06) ; les corriger à la main (EF-CAN-07) ou
  demander une tâche de reclassement.
- [x] **T-308 Relecture des accusés de réception déjà classés** — *demande du Business Owner du 24/09/2026 (cahier
  v1.19, BES-31).* `POST /api/gmail/reclassify` met en file une exécution `gmail_reclassify` (migration 0012 :
  valeur d'énumération, compteur `messages_corrected`, index `ix_emails_user_category`) ; chaque message reçu classé
  « accusé de réception » est relu dans Gmail (T-307) et reclassé « refus » quand RG-17 le désigne, sa candidature
  suivant RG-04 dans la même transaction, puis ses fils relibellés ; aucun appel à l'IA. Réglages → Gmail : bouton
  « Relire les accusés de réception », avancement et bilan par le flux des exécutions. Jeu de charge complété des
  10 000 messages d'ENF-PERF-01, jusque-là absents.
  *Exigences* : EF-GML-20, RG-17, RG-04, ENF-PERF-04, EF-EXE-01, EF-EXE-03.
  *Fini quand* : un accusé de réception enregistré dont le corps refuse devient « refus », sa candidature « Refusée »
  et son fil « Statut/Refusée » ; un vrai accusé de réception reste inchangé ; `EXPLAIN` sans parcours complet de
  `emails` sur le jeu de charge.

## Lot 4 — Veille des offres

- [x] **T-401 Client HTTP de collecte** — robots.txt (cache par origine), 3 s par hôte, agent identifiant,
  délai 15 s, limite 3 Mo, https uniquement.
  *Exigences* : ENF-COL-01 à 04.
  *Fini quand* : tests avec serveur HTTP local simulé.
  *Livré* : `scraper/http.ts` — `createPoliteFetch({ contact })` : https seul, robots.txt lu une fois par origine
  (indisponible = refus complet, RFC 9309), un limiteur par hôte (`lib/rateLimiter.ts` réutilisé), agent
  `TracandiBot/1.0 (+contact)`, `AbortSignal.timeout(15 s)` et lecture du corps interrompue au-delà de 3 Mo.
  Dépendance `robots-parser` installée (`npm run audit` : aucune vulnérabilité haute ou critique).
  *Écart assumé* : le « serveur HTTP local simulé » est remplacé par un `fetch` injecté, comme partout ailleurs dans
  le projet — `testing.md` interdit le réseau dans un test unitaire, et un serveur local serait en http, refusé par
  le client. Les 17 tests couvrent chaque exigence, y compris l'annulation du flux au-delà de 3 Mo.
  *Reste à faire* : l'adresse de contact (ENF-COL-03) est un paramètre du client ; elle sera lue dans la
  configuration quand T-404 exécutera réellement la veille.
- [x] **T-402 Adaptateurs ATS** — Greenhouse, Lever, SmartRecruiters, Recruitee, Workday ; registre d'adaptateurs.
  *Exigences* : EF-VEI-08, EF-VEI-02 (RG-08), EF-VEI-22, ENF-MAI-03, ENF-FIA-02.
  *Fini quand* : un test par adaptateur sur réponse enregistrée dans `tests/fixtures/ats/`.
  *Livré* : `scraper/adapters/` — `types.ts` (contrat `SourceAdapter`, `NormalizedOffer` borné aux colonnes de
  `job_offers`, `SourceFetchError` dont le message est en français car il est montré au candidat, EF-VEI-11),
  `description.ts` (HTML → texte sans dépendance nouvelle, correspondance des libellés de contrat français et
  anglais), un fichier par source, `index.ts` pour le registre. Chaque source est jointe **par sa seule API
  publique de job board**, sans clé : Greenhouse, Lever et Recruitee rendent tout en une requête ;
  SmartRecruiters et Workday sont paginés et bornés à 5 pages.
  *Choix assumés* : SmartRecruiters et Workday ne publient pas le texte de l'offre dans leur liste — le lire
  coûterait une requête par offre, soit 3 s chacune (ENF-COL-02) ; la description reste nulle et sera lue par
  T-404 pour les seules offres nouvelles. `postedOn` de Workday (« Posted 5 Days Ago ») n'est pas une date : elle
  n'est pas devinée. « Full-time » et « Part-time » ne valent pas CDI (EF-VEI-22). `scraper/http.ts` gagne une
  option `{ method, json }` : la liste d'un site Workday n'existe qu'en POST, et passe par le même client poli.
  *Écart assumé* : les fixtures de `tests/fixtures/ats/` reproduisent le format documenté de chaque API avec des
  entreprises fictives ; aucune réponse réelle n'a été appelée (testing.md interdit le réseau en test).
  *Reste à faire* : le type `generic` (page carrières lue par IA) arrive avec T-403 ; `adapterFor('generic')`
  renvoie `undefined` en attendant, pour qu'une source de ce type signale son absence d'adaptateur.
- [x] **T-403 Adaptateur générique** — HTML → texte + liens, extraction IA, filtrage des URL hors domaine.
  *Exigences* : EF-VEI-08, EF-VEI-02 (RG-08), EF-VEI-09, ENF-SEC-06, ENF-COU-01, ENF-FIA-02.
  *Fini quand* : test où l'IA simulée renvoie une URL externe, qui est écartée.
  *Livré* : `scraper/page.ts` — `readPage(html, url)` (cheerio) rend le texte lisible et les liens résolus en
  adresses absolues, bornés à 12 000 caractères et 120 liens (ENF-COU-01) ; scripts et styles retirés avant toute
  lecture, mobilier du site retiré du texte mais **ses liens conservés**, certains sites y listant leurs offres.
  `llm/prompts/extractOffers.ts` (balises `<page_text>` et `<page_links>`, ENF-SEC-06),
  `modules/offers/extraction.ts` (`ExtractedOffersSchema`, bornes explicites), `scraper/adapters/generic.ts`.
  La tâche `extract_offers` existait déjà dans `TASK_ROUTES` (RG-13) : aucun changement de routage.
  *Garde-fou* : **c'est le code, jamais le modèle, qui décide où le candidat est envoyé.** Une adresse proposée
  n'est retenue que si elle figure parmi les liens réellement présents sur la page **et** reste sur le site de la
  source (même hôte, ou sous-domaine de l'un ou de l'autre). Sinon l'offre est conservée mais pointe sur la page
  carrières. Comparer les noms d'hôte entiers évite d'avoir besoin d'une liste de suffixes publics, qui serait
  fausse pour `exemple.co.uk`.
  *Choix assumés* : une page carrières ne date presque jamais ses offres et « publiée récemment » n'est pas une
  date — `postedAt` reste nul. L'identifiant d'une offre sans lien est un condensé de l'adresse de la page et de
  son intitulé, stable d'un passage à l'autre (EF-VEI-09). `AdapterDeps` gagne un `runTask` **facultatif** :
  seule la page générique lit par un modèle, et un adaptateur qui en a besoin sans en disposer le dit (EF-IA-04).
  Dépendance `cheerio` installée (pré-approuvée pour T-403 ; `npm run audit` : rien de haut ni de critique).
- [x] **T-404 Exécution et notation** — gestion des sources (API), dédoublonnage, pré-filtre RG-10, notation RG-09 par lots.
  *Exigences* : EF-VEI-01 à 07, 09 à 14, 21, ENF-FIA-02, ENF-PERF-04, ENF-COL-03.
  *Fini quand* : une source en échec n'empêche pas les autres (test).
  *Livré* : `modules/sites/` — `schemas.ts` (l'identifiant est lu par la règle RG-08 **du type choisi**),
  `repository.ts`, `pass.ts` (une passe : lecture, dédoublonnage, notation, enregistrement) et `service.ts`
  (catalogue des sources + orchestration). Routes `GET/POST /api/sites`, `PATCH/DELETE /api/sites/{id}` et
  `POST /api/sites/run`. `modules/offers/scoring.ts` porte RG-09 et RG-10, `llm/prompts/scoreOffers.ts` le prompt
  de la tâche `score_offers` (déjà routée par RG-13). Planification EF-VEI-06 : `CRON_SCRAPER`, 7 h, 13 h et 19 h
  heure de Paris.
  *Fusion avec T-706* : une passe de veille est un traitement long ; elle passe par la **file d'attente**
  (`jobs/queue.ts`) comme la synchronisation Gmail. `POST /api/sites/run` répond **202** avec l'identifiant de
  l'exécution, à suivre par `GET /jobs/{id}` ou `GET /jobs/stream` (EF-EXE-01, EF-EXE-03). Une passe planifiée
  déjà en attente pour un candidat est écartée au lieu d'être empilée (EF-GML-18). Les erreurs — profil de
  référence absent, contact de collecte non renseigné — closent l'exécution avec leur message au lieu de faire
  échouer une requête que plus personne n'attend.
  *Économie d'appels IA* : RG-10 écarte sans aucun appel une offre ne portant aucun mot-clé d'une cible — elle
  reçoit le score 5 et la raison qui le dit (EF-VEI-14) ; le reste part par lots de 15 (ENF-COU-01). Une seconde
  passe sur un board inchangé ne coûte **aucun** appel, les offres connues étant écartées avant la notation.
  *Correctif de performance* : le comptage des offres d'une source passait par une jointure et un `group by`, que
  le planificateur servait en lisant tout `job_offers` ; il est devenu une sous-requête corrélée servie par
  `uq_job_offers_source_item`. Vérifié par `tests/integration/sites-query-plans.test.ts` sur le jeu de charge
  (ENF-PERF-04).
  *Choix assumés* : les sources sont lues l'une après l'autre — le collecteur espace déjà ses appels (ENF-COL-02)
  et une page carrières coûte un appel IA ; ce qui compte est qu'un échec reste sur sa source (ENF-FIA-02).
  `SCRAPER_CONTACT_EMAIL` vide fait **refuser** la consultation avec un message clair plutôt que de collecter
  anonymement (ENF-COL-03) ; le reste de l'application n'en est pas affecté. Une passe demandée sans profil de
  référence ferme l'exécution en échec, avec le message qui le dit : les cibles sont ce contre quoi un score se
  mesure.
  *Reste à faire* : la description d'une offre nouvelle chez SmartRecruiters et Workday n'est toujours pas lue
  (une requête par offre, 3 s chacune) — la notation s'y appuie sur l'intitulé, le lieu et le contrat ; à traiter
  avec T-406, qui affichera le détail d'une offre. Le récapitulatif e-mail (EF-VEI-15) est T-405.
- [x] **T-408 Page carrières retrouvée depuis la racine du site** — *demande du Business Owner du 24/09/2026
  (cahier v1.15, BES-27)* : une source déduite ne donne que le domaine ; l'accueil d'un site ne publie pas
  d'offres, et l'adaptateur générique n'y trouvait rien.
  *Exigences* : EF-VEI-27, EF-VEI-11 (messages d'échec), ENF-SEC-06.
  *Fini quand* : une source pointant la racine d'un site dont l'accueil renvoie aux offres les relève ; une
  adresse hors du site n'est jamais suivie.
  *Livré* : `scraper/careerLink.ts` — le lien vers les offres reconnu **sans appel d'IA**, par le libellé et par
  l'adresse (« Nos offres », « Carrières », « Nous rejoindre », « Join us »…), en écartant ce qui parle d'emploi
  sans rien lister (candidature spontanée, politique de recrutement, actualités). `ExtractedOffersSchema` gagne
  `careerPageUrl`, second recours quand le site ne nomme aucun lien reconnaissable.
  *Choix assumés* : **un seul rebond**, jamais de parcours de site (ENF-COL-02 : chaque saut coûte 3 s). Le lien
  du site passe **avant** le modèle, ce qui épargne un appel d'IA sur chaque page d'accueil. L'adresse que le
  modèle propose est retenue aux mêmes conditions qu'une offre : présente parmi les liens de la page et sur le
  site de la source — le code, jamais le modèle, décide où le candidat est envoyé (ENF-SEC-06).

- [x] **T-409 Offres balisées lues avant l'IA** — *demande du Business Owner du 24/09/2026 (cahier v1.16,
  BES-28)*, après recherche sur les pratiques de collecte : une page carrières « vide » ne l'est presque jamais,
  ses offres sont dans son HTML mais hors du texte visible.
  *Exigences* : EF-VEI-28, EF-VEI-09, ENF-SEC-06, ENF-COU-01.
  *Fini quand* : une page balisée rend ses offres **sans aucun appel d'IA** ; une page sans balisage part au
  modèle comme avant.
  *Livré* : `scraper/page.ts` lit les `<script type="application/ld+json">` et `application/json`
  (`__NEXT_DATA__`, `__NUXT__`) **avant** de retirer les scripts — c'est là que la plupart des sites publient
  leurs offres, pour Google for Jobs. `scraper/structuredJobs.ts` en extrait les nœuds `schema.org/JobPosting`
  où qu'ils soient : racine, `@graph`, liste, ou au fond de l'état d'une application monopage.
  *Ce que ça rapporte* : zéro appel d'IA sur ces pages, et des champs **exacts** au lieu de devinés — la date de
  publication et le type de contrat viennent de la source. `postedAt`, toujours nul pour une page générique,
  est enfin rempli.
  *Bornes* : 20 blocs par page, 512 ko par bloc, 12 niveaux de profondeur, 20 000 nœuds parcourus, 60 offres.
  Un bloc mal formé — il y en a beaucoup — est ignoré sans faire perdre les autres.
  *Sécurité* : un balisage est **du contenu non fiable** comme un autre. Chaque offre passe par un schéma zod,
  chaque texte est borné, et l'adresse n'est retenue que si elle reste sur le site de la source (ENF-SEC-06).
  *Correctif de T-408* : le rebond ne part plus que de **l'accueil** d'un site. Sur une page profonde, il
  quittait le board pour une offre isolée dès qu'un lien portait « offres » dans son chemin.
  *Choix assumé* : le titre, écrit en français, prime sur `employmentType` quand il nomme un contrat — le
  vocabulaire de schema.org ne connaît ni CDI, ni CDD, ni alternance, et balise une alternance « INTERN ».
  *Reste à faire* : reconnaître l'ATS à l'empreinte laissée dans la page pour basculer sur son API (levier C de
  l'étude du 24/09/2026).

- [ ] **T-405 Récapitulatif e-mail** — envoi via Gmail des offres de score ≥ S.
  *Exigences* : EF-VEI-15.
- [~] **T-406 Écrans Sites et Offres** — ajout/suspension/retrait, liste triée, filtre score, garder/écarter,
  « J'ai postulé ».
  *Exigences* : EF-VEI-01 à 05, 07, 10, 11 (écran Sites) ; EF-VEI-16 à 20, 22 (écran Offres).
  *Livré (étape 1, écran Sites)* : `pages/sites/SitesPage.tsx` et `NewSourceForm.tsx` — liste des sources avec
  leur type, leur identifiant, la date de leur dernière consultation et l'erreur de la dernière consultation
  échouée ; ajout, suspension, réactivation, retrait confirmé qui annonce les offres supprimées avec la source.
  `GET /api/sites/types` (nouveau) décrit les six types : l'écran ne tient pas la liste lui-même, donc ajouter un
  type reste un fichier et une entrée de registre (ENF-MAI-03). Le bouton « Consulter maintenant » met la passe en
  file et suit son avancement par le flux (EF-EXE-01, EF-EXE-04) ; une passe lancée par le planificateur s'y
  affiche aussi. Un refus de l'API s'affiche sous le champ qu'il nomme (ENF-SEC-04).
  *Reste à faire* : l'écran Offres (EF-VEI-16 à 20, 22), qui demande d'abord une API des offres.

- [x] **T-407 Sources déduites des candidatures** — *demande du Business Owner du 23/09/2026 (cahier v1.13,
  BES-25)* : proposer comme sources à surveiller les entreprises auxquelles le candidat a déjà postulé, d'après
  le domaine d'où elles lui ont écrit.
  *Exigences* : EF-VEI-23, EF-VEI-24, EF-VEI-25, RG-19.
  *Fini quand* : une entreprise déjà surveillée n'est pas proposée ; une proposition écartée ne revient pas ;
  aucune requête sortante.
  *Livré* : `modules/sites/suggestion-rules.ts` (RG-19 : choix du domaine, exclusion des plateformes, des
  messageries grand public et des ATS ; EF-VEI-24 : type déduit du domaine de l'expéditeur),
  `suggestions.ts` (lecture et mise à l'écart), table `dismissed_source_suggestions` (migration 0011),
  `GET /api/sites/suggestions` et `POST /api/sites/suggestions/{companyId}/dismiss`, section « Entreprises
  auxquelles vous avez postulé » sur l'écran Sites.
  *Choix assumés* : **aucune requête sortante** — tout se lit dans ce que la synchronisation Gmail a déjà
  enregistré, et le type d'ATS est reconnu au domaine de l'expéditeur, pas en sondant le site. **Rien n'est
  ajouté d'office** : « Surveiller » pré-remplit le formulaire, le candidat vérifie l'identifiant et valide
  (RG-19). Seule l'adresse de l'expéditeur est lue, jamais le corps des messages (ENF-RGP-01).
  *Performance* : la requête agrège tous les messages reçus du candidat, comme les indicateurs du tableau de
  bord ; elle est donc mesurée au temps (< 50 ms sur le jeu de charge, ENF-PERF-05) et non au plan, un `Seq Scan`
  y étant le bon plan (Q-17).
  *Complément (cahier v1.14, BES-26)* : bouton « Surveiller les N » qui ajoute toutes les propositions d'un seul
  geste (EF-VEI-26). Les ajouts se font l'un après l'autre et **celles que l'API refuse sont nommées avec leur
  raison** : un lot n'échoue jamais en bloc. RG-19 tient toujours — rien n'est ajouté sans un geste du candidat,
  qu'il porte sur une proposition ou sur toutes.
  *Correctif du 23/09/2026 (journaux réels)* : plusieurs entreprises étaient proposées avec le domaine de
  l'**outil de leur recruteur** — `mail.flatchr.io`, `ateme.teamtailor-mail.com`, `daunat.werecruit.io` — ou
  d'un **job board** (`free-work.com`), dont les offres ne sont celles de personne en particulier. RG-19 écarte
  désormais ces domaines. `scraper/failures.ts` traduit par ailleurs les échecs réseau : « fetch failed »
  devient « ce domaine n'existe pas », « le certificat du site a expiré »… (EF-VEI-11).
  *Reste à faire* : deviner le slug exact d'un job board demanderait de sonder l'ATS ; l'identifiant proposé est
  le nom normalisé de l'entreprise, que le candidat corrige au besoin. Une source ajoutée en lot peut donc
  échouer à sa première consultation, ce que l'écran annonce sous le bouton.

## Lot 5 — CV et réponses

- [x] **T-501 Profil de référence** — schéma zod, stockage en base par utilisateur (Q-16), API.
  *Exigences* : EF-CVX-01, 02 (cibles avec types de contrat acceptés, RG-09).
  *Livré* : `modules/cv/` — `CandidateProfileSchema` (identité, zone de recherche, disponibilités, cibles avec
  leurs types de contrat RG-09 et leurs mots-clés RG-10, source de CV : titre, profil, expériences, formations,
  compétences, centres d'intérêt), table `candidate_profiles` (migration 0008, un document `jsonb` par utilisateur),
  `GET /api/profile` (404 tant qu'aucun profil) et `PUT /api/profile` (remplacement complet, 400 détaillé si invalide).
  Le document est reparsé à chaque lecture : un profil écrit hors de l'application n'atteint jamais un CV (RG-12).
  *Écart assumé* : `data/profile.json` de la ligne d'origine est remplacé par la base, conformément à Q-16
  (cahier v1.2) ; le fichier d'exemple `tests/fixtures/profile.example.json` sert de jeu de test.
  *Reste à faire* : l'écran de consultation et de modification arrive avec T-506.
- [x] **T-502 Rendu Word** — rendu conforme RG-11 à partir d'un contenu validé.
  *Exigences* : EF-CVX-06, 08, 14 (RG-11, RG-15 : mise en page sans tableau).
  *Fini quand* : test de structure du .docx (aucun `w:tbl`, `w:txbxContent`, contenu d'en-tête ou de pied de page)
  + comparaison visuelle manuelle avec le modèle (capture jointe à la PR).
  *Livré* : `modules/cv/render.ts` — `renderCvDocx(content)` et `CvContentSchema` (ce qu'un CV porte une fois écrit).
  En-tête deux colonnes par tabulation droite (jamais de tableau, RG-15), titre et sous-titre centrés, bandeaux de
  section `D9E2F3` bordés `AAB5CE`, lignes « dates | contenu » alignées à 2150 twips, Calibri 10 pt, A4 avec
  10 620 twips utiles. `formatDates` écrit les mois en chiffres (RG-15) et laisse intact ce qu'il ne reconnaît pas
  (RG-12). Aucune photo insérée (Q-01). Dépendance `docx` installée (`npm run audit` : rien de haut ni critique).
  Les tests relisent le .docx produit avec un lecteur de zip écrit sur `node:zlib` (`tests/fixtures/docx/`), pour
  ne pas ajouter de dépendance de test.
  *Reste à faire* : la comparaison visuelle avec le modèle Word du candidat (exemplaire fourni au Business Owner)
  et le téléchargement (EF-CVX-11) qui arrive avec T-504 et T-506.
- [ ] **T-503 Conversion PDF** — LibreOffice sans shell (`execFile`), délai 60 s, contrôle 1 page A4.
  *Exigences* : EF-CVX-07, ENF-SEC-13.
- [ ] **T-504 CV adapté** — tâche IA, contrôle de fidélité RG-12, historique des versions, téléchargement.
  *Exigences* : EF-CVX-04, 05, 09, 10, 11, 15, 16, 17 (RG-12 renforcée).
  *Fini quand* : test avec entreprise inventée rejetée.
- [ ] **T-505 Réponse de motivation** — tâche IA, contrôle 80–140 mots.
  *Exigences* : EF-CVX-12.
- [~] **T-506 Écran Atelier CV** — génération, téléchargement, réponse de motivation modifiable.
  *Exigences* : EF-CVX-13.
  *Livré (23/09/2026, partie profil)* : écran `/atelier-cv` — consultation du profil de référence section par
  section (EF-CVX-01) et modification complète (EF-CVX-02 : identité, recherche, cibles avec leurs types de contrat
  et mots-clés, CV, expériences, formations, compétences, centres d'intérêt ; listes saisies une valeur par ligne,
  entrées répétables). Les champs refusés par l'API sont nommés et le formulaire est conservé. L'écran est chargé à
  la demande (son formulaire ne pèse pas sur le premier chargement).
  *Complément du 23/09/2026* : chaque champ obligatoire porte un astérisque et l'attribut `required` ; un refus de
  l'API s'affiche **sous le champ qu'il nomme** (`aria-invalid`, message lié par `aria-describedby`) au lieu d'une
  liste de chemins en haut de page ; les périodes d'expérience et de formation se choisissent dans deux sélecteurs
  de mois (`<input type="month">`) avec une case « En cours aujourd'hui ». Le modèle de données ne change pas : la
  période reste du texte, relu et réécrit au format « MM/AAAA – MM/AAAA » attendu par le rendu (RG-15), et une
  valeur illisible — « Depuis le printemps » — est conservée tant qu'aucune date n'est choisie (RG-12).
  *Reste à faire* : génération d'un CV adapté (T-504), téléchargement Word et PDF (EF-CVX-11, T-503), réponse de
  motivation (T-505, EF-CVX-13).

- [x] **T-507 Niveau d'études et certifications du profil** — *demande du Business Owner du 23/09/2026
  (cahier v1.12, BES-24)* : le profil de référence porte le niveau d'études (RG-18) et les certifications, l'écran
  Atelier CV les affiche et les modifie, et le CV généré les reprend.
  *Exigences* : EF-CVX-18, EF-CVX-19, EF-CVX-20, RG-18.
  *Fini quand* : niveau hors liste et certification sans intitulé refusés ; un profil écrit avant v1.12 continue
  de s'ouvrir ; aucune section vide sur le CV.
  *Livré* : `modules/cv/schemas.ts` — `STUDY_LEVELS`, `StudyLevelSchema`, `CertificationSchema`, repris dans
  `CandidateProfileSchema` **et** `CvContentSchema` ; `render.ts` écrit le niveau sous la section FORMATION et
  ouvre une section CERTIFICATIONS seulement si le candidat en a. Écran : section de consultation, sélecteur de
  niveau avec la case « en cours », groupe répétable de certifications que le candidat peut vider entièrement.
  *Choix assumés* : les deux champs sont **facultatifs** — un profil enregistré avant cette version reste lisible
  (EF-CVX-01), là où un champ obligatoire l'aurait rendu introuvable, le document étant reparsé à chaque lecture.
  Le niveau est un champ du profil, distinct de la liste des diplômes de `cvSource.education` qu'il résume.
  Une année de certification qui n'est pas un entier reste absente plutôt que fausse.

## Lot 6 — Tableau de bord

- [x] **T-601 API statistiques** — indicateurs EF-TDB-01 à 09, RG-07.
  *Avancée à la demande du Business Owner (22/09/2026), avec T-602 et le shell de T-003, avant T-103.*
  *Fini quand* : chaque requête du tableau de bord s'exécute en moins de 50 ms sur le jeu de charge (`EXPLAIN ANALYZE`,
  test d'intégration) — ENF-PERF-05 ; ENF-PERF-04 ne vise plus ces agrégats (Q-17, cahier des charges v1.3).
- [~] **T-602 Écran tableau de bord**.

## Lot 7 — Exploitation

- [ ] **T-701 Sauvegardes** — réécrire `scripts/db/` pour PostgreSQL : `pg_dump` quotidien de Neon vers le poste (rôle
  `tracandi_backup`, rétention 30 j), restauration de contrôle dans le PostgreSQL local, restauration vers Neon, planification quotidienne.
  *Exigences* : ENF-FIA-04 à 08.
  *Fini quand* : une sauvegarde puis une restauration de contrôle réussissent ; durée de restauration mesurée.
- [ ] **T-702 Purge RGPD** — commande `npm run data:purge` avec confirmation.
  *Exigences* : ENF-RGP-02.
- [ ] **T-703 Jeu de charge et performance** — *ouvert le 23/09/2026 par les journaux de production : chaque requête
  payait deux allers-retours vers Neon (session puis données), et une base injoignable répondait 500 après 15 s.
  Premiers correctifs livrés hors tâche (cache de session 60 s, délai de connexion 8 s, 503 explicite ;
  classement de 3 lots en parallèle ; écrans lourds chargés à la demande ; modèle saturé passé au suivant sans
  attente et délai `Retry-After` respecté) ; la mesure ENF-PERF-01 à 03 et le choix
  d'hébergement restent à traiter ici. Correctif du 23/09/2026 : une base injoignable était encore renvoyée en 500
  quand `pg` la signalait par un libellé plutôt que par un code (« Connection terminated unexpectedly ») ; le
  pool ferme désormais ses connexions inactives avant l'hôte (60 s) et garde la liaison en vie.* — script de génération de données, mesures ENF-PERF-01 à 03.
- [ ] **T-704 Revue de sécurité finale** — checklist du skill `security`, `npm audit`, revue des journaux,
  exposition réseau, localisation des données, démarrage `docker compose up` après `scripts/setup.sh`.
  *Exigences* : ENF-SEC-01, ENF-SEC-10, ENF-RGP-03, ENF-POR-01.
- [x] **T-706 File d'exécution et suivi en direct** — *hors ordre, à la demande du Business Owner (23/09/2026).*
  File d'attente des traitements longs, API qui rend la main aussitôt, suivi poussé vers l'interface.
  *Exigences* : EF-EXE-01 à 05, ENF-PERF-06 (cahier v1.11, BES-23).
  *Fini quand* : demandes enchaînées exécutées dans l'ordre sans perte, état et compteurs consultables, flux qui
  émet à chaque changement, exécution restée en cours à l'arrêt close en échec.
  *Livré* : `jobs/queue.ts` (une chaîne par candidat, journal `job_runs` étendu de l'état `queued`, compteurs
  publiés en cours de route), `GET /api/jobs/{id}` et `GET /api/jobs/stream`, `POST /api/gmail/sync` qui répond
  **202** avec l'identifiant d'exécution, écran Réglages qui suit l'avancement et survit à un rechargement.
  Migrations 0009 (état `queued`) et 0010 (compteur `messages_pending`).
  *Choix technique signalé* : **événements envoyés par le serveur** (SSE) plutôt que WebSocket — l'interface ne fait
  qu'écouter, le flux passe par le même proxy, se reconnecte seul et n'ajoute aucune dépendance. Une bascule vers
  `ws` reste possible si un besoin bidirectionnel apparaît.
  *Reste à faire* : la veille (T-404) et la génération de CV (T-504) se brancheront sur la même file.

- [ ] **T-705 Coûts IA** — agrégat mensuel `llm_calls`, affichage EF-CFG-03, contrôle ENF-COU-01.

---

## Lot 8 — Première mise en production (BES-29, cahier v1.17)

Branches (`docs/CONVENTIONS_GIT.md`) : tout développement part de `dev` et y revient ; `main` ne reçoit que des
**versions** fusionnées depuis `dev`. Sur les deux branches, `ENABLED_FEATURES` est vide : seuls le tableau de bord,
les candidatures et les réglages de la synchronisation Gmail sont utilisables ; Offres, Sites surveillés et Atelier CV
restent dans la navigation et affichent « En préparation ». Le code de la veille et du CV reste en place : un
développeur l'active sur son poste (`ENABLED_FEATURES=watch,cv`) le temps d'y travailler.

- [x] **T-801 Fonctionnalités activables par configuration** — *demande du Business Owner du 24/09/2026.*
  `ENABLED_FEATURES` (`watch`, `cv`) lue et validée au démarrage ; modules d'API et tâche planifiée `scraper` montés
  seulement si leur fonctionnalité est active ; `GET /api/settings/features` ; interface : les écrans d'une
  fonctionnalité désactivée affichent « En préparation » (`FeaturesProvider`, `RequireFeature`), sans appel à leur API ;
  carte « Offres à regarder » absente sans veille (`offers: null`).
  Couvre ENF-MAI-07, EF-TDB-08 (précisée).
  *Fini quand* : une configuration sans fonctionnalité facultative répond 404 sur `/api/profile` et `/api/sites`, ne
  planifie que `gmail_sync`, et l'interface n'offre que Tableau de bord, Candidatures et Réglages, les autres écrans
  affichant « En préparation ».
- [ ] **T-802 Finitions du périmètre de mise en production** — terminer T-602 (écran du tableau de bord), revue
  complète des écrans Candidatures et Réglages (Gmail) à 1440 px et 390 px, démonstration au Business Owner.
- [ ] **T-803 Hébergement** — après réponse à Q-18 : demande de changement, cible d'hébergement, HTTPS, CI
  (`npm run check` et tests d'intégration sur chaque PR vers `dev` et `main`), procédure de version `dev` → `main`.
