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
| RG-17 (v1.10) | T-303 | `src/modules/emails/cues.test.ts` (15 formulations de refus et 7 d'accusé de réception reconnues, français et anglais ; « suite favorable » sans négation laissée intacte ; objet lu comme l'extrait ; casse et accents ignorés ; proposition d'embauche, entretien, alerte emploi et message envoyé jamais corrigés) ; `tests/integration/gmail-sync.test.ts` (refus poli classé « accusé de réception » par l'IA → e-mail et candidature en « refusée ») ; `src/llm/prompts/classifyEmails.test.ts` (consigne sur l'ouverture polie) | couverte |
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
| EF-CAN-01 (interface) | T-103 | `frontend/src/pages/applications/ApplicationsPage.test.tsx` (groupes par entreprise dans l'ordre alphabétique, état vide, « Afficher plus ») | couverte |
| EF-CAN-02 (interface) | T-103 | `ApplicationsPage.test.tsx` (filtre « Refusée ») | couverte |
| EF-CAN-03 (interface) | T-103 | `ApplicationsPage.test.tsx` (« mcdo » → McDonald's, une seule requête après la saisie) | couverte |
| EF-CAN-04 (interface) | T-103 | `ApplicationsPage.test.tsx` (chronologie : date, sens, catégorie, objet, extrait, ordre) | couverte |
| EF-CAN-05 (interface) | T-103 | `ApplicationsPage.test.tsx` (lien Gmail dans un nouvel onglet ; aucun lien hors de Gmail) | couverte |
| EF-CAN-06 (interface) | T-103 | `ApplicationsPage.test.tsx` (ajout visible dans la liste, refus de l'API, focus clavier) | couverte |
| EF-CAN-07 (interface) | T-103 | `ApplicationsPage.test.tsx` (changement de statut, refus de l'API) | couverte |
| EF-CAN-12 (interface) | T-103 | `ApplicationsPage.test.tsx` (badge « À relancer ») | couverte |
| EF-CAN-14 (interface) | T-103 | `ApplicationsPage.test.tsx` (filtre « Alternance ») | couverte |
| ENF-UTI-02 (Candidatures) | T-103 | Captures 360 px et 1440 px (Chrome sans interface, API simulée : liste, fiche ouverte, formulaire) | couverte |
| ENF-UTI-03 (Candidatures) | T-103 | `ApplicationsPage.test.tsx` (squelette, message d'erreur) ; `Flash.test.tsx` (confirmation polie) | couverte |
| ENF-PERF-01 (Candidatures) | T-103, T-703 | `ApplicationsPage.test.tsx` (retour sur l'écran : dernière liste et filtres affichés aussitôt) — mesure sur le jeu de charge en T-703 | partielle |
| EF-AUT-06 (Candidatures) | T-103 | `AppShell.test.tsx` (liste de la session précédente jamais montrée au compte suivant) | couverte |
| EF-CAN-15 | T-104 | `backend/tests/integration/applications.test.ts` (détail avec description, absente de la liste, modification, effacement, 20 000 / 20 001 caractères, autre utilisateur 404) ; `ApplicationsPage.test.tsx` (saisie à la création, affichage, modification, effacement) | couverte |
| EF-CAN-16 | T-104 | `applications.test.ts` (date passée, date par défaut, date future et antérieure à 2000 refusées) ; `ApplicationsPage.test.tsx` (date passée envoyée à midi, date future refusée localement, résumé « candidature du ») ; `frontend/src/lib/dates.test.ts` | couverte |
| RG-16 | T-104 | `src/modules/applications/rules.test.ts` (lastActivityAfterDateChange, deux branches) ; `applications.test.ts` (relance à J+15, activité plus récente conservée) | couverte |
| EF-CAN-06 (erreurs de champ) | T-104 | `ApplicationsPage.test.tsx` (raison donnée par l'API affichée sous le champ `body.companyName`) | couverte |
| EF-IA-01 | T-201 | `backend/src/llm/router.test.ts` (fournisseur prioritaire seul appelé, consigne et contenu transmis tels quels) ; `llm/providers/claude.test.ts`, `gemini.test.ts` (requête envoyée au SDK), `openaiCompatible.test.ts` (corps envoyé à l'API compatible OpenAI, clé dans l'en-tête seulement, échec portant le statut HTTP) | couverte |
| EF-IA-02 | T-201 | `router.test.ts` (erreur, 60 s sans réponse avec signal annulé, réponse hors schéma, réponse non JSON ; raison du fournisseur écarté journalisée, sans le prompt ni la réponse) ; `claude.test.ts` (refus), `gemini.test.ts` (réponse vide) | couverte |
| EF-IA-03 | T-201 | `router.test.ts` (réponse hors schéma jamais renvoyée, JSON dans un bloc Markdown accepté) | couverte |
| EF-IA-04 | T-201 | `router.test.ts` (`LlmUnavailableError`, 502) ; `src/app.test.ts` (réponse HTTP 502 et message explicite) | couverte |
| EF-IA-05 | T-201 | `src/config/env.test.ts` (démarrage avec la seule clé Gemini, Anthropic ou Groq ; emplacement Groq vide = entrée de routage retirée ; clé Groq sans aucun modèle refusée ; refus sans clé) ; `router.test.ts` (un seul fournisseur) | couverte |
| EF-IA-06 | T-201 | `router.test.ts` (fournisseur, modèle, tâche, durée, jetons, résultat ; aucun contenu) ; `tests/integration/llm-journal.test.ts` (une ligne `llm_calls` par appel) | couverte |
| ENF-MAI-04 | T-201 | `router.test.ts` (toutes les tâches routées vers les deux fournisseurs, table unique `TASK_ROUTES`) + revue : aucun SDK hors de `llm/providers/` | couverte |
| RG-13 (v1.8) | T-201 | `router.test.ts` (les trois emplacements Groq en tête de chaque tâche ; Gemini puis Claude pour le volume, Claude puis Gemini pour la rédaction ; toutes les entrées de l'énumération couvertes) ; `assignments.test.ts` (ordre d'affichage, emplacement vide ignoré) ; `tests/integration/settings.test.ts` (route Groq puis Gemini) ; `llm-journal.test.ts` (`llm_calls.provider = groq_1`) | couverte |
| ENF-SEC-06 | T-202 | `backend/src/llm/prompts/untrusted.test.ts` (encadrement, balise fermante neutralisée, avis « donnée, jamais une instruction ») ; `prompts/classifyEmails.test.ts` (chaque message entre balises, message hostile qui ne peut pas sortir de sa balise, avis dans l'instruction système) | couverte |
| EF-GML-08 à 10, 19 (prompt et schéma) | T-202 | `classifyEmails.test.ts` (catégories, employeur, plateforme, intitulé, contrat demandés) ; `src/modules/emails/classification.test.ts` (catégorie et contrat hors liste refusés, nom vide = absent) | couverte |
| EF-GML-08 | T-303 | `gmail-sync.test.ts` (catégorie valide pour chaque message retenu des fixtures, fournisseur enregistré, appel journalisé ; lots de 10 : 10, 10, 3) | couverte |
| EF-GML-09 | T-303 | `gmail-sync.test.ts` (fixture APEC : entreprise = Innova Solutions) | couverte |
| EF-GML-10 | T-303 | `gmail-sync.test.ts` (fixture LHH : plateforme = LHH sur le message et la candidature ; plateforme nommée par l'IA enregistrée une seule fois) | couverte |
| EF-GML-11 | T-303 | `gmail-sync.test.ts` (envoi, accusé et entretien McDonald's rattachés à une seule candidature, historique envoyée → accusé → entretien) | couverte |
| EF-GML-12 | T-303 | `gmail-sync.test.ts` (refus de Maison Lumen : candidature créée au statut Refusée ; ni employeur ni plateforme : « Entreprise inconnue ») | couverte |
| EF-GML-19 | T-303 | `gmail-sync.test.ts` (fixture « Accusé de réception — Alternance Data Analyst » : type = alternance ; LHH : CDD) ; `src/modules/emails/classification.test.ts` (« stage » → autre, « apprentissage » → alternance, « CDI » → cdi ; libellé inconnu, « non précisé », absence → non précisé, le message restant classé) | couverte |
| EF-CAN-11 (synchronisation) | T-303 | `gmail-sync.test.ts` (accusé tardif : l'entretien est conservé, dernière activité avancée, aucun historique ajouté) | couverte |
| RG-02, RG-03 (synchronisation) | T-303 | `gmail-sync.test.ts` (alerte emploi stockée sans candidature ; message hors sujet non conservé, Q-08) | couverte |
| EF-GML-13 | T-304 | `backend/src/modules/emails/labels.test.ts` (libellé « Candidatures/‹Entreprise› » créé avec son parent, libellé existant réutilisé, ids retenus, cache oublié quand Gmail refuse un id) ; `tests/integration/gmail-labels.test.ts` (fil d'un message rattaché libellé, aucune nouvelle liste au passage suivant, synchronisation conservée si Gmail refuse les libellés) ; `labels.test.ts` (libellé déjà présent réutilisé quelle que soit sa casse ; conflit 409 de Gmail → nouvelle lecture des libellés et réutilisation) | couverte |
| EF-GML-14 | T-304 | `labels.test.ts` (un seul libellé de statut) ; `gmail-labels.test.ts` (tous les fils McDonald's passent de « En attente » à « Entretien ») | couverte |
| EF-GML-15 | T-304 | `labels.test.ts`, `gmail-labels.test.ts` (alerte emploi : `threads.modify` avec « Alertes emploi ») | couverte |
| EF-GML-16 | T-304 | `labels.test.ts`, `gmail-labels.test.ts` (alerte emploi : `threads.modify` avec retrait de INBOX) | couverte |
| EF-GML-17 | T-304 | `gmail-labels.test.ts` (`PATCH /api/gmail/settings` : lecture seule → aucun `threads.modify`, aucune création ni liste de libellés ; réglage visible dans le statut ; 400, 401) ; `SettingsPage.test.tsx` (case « Ranger les fils avec des libellés Gmail », retour à l'état précédent si l'API refuse) | couverte |
| RG-05 | T-304 | `labels.test.ts` (correspondance statut → libellé, À postuler sans libellé) | couverte |
| EF-GML-03 | T-305 | `backend/src/jobs/scheduler.test.ts` (expression cron et fuseau configurés, sans chevauchement) ; `src/config/env.test.ts` (`CRON_GMAIL` et `SCHEDULER_TIMEZONE` : défauts toutes les 30 min heure de Paris, valeurs invalides refusées) ; `tests/integration/gmail-schedule.test.ts` (chaque boîte connectée synchronisée, et elles seules) | couverte |
| EF-GML-18 | T-305 | `gmail-schedule.test.ts` (une ligne `job_runs` par exécution : début, fin, résultat, compteurs lus/retenus/classés ; échec avec son erreur ; exécution demandée pendant une autre : `skipped`) | couverte |
| ENF-FIA-01 | T-305 | `scheduler.test.ts` (exception dans la tâche : le planificateur continue, l'erreur est journalisée) ; `gmail-schedule.test.ts` (échec d'une boîte : les autres sont synchronisées, aucune exception) | couverte |
| EF-CFG-02 | T-305 | `backend/src/llm/assignments.test.ts` (fournisseurs configurés, fournisseurs de chaque tâche dans l'ordre RG-13, aucune clé) ; `tests/integration/settings.test.ts` (`GET /api/settings/ai`, 401) ; `SettingsPage.test.tsx` (carte « Fournisseurs d'IA » : modèles, fournisseur et secours par tâche, « sans secours ») | couverte |
| Q-11 (décision) | T-305 | `mailbox.test.ts` (`invalid_grant` reconnu) ; `gmail-schedule.test.ts` (connexion marquée expirée, 409 explicite, statut, boîte laissée par le planificateur jusqu'à une nouvelle connexion) ; `AppShell.test.tsx` (bandeau « Reconnecter Gmail » sur chaque écran) ; `SettingsPage.test.tsx` (message et bouton de reconnexion) | couverte |
| ENF-SEC-10 (T-305) | T-305 | `npm run audit` après ajout de `node-cron` : aucune vulnérabilité haute ou critique | couverte |
| ENF-SEC-10 (T-201) | T-201 | `npm run audit` après ajout de `@anthropic-ai/sdk` et `@google/genai` : aucune vulnérabilité haute ou critique | couverte |
| EF-GML-01 | T-301 | `backend/tests/integration/gmail-connection.test.ts` (adresse de consentement, adresse connectée visible par ce seul utilisateur, refus, échec Google, reconnexion de la même boîte, autre boîte) ; `src/modules/emails/googleOAuth.test.ts` ; `frontend/src/pages/settings/SettingsPage.test.tsx` (redirection vers Google, 4 issues du retour affichées une fois) | couverte |
| EF-GML-02 | T-301 | `gmail-connection.test.ts` (jeton révoqué chez Google et absent de la base, même si Google est injoignable ; connexion d'un autre utilisateur intouchable) ; `SettingsPage.test.tsx` (confirmation, annulation) | couverte |
| EF-CFG-01 | T-301, T-303 | `gmail-connection.test.ts` (statut : adresse, date de connexion) ; `gmail-sync.test.ts` (date de dernière synchronisation = début de la dernière synchronisation complète, renvoyée par le statut) ; `SettingsPage.test.tsx` (adresse, date de connexion, dernière synchronisation ou « pas encore », date rafraîchie après une synchronisation) | couverte |
| ENF-SEC-02 | T-301 | `src/lib/crypto.test.ts` (aller-retour, IV neuf, altération du chiffré, du tag ou de l'IV détectée, autre clé refusée, clé de 64 caractères hexadécimaux) ; `gmail-connection.test.ts` (jeton jamais stocké en clair) | couverte |
| ENF-SEC-07 | T-301 | `googleOAuth.test.ts` (scope `gmail.modify` seul) | couverte |
| ENF-SEC-14 | T-301 | `src/modules/emails/oauthState.test.ts` (24 octets aléatoires, usage unique, 10 min, utilisateurs séparés) ; `gmail-connection.test.ts` (`state` absent, faux, expiré, rejoué ; limite de 20 retours / 15 min) | couverte |
| ENF-SEC-10 (T-301) | T-301 | `npm run audit` après ajout de `googleapis` : aucune vulnérabilité haute ou critique | couverte |
| EF-GML-04 | T-302, T-303 | `backend/tests/integration/gmail-sync.test.ts` (`POST /api/gmail/sync` : messages lus, retenus, classés ; 409 sans boîte connectée ou pendant une synchronisation ; 401) ; `gmail-fetch.test.ts` ; `SettingsPage.test.tsx` (bouton « Synchroniser maintenant », attente, compteurs, erreur de l'API) | couverte |
| EF-GML-05 | T-302 | `gmail-fetch.test.ts` (120 jours par défaut ; N = 30 : aucun message antérieur à J-30 traité) ; `src/modules/emails/mailbox.test.ts` (toutes les pages de la recherche) | couverte |
| EF-GML-06 | T-302, T-303 | `gmail-fetch.test.ts` (message traité jamais relu, reprise une heure avant la dernière synchronisation, message supprimé entre la liste et la lecture) ; `gmail-sync.test.ts` (deux synchronisations successives : aucune ligne ajoutée, aucun appel IA) | couverte |
| EF-GML-07 | T-302 | `src/modules/emails/prefilter.test.ts` ; `gmail-fetch.test.ts` (message bancaire écarté, marqué traité, jamais transmis au classement : la récupération n'a aucun accès aux fournisseurs IA) | couverte |
| RG-10 (messages) | T-302 | `prefilter.test.ts` (mot-clé entier dans l'objet ou l'extrait, casse et accents ignorés, plateforme par domaine ou sous-domaine, listes initiales Q-09) ; `gmail-fetch.test.ts` (liste initiale donnée à la première synchronisation, liste propre de l'utilisateur ensuite) — volet offres en T-404 | couverte |
| ENF-RGP-01 | T-302 | `mailbox.test.ts` (format `metadata` : jamais le corps ; extrait décodé, 300 caractères au plus) ; `gmail-fetch.test.ts` (champs transmis au classement) | couverte |
| ENF-FIA-03 | T-302, T-303 | `gmail-fetch.test.ts` (panne Gmail en cours de lecture ; passe bornée à 400 messages, suite au passage suivant sans relire) ; `gmail-sync.test.ts` (panne IA au 2e lot : 1er lot conservé, fin au passage suivant sans doublon ; message omis par l'IA relu au passage suivant ; passe bornée : dernière synchronisation non avancée ; quota Gmail refusé → 503 explicite) ; `src/modules/emails/quota.test.ts` (réessais sur 429, 403 de quota et 503 ; `Retry-After` ; abandon après 5 tentatives ; aucun réessai sur 404 ni sur une autorisation refusée) ; `src/lib/async.test.ts` | couverte |
| EF-CFG-04 | T-306 | `backend/tests/integration/gmail-labels.test.ts` (période exposée par le statut, réglage enregistré, 0, 366 et 30,5 refusés) ; `frontend/src/pages/settings/SettingsPage.test.tsx` (sélecteur « Période à synchroniser », valeur par défaut, refus de l'API) | couverte |
| EF-GML-05 (v1.5) | T-302, T-306 | `gmail-fetch.test.ts` (30 jours par défaut : aucun message antérieur traité ; N = 120 : messages plus anciens traités) ; `gmail-connection.test.ts` (statut : `lookbackDays` 30) ; migration `0004_lookback_days_default.sql` | couverte |
| ENF-FIA-10 | T-201 | `src/llm/router.test.ts` (503 redemandé puis réussi sans toucher au secours, attentes 2 s et 5 s ; bascule après la 3e tentative ; aucun réessai sur un refus de la requête — crédit épuisé, modèle inconnu — ni après un délai de 60 s ; une ligne `llm_calls` par tentative) | couverte |
| ENF-FIA-09 | T-306 | `src/modules/emails/quota.test.ts` (espacement, réessais 4/8/16/32 s, attente partagée par la boîte, `Retry-After`, abandon) ; `src/lib/rateLimiter.test.ts` (`pauseFor`) ; `gmail-fetch.test.ts` (passe partielle sur refus de quota, refus total signalé) ; `gmail-sync.test.ts` (503 explicite, dernière synchronisation non avancée) | couverte |
| ENF-PERF-02 | T-302, T-306, T-703 | `src/lib/rateLimiter.test.ts` (étalement des appels selon leur coût) ; `quota.test.ts` (appels Gmail sous 250 unités par seconde) ; `gmail-fetch.test.ts` (lecture de 200 messages par passe, 10 en parallèle, 50 unités/seconde) — mesure des 3 minutes sur le jeu de charge en T-703 ; `gmail-sync.test.ts` (3 lots classés en parallèle, enregistrés dans l'ordre des messages) | partielle |
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
| ENF-PERF-01 | T-003, T-703 | `DashboardPage.test.tsx` (retour au tableau de bord : derniers chiffres affichés aussitôt) — mesure sur le jeu de charge en T-703 ; `src/modules/auth/service.ts` (session résolue gardée 60 s en mémoire : un aller-retour base en moins par requête, oubliée à la déconnexion) ; `tests/integration/auth.test.ts` (déconnexion → 401 immédiat, session expirée à J+7 → 401) ; découpage des écrans lourds (`App.tsx` : tableau de bord et page de connexion chargés à la demande) — paquet initial 652 ko → 208 ko (202 ko → 67 ko gzip), polices 271 ko → 82 ko sur l'application connectée | partielle |
| EF-TDB-01 à 09 (API) | T-601 | `backend/tests/integration/stats.test.ts` (un test par indicateur, isolation EF-AUT-06, 401) ; `src/modules/stats/rules.test.ts` (RG-07, semaines) | couverte |
| RG-07 | T-601 | `stats/rules.test.ts` (arrondi, total nul) ; `stats.test.ts` (taux global et par type de contrat) | couverte |
| ENF-PERF-05 | T-601 | `tests/integration/stats-query-plans.test.ts` (`EXPLAIN ANALYZE` de chaque requête du tableau de bord sur le jeu de charge : < 50 ms) | couverte |
| ENF-PERF-04 | T-102, T-703 | Agrégats du tableau de bord exclus (Q-17) ; requêtes sélectives : jeu de charge `tests/integration/load-dataset.ts` disponible, vérification à étendre en T-703 | partielle |
| EF-TDB-01 à 09 (écran) | T-602 | `frontend/src/pages/dashboard/DashboardPage.test.tsx` — tâche en cours | à faire |
<!-- Ajouter une ligne par exigence au fur et à mesure. Statuts : à faire | couverte | vérifiée (démo BO) -->
