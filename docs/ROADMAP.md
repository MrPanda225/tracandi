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

- [x] **T-007 Page de présentation** — *demande du Business Owner du 24/09/2026 (cahier v1.24, BES-36, BES-37).*
  À l'adresse racine pour un visiteur sans session (`RequireAuth` › `anonymousHome`) ; accès « Se connecter » et
  « Créer un compte » (`/connexion?mode=inscription`, EF-AUT-10). Sections : présentation avec aperçu du tableau de
  bord en 3D (données d'exemple), fonctionnement en trois étapes, fonctionnalités en grille, chiffres du produit,
  confidentialité, appel final. Composants React Bits adaptés (TiltedCard, BlurText, CountUp avec `motion` accordé ;
  GlareHover, StarBorder, ShinyText sans dépendance ; SpotlightCard, Magnet, ClickSpark existants) ; chargement
  d'ouverture ; tout mouvement coupé sous `prefers-reduced-motion` (ENF-UTI-04). Bklit écarté : bibliothèque de
  graphiques exigeant Tailwind, shadcn et React 19. Page chargée à part (49 kB gzip), le reste de l'application
  inchangé. *Exigences* : EF-AUT-09, EF-AUT-10, ENF-UTI-04, ENF-PERF-01.
  *Retouche du 27/09/2026 (demande du Business Owner : « des textes plus naturels, qui donnent envie d'être lus, pas
  une justification »)* : textes réécrits en bénéfices plutôt qu'en mécanique — titre « Postulez. On s'occupe du
  suivi. » (espaces insécables pour une coupure au rythme de la phrase), étapes, fonctionnalités, chiffres et
  garanties au ton parlé ; les garanties regroupées dans « Vos données restent les vôtres ». Chaque phrase reste
  vraie (lecture sans suppression, libellés posés, conservation limitée). Sujets d'EF-AUT-09 inchangés.
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
- [x] **T-309 Entreprise déduite du domaine du correspondant** — *demande du Business Owner du 24/09/2026 (cahier
  v1.20, BES-32) : candidature envoyée à une adresse `@data-praxis.fr` enregistrée « Entreprise inconnue ».* L'en-tête
  `To` est lu (premier destinataire, jamais conservé) ; sans employeur ni plateforme, l'entreprise est nommée d'après
  le domaine du destinataire d'un message envoyé ou de l'expéditeur d'un message reçu, les domaines de RG-19 exclus.
  Listes de domaines (messageries, outils de recrutement, ATS) déplacées de la veille vers `modules/emails/domains.ts`,
  module toujours actif, et partagées avec le pré-filtre.
  *Exigences* : RG-03 (v1.20), RG-19, EF-GML-09, EF-GML-11.
  *Fini quand* : la candidature envoyée à `…@data-praxis.example` est rattachée à « Data Praxis » ; une adresse
  Gmail, une plateforme, un outil de recrutement ou un ATS ne nomment aucune entreprise.
  *Hors périmètre* : les candidatures déjà enregistrées « Entreprise inconnue » ne sont pas renommées.
- [x] **T-310 Relance préparée en brouillon Gmail** — *demande du Business Owner du 24/09/2026 (cahier v1.22,
  BES-34) : ne relancer que ceux à qui l'on peut écrire, bouton « Relancer » qui rédige le mail et le laisse en
  attente d'envoi.* Adresse de contact de chaque message (RG-20 : `Reply-To`, sinon expéditeur, destinataire d'un
  envoi, jamais un « no-reply ») conservée (migration 0013 : colonne `contact_address`, index partiel
  `ix_emails_user_without_contact`, tâche IA `write_follow_up`) et retrouvée pour les messages déjà enregistrés par la
  relecture de T-308 ; RG-06 exige une adresse de contact (liste du tableau de bord et drapeau des candidatures) ;
  `POST /api/applications/{id}/follow-up-draft` : l'IA rédige (80 à 150 mots, contrôlés par le code) à partir des
  seuls faits de la candidature, le brouillon est enregistré en réponse dans le fil (`In-Reply-To`, `References`,
  objet « Re: »), jamais envoyé ; bouton « Relancer » ouvrant Gmail sur le brouillon.
  *Exigences* : RG-06 (v1.22), RG-20, EF-CAN-17, RG-13, ENF-RGP-01, ENF-SEC-04, ENF-SEC-06.
  *Fini quand* : un brouillon est créé dans le fil, adressé au contact, signé du nom lu sur l'envoi du candidat ;
  sans contact, statut hors relance ou IA indisponible : aucun brouillon ; aucune candidature sans contact listée.
- [x] **T-311 Réglages réduits à l'essentiel** — *demande du Business Owner du 24/09/2026 (cahier v1.23, BES-35),
  selon `ux-design` et `ui-design`.* Carte « Fournisseurs d'IA » retirée de l'écran ; carte Gmail réorganisée :
  état en badge (mot + point, jamais la seule couleur) et « Synchroniser maintenant » en tête, préférences (libellés en
  interrupteur, période en puces tant que la première synchronisation n'a pas eu lieu), entretien (relecture), puis
  connexion à l'écart (déconnexion en rouge, confirmée). *Exigences* : EF-CFG-05, EF-CFG-02 (retirée de l'écran),
  EF-CFG-01, EF-CFG-04, EF-GML-02, EF-GML-17, EF-GML-20.

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

### Veille élargie et gratuite (BES-46, cahier v1.33)

*Demande du Business Owner du 01/10/2026*, après l'étude des sources du 30/09/2026 : services payants écartés, API
officielles gratuites d'abord, logiciels de recrutement retrouvés depuis les entreprises des candidatures, rendu
JavaScript reporté (Q-21). Ordre : les critères d'abord (ils nourrissent les requêtes et la notation), puis l'écran
qui montre les offres, puis les sources, enfin l'économie de collecte.

- [x] **T-410 Critères de recherche** — table `watch_criteria` (document par candidat, validé par zod), `GET/PUT
  /api/watch/criteria`, recherche de commune (`GET /api/watch/places?q=`, service public du découpage administratif),
  notation RG-09 sur les critères, profil de référence en secours ; écran « Vos critères » sur la page Sites.
  *Exigences* : EF-VEI-29, EF-VEI-30, EF-VEI-31, RG-09 (v1.33), ENF-RGP-11, ENF-COL-05.
  *Fini quand* : critères enregistrés et relus ; rayon hors bornes refusé ; commune simulée retrouvée ; prompt de
  notation portant les cibles des critères ; veille refusée sans critères ni profil.
  *Livré* : `modules/criteria/` (schéma, dépôt, service, routes ; migration 0016 `watch_criteria`), client des API
  officielles `scraper/official/client.ts` (débit par API, 15 s, 3 Mo, un nouvel essai après un 429, sans robots.txt),
  `scraper/official/geo.ts` (geo.api.gouv.fr, 5 requêtes par seconde retenues sur 50), passe de veille notée sur
  les critères puis, à défaut, sur le profil ; critères inclus dans l'export des données (EF-AUT-12) ; carte « Ce
  que vous recherchez » en tête de l'écran Sites (résumé, formulaire à la demande, commune choisie parmi celles du
  service public, codes ROME repliés).
  *Choix assumés* : un mot-clé en double, quelle que soit sa casse, est gardé une fois ; un document enregistré
  devenu invalide est traité comme absent (journalisé), jamais transmis aux sources.
- [x] **T-406 (étape 2) API et écran Offres** — `GET /api/offers` (score minimum, contrat, état, entreprise des
  candidatures), `PATCH /api/offers/{id}`, « J'ai postulé » ; écran Offres.
  *Exigences* : EF-VEI-16 à 20, 22, EF-VEI-35 (affichage, avec T-412).
  *Livré* : `modules/offers/` (schémas, dépôt, service, routes) : `GET /api/offers` (vues à regarder, gardées,
  écartées, postulées ; score minimum ; contrat ; pages de 50), `GET /api/offers/{id}` (texte de l'offre),
  `PATCH /api/offers/{id}`, `POST /api/offers/{id}/apply` (candidature « Envoyée » créée dans la même transaction,
  `createApplicationFromOffer`) ; écran `/offres` (vues, filtres, note sur 100 lisible sans couleur, garder,
  écarter, « J'ai postulé », texte lu à la demande, « Afficher 50 de plus »).
  *Choix assumés* : une offre postulée ne change plus d'état (409) ; un intitulé déjà présent à l'entreprise est
  refusé plutôt que fusionné (RG-03), l'offre restant à regarder. Le lien vers le CV utilisé (EF-VEI-20) est sans
  objet depuis v1.30 : aucun CV n'est conservé.
- [ ] **T-411 Client des API officielles et source France Travail** — client commun (délai, taille, débit par API,
  sans robots.txt, ENF-COL-05), jeton OAuth en mémoire, identifiants en configuration (ENF-SEC-23), source unique
  par candidat (`user_id` sur `watched_sites`, entreprise facultative), employeur enregistré sur l'offre, partenaires
  exclus, contacts jamais lus ; guide de création des accès.
  *Exigences* : EF-VEI-08, EF-VEI-32, EF-VEI-33, EF-VEI-37, ENF-COL-05, ENF-SEC-23, ENF-RGP-09, ENF-RGP-11.
  *Fini quand* : API simulée — requête aux paramètres des critères, offres enregistrées sans contact, offre
  « Indeed » écartée, identifiants absents signalés sur la seule source.
- [ ] **T-412 La bonne alternance et SIREN des entreprises** — source La bonne alternance ; SIREN retrouvé par l'API
  Recherche d'entreprises (sans dirigeants) ; offre signalée « Vous y avez postulé ».
  *Exigences* : EF-VEI-34, EF-VEI-35, EF-VEI-36, ENF-RGP-09, ENF-RGP-11.
  *Fini quand* : API simulées — offres en alternance enregistrées ; homonymes sans SIREN ; offre de « CAPGEMINI »
  signalée pour une candidature chez « Capgemini ».
- [ ] **T-413 Cinq logiciels de recrutement** — adaptateurs Cegid Talentsoft (RSS), Teamtailor (RSS), Personio (XML),
  Workable et Ashby (JSON), lus sans dépendance nouvelle (`cheerio` en mode XML) ; migration de `site_adapter`.
  *Exigences* : EF-VEI-08, RG-08 (v1.33), ENF-MAI-03, ENF-FIA-02.
  *Fini quand* : un test par adaptateur sur fixture fictive fidèle au format réel ; identifiant invalide refusé.
- [ ] **T-414 Recherche des pages carrières** — exécution `source_discovery` en file : accueil du site, un rebond,
  empreintes RG-27, vérification par une consultation ; propositions « vérifiée » ou « à confirmer » à l'écran.
  *Exigences* : EF-VEI-38, EF-VEI-39, EF-VEI-40, RG-19 (v1.33), RG-27, ENF-COL-01 à 04.
  *Fini quand* : accueil liant un board Ashby → proposition Ashby vérifiée ; aucune source ajoutée d'office.
- [ ] **T-415 Collecte économe et minimisation** — empreinte de la liste d'offres, consultation planifiée espacée
  des sources inchangées ; coordonnées retirées du texte des offres ; purge quotidienne des offres de plus de
  60 jours ; politique de confidentialité complétée.
  *Exigences* : EF-VEI-41, EF-VEI-42, ENF-RGP-09, ENF-RGP-10, ENF-RGP-05 (v1.33).
  *Fini quand* : source identique 3 fois écartée de la passe planifiée et lue par « Consulter maintenant » ;
  e-mail et téléphone absents d'une offre enregistrée ; offre écartée de 61 jours supprimée, offre gardée conservée.

- [ ] **T-405 Récapitulatif e-mail** — envoi via Gmail des offres de score ≥ S.
  *Exigences* : EF-VEI-15.
- [x] **T-406 Écrans Sites et Offres** — ajout/suspension/retrait, liste triée, filtre score, garder/écarter,
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

> **Refonte du 26/09/2026 (BES-43, cahier v1.30).** L'Atelier CV part désormais du CV que le candidat importe, et
> non plus d'un profil enregistré rendu dans son modèle Word. T-503, T-504 et T-506 sont abandonnées au profit de
> T-510 à T-514 ; le code de T-501, T-502 et T-507 est retiré par T-515. T-505 (réponse de motivation) est conservée.

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
- [-] ~~**T-503 Conversion PDF**~~ — *abandonnée en v1.30 (BES-43) : le CV se télécharge en Word (EF-CVX-31).*
  LibreOffice sans shell (`execFile`), délai 60 s, contrôle 1 page A4.
  *Exigences* : EF-CVX-07, ENF-SEC-13.
- [-] ~~**T-504 CV adapté**~~ — *abandonnée en v1.30 (BES-43) : remplacée par T-511 à T-513.*
  Tâche IA, contrôle de fidélité RG-12, historique des versions, téléchargement.
  *Exigences* : EF-CVX-04, 05, 09, 10, 11, 15, 16, 17 (RG-12 renforcée).
  *Fini quand* : test avec entreprise inventée rejetée.
- [ ] **T-505 Réponse de motivation** — tâche IA, contrôle 80–140 mots.
  *Exigences* : EF-CVX-12.
- [-] ~~**T-506 Écran Atelier CV**~~ — *abandonnée en v1.30 (BES-43) : remplacée par T-514 ; l'écran du profil est
  retiré par T-515.* Génération, téléchargement, réponse de motivation modifiable.
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

### Atelier CV — adaptation d'un CV importé à une offre (BES-43, cahier v1.30)

Une étape par tâche, chacune sur sa branche et sa PR. L'atelier reste derrière `ENABLED_FEATURES=cv` (ENF-MAI-07) :
sur `main`, il affiche « En préparation » tant que le Business Owner ne l'active pas. Aucune donnée du CV ni de
l'offre n'est écrite en base, sur disque ou dans les journaux (ENF-RGP-06).

- [x] **T-510 Import et lecture du CV** — réception du fichier (5 Mo, refus avant lecture), type identifié par son
  contenu (PDF uniquement), extraction du texte en mémoire, OCR sur le serveur des pages sans texte (Tesseract
  français et anglais, 3 pages au plus, 60 s par page, dossier temporaire effacé), refus d'un CV illisible, repérage et retrait des coordonnées
  (nom, e-mail, téléphone, adresse, liens) gardées à part pour le rendu.
  *Exigences* : EF-CVX-21, EF-CVX-22, EF-CVX-34, ENF-SEC-22, ENF-RGP-07.
  *Dépendance* : lecture PDF (`unpdf`) — justification (téléchargements, publication, mainteneurs, `npm run audit`)
  dans la PR. Le fichier arrive en base64 dans une requête JSON : aucune réception multipart, la garde JSON
  d'ENF-SEC-12 reste sans exception. OCR : paquets système `tesseract-ocr`, `tesseract-ocr-fra` et `tesseract-ocr-eng`
  dans l'image de l'API et la CI (`pdftoppm` vient de `poppler-utils`, déjà installé), lancés par `execFile`.
  *Fini quand* : fichier de 5 Mo + 1 octet, DOCX et faux PDF refusés ; PDF scanné lu par OCR ; page blanche,
  PDF protégé et scan de 4 pages refusés sans appel IA ; dossier temporaire absent après succès comme après échec ; texte extrait
  sans l'e-mail ni le téléphone des fixtures (CV fictifs dans `tests/fixtures/cv/`).
  *Livré (26/09/2026)* : `modules/cvWorkshop/` — `decodeCvUpload` (taille contrôlée sur le base64 avant tout
  décodage, 413 au-delà de 5 Mo ; signature `%PDF-` exigée, DOCX et faux PDF en 400), `readPdfPages` (texte de
  chaque page par `unpdf`, en mémoire ; PDF protégé ou endommagé : `CvUnreadableError` 422 avec un message pour le
  candidat ; avertissements de pdf.js coupés), `createPdfOcr` (`pdftoppm` 200 dpi en gris puis `tesseract fra+eng`,
  par `execFile` sans shell, environnement réduit à `PATH` — aucun secret de l'API transmis — et un seul fil ;
  60 s par page ; dossier `0700` effacé après succès comme après échec), `separateContacts` (nom de la première
  ligne, e-mails, téléphones français et internationaux, adresse postale, liens), `readCv` (OCR des seules pages
  sans texte, 3 au plus). Dépendance `unpdf` 1.8.1 (MIT, unjs, aucune dépendance, pdf.js 6.1 sans chemin `eval`),
  approuvée le 26/09/2026 ; `npm run audit` sans vulnérabilité haute ni critique. Image de l'API et CI : paquets
  `tesseract-ocr`, `tesseract-ocr-fra`, `tesseract-ocr-eng`.
  *Reste* : la route qui reçoit le fichier (limite de corps propre à cette route, le reste de l'API gardant 100 ko)
  arrive avec l'analyse (T-511), qui l'enchaîne au diagnostic. L'OCR réel et sa mémoire ne sont vérifiés qu'en CI
  (`tests/integration/cv-ocr.test.ts`) : Tesseract n'est pas installé sur le poste de développement.

- [x] **T-511 Diagnostic de compatibilité** — tâche IA « diagnostic » par le routeur (procédure `add-llm-task`) :
  quatre sous-scores expliqués en français, score global calculé par RG-23 ; analyse menée dans la file
  d'exécution (nouvelle tâche `cv_analysis`, compteurs seuls) ; résultat gardé en mémoire 30 min puis effacé ;
  quota de 5 analyses par jour.
  *Exigences* : EF-CVX-23, EF-CVX-24, EF-CVX-30, EF-CVX-32, EF-CVX-33, RG-23, ENF-RGP-06, ENF-PERF-08.
  *Fini quand* : réponse de la route en moins d'une seconde avec un identifiant ; sous-score hors bornes rejeté ;
  résultat introuvable (404) après 30 min ; sixième analyse du jour refusée (429) ; aucune ligne créée hors `job_runs`.
  *Livré, partie 1 (26/09/2026, demande du Business Owner : « active la page de l'Atelier CV, que je teste »)* :
  l'analyse passe par la file — `POST /api/cv-workshop/analyses` (PDF en base64, seule route de l'API dont le corps
  peut dépasser 100 ko : 7 Mo), nouvelle tâche `cv_analysis` et compteur `cv_pages_ocr` (migration 0014), réponse
  202 avec l'identifiant ; lecture et OCR dans la file ; résultat gardé en mémoire (`createAnalysisResults`, effacé
  au bout de 30 min même sans nouvelle demande) et rendu par `GET /api/cv-workshop/analyses/:id` (404 pour un autre
  compte, avant la fin ou après l'effacement). La file transmet désormais son identifiant au traitement.
  *Livré, partie 2 (26/09/2026)* : tâche IA `diagnose_cv` (prompt `llm/prompts/diagnoseCv.ts`, CV sans coordonnées
  et offre encadrés, bornés à 12 000 et 8 000 caractères ; route Groq 1, 2, 3, Gemini, Claude, RG-13 complétée ;
  migration 0015), schéma `DiagnosisAnswerSchema` (sous-scores entiers 0–100, explications de 1 à 3 phrases, 20
  compétences manquantes au plus), `buildDiagnosis` (score global RG-23 calculé par le code en centièmes exacts ;
  points faibles sous 50 ; compétence dite manquante mais citée par le CV écartée, doublons retirés), texte de
  l'offre de 200 à 20 000 caractères, quota de 5 analyses par jour de Paris (échecs non comptés, index
  `ix_job_runs_user_job_started`), étapes publiées (`cv_steps_done`). Écran : formulaire CV puis offre, avancement
  en deux étapes, score et verdict en mots, quatre jauges `<meter>` expliquées, « À renforcer », compétences
  manquantes, « Ce que l'IA a reçu » replié ; textes réécrits sur un ton naturel et chaleureux (ux-design, ui-design).

- [x] **T-512 CV adapté** — tâche IA « adaptation » : CV réécrit par sections, liste des modifications (section,
  avant, après, raison), compétences de l'offre absentes du CV ; contrôle RG-21 avant toute présentation.
  *Exigences* : EF-CVX-25, EF-CVX-26, EF-CVX-27, EF-CVX-29, RG-21.
  *Fini quand* : réponse simulée citant une entreprise, un diplôme ou un chiffre absents du CV rejetée puis
  confiée à nouveau ; compétence absente listée et non ajoutée.
  *Livré (28/09/2026)* : tâche IA `tailor_cv` (route d'écriture de RG-13, déjà prévue : aucune migration), prompt
  `llm/prompts/tailorCv.ts` (CV sans coordonnées, offre et diagnostic encadrés ; recopie à l'identique exigée ;
  compétences absentes nommées pour ne pas les ajouter) ; `fidelity.ts` — `tailoredAnswerSchemaFor(cvText)` : le
  schéma de la réponse porte le contrôle RG-21 (entreprises, établissements, intitulés, diplômes, lieux et dates
  cités ; compétences, certifications, langues et centres d'intérêt cités ; aucun chiffre nouveau, où qu'il soit
  écrit), si bien qu'une réponse qui invente est rejetée comme hors schéma et confiée au fournisseur suivant
  (EF-IA-02), puis refusée par un message clair ; chemins seuls dans les journaux, jamais les valeurs. L'analyse
  enchaîne lecture, diagnostic et adaptation, chaque étape publiée (`cv_steps_done` 1, 2, 3).
- [x] **T-513 Rendu Word lisible par les ATS** — fichier .docx d'une colonne (RG-22) depuis le CV adapté,
  coordonnées rétablies, compétences cochées ajoutées sans nouveau score, téléchargement.
  *Exigences* : EF-CVX-28, EF-CVX-31, RG-22.
  *Fini quand* : test de structure du .docx (aucun `w:tbl`, `w:drawing`, `w:txbxContent`, en-tête ni pied de page) ;
  titres de RG-22 dans l'ordre ; compétences cochées présentes.
  *Livré, partie 1 (26/09/2026)* : `modules/cvWorkshop/adaptedCv.ts` — `AdaptedCvSchema`, le CV adapté section par
  section (titre, profil, expériences, formation, compétences, certifications, langues, centres d'intérêt), borné,
  que la tâche IA de T-512 remplira ; `atsDocx.ts` — `renderAtsDocx` : une colonne de texte réel, Calibri 11, A4 ;
  coordonnées en tête du corps (jamais dans un en-tête Word) ; titres RG-22 en styles « Titre 2 », dans l'ordre,
  sections vides omises ; expériences « Poste — Entreprise, lieu », dates, réalisations en puces ; compétences
  cochées ajoutées sans doublon. Aucune dépendance nouvelle (`docx` était déjà là).
  *Reste* : le téléchargement (route et bouton), dès que T-512 produit le CV adapté.

  *Livré, partie 2 (28/09/2026)* : `POST /api/cv-workshop/analyses/:id/docx` (`{ addedSkills }` : seules les
  compétences listées par le diagnostic, 400 sinon ; coordonnées remises ; score inchangé ; `cv-adapte.docx`,
  `Cache-Control: no-store`), bouton de téléchargement.
- [x] **T-514 Écran Atelier CV** — parcours en quatre étapes : CV, offre, analyse suivie en direct, résultat
  (score et sous-scores expliqués, points faibles, compétences manquantes à cocher, modifications avant/après,
  téléchargement).
  *Exigences* : EF-CVX-24, EF-CVX-27 à EF-CVX-31 (affichage), ENF-UTI-01 à 04.
  *Fini quand* : parcours complet au clavier, 360 px et 1440 px, erreurs en français, rien de conservé au
  rechargement de la page.
  *Livré, étape 1 (26/09/2026)* : `/atelier-cv` remplace l'écran du profil — choix du PDF (refus immédiat d'un
  autre format ou de plus de 5 Mo), envoi, attente suivie en direct et par une vérification toutes les 2 s, puis
  texte lu tel que l'IA le recevra et coordonnées mises à part (EF-CVX-35), nombre de pages lues par OCR, raison
  d'un échec. L'écran du profil (`ProfileForm`, `CvPreview`, `api/profile`) est retiré de l'interface ; son API
  part avec T-515. *Reste* : étapes offre, analyse et résultat.

  *Livré, fin (28/09/2026)* : avancement en trois étapes ; compétences manquantes à cocher (cibles de 44 px) ;
  « Votre CV, adapté à cette offre » — aperçu qui reprend aussitôt les compétences cochées, puis téléchargement
  Word (une seule action principale à l'écran) ; « Ce qui a changé, et pourquoi » — avant, après, raison ; aperçu
  déplié en entier sur téléphone. Vérifié à 1440 px et 390 px sur une API simulée (données fictives).
- [x] **T-516 CV d'une page A4** — *demande du Business Owner du 30/09/2026 (cahier v1.31, BES-44).* Consigne
  de la tâche `tailor_cv` bornée à une page ; contrôle côté serveur de la place occupée, qui rejette une réponse
  trop longue comme une infidélité (le routeur passe au fournisseur suivant) ; rendu Word qui resserre espacements
  puis taille du texte, jusqu'à 10 pt et 1,5 cm de marges, pour loger les compétences cochées ; LibreOffice installé
  dans la CI seulement, pour compter les pages du fichier (l'image de l'API reste sans LibreOffice).
  *Exigences* : RG-24, EF-CVX-36, EF-CVX-37.
  *Fini quand* : le CV fictif long (12 expériences de 8 réalisations, 40 compétences, 3 cochées) donne un fichier
  d'une page qui cite les 12 expériences ; réponse trop longue rejetée puis redemandée.
  *Livré (30/09/2026)* : `cvWorkshop/onePage.ts` — paragraphes du CV décrits une fois (`cvBlocks`) pour le fichier
  et pour la mesure ; mesure volontairement pessimiste de la hauteur (caractères comptés plus larges que Calibri,
  lignes plus hautes) ; trois réglages de page, de 11 pt et 2 cm à 10 pt et 1,5 cm, le plus aéré qui tient étant
  retenu. Dates reportées sur la ligne du titre (« Poste — Entreprise, lieu | dates »), une ligne de moins par entrée.
  Réponse de `tailor_cv` rejetée si elle ne tient pas avec toutes les compétences manquantes cochées (EF-CVX-37) ;
  consigne de 450 mots au plus. `tests/integration/cv-one-page.test.ts` compte les pages avec LibreOffice et
  Carlito, installés dans la CI seulement (absents du poste de développement : vérifié par la CI).
- [x] **T-517 Atelier CV allégé** — *demande du Business Owner du 30/09/2026 (cahier v1.31, BES-44).* Texte d'aide
  réduit avant l'analyse ; explications des sous-scores, modifications et texte lu repliés ; score, CV adapté et
  téléchargement visibles d'emblée ; aperçu en page A4 à la police et aux marges du fichier.
  *Exigences* : ENF-UTI-05, ENF-UTI-06, ENF-UTI-07, EF-CVX-38 ; EF-CVX-24 et EF-CVX-29 (précisées).
  *Fini quand* : 40 mots d'aide au plus sur l'écran vide ; démonstration à 1440 × 900 et 390 px.
  *Livré (30/09/2026)* : environ 30 mots d'aide sur l'écran vide ; « Pourquoi ? » replie l'explication de chaque
  sous-score, « Ce qui a changé, et pourquoi » est replié avec le nombre de modifications ; les compétences à cocher
  passent avant le détail ; aperçu en page A4 (proportions 21 × 29,7, marges de 1,75 cm, tailles rapportées à la
  largeur de la page, texte réduit jusqu'à 80 % si la page déborde). Vérifié par captures à 1440 × 900 (score, CV et
  téléchargement sans défiler) et à 390 px (page A4 en vignette, lisible en zoomant).

- [ ] **T-515 Retrait de l'ancien atelier** — code du profil de référence et du modèle Word (T-501, T-502, T-507),
  LibreOffice retiré de l'image, migration de suppression de `candidate_profiles` et `cv_versions`, politique de
  confidentialité complétée.
  *Exigences* : ENF-RGP-08 ; remplacement de EF-CVX-01, 02, 04 à 11, 14 à 20, RG-11, RG-12, RG-15, RG-18.
  *Fini quand* : plus aucune route `/api/profile` ; migration appliquée sur la base de test ; page Confidentialité
  décrivant l'Atelier CV.

## Lot 6 — Tableau de bord

- [x] **T-601 API statistiques** — indicateurs EF-TDB-01 à 09, RG-07.
  *Avancée à la demande du Business Owner (22/09/2026), avec T-602 et le shell de T-003, avant T-103.*
  *Fini quand* : chaque requête du tableau de bord s'exécute en moins de 50 ms sur le jeu de charge (`EXPLAIN ANALYZE`,
  test d'intégration) — ENF-PERF-05 ; ENF-PERF-04 ne vise plus ces agrégats (Q-17, cahier des charges v1.3).
- [~] **T-602 Écran tableau de bord**.
  *24/09/2026 (cahier v1.21, BES-33)* : suivi hebdomadaire refait selon `bi-dashboard-design` — 5 semaines en
  barres groupées valeurs inscrites, semaine en cours plus claire et marquée « en cours », les trois chiffres de la
  semaine comparés à la précédente (EF-TDB-10) servant aussi de légende et de bascule d'affichage, tableau pour
  lecteur d'écran, actualisation d'elle-même à la fin d'une synchronisation ou d'une relecture (EF-TDB-11).

## Lot 7 — Exploitation

- [ ] **T-701 Sauvegardes** — réécrire `scripts/db/` pour PostgreSQL : `pg_dump` quotidien de Neon vers le poste (rôle
  `tracandi_backup`, rétention 30 j), restauration de contrôle dans le PostgreSQL local, restauration vers Neon, planification quotidienne.
  *Exigences* : ENF-FIA-04 à 08.
  *Fini quand* : une sauvegarde puis une restauration de contrôle réussissent ; durée de restauration mesurée.
- [ ] **T-702 Purge RGPD** — commande `npm run data:purge` avec confirmation.
  *24/09/2026* : la suppression d'un compte et de toutes ses données est faite dans l'application (T-708,
  EF-AUT-11) ; reste la purge de toute la base en ligne de commande.
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

- [x] **T-708 Conformité RGPD** — *demande du Business Owner du 24/09/2026 (cahier v1.25, BES-38).* Pages publiques
  mentions légales, politique de confidentialité et cookies (éditeur, contact et hébergeur par défaut,
  remplaçables par `VITE_LEGAL_*`), liées depuis la connexion, l'application et les Réglages ; mention d'information sur
  l'unique cookie (session), sans consentement à demander, retenue dans le navigateur ; « Mes données » dans les
  Réglages : `GET /api/account/export` (fichier JSON de toutes les données, sans secret) et `DELETE /api/auth/account`
  (mot de passe, révocation Gmail, suppression en cascade, sessions fermées). *Exigences* : EF-AUT-11, EF-AUT-12,
  EF-LEG-01, EF-LEG-02, ENF-RGP-02, ENF-RGP-04, ENF-RGP-05.
  *Reste* : lier les pages légales depuis la page de présentation une fois #33 fusionnée ; renseigner les
  informations légales au déploiement (Q-18).

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
- [~] **T-803 Hébergement** — Q-18 tranchée le 24/09/2026 (BES-39, cahier v1.26) : Vercel pour l'interface, Northflank
  pour l'API, Neon pour la base. *Préparé* : `frontend/vercel.json` (relais `/api`, retour à l'application, en-têtes de
  sécurité et CSP, cache des ressources, garde de build contre l'adresse d'API non renseignée) ; image de l'API prête
  pour Northflank (écoute `0.0.0.0`, contrôle de santé) ; `TRUST_PROXY` (ENF-SEC-21) ; flux d'exécutions non tamponné
  par les relais ; pages légales nommant Vercel et Northflank ; guide `docs/DEPLOIEMENT.md`.
  Intégration continue (BES-40, ENF-MAI-08) : `.github/workflows/ci.yml` — API (types, lint, tests unitaires et
  d'intégration sur PostgreSQL 18, couverture, audit), interface (vérifications, build, audit), image de l'API.
  *Reste* : créer les services, renseigner les variables, protéger `main` et `dev` par la CI, premier déploiement,
  vérification Google OAuth en production.
- [x] **T-804 Performances et référencement des pages publiques** — *demande du Business Owner du 25/09/2026*
  (BES-41, cahier v1.28). Texte d'accroche et accès de la présentation affichés sans animation ; ouverture animée
  jouée une fois par visite ; écran d'entrée (présentation, connexion, pages légales) téléchargé en même temps que la
  vérification de session ; axes SOFT et WONK de Fraunces chargés après le premier affichage de la connexion ;
  `GET /api/auth/session` (toujours 200) à la place du 401 de `/auth/me` au démarrage ; titre et description par
  page, icône, aperçu de partage, `robots.txt`, `llms.txt` ; statut « En attente » assombri (contraste AA) ;
  formulaire de connexion gardant son rôle de formulaire. Couvre EF-AUT-13, EF-SEO-01, ENF-PERF-07.
  *Fini quand* : Lighthouse mobile sur la version construite donne, pour `/` et `/connexion`, performance ≥ 90,
  SEO 100, bonnes pratiques 100 et plus grand élément affiché en moins de 3 s. Mesuré le 25/09/2026 : `/` 95 / 100 /
  100, 2,8 s ; `/connexion` 96 / 100 / 100, 2,7 s (avant : 96 et 90 en performance, SEO 82, bonnes pratiques 96).
  Écrans de l'application (demande du 25/09/2026, mesurés avec une API simulée) : les fonctionnalités facultatives ne
  bloquent plus que leurs propres écrans ; titre d'onglet par écran ; nom accessible des liens de navigation
  contenant le libellé court du téléphone (WCAG 2.5.3) ; gris du panneau éclairci (`--color-mist-on-ink`, 5,1:1) ;
  squelette de la carte Gmail à la forme d'une boîte connectée. `/candidatures` et `/reglages` : performance 95,
  accessibilité 97/96 → 100, CLS de Réglages 0,02 ; SEO 63 voulu (seul `is-crawlable` échoue : `robots.txt`).
- [x] **T-805 Limite globale de la file d'exécution** — *demande du Business Owner du 25/09/2026* (BES-42, cahier
  v1.29). Les traitements longs (synchronisation Gmail, relecture, veille) passent tous par des créneaux partagés :
  au plus `MAX_CONCURRENT_JOBS` à la fois sur tout le serveur (1 par défaut), les autres attendent leur tour dans
  l'ordre, l'ordre de chaque candidat restant garanti. Couvre EF-EXE-06.
  *Fini quand* : avec 1 créneau, deux candidats ne synchronisent jamais en même temps ; avec 2, ils le peuvent.

---

## Lot 9 — Retours de la première testeuse (BES-45, cahier v1.32)

- [ ] **T-901 Doublons** — rattachement par conversation Gmail (RG-03 (0)), clés d'intitulé (RG-25) et d'entreprise
  (RG-26), fusion de deux candidatures (API et écran).
  *Exigences* : RG-03, RG-25, RG-26, EF-CAN-18.
  *Fini quand* : accusé de réception puis refus d'une même conversation aux intitulés différents → une candidature ;
  « Capgemini SE » et « Capgemini France » → une entreprise ; deux doublons fusionnés.
- [ ] **T-902 Lien, entreprise et intitulé** — colonne du lien (migration), saisie à la création et en modification,
  entreprise et intitulé modifiables avec refus d'un doublon.
  *Exigences* : EF-CAN-19, EF-CAN-21.
- [ ] **T-903 Import CSV** — lecture du fichier (sans dépendance), aperçu, correspondance des colonnes, import sans doublon.
  *Exigences* : EF-CAN-23.
- [ ] **T-904 Statut « Test technique »** — énumérations (migration), classement, rangs, libellé Gmail, taux de réponse,
  tableau de bord, filtre.
  *Exigences* : RG-01, RG-02, RG-04, RG-05, RG-07 (v1.32).
- [~] **T-905 Tri, filtre par période et couleurs** — tri au choix, filtre du … au …, index pour ENF-PERF-04,
  couleurs des statuts (règle `frontend.md` mise à jour).
  *Exigences* : EF-CAN-01 (v1.32), EF-CAN-20, EF-CAN-22, EF-CAN-24.
  *Livré, étape 1 (30/09/2026, à la demande du Business Owner)* : tri au choix, par défaut la candidature la plus
  récente d'abord ; liste à plat qui nomme l'entreprise de chaque candidature, groupée par entreprise seulement dans le
  tri par entreprise ; filtre « Candidature du … au … » en jours de Paris (`lib/parisTime.ts`, exact les jours de
  changement d'heure, ce qui corrige aussi le décompte quotidien de l'Atelier CV). *Reste* : couleurs (EF-CAN-22).
- [ ] **T-906 Relance vers le recruteur** — adresses des plateformes écartées du contact (RG-20 v1.32).
  *Exigences* : RG-20.

