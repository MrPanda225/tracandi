# Cahier des charges — Tracandi

| Version | Date | Auteur | Statut |
|---|---|---|---|
| 1.0 | 21/09/2026 | Sahiré YAPI (Business Owner) | À valider |
| 1.1 | 22/09/2026 | Sahiré YAPI (Business Owner) | À valider — base hébergée Neon (PostgreSQL), accès par ORM (BES-10, BES-11) ; recherche en CDI, CDD, alternance ou job étudiant et suivi par type de contrat (BES-12) ; CV optimisé pour les ATS, sans CV générique (BES-13) ; questions Q-05 à Q-15 |
| 1.2 | 22/09/2026 | Sahiré YAPI (Business Owner) | À valider — comptes utilisateurs et données séparées (BES-14), documentation OpenAPI / Swagger (BES-15), connexion Gmail par utilisateur depuis l'interface (BES-16) ; Q-16 |
| 1.3 | 22/09/2026 | Sahiré YAPI (Business Owner) | Validée — ENF-PERF-04 limitée aux requêtes sélectives ; indicateurs du tableau de bord bornés à 50 ms par requête (BES-17, ENF-PERF-05) ; Q-17 |
| 1.4 | 22/09/2026 | Sahiré YAPI (Business Owner) | À valider — description de l'offre et date de candidature saisies par le candidat (BES-18, EF-CAN-15, EF-CAN-16, RG-16) |
| 1.5 | 22/09/2026 | Sahiré YAPI (Business Owner) | À valider — période de la première synchronisation réglable depuis les Réglages, 30 jours par défaut (BES-19, EF-GML-05 modifiée, EF-CFG-04) ; quotas de l'API Gmail respectés (ENF-FIA-09) |
| 1.6 | 22/09/2026 | Sahiré YAPI (Business Owner) | À valider — un fournisseur d'IA momentanément surchargé est redemandé avant la bascule (ENF-FIA-10), après un 503 « high demand » de Gemini |
| 1.7 | 22/09/2026 | Sahiré YAPI (Business Owner) | À valider — trois modèles gratuits de Groq (Llama 3.3 70B, Qwen, Kimi K2) en fournisseurs prioritaires, Gemini puis Claude en secours (BES-20, RG-13 révisée, EF-IA-05 étendue) |
| 1.8 | 23/09/2026 | Sahiré YAPI (Business Owner) | À valider — RG-13 exprimée en trois **emplacements** Groq configurables (le catalogue gratuit de Groq n'offre ni Llama 3.3 70B ni Kimi K2 sur le compte du candidat) |
| 1.9 | 23/09/2026 | Sahiré YAPI (Business Owner) | À valider — indice lexical de refus : un refus poli ouvert par un accusé de réception ne doit plus être classé « accusé de réception » (BES-21, RG-17) |
| 1.10 | 23/09/2026 | Sahiré YAPI (Business Owner) | À valider — RG-17 étendue : liste des expressions de refus et d'accusé de réception donnée par le Business Owner, en français et en anglais (BES-22) |
| 1.11 | 23/09/2026 | Sahiré YAPI (Business Owner) | À valider — traitements longs exécutés en file d'attente, l'interface répondant aussitôt et suivant l'avancement en direct (BES-23, EXM-15, EF-EXE-01 à 05, ENF-PERF-06) |
| 1.13 | 23/09/2026 | Sahiré YAPI (Business Owner) | À valider — sources à surveiller déduites des entreprises auxquelles le candidat a déjà postulé, proposées et jamais ajoutées d'office (BES-25, EF-VEI-23 à 25, RG-19) |
| 1.14 | 23/09/2026 | Sahiré YAPI (Business Owner) | À valider — toutes les sources proposées ajoutables d'un seul geste (BES-26, EF-VEI-26) |
| 1.15 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — page carrières retrouvée depuis l'adresse racine d'un site (BES-27, EF-VEI-27) |
| 1.16 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — offres balisées d'une page lues avant tout appel à l'IA (BES-28, EF-VEI-28) |
| 1.17 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — première mise en production limitée au tableau de bord, aux candidatures et aux réglages de la synchronisation Gmail ; veille et Atelier CV désactivables par configuration, leurs écrans affichés « En préparation », sur `main` comme sur `dev` (BES-29, ENF-MAI-07, EF-TDB-08 précisée) ; hébergement à trancher (Q-18) |
| 1.18 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — le classement d'un message lit le début de son corps, en mémoire et sans le conserver : des refus dont la formule arrive après un long préambule étaient classés « accusé de réception » (BES-30, EF-GML-08 précisée, RG-17 v1.18, ENF-RGP-01 précisée) |
| 1.19 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — relecture, à la demande, des messages déjà classés « accusé de réception », pour corriger ceux que RG-17 désigne désormais comme des refus (BES-31, EF-GML-20) |
| 1.20 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — entreprise déduite du domaine de l'adresse du correspondant quand ni l'employeur ni la plateforme ne sont identifiés (BES-32, RG-03 v1.20) |
| 1.21 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — suivi hebdomadaire resserré sur 5 semaines, semaine en cours comparée à la précédente, tableau de bord actualisé sans rechargement à la fin d'une synchronisation (BES-33, EF-TDB-04 v1.21, EF-TDB-10, EF-TDB-11) |
| 1.22 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — relance limitée aux candidatures dont une adresse de contact est connue ; bouton « Relancer » préparant, rédigé par l'IA, un brouillon Gmail en réponse dans le fil, jamais envoyé par le système (BES-34, RG-06 v1.22, RG-20, EF-CAN-17, RG-13, ENF-RGP-01) |
| 1.23 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — écran Réglages réduit à ce qui sert au candidat : fournisseurs d'IA retirés de l'interface, carte Gmail réorganisée (état et synchronisation d'abord, préférences, entretien, déconnexion à part) (BES-35, EF-CFG-02 retirée de l'écran, EF-CFG-05) |
| 1.25 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — conformité RGPD : pages publiques (mentions légales, confidentialité, cookies), mention d'information sur l'unique cookie, suppression du compte et export des données depuis l'application (BES-38, EF-AUT-11, EF-AUT-12, EF-LEG-01, EF-LEG-02, ENF-RGP-04, ENF-RGP-05) |
| 1.26 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — hébergement en ligne : interface sur Vercel, qui relaie `/api` vers l'API hébergée sur Northflank ; base sur Neon (BES-39, Q-18 tranchée, C-05 et §5.2 révisés, ENF-SEC-01 révisée, ENF-SEC-21) |
| 1.27 | 24/09/2026 | Sahiré YAPI (Business Owner) | À valider — intégration continue : chaque PR et chaque poussée sur `dev` et `main` exécutent types, lint, tests unitaires et d'intégration, couverture, audit et construction de l'image de l'API (BES-40, ENF-MAI-08) |
| 1.28 | 25/09/2026 | Sahiré YAPI (Business Owner) | À valider — performances et référencement des pages publiques : texte principal visible sans attendre d'animation, état de session sans erreur, titres et descriptions par page, `robots.txt`, `llms.txt`, icône et aperçu de partage (BES-41, EF-AUT-13, EF-SEO-01, ENF-PERF-07) |

> Document de référence pour le développement. Toute évolution de périmètre passe par une mise à jour
> de ce fichier **avant** le code. Chaque exigence porte un identifiant stable, repris dans
> `docs/ROADMAP.md`, dans les noms de tests et dans `docs/TRACABILITE.md`.

---

## 1. Contexte et objet

Sahiré YAPI, étudiant en Master MIAGE (parcours Data & BI) en Île-de-France, recherche un poste en **CDI**, en **CDD**
ou en **alternance** (v1.1, BES-12) et, en parallèle, un **job étudiant à temps partiel** (restauration, vente).
Plus d'une centaine de candidatures ont été envoyées en trois mois, par e-mail direct et via des plateformes
(APEC, LHH, Indeed, HelloWork…).

Constat actuel (analyse documentaire de la boîte mail et des échanges précédents) :

- le suivi est manuel et dispersé dans plus de 18 000 conversations Gmail ;
- les filtres Gmail ne savent pas extraire l'employeur quand le mail vient d'une plateforme ;
- les relances ne sont pas suivies ;
- chaque CV est adapté à la main à partir d'un modèle Word ;
- la découverte d'offres dépend des alertes des jobboards, sans visibilité directe sur les sites des entreprises visées.

**Objet** : réaliser une application web mono-utilisateur, exécutée sur le poste du candidat, qui automatise le suivi
des candidatures, la veille des offres et la production de CV adaptés.

## 2. Glossaire

| Terme | Définition |
|---|---|
| Candidat / utilisateur | Personne disposant d'un compte (v1.2) ; chaque utilisateur ne voit que ses propres données. Sahiré YAPI est le premier utilisateur. |
| Candidature | Démarche du candidat auprès d'une entreprise pour un poste donné. Identifiée par le couple (entreprise, intitulé de poste). |
| Entreprise | Employeur réel visé par une candidature (≠ plateforme intermédiaire). |
| Plateforme intermédiaire | Jobboard ou cabinet par lequel transite un message (APEC, LHH, Indeed…). |
| Message | E-mail reçu ou envoyé par le candidat. |
| Fil | Conversation Gmail regroupant plusieurs messages (thread). |
| Catégorie de message | Nature d'un message : candidature envoyée, accusé de réception, entretien, proposition, refus, alerte emploi, hors sujet. |
| Statut | État d'avancement d'une candidature (voir RG-01). |
| Source surveillée | Page ou service listant les offres d'une entreprise. |
| ATS | *Applicant Tracking System* : logiciel de recrutement publiant les offres d'une entreprise (Greenhouse, Lever, Workday…). |
| Offre | Annonce d'emploi détectée sur une source surveillée. |
| Score de pertinence | Entier de 0 à 100 exprimant l'adéquation d'une offre au profil. |
| Profil de référence | Données factuelles du candidat (identité, expériences, formations, compétences) servant de source unique aux CV. |
| Cible | Type de poste recherché, défini par un libellé, une liste de mots-clés et les types de contrat acceptés. |
| Type de contrat | Nature du contrat d'une offre ou d'une candidature : **CDI**, **CDD**, **alternance** (apprentissage ou professionnalisation), **job étudiant** (temps partiel compatible avec les études, quel que soit le contrat juridique), **autre** (stage, intérim, freelance…) ou **non précisé**. |
| Fournisseur IA | Service de modèle de langage : Claude (Anthropic) ou Gemini (Google). |
| Tâche IA | Traitement confié à un fournisseur IA (classer, noter, extraire, rédiger). |

## 3. Parties prenantes et acteurs

### 3.1 Parties prenantes (matrice de Mendelow)

| Partie prenante | Rôle | Influence | Intérêt | Stratégie |
|---|---|---|---|---|
| Sahiré YAPI | Sponsor, Business Owner, utilisateur final | Forte | Fort | Gérer de près : valide chaque lot |
| Claude Code | Équipe de réalisation (dev + tests) | Moyenne | Fort | Tenir informé via `CLAUDE.md`, règles et roadmap |
| Entreprises dont les sites sont surveillés | Fournisseurs de données (offres) | Faible | Faible | Surveiller : respect robots.txt et rythme de requêtes |
| Recruteurs (expéditeurs des mails) | Tiers dont les données personnelles transitent | Faible | Faible | Surveiller : minimisation des données (RGPD) |
| Google (Gmail API, Gemini API) | Fournisseur de services, conditions d'utilisation | Forte | Faible | Satisfaire : respect des scopes et quotas |
| Anthropic (Claude API) | Fournisseur de service | Forte | Faible | Satisfaire : respect des quotas |
| Neon | Hébergeur de la base de données (sous-traitant RGPD) | Forte | Faible | Satisfaire : région UE, connexion chiffrée, quotas de l'offre |
| CNIL / RGPD | Cadre réglementaire | Forte | Faible | Satisfaire : conformité documentée (§ 7.7) |

### 3.2 Acteurs (interagissent directement avec le système)

| Acteur | Type | Interaction |
|---|---|---|
| Candidat | Humain | Utilise l'interface web |
| Gmail API | Système | Lecture des messages, libellés, envoi du récapitulatif |
| Claude API | Système | Tâches IA de rédaction |
| Gemini API | Système | Tâches IA de volume |
| Services ATS / sites carrières | Système | Fourniture des listes d'offres |
| Planificateur | Système (horloge) | Déclenche synchronisations et veilles |

## 4. Besoins et exigences métier

### 4.1 Besoins exprimés (espace problème)

| ID | Besoin, tel qu'exprimé |
|---|---|
| BES-01 | « Je veux savoir où en sont toutes mes candidatures sans fouiller ma boîte mail. » |
| BES-02 | « Pour une offre où j'ai candidaté, je veux que les réponses restent groupées avec elle, par entreprise : mail d'envoi, de réception, de refus, d'entretien. » |
| BES-03 | « Je veux garder ma boîte Gmail organisée par entreprise et par statut. » |
| BES-04 | « Je veux savoir quand relancer une entreprise. » |
| BES-05 | « Je veux surveiller directement les sites des entreprises et voir leurs nouvelles offres qui vont dans mon sens. » |
| BES-06 | « Je veux un CV adapté à chaque offre, au format de mon modèle Word, sans le refaire à la main. » |
| BES-07 | « Je veux de l'aide pour répondre aux questions de motivation des formulaires. » |
| BES-08 | « Je veux visualiser l'ensemble de ma recherche. » |
| BES-09 | « Je veux utiliser mes deux clés d'API : Claude et Gemini. » |
| BES-10 | « Pour la BD on va utiliser Neon. » |
| BES-11 | « Accès base via Drizzle ORM plutôt que SQL écrit à la main, pour éviter les injections SQL. » |
| BES-12 | « Le but de cette application est pour mes candidatures de CDI et CDD ou l'alternance et leur suivi. » (précisé : « pas besoin de retirer les jobs étudiants ») |
| BES-14 | « Il faudra des comptes user pour l'utilisateur qui se connecte pour suivre ses candidatures et tout le reste. » |
| BES-15 | « Ajoute un Swagger qui documente bien mes API. » |
| BES-16 | « L'autorisation pour son Gmail devra être effectuée depuis l'app web. » |
| BES-13 | « Pas de CV générique : un CV optimisé pour passer les ATS et dont les expériences sont reformulées (sans mentir) pour correspondre aux besoins de l'offre ou en couvrir une bonne partie. » |
| BES-17 | « Exempter [les agrégats du tableau de bord de l'interdiction du Seq Scan], borner à 50 ms. » (choix du 22/09/2026, après mesure : moins de 1 ms par requête avec le jeu de charge) |
| BES-18 | « Il faudrait pouvoir mettre une description de l'offre et la date de candidature. » |
| BES-19 | « Pour la synchronisation on peut définir la période à vérifier qui doit être modifiable sur l'écran, mais pour éviter ces rate limits on peut passer par les mails sur la période 1 mois. » (après refus de quota de l'API Gmail, 22/09/2026) |
| BES-20 | « J'ai l'abonnement max avec Claude et je ne veux pas payer de crédit en plus […] je veux utiliser ces trois là Llama 3.3 70B, Qwen, Kimi K2 de Groq. » (22/09/2026) |
| BES-21 | « Il faut qu'il puisse bien labéliser les offres (quand c'est refusé ne pas confondre avec accusé de réception etc.) en vérifiant la présence de certains mots dans le mail. » (23/09/2026) |
| BES-28 | « On part avec l'option A et B » — lire le balisage `schema.org/JobPosting` et l'état embarqué des pages, plutôt que de confier chaque page à un modèle. (24/09/2026) |
| BES-27 | « Comment résoudre ce problème d'adaptateur générique ? Il faudrait résoudre ça automatiquement pour mon scraping. » (24/09/2026) |
| BES-26 | « Rajoute un bouton pour surveiller tous les sites de la proposition d'un coup. » (23/09/2026) |
| BES-25 | « L'idée de cette section, c'est de récupérer depuis les offres que j'ai récupérées leur nom de site à travers les mails, et stocker dans ma BD. » (23/09/2026) |
| BES-24 | « Ajoute une section Profil pour définir ses expériences, ce que l'on recherche aussi, et ses formations (niveau d'études master, licence, etc.) et les certificats passés et tout. » (23/09/2026) |
| BES-22 | « Pour reconnaître les statuts des mails il faut regarder le contenu et voir la présence de ces termes. Statut/Refusée : “pas retenue”, “ne correspond malheureusement pas”, “au regret”, “suite favorable”, “nous ne pouvons y donner”. Statut/En attente : “bien reçu votre candidature”, “accusé de réception de votre candidature”, “candidature a bien été”. Fais pareil pour les termes en anglais et rajoute quelques termes qui vont dans le sens du statut. » (23/09/2026) |
| BES-29 | « On va réarranger les branches de façon propre : une branche dev pour tous les développements, la main laisse juste trois fonctionnalités de l'app qu'on va développer à fond avant de la déployer : le tableau de bord, candidature et réglage pour la synchronisation avec le mail pour suivre ces candidatures. » (24/09/2026) |
| BES-30 | « Nous allons travailler sur la classification des offres : regarde, il l'a mise en attente au lieu de la mettre refusée, pareil sur la deuxième image. » (24/09/2026 ; deux refus — « nous ne pouvons pas donner de suite favorable », « nous avons le regret […] pas retenu votre candidature » — étiquetés « Statut/En attente ») |
| BES-31 | « Ok vas-y. » (24/09/2026, en réponse à la proposition : relire les messages déjà classés « accusé de réception » avec la lecture du corps de T-307, pour corriger les refus déjà enregistrés comme « En attente ») |
| BES-32 | « Pour les entreprises inconnues, il suffit de regarder le nom de domaine dans le mail. » (24/09/2026, capture : candidature envoyée à `christophe.deschamps@data-praxis.fr`, enregistrée « Entreprise inconnue ») |
| BES-33 | « Travaille sur le graphique pour le suivi : regardons sur une période de 5 semaines et sois plus expressif, suis le skill bi-dashboard-design ; il doit être dynamique. » (24/09/2026, captures du graphique des 16 semaines) |
| BES-34 | « Au niveau des relances, il faudra revoir la politique : relancer tous ceux dont on a un mail de relance, et ajouter un bouton Relance qui va rédiger le mail à envoyer ; en cliquant, ça doit lancer le mail avec l'objet et le contenu, avec le mail en attendant d'être envoyé. » (24/09/2026 ; précisé : adresse joignable, brouillon dans Gmail, rédaction par l'IA) |
| BES-38 | « Rajoute les cookies, les règles de RGPD, etc., et tout. » (24/09/2026 ; précisé : page cookies et mention d'information discrète — un seul cookie, strictement nécessaire, donc pas de consentement à demander ; suppression du compte et export des données dans l'application ; éditeur et hébergeur fournis par la configuration) |
| BES-39 | « Prépare le front pour un déploiement sur Vercel et le back pour un déploiement sur Northflank. » (24/09/2026) |
| BES-40 | « Rajoute aussi la pipeline CI/CD qui va exécuter tous les tests unitaires et d'intégration. » (24/09/2026) |
| BES-41 | « Optimise aussi les performances et le SEO. » (25/09/2026, relevé Lighthouse à l'appui : description absente, `robots.txt` invalide, affichage lent) |
| BES-35 | « On va retaper la section Réglages en gardant que ce qui est utile à savoir pour l'utilisateur : déjà retire-moi le fournisseur d'IA, et optimise la section boîte mail en suivant les principes ux-design et ui-design. » (24/09/2026) |
| BES-23 | « Applique un système de queue pour mes traitements trop longs et même des websockets, avec une architecture asynchrone. » (23/09/2026) |

### 4.2 Exigences métier (indépendantes de la solution)

| ID | Exigence métier | Besoin(s) |
|---|---|---|
| EXM-01 | Le système doit reconstituer automatiquement l'état de chaque candidature à partir des échanges de messagerie. | BES-01, BES-02 |
| EXM-02 | Le système doit présenter chaque candidature avec l'historique complet de ses échanges. | BES-02 |
| EXM-03 | Le système doit refléter le classement des candidatures dans la messagerie du candidat. | BES-03 |
| EXM-04 | Le système doit signaler les candidatures nécessitant une relance. | BES-04 |
| EXM-05 | Le système doit détecter les nouvelles offres publiées par des entreprises choisies. | BES-05 |
| EXM-06 | Le système doit évaluer l'adéquation de chaque nouvelle offre au profil du candidat. | BES-05 |
| EXM-07 | Le système doit produire un CV fidèle au profil, adapté à une offre, dans la charte graphique du candidat. | BES-06, BES-13 |
| EXM-12 | Le système doit maximiser les chances qu'un CV franchisse le tri automatique des logiciels de recrutement, sans affirmation absente du profil. | BES-13 |
| EXM-13 | Le système doit réserver l'accès aux données de chaque utilisateur à cet utilisateur, après authentification. | BES-14 |
| EXM-14 | Le système doit fournir une documentation à jour et consultable de toutes ses interfaces de programmation. | BES-15 |
| EXM-15 | Le système doit rendre la main immédiatement sur un traitement long et en montrer l'avancement. | BES-23 |
| EXM-08 | Le système doit proposer des réponses rédigées aux questions de formulaires de candidature. | BES-07 |
| EXM-09 | Le système doit fournir des indicateurs de suivi de la recherche d'emploi. | BES-08 |
| EXM-10 | Le système doit répartir les traitements automatisés entre deux fournisseurs IA, avec continuité de service si l'un est indisponible. | BES-09 |
| EXM-11 | Le système doit distinguer les offres et les candidatures selon le type de contrat recherché : CDI, CDD, alternance ou job étudiant. | BES-12 |

## 5. Périmètre

### 5.1 Dans le périmètre
Suivi des candidatures depuis Gmail ; saisie manuelle de candidatures ; veille de sites carrières d'entreprises choisies ;
notation des offres ; génération de CV (.docx, .pdf) ; rédaction de réponses de motivation ; tableau de bord ;
sauvegarde et restauration de la base.

### 5.2 Hors périmètre (exclusions explicites)
- Envoi automatique de candidatures au nom du candidat.
- Envoi automatique de relances : le système signale, le candidat relance lui-même.
- Collecte sur LinkedIn, Indeed, Welcome to the Jungle ou toute plateforme dont les conditions interdisent l'automatisation.
- Messageries autres que Gmail.
- Partage de données entre utilisateurs, rôles d'administration,
  application mobile native. (Le multi-utilisateur avec comptes séparés est dans le périmètre depuis v1.2, BES-14 ;
  l'hébergement en ligne de l'interface et de l'API, depuis v1.26, BES-39.)
- Rendu des pages carrières exécutant du JavaScript côté client (navigateur automatisé).

## 6. Exigences fonctionnelles

Convention : **doit** = obligation du système ; **peut** = capacité offerte au candidat.
Priorité MoSCoW : **M** (Must), **S** (Should), **C** (Could).
Vérification : **T** test automatisé, **D** démonstration, **I** inspection.

### 6.1 Synchronisation de la messagerie (GML)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-GML-01 | L'utilisateur peut connecter sa propre boîte Gmail depuis l'interface web, par autorisation OAuth lancée et reçue par l'application. | M | EXM-01, BES-16 | D | Après consentement Google, l'écran Réglages de cet utilisateur affiche l'adresse connectée ; un autre utilisateur ne la voit pas. |
| EF-GML-02 | Le candidat peut révoquer la connexion Gmail depuis l'interface. | M | EXM-01 | T | Après révocation, aucun jeton n'est présent en base. |
| EF-GML-03 | Le système doit synchroniser les messages reçus et envoyés toutes les 30 minutes lorsqu'une boîte est connectée. | M | EXM-01 | T | Le planificateur déclenche la tâche selon l'expression cron configurée. |
| EF-GML-04 | Le candidat peut déclencher une synchronisation manuelle. | M | EXM-01 | T | L'appel renvoie le nombre de messages lus, retenus et classés. |
| EF-GML-05 | Lors de la première synchronisation, le système doit traiter les messages des N derniers jours, N paramétrable entre 1 et 365 avec **30 par défaut** (v1.5, BES-19 ; 120 en v1.4). | M | EXM-01 | T | Avec N = 30, aucun message antérieur à J-30 n'est traité. |
| EF-GML-06 | Le système doit ignorer tout message déjà traité. | M | EXM-01 | T | Deux synchronisations successives sans nouveau message n'ajoutent aucune ligne. |
| EF-GML-07 | Le système doit écarter sans appel IA tout message ne correspondant à aucun indicateur d'emploi (RG-10). | M | EXM-10 | T | Un message bancaire de test n'entraîne aucun appel fournisseur. |
| EF-GML-08 | Le système doit attribuer à chaque message retenu une catégorie de message, lue sur son objet et le début de son corps, et non sur le seul extrait de Gmail (précisée v1.18, BES-30). | M | EXM-01 | T | Sur le jeu de fixtures, chaque message reçoit une catégorie valide. |
| EF-GML-09 | Le système doit identifier l'employeur réel d'un message transmis par une plateforme lorsque ce nom figure dans l'objet ou le corps. | M | EXM-01 | T | Fixture APEC « Innova Solutions » : entreprise = Innova Solutions. |
| EF-GML-10 | Le système doit enregistrer le nom de la plateforme intermédiaire d'un message. | S | EXM-09 | T | Fixture LHH : plateforme = LHH. |
| EF-GML-11 | Le système doit rattacher chaque message de catégorie candidature envoyée, accusé, entretien, proposition ou refus à une candidature selon RG-03. | M | EXM-02 | T | Trois messages McDonald's successifs sont rattachés à une seule candidature. |
| EF-GML-12 | Le système doit créer une candidature lorsqu'aucune candidature ne correspond au message selon RG-03. | M | EXM-01 | T | Un refus d'une entreprise inconnue crée une candidature au statut Refusée. |
| EF-GML-13 | Le système doit appliquer dans Gmail le libellé « Candidatures/‹Entreprise› » au fil d'un message rattaché. | S | EXM-03 | T | Appel `threads.modify` vérifié sur client Gmail simulé. |
| EF-GML-14 | Le système doit maintenir un seul libellé de statut sur un fil rattaché, selon RG-05. | S | EXM-03 | T | Un fil passant d'« En attente » à « Entretien » ne porte plus « En attente ». |
| EF-GML-15 | Le système doit appliquer le libellé « Alertes emploi » à un message d'alerte emploi. | S | EXM-03 | T | Appel `threads.modify` avec ajout du libellé. |
| EF-GML-16 | Le système doit retirer de la boîte de réception un message d'alerte emploi. | C | EXM-03 | T | Appel `threads.modify` avec retrait de INBOX. |
| EF-GML-17 | Le candidat peut désactiver l'écriture de libellés dans Gmail. | S | EXM-03 | T | Paramètre désactivé : aucun appel `threads.modify`. |
| EF-GML-18 | Le système doit journaliser chaque exécution de synchronisation avec début, fin, compteurs et erreur éventuelle. | S | ENF-FIA-01 | T | Une ligne `job_runs` par exécution. |
| EF-GML-19 | Le système doit enregistrer le type de contrat d'une candidature créée depuis un message lorsque ce message le mentionne. | C | EXM-11 | T | Fixture « Accusé de réception — Alternance Data Analyst » : type = alternance. |
| EF-GML-20 | Le candidat doit pouvoir demander, depuis l'écran Réglages, la relecture des messages reçus déjà classés « accusé de réception ». Chacun est relu dans Gmail ; celui que RG-17 désigne comme un refus est reclassé « refus », sa candidature suit RG-04 et ses libellés Gmail sont mis à jour (EF-GML-13 à 17). Aucun appel à l'IA ; aucun autre message n'est modifié. (v1.19, BES-31) | S | EXM-01 | T | Un accusé de réception enregistré dont le corps refuse devient « refus » et sa candidature « Refusée » ; un accusé de réception sans refus, ou n'annonçant un refus que sous condition, reste inchangé ; la relecture s'exécute en file (EF-EXE-01) et compte les messages relus et corrigés. |

### 6.2 Suivi des candidatures (CAN)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-CAN-01 | Le système doit afficher les candidatures regroupées par entreprise, entreprises triées alphabétiquement. | M | EXM-02 | D | — |
| EF-CAN-02 | Le candidat peut filtrer les candidatures par statut. | M | EXM-02 | T | Filtre « Refusée » : seules les candidatures refusées sont listées. |
| EF-CAN-03 | Le candidat peut rechercher une candidature par nom d'entreprise ou par intitulé de poste. | S | EXM-02 | T | Recherche « mcdo » : la candidature McDonald's apparaît. |
| EF-CAN-04 | Le système doit afficher la chronologie des messages d'une candidature, par date croissante, avec date, sens, catégorie, objet et extrait. | M | EXM-02 | T | Ordre chronologique vérifié sur fixture. |
| EF-CAN-05 | Le système doit fournir pour chaque message un lien ouvrant son fil dans Gmail. | S | EXM-02 | I | — |
| EF-CAN-06 | Le candidat peut créer une candidature en saisissant entreprise, intitulé de poste et statut. | M | EXM-01 | T | Réponse 201 et candidature visible dans la liste. |
| EF-CAN-07 | Le candidat peut modifier le statut d'une candidature. | M | EXM-01 | T | Réponse 204 et statut modifié en base. |
| EF-CAN-08 | Le candidat peut associer une note de 2 000 caractères maximum à une candidature. | C | EXM-02 | T | Note de 2 001 caractères : réponse 400. |
| EF-CAN-09 | Le candidat peut supprimer une candidature. | S | EXM-01 | T | Les messages associés restent en base, détachés. |
| EF-CAN-10 | Le candidat peut rattacher un message à une autre candidature. | S | EXM-02 | T | Correction d'une erreur de classement de l'IA. |
| EF-CAN-11 | Le système doit mettre à jour le statut d'une candidature selon RG-04 à chaque message rattaché. | M | EXM-01 | T | Accusé reçu après entretien : le statut reste Entretien. |
| EF-CAN-12 | Le système doit marquer « à relancer » toute candidature répondant à RG-06. | M | EXM-04 | T | Candidature Envoyée sans activité depuis 11 jours avec D = 10 : marquée. |
| EF-CAN-13 | Le candidat peut renseigner et modifier le type de contrat d'une candidature. | M | EXM-11 | T | Valeur hors liste (glossaire) : réponse 400. |
| EF-CAN-14 | Le candidat peut filtrer les candidatures par type de contrat. | M | EXM-11 | T | Filtre « Alternance » : seules les candidatures en alternance sont listées. |
| EF-CAN-15 | Le candidat peut enregistrer, modifier et effacer la description de l'offre d'une candidature, de 20 000 caractères au plus. | S | EXM-02 | T | Description de 20 001 caractères : réponse 400 ; description enregistrée affichée dans le détail de la candidature et absente de la liste. |
| EF-CAN-16 | Le candidat peut indiquer la date de candidature à la création d'une candidature, puis la modifier ; la date ne peut être ni postérieure au moment de la saisie, ni antérieure au 1er janvier 2000. | S | EXM-02, EXM-04 | T | Candidature Envoyée créée avec une date antérieure de 15 jours et D = 10 : marquée « à relancer » (RG-06, RG-16) ; date du lendemain : réponse 400. |
| EF-CAN-17 | Le candidat doit pouvoir, depuis une candidature à relancer, obtenir en un geste un brouillon de relance dans sa boîte Gmail : réponse dans le fil de la candidature, adressée à l'adresse de contact (RG-20), objet et texte rédigés (80 à 150 mots, rien d'affirmé qui ne figure dans la candidature). Le brouillon s'ouvre dans Gmail ; le système ne l'envoie jamais. (v1.22, BES-34) | S | EXM-04 | T | Candidature à relancer : un brouillon est créé dans le fil, adressé au contact, et Gmail s'ouvre dessus ; aucun message n'est envoyé ; sans adresse de contact : 409 ; aucun fournisseur d'IA : 502. |

### 6.3 Veille des offres (VEI)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-VEI-01 | Le candidat peut ajouter une source surveillée en indiquant nom d'entreprise, type de source et identifiant. | M | EXM-05 | T | Réponse 201. |
| EF-VEI-02 | Le système doit rejeter un identifiant non conforme à RG-08 pour le type de source choisi. | M | ENF-SEC-04 | T | Identifiant `../../etc` pour Greenhouse : réponse 400. |
| EF-VEI-03 | Le système doit rejeter l'ajout d'une source déjà surveillée. | S | EXM-05 | T | Réponse 409. |
| EF-VEI-04 | Le candidat peut suspendre puis réactiver une source. | S | EXM-05 | T | Source suspendue : non consultée au passage suivant. |
| EF-VEI-05 | Le candidat peut retirer une source surveillée. | S | EXM-05 | T | Offres de la source supprimées en cascade. |
| EF-VEI-06 | Le système doit consulter chaque source active à 7 h, 13 h et 19 h, heure de Paris. | M | EXM-05 | T | Expression cron par défaut vérifiée. |
| EF-VEI-07 | Le candidat peut déclencher une consultation immédiate de toutes les sources actives. | M | EXM-05 | T | Réponse avec nombre de sources, nouvelles offres, offres pertinentes. |
| EF-VEI-08 | Le système doit prendre en charge les types de source Greenhouse, Lever, SmartRecruiters, Recruitee, Workday et page carrières générique. | M | EXM-05 | T | Un test par type sur réponse enregistrée (fixture). |
| EF-VEI-09 | Le système doit enregistrer une offre uniquement si elle est absente de la base pour sa source. | M | EXM-05 | T | Deux consultations identiques : zéro nouvelle offre à la seconde. |
| EF-VEI-10 | Le système doit enregistrer la date de dernière consultation de chaque source. | S | ENF-FIA-02 | T | — |
| EF-VEI-11 | Le système doit enregistrer le message d'erreur de la dernière consultation échouée d'une source. | S | ENF-FIA-02 | T | Source renvoyant HTTP 500 : erreur visible dans la liste des sources. |
| EF-VEI-12 | Le système doit attribuer à chaque nouvelle offre un score de pertinence selon RG-09. | M | EXM-06 | T | Score entier compris entre 0 et 100. |
| EF-VEI-13 | Le système doit associer à chaque offre notée par l'IA une justification d'une phrase en français. | S | EXM-06 | T | Justification non vide. |
| EF-VEI-14 | Le système doit attribuer sans appel IA le score 5 aux offres exclues par RG-10. | M | EXM-10 | T | Offre « Comptable senior » : score 5, aucun appel fournisseur. |
| EF-VEI-15 | Le système doit envoyer au candidat un e-mail récapitulatif lorsqu'une consultation produit au moins une offre de score supérieur ou égal au seuil S. | S | EXM-05 | T | S paramétrable, 60 par défaut. |
| EF-VEI-16 | Le système doit afficher les offres par score décroissant. | M | EXM-06 | T | — |
| EF-VEI-17 | Le candidat peut filtrer les offres par score minimum. | S | EXM-06 | T | — |
| EF-VEI-18 | Le candidat peut classer une offre dans l'état « gardée » ou « écartée ». | S | EXM-06 | T | — |
| EF-VEI-19 | Le candidat peut déclarer avoir postulé à une offre. | M | EXM-01 | T | L'offre passe à l'état « postulée ». |
| EF-VEI-20 | Le système doit créer une candidature au statut Envoyée lorsque le candidat déclare avoir postulé à une offre. | M | EXM-01 | T | Candidature liée à l'offre et au CV utilisé, avec le type de contrat de l'offre. |
| EF-VEI-21 | Le système doit attribuer à chaque nouvelle offre un type de contrat. | M | EXM-11 | T | Offre Greenhouse « Apprenti Data Engineer » : type = alternance ; offre sans mention : non précisé. |
| EF-VEI-22 | Le candidat peut filtrer les offres par type de contrat. | S | EXM-11 | T | — |
| EF-VEI-23 | Le système doit proposer au candidat, comme sources à surveiller, les entreprises auxquelles il a déjà postulé et qu'il ne surveille pas encore, avec le domaine d'où elles lui ont écrit (RG-19). | S | EXM-05 | T | Entreprise ayant écrit depuis `arkema.com` et sans source : proposée avec ce domaine. Entreprise déjà surveillée : non proposée. |
| EF-VEI-24 | Le système doit proposer le type de source d'une entreprise lorsque le domaine d'envoi désigne un ATS connu, et « page carrières » sinon. | S | EXM-05 | T | Message envoyé depuis `no-reply@greenhouse.io` : type Greenhouse proposé. |
| EF-VEI-25 | Le candidat peut écarter une proposition, qui ne lui est alors plus présentée. | S | EXM-05 | T | Proposition écartée : absente de la liste au rappel suivant. |
| EF-VEI-26 | Le candidat peut ajouter d'un seul geste toutes les sources proposées, et le système lui rend compte de celles qu'il n'a pas pu ajouter, avec la raison. | S | EXM-05 | T | Trois propositions dont une refusée : deux sources ajoutées, la refusée nommée avec sa raison. |
| EF-VEI-27 | Le système doit retrouver la page qui liste les offres lorsque la source ne désigne que l'accueil du site, en suivant un lien de ce site, et sans jamais en suivre plus d'un. | S | EXM-05 | T | Source `https://exemple.fr/` dont l'accueil porte « Nos offres » : les offres de cette page sont relevées, sans appel d'IA sur l'accueil. Adresse hors du site : jamais suivie. |
| EF-VEI-28 | Le système doit lire les offres qu'une page publie sous forme balisée — `schema.org/JobPosting` en `application/ld+json`, ou dans l'état embarqué de la page — avant de confier cette page à un modèle, et ne l'y confier que si le balisage n'a rien donné. | M | EXM-05, EXM-10 | T | Page portant trois offres balisées : les trois sont relevées, avec leur date de publication, sans aucun appel d'IA. Page sans balisage : le modèle est appelé comme avant. |

### 6.4 Production de CV et de réponses (CVX)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-CVX-01 | Le candidat peut consulter son profil de référence. | M | EXM-07 | T | — |
| EF-CVX-02 | Le candidat peut modifier son profil de référence. | S | EXM-07 | T | Profil invalide au regard du schéma : réponse 400. |
| ~~EF-CVX-03~~ | *Supprimée en v1.1 (BES-13) : aucun CV générique n'est produit ; tout CV est adapté à une offre.* | — | — | — | — |
| EF-CVX-04 | Le système doit générer un CV adapté à une offre repérée. | M | EXM-07 | T | — |
| EF-CVX-05 | Le système doit générer un CV adapté à une offre saisie par le candidat (entreprise, intitulé, texte). | M | EXM-07 | T | — |
| EF-CVX-06 | Le système doit produire chaque CV au format Word (.docx). | M | EXM-07 | T | Fichier ouvrable, type MIME vérifié. |
| EF-CVX-07 | Le système doit produire chaque CV au format PDF d'une page A4. | M | EXM-07 | T | `pdfinfo` : 1 page, format A4. |
| EF-CVX-08 | Le système doit appliquer la charte RG-11 à chaque CV. | M | EXM-07 | I | Comparaison visuelle avec le modèle de référence. |
| EF-CVX-09 | Le système doit rejeter tout CV adapté mentionnant une entreprise, un diplôme ou une période absents du profil (RG-12). | M | EXM-07 | T | Réponse IA simulée contenant une entreprise inventée : génération refusée. |
| EF-CVX-10 | Le système doit conserver chaque version de CV générée avec son libellé, sa date et le fournisseur IA utilisé. | S | EXM-07 | T | — |
| EF-CVX-11 | Le candidat peut télécharger toute version de CV générée, au format Word ou PDF. | M | EXM-07 | T | — |
| EF-CVX-12 | Le système doit rédiger une réponse de 80 à 140 mots à une question de formulaire, pour une offre donnée. | S | EXM-08 | T | Nombre de mots contrôlé ; hors bornes : nouvelle tentative puis erreur. |
| EF-CVX-13 | Le candidat peut modifier la réponse rédigée avant de la copier. | S | EXM-08 | D | — |
| EF-CVX-14 | Le système doit produire des CV dont le texte est intégralement lisible par un logiciel de recrutement, conformément à RG-15. | M | EXM-12 | T | Le .docx ne contient ni tableau, ni zone de texte, ni contenu en en-tête ou pied de page ; le texte extrait du PDF (`pdftotext`) contient chaque section et chaque expérience, dans l'ordre du CV. |
| EF-CVX-15 | Le système doit reformuler les expériences, le profil et les compétences du CV adapté avec le vocabulaire de l'offre, pour chaque exigence de l'offre à laquelle une donnée du profil répond. | M | EXM-12 | T | Offre exigeant « gestion des stocks », profil mentionnant « rotation des stocks » : l'expression de l'offre figure dans le CV. |
| EF-CVX-16 | Le système doit afficher, pour chaque CV adapté, le taux de couverture des mots-clés de l'offre et la liste des mots-clés non couverts. | S | EXM-12 | T | Taux entier de 0 à 100 ; un mot-clé est couvert s'il figure dans le texte du CV. |
| EF-CVX-17 | Le système doit signaler un CV adapté dont le taux de couverture est inférieur à T %, T paramétrable avec 60 par défaut. | S | EXM-12 | T | Couverture de 45 % avec T = 60 : avertissement affiché. |
| EF-CVX-18 | Le candidat peut renseigner dans son profil de référence son niveau d'études, choisi dans la liste RG-18, et préciser s'il est obtenu ou en cours. | S | EXM-07 | T | Niveau hors liste : réponse 400. Profil sans niveau : accepté, le niveau vaut « non précisé ». |
| EF-CVX-19 | Le candidat peut renseigner dans son profil de référence ses certifications, chacune avec son intitulé, l'organisme qui la délivre et son année. | S | EXM-07 | T | Certification sans intitulé : réponse 400. Profil sans certification : accepté. |
| EF-CVX-20 | Le système doit faire figurer dans le CV généré le niveau d'études du candidat et, lorsqu'il en a, une section « Certifications ». | S | EXM-07 | T | CV d'un profil sans certification : aucune section vide. |

### 6.5 Tableau de bord (TDB)

| ID | Exigence | Prio | Source | Vérif. |
|---|---|---|---|---|
| EF-TDB-01 | Le système doit afficher le nombre total de candidatures suivies. | M | EXM-09 | T |
| EF-TDB-02 | Le système doit afficher le nombre de candidatures ayant atteint le statut Entretien ou Proposition. | M | EXM-09 | T |
| EF-TDB-03 | Le système doit afficher le taux de réponse calculé selon RG-07. | M | EXM-09 | T |
| EF-TDB-04 | Le système doit afficher, pour chacune des 5 dernières semaines (la semaine en cours comprise et signalée comme telle), le nombre de candidatures envoyées, ayant obtenu un entretien et refusées. (v1.21, BES-33 ; 16 semaines jusqu'en v1.20) | S | EXM-09 | T |
| EF-TDB-10 | Le système doit afficher, pour la semaine en cours, les candidatures envoyées, les entretiens et les refus, chacun avec son écart à la semaine précédente. (v1.21, BES-33) | S | EXM-09 | T |
| EF-TDB-11 | Le tableau de bord ouvert doit se mettre à jour, sans action du candidat, à la fin de chaque synchronisation Gmail ou relecture des messages réussie. (v1.21, BES-33) | S | EXM-09 | T |
| EF-TDB-05 | Le système doit afficher le nombre de candidatures par statut. | M | EXM-09 | T |
| EF-TDB-06 | Le système doit afficher le nombre de candidatures par canal (direct ou plateforme). | C | EXM-09 | T |
| EF-TDB-07 | Le système doit afficher la liste des candidatures à relancer, de la plus ancienne à la plus récente. | M | EXM-04 | T |
| EF-TDB-08 | Le système doit afficher le nombre d'offres à l'état « nouvelle » de score supérieur ou égal à S, lorsque la veille des offres est activée (ENF-MAI-07). | S | EXM-06 | T |
| EF-TDB-09 | Le système doit afficher le nombre de candidatures et le taux de réponse (RG-07) par type de contrat. | S | EXM-11 | T |

### 6.6 Orchestration IA (IA)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-IA-01 | Le système doit confier chaque tâche IA au fournisseur prioritaire défini par RG-13. | M | EXM-10 | T | Fournisseurs simulés : appel au prioritaire vérifié. |
| EF-IA-02 | Le système doit confier la tâche au fournisseur suivant lorsque le prioritaire renvoie une erreur, dépasse 60 secondes ou produit une réponse non conforme au schéma. | M | EXM-10 | T | Trois tests, un par cas d'échec. |
| EF-IA-03 | Le système doit valider chaque réponse IA contre le schéma de la tâche avant toute utilisation. | M | ENF-SEC-06 | T | Réponse hors schéma : jamais persistée. |
| EF-IA-04 | Le système doit informer le candidat lorsqu'aucun fournisseur n'a pu réaliser une tâche. | M | EXM-10 | T | Réponse HTTP 502 avec message explicite. |
| EF-IA-05 | Le système doit fonctionner lorsqu'une seule clé d'API est configurée, quel que soit le fournisseur. | M | EXM-10 | T | Démarrage réussi avec la seule clé Gemini, ou la seule clé Groq. |
| EF-IA-06 | Le système doit enregistrer pour chaque appel IA le fournisseur, la tâche, la durée, le nombre de jetons et le résultat. | S | ENF-COU-01 | T | Une ligne `llm_calls` par appel. |

### 6.7 Réglages (CFG)

| ID | Exigence | Prio | Source | Vérif. |
|---|---|---|---|---|
| EF-CFG-01 | Le système doit afficher l'adresse Gmail connectée et la date de dernière synchronisation. | M | EXM-01 | D |
| EF-CFG-02 | ~~Le système doit afficher les fournisseurs IA configurés et la tâche attribuée à chacun.~~ Retirée de l'écran en v1.23 (BES-35) : l'information ne sert pas au candidat ; la route `GET /api/settings/ai` reste documentée pour le diagnostic. | — | EXM-10 | — |
| EF-CFG-05 | L'écran Réglages doit présenter d'abord l'état de la boîte Gmail (connectée, synchronisation en cours, autorisation expirée — signalé par un libellé, pas par la seule couleur) et l'action « Synchroniser maintenant », puis les préférences, puis l'entretien, et tenir la déconnexion à l'écart des autres actions. La période de la première synchronisation n'est proposée que tant que celle-ci n'a pas eu lieu. (v1.23, BES-35) | S | EXM-01 | T |
| EF-CFG-03 | Le système doit afficher le coût IA estimé du mois en cours. | C | ENF-COU-01 | T |
| EF-CFG-04 | Le candidat doit pouvoir régler, depuis l'écran Réglages, la période de la première synchronisation (N jours, EF-GML-05). | M | BES-19 | T |

### 6.8 Comptes et accès (AUT)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-AUT-01 | Une personne peut créer un compte avec une adresse e-mail et un mot de passe. | M | EXM-13 | T | Réponse 201 et session ouverte ; adresse déjà utilisée : réponse 409. |
| EF-AUT-02 | Le système doit refuser un mot de passe de moins de 12 ou de plus de 128 caractères. | M | EXM-13 | T | Mot de passe de 11 caractères : réponse 400. |
| EF-AUT-03 | L'utilisateur peut se connecter avec son adresse et son mot de passe. | M | EXM-13 | T | Réponse 200 et cookie de session `HttpOnly`, `SameSite=Strict`. |
| EF-AUT-04 | L'utilisateur peut se déconnecter ; sa session est alors invalidée côté serveur. | M | EXM-13 | T | Requête suivante avec l'ancien cookie : réponse 401. |
| EF-AUT-05 | Le système doit refuser avec le code 401 toute requête sans session valide, à l'exception de la création de compte, de la connexion, de l'état de santé et de la documentation. | M | EXM-13 | T | `GET /api/applications` sans cookie : 401. |
| EF-AUT-06 | Le système doit limiter chaque lecture et chaque modification aux données de l'utilisateur connecté. | M | EXM-13 | T | Candidature d'un autre utilisateur : réponse 404, jamais 403 (pas de divulgation d'existence). |
| EF-AUT-07 | Une session doit expirer 7 jours après son ouverture. | M | EXM-13 | T | Horloge simulée à J+7 : réponse 401. |
| EF-AUT-08 | L'utilisateur peut consulter l'adresse de son compte. | S | EXM-13 | T | `GET /api/auth/me` : adresse de l'utilisateur connecté. |

### 6.9 Documentation des API (DOC)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-DOC-01 | Le système doit publier une description OpenAPI 3 de chaque route : chemin, paramètres, corps, réponses, codes d'erreur et exigence d'authentification. | M | EXM-14 | T | Chaque route de l'API figure dans `/api/openapi.json`. |
| EF-DOC-02 | Le système doit proposer une interface web de consultation et d'essai de cette description. | S | EXM-14 | D | `/api/docs` affiche la documentation ; un appel d'essai fonctionne après connexion. |

### 6.10 Exécution des traitements longs (EXE)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-EXE-01 | Le système doit accepter une demande de traitement long (synchronisation de la messagerie, veille des offres, génération de CV) sans attendre sa fin, et répondre l'identifiant de l'exécution. | M | EXM-15 | T | La réponse arrive en moins d'une seconde et porte un identifiant d'exécution. |
| EF-EXE-02 | Le système doit exécuter les traitements d'un même candidat un par un, dans l'ordre de leur demande, sans en perdre. | M | EXM-15 | T | Trois demandes enchaînées : trois exécutions, dans l'ordre, aucune ignorée. |
| EF-EXE-03 | Le candidat doit pouvoir consulter l'état et l'avancement d'une exécution : en attente, en cours, terminée ou en échec, avec ses compteurs. | M | EXM-15 | T | — |
| EF-EXE-04 | Le système doit pousser l'avancement vers l'interface sans que celle-ci ait à redemander, et la reprise du flux après coupure ne doit rien perdre. | S | EXM-15 | T | Le flux émet un événement à chaque changement d'état ; une reconnexion retrouve l'état courant. |
| EF-EXE-05 | Le système doit reprendre ou marquer en échec toute exécution restée « en cours » après un arrêt du serveur. | S | ENF-FIA-01 | T | Une exécution « en cours » au démarrage est close en échec, jamais laissée telle quelle. |


### 6.11 Informations légales (LEG)

| ID | Exigence | Prio | Source | Vérif. |
|---|---|---|---|---|
| EF-LEG-01 | Le système doit publier, sans session, les mentions légales, la politique de confidentialité et la page des cookies, liées depuis la page de présentation, la page de connexion et l'application. L'éditeur (par défaut Sahiré YAPI), son adresse de contact (par défaut celle du Business Owner, accord du 24/09/2026) et l'hébergeur (par défaut Vercel et Northflank) peuvent être remplacés par la configuration. (v1.25, BES-38) | M | EXM-13 | T |
| EF-LEG-02 | À la première visite, le système doit informer, sans bloquer la page ni demander de consentement, qu'il ne dépose qu'un cookie strictement nécessaire à la session ; l'information ne réapparaît pas une fois lue sur le même navigateur. (v1.25, BES-38 — lignes directrices de la CNIL) | S | EXM-13 | T |

### 6.12 Référencement (SEO)

| ID | Exigence | Prio | Source | Vérif. |
|---|---|---|---|---|
| EF-SEO-01 | Les pages publiques (présentation, connexion, pages légales) doivent porter chacune un titre et une description propres, en français, une icône et un aperçu de partage ; le site doit publier un `robots.txt` valide qui ouvre ces pages et ferme l'application et l'API, et un `llms.txt` qui décrit le service. Les écrans de l'application ne sont pas indexés. (v1.28, BES-41) | S | EXM-13 | T |

## 7. Exigences non fonctionnelles

### 7.1 Performance
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-PERF-01 | Chaque page de l'interface doit s'afficher en moins de 2 secondes avec 1 000 candidatures, 10 000 messages et 5 000 offres en base. | T (jeu de charge) |
| ENF-PERF-02 | Une synchronisation incrémentale de 100 nouveaux messages doit s'achever en moins de 3 minutes. | T |
| ENF-PERF-03 | 95 % des générations de CV adapté doivent s'achever en moins de 60 secondes. | T (mesure `llm_calls`) |
| ENF-PERF-04 | Avec le jeu de charge d'ENF-PERF-01, aucune requête sélective de l'application (liste, recherche, détail, rattachement) ne doit effectuer de parcours séquentiel complet (`Seq Scan` dans `EXPLAIN`) sur les tables `applications`, `emails` ou `job_offers`. | I (EXPLAIN) |
| ENF-PERF-05 | Avec le jeu de charge d'ENF-PERF-01, chaque requête de calcul des indicateurs du tableau de bord (EF-TDB-01 à 09) doit s'exécuter en moins de 50 ms sur la base locale de test. | T (`EXPLAIN ANALYZE`) |
| ENF-PERF-06 | Aucune route de l'API ne doit dépasser 2 secondes : un traitement plus long est mis en file et suivi (EF-EXE-01). | T |
| ENF-PERF-07 | Construites pour la production et mesurées par Lighthouse en profil mobile, la page de présentation et la page de connexion doivent obtenir un score de performance d'au moins 90, un score SEO et « bonnes pratiques » de 100, et afficher leur plus grand élément en moins de 3 s ; le titre et le texte principal de la présentation sont visibles sans attendre la fin d'une animation, et la console reste sans erreur pour un visiteur. Les écrans Candidatures et Réglages, mesurés de même avec une session, doivent obtenir au moins 90 en performance et 100 en accessibilité, sans décalage de mise en page notable (CLS < 0,1) ; leur SEO n'est pas mesuré, puisqu'ils sont volontairement fermés aux moteurs (EF-SEO-01). (v1.28, BES-41) | I (Lighthouse) |

### 7.2 Sécurité
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-SEC-01 | En local, l'API et l'interface doivent être joignables uniquement depuis l'adresse 127.0.0.1. Hébergées (v1.26, BES-39), elles ne sont servies qu'en HTTPS, l'interface relayant l'API sous sa propre origine. | I |
| ENF-SEC-21 | Derrière les relais de l'hébergement, les limites de fréquence (ENF-SEC-19) doivent s'appliquer à chaque visiteur, identifié par l'adresse que les relais transmettent, et non au relais qu'ils partagent ; en local, cette adresse transmise est ignorée. (v1.26, BES-39) | T |
| ENF-SEC-02 | Le jeton de renouvellement OAuth doit être chiffré au repos en AES-256-GCM. | T |
| ENF-SEC-03 | Aucun secret (clé d'API, mot de passe, jeton) ne doit figurer dans le dépôt Git. | I (hook + revue) |
| ENF-SEC-04 | Toute donnée entrant dans l'API doit être validée par un schéma ; une donnée invalide doit être rejetée avec le code 400. | T |
| ENF-SEC-05 | Toute requête SQL doit être paramétrée. | I |
| ENF-SEC-06 | Tout contenu externe (message, page web, offre) transmis à un fournisseur IA doit être délimité et déclaré comme donnée non fiable dans l'instruction système. | I |
| ENF-SEC-07 | L'autorisation Gmail doit se limiter au scope `gmail.modify`. | I |
| ENF-SEC-08 | Les journaux ne doivent contenir ni secret, ni jeton, ni corps de message. | I |
| ENF-SEC-09 | Le compte de base de données de l'application ne doit disposer d'aucun droit de modification de structure (DDL). | T |
| ENF-SEC-10 | Les dépendances ne doivent présenter aucune vulnérabilité de sévérité haute ou critique (`npm audit`). | T (CI locale) |
| ENF-SEC-11 | L'API doit refuser les requêtes cross-origin provenant d'une origine autre que l'interface. | T |
| ENF-SEC-12 | L'API doit refuser toute requête d'écriture dont le type de contenu n'est pas `application/json`. | T |
| ENF-SEC-13 | Le téléchargement d'un fichier doit être refusé lorsque sa référence ne correspond pas à un identifiant généré par le système. | T |
| ENF-SEC-14 | Le callback OAuth doit rejeter toute réponse dont le paramètre `state` ne correspond pas à celui émis dans les 10 dernières minutes. | T |
| ENF-SEC-15 | Toute connexion à la base de données hébergée doit être chiffrée, avec vérification du certificat du serveur. | T (connexion sans chiffrement refusée) |
| ENF-SEC-16 | Le code applicatif ne doit construire aucune requête par assemblage de chaînes : toute valeur est transmise comme paramètre, tout nom de table ou de colonne est vérifié à la compilation. | I (règle lint + revue) |
| ENF-SEC-18 | Les mots de passe doivent être stockés sous forme d'empreinte salée calculée par une fonction lente (scrypt, paramètres OWASP), jamais en clair ni dans les journaux. | T |
| ENF-SEC-19 | La connexion doit renvoyer la même réponse pour une adresse inconnue et un mot de passe faux, et accepter au plus 10 tentatives par 15 minutes et par adresse IP. | T |
| ENF-SEC-20 | Le jeton de session doit être aléatoire (256 bits au moins) et stocké en base sous forme d'empreinte uniquement. | T |
| ENF-SEC-17 | Les identifiants de connexion à la base hébergée doivent être propres à chaque compte (application, migrations, sauvegarde), distincts et révocables séparément. | I |

### 7.3 Fiabilité et disponibilité
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-FIA-01 | L'échec d'une synchronisation ne doit pas arrêter le planificateur. | T |
| ENF-FIA-02 | L'échec de consultation d'une source ne doit pas empêcher la consultation des autres sources. | T |
| ENF-FIA-03 | Une synchronisation interrompue doit reprendre au passage suivant sans créer de doublon. | T |
| ENF-FIA-04 | La base doit faire l'objet d'une sauvegarde logique quotidienne. | I |
| ENF-FIA-05 | Chaque sauvegarde doit être restaurée automatiquement dans une base de contrôle, avec vérification du nombre de tables. | T |
| ENF-FIA-06 | La perte de données maximale admissible (RPO) est de 24 heures. | I |
| ENF-FIA-07 | La durée maximale de restauration (RTO) est de 30 minutes. | D |
| ENF-FIA-08 | Les sauvegardes doivent être conservées 30 jours. | I |
| ENF-FIA-09 | La synchronisation doit rester dans les quotas de l'API Gmail : appels espacés, refus pour quota réessayé avec attente croissante, et passage interrompu conservant les messages déjà lus. | T |
| ENF-FIA-10 | Un fournisseur d'IA qui refuse pour une raison passagère (surcharge, trop de requêtes) doit être redemandé jusqu'à 3 fois avant la bascule vers le fournisseur de secours ; un refus de la requête elle-même bascule aussitôt. | T |

### 7.4 Maintenabilité
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-MAI-01 | La couverture de tests doit atteindre au moins 80 % des lignes des modules métier (`backend/src/modules`, `backend/src/llm`, `backend/src/scraper`). | T |
| ENF-MAI-02 | Le code doit passer le contrôle de types strict et le linter sans erreur. | T |
| ENF-MAI-03 | L'ajout d'un type de source ne doit nécessiter aucune modification de code hors du nouveau fichier adaptateur et du registre des adaptateurs. | I |
| ENF-MAI-04 | L'ajout d'une tâche IA ne doit nécessiter aucune modification des fournisseurs existants. | I |
| ENF-MAI-05 | Toute modification de structure de base doit passer par un fichier de migration versionné. | I |
| ENF-MAI-06 | Chaque exigence de ce document doit être couverte par au moins un test ou une procédure de vérification référencée dans `docs/TRACABILITE.md`. | I |
| ENF-MAI-07 | La veille des offres (§6.3) et la production de CV (§6.4) doivent chacune pouvoir être activées ou désactivées par la configuration du serveur, sans modification de code. Une fonctionnalité désactivée n'expose aucune route d'API ni aucun traitement planifié, et ses écrans restent dans la navigation en affichant « En préparation » sans charger leur contenu ; une fonctionnalité que la configuration ne nomme pas est désactivée ; un nom inconnu empêche le démarrage. Le tableau de bord, les candidatures, la synchronisation Gmail et les réglages sont toujours actifs. (BES-29) | T |

### 7.5 Utilisabilité et portabilité
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-UTI-01 | L'interface doit être rédigée en français. | I |
| ENF-UTI-02 | L'interface doit rester utilisable sur un écran de 360 px de large. | D |
| ENF-UTI-03 | Chaque action longue (plus de 1 seconde) doit afficher un indicateur d'attente. | D |
| ENF-UTI-04 | Les animations de la page de présentation (chargement, survol, mouvement 3D, micro-interactions) doivent s'arrêter lorsque le système de l'utilisateur demande de réduire les animations, sans rien retirer du contenu ni des accès. (v1.24, BES-36) | T |
| ENF-POR-01 | Le système complet doit démarrer par une seule commande `docker compose up` sous Windows, macOS et Linux. | D |

### 7.6 Collecte responsable (veille)
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-COL-01 | Le système ne doit consulter aucune URL interdite par le fichier robots.txt du site. | T |
| ENF-COL-02 | Le système doit espacer d'au moins 3 secondes deux requêtes vers un même hôte. | T |
| ENF-COL-03 | Le système doit s'identifier par un agent utilisateur contenant une adresse de contact. | T |
| ENF-COL-04 | Le système doit limiter chaque requête de collecte à 15 secondes et à 3 Mo de réponse. | T |

### 7.7 Données personnelles (RGPD)
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-RGP-01 | Le système ne doit conserver d'un message que ses métadonnées (expéditeur, objet, date, adresse de contact selon RG-20 depuis v1.22) et un extrait de 300 caractères maximum. Le début du corps (2 000 caractères de texte au plus) peut être lu en mémoire pour le classer (EF-GML-08, RG-17), sans être ni conservé ni journalisé ; seuls 1 000 de ces caractères sont transmis à l'IA. (précisée v1.18, BES-30) | T |
| ENF-RGP-02 | L'utilisateur peut supprimer son compte et l'intégralité de ses données par une action unique. | T |
| ENF-RGP-03 | Les données doivent être stockées exclusivement sur le poste du candidat et dans la base hébergée, située dans l'Union européenne, à l'exception des contenus transmis aux fournisseurs IA pour traitement. | I |
| ENF-RGP-04 | Le système ne doit déposer aucun cookie ni traceur autre que le cookie de session (aucune mesure d'audience, aucune publicité, aucun service tiers dans le navigateur). (v1.25) | I |
| ENF-RGP-05 | La politique de confidentialité doit indiquer le responsable du traitement et son contact, les données traitées, les finalités et leurs bases légales, les durées de conservation (sauvegardes comprises), les destinataires (Neon, Google, Groq, Gemini, Anthropic), les transferts hors de l'Union européenne, les droits et leur exercice, le recours auprès de la CNIL, et le respect de la politique d'utilisation limitée des données des API Google. (v1.25) | I |

### 7.8 Coûts
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-COU-01 | Le coût des appels IA ne doit pas dépasser 10 € par mois pour 300 messages liés à l'emploi et 500 nouvelles offres par mois. | T (agrégat `llm_calls`) |

## 8. Contraintes

| ID | Contrainte | Origine |
|---|---|---|
| C-01 | L'interface est réalisée en React. | Business Owner |
| C-02 | La base de données est PostgreSQL, hébergée par Neon. | Business Owner (v1.1, BES-10) |
| C-03 | Les fournisseurs IA sont Claude (Anthropic) et Gemini (Google), avec les clés du candidat. | Business Owner |
| C-04 | La messagerie supportée est Gmail. | Existant |
| C-05 | Le système est multi-utilisateur à comptes séparés. En local, l'API et l'interface s'exécutent via Docker. Hébergé (v1.26), l'interface est servie par Vercel, qui relaie `/api` vers l'API servie par Northflank en une seule instance (planificateur et file d'exécution internes) ; la base est hébergée par Neon. | Business Owner (v1.2, BES-14 ; v1.26, BES-39) |
| C-06 | Le développement est réalisé de manière incrémentale par Claude Code, lot par lot, suivant `docs/ROADMAP.md`. | Organisation |
| C-07 | Le code respecte les principes des skills `clean-code` et `security` fournis dans `.claude/skills/`, et la règle `.claude/rules/database.md`. | Organisation |
| C-09 | L'accès aux données passe par l'ORM Drizzle. | Business Owner (v1.1, BES-11) |
| C-08 | Le CV reproduit le modèle Word « CV pour Forum » déjà utilisé par le candidat. | Existant |

## 9. Règles de gestion

| ID | Règle |
|---|---|
| RG-01 | Les statuts de candidature sont : **À postuler**, **Envoyée**, **Accusé reçu**, **Entretien**, **Proposition**, **Refusée**. |
| RG-02 | Correspondance catégorie → statut : candidature envoyée → Envoyée ; accusé de réception → Accusé reçu ; entretien → Entretien ; proposition → Proposition ; refus → Refusée. Alerte emploi et hors sujet ne modifient aucune candidature. |
| RG-03 | Rattachement d'un message : (a) entreprise identifiée par sa clé normalisée (RG-14) ; (b) si le message mentionne un intitulé, candidature de cette entreprise dont l'intitulé normalisé est identique ; (c) si le message ne mentionne aucun intitulé, candidature de l'entreprise dont la dernière activité est la plus récente ; (d) sinon, création d'une candidature avec l'intitulé mentionné ou, à défaut, « Candidature ». Si l'employeur n'est pas identifiable, l'entreprise retenue est la plateforme ; si aucune plateforme n'est identifiable, l'entreprise est déduite du domaine de l'adresse du correspondant — le destinataire d'un message envoyé, l'expéditeur d'un message reçu — lorsque ce domaine la désigne selon RG-19 (ni messagerie grand public, ni plateforme, ni outil de recrutement, ni job board) : « data-praxis.fr » donne « Data Praxis » (v1.20, BES-32) ; à défaut, l'entreprise retenue est « Entreprise inconnue ». |
| RG-04 | Évolution du statut : rang À postuler 0, Envoyée 1, Accusé reçu 2, Entretien 3, Proposition 4, Refusée 5. Un nouveau statut remplace le statut courant si et seulement si il vaut Proposition ou Refusée, ou si son rang est supérieur. Les messages sont traités par date croissante. La date de dernière activité prend la plus grande des deux dates. |
| RG-05 | Libellés Gmail de statut : Refusée → « Statut/Refusée » ; Entretien et Proposition → « Statut/Entretien » ; Envoyée et Accusé reçu → « Statut/En attente ». À postuler → aucun libellé. |
| RG-06 | Une candidature est « à relancer » lorsque son statut est Envoyée ou Accusé reçu, que sa dernière activité date de plus de D jours, D paramétrable avec 10 par défaut, et qu'au moins un de ses messages porte une adresse de contact (RG-20) — une candidature à laquelle on ne peut pas écrire n'est pas proposée à la relance (v1.22, BES-34). |
| RG-07 | Taux de réponse = (Entretien + Proposition + Refusée) / total des candidatures × 100, arrondi à l'entier le plus proche ; 0 lorsque le total est nul. |
| RG-08 | Format d'identifiant de source : Greenhouse, Lever, SmartRecruiters, Recruitee → `^[a-z0-9][a-z0-9._-]{0,80}$` (insensible à la casse) ; Workday → URL https sur un sous-domaine de `myworkdayjobs.com` contenant le nom du site carrières ; page générique → URL https. |
| RG-09 | Critères de notation : correspondance à une cible du profil ; lieu dans la zone de recherche ou télétravail ; type de contrat de l'offre accepté par la cible (CDI, CDD, alternance, job étudiant ; « non précisé » ne pénalise pas) ; expérience exigée de 3 ans au plus. Un critère non satisfait abaisse le score. |
| RG-10 | Pré-filtre sans IA : un message est retenu si son objet ou son extrait contient un mot-clé d'emploi, ou si son expéditeur appartient à la liste des plateformes connues. Une offre est retenue pour notation IA si son intitulé ou sa description contient au moins un mot-clé d'une cible et si son type de contrat n'est pas « autre ». Les listes sont paramétrables. |
| RG-11 | Charte du CV : format A4, une page ; en-tête deux colonnes (coordonnées à gauche, disponibilités et photo à droite) ; titre centré en gras 15 pt et sous-titre centré en italique 11 pt ; sections en bandeaux de fond `#D9E2F3` bordés de `#AAB5CE`, libellés en majuscules ; lignes « dates \| contenu » (alignement à 2 150 twips, largeur utile 10 620 twips) ; police Calibri 10 pt. Réalisation conforme à RG-15 (tabulations et trames de paragraphe, jamais de tableau). |
| RG-12 | Fidélité du CV : chaque entreprise, établissement de formation, période, intitulé de poste et diplôme cités dans un CV adapté doit exister à l'identique dans le profil de référence ; chaque compétence et chaque outil cités doivent figurer dans le profil. Autorisé : reformuler une activité réellement exercée avec le vocabulaire de l'offre, réordonner, sélectionner, mettre en avant. Interdit : ajouter une compétence, un outil, une certification, une responsabilité, un chiffre ou un résultat absents du profil ; modifier un intitulé de poste, un employeur ou une date. |
| RG-15 | Lisibilité par les ATS : texte réel (aucun texte en image) ; aucun tableau, zone de texte, colonne de section ni contenu en en-tête ou pied de page Word — la mise en page de RG-11 est obtenue par tabulations et trames de paragraphe ; titres de sections usuels en français (Profil, Expériences professionnelles, Formation, Compétences, Langues, Centres d'intérêt) ; coordonnées dans le corps du document ; dates au format « MM/AAAA – MM/AAAA » ; police standard ; intitulé du poste visé par l'offre en titre du CV. |
| RG-13 | Routage IA (v1.8) : trois emplacements Groq (modèles gratuits, choisis dans la configuration) sont essayés dans l'ordre, puis les secours historiques. Classement des messages, notation des offres, extraction de pages → Groq 1, 2, 3, Gemini, Claude. CV adapté, réponse de motivation, relance (v1.22) → Groq 1, 2, 3, Claude, Gemini. Un emplacement vide est ignoré. |
| RG-17 | Indices lexicaux de statut (v1.10, lecture v1.18) : dans un message **reçu**, l'objet et le début du corps (2 000 caractères de texte, citations des réponses précédentes exclues ; l'extrait de Gmail à défaut de corps lisible) sont comparés, sans accents ni casse, à une liste d'expressions de refus puis à une liste d'expressions d'accusé de réception, en français et en anglais. Une expression de refus précédée, dans sa phrase, d'une condition (« si », « sans réponse », « au cas où », « if »…) ne compte pas : « sans réponse sous 4 semaines, considérez que votre candidature n'a pas été retenue » reste un accusé de réception (v1.18). Une expression de refus impose « refus » (un refus poli ouvert par « nous avons bien reçu votre candidature » est donc classé « refus ») ; certaines expressions — « suite favorable », « suite positive » — ne valent refus que sous une négation proche. À défaut de refus, une expression d'accusé de réception impose « accusé de réception » lorsque l'IA n'a rien reconnu de plus fort. Jamais corrigés : une proposition d'embauche, un entretien reconnu (vers l'accusé de réception), une alerte emploi (vers le refus), un message envoyé par le candidat. |
| RG-14 | Clé normalisée d'un nom : minuscules, accents supprimés, tout caractère non alphanumérique remplacé par une espace, espaces multiples réduits, espaces de bord supprimées. |
| RG-18 | Niveaux d'études (v1.12) : **Bac**, **Bac+2** (BTS, DUT, BUT 2), **Bac+3** (licence, bachelor, BUT 3), **Bac+5** (master, diplôme d'ingénieur), **Doctorat**, **Autre**. Le niveau est celui le plus élevé atteint ; il est marqué « obtenu » ou « en cours ». Un profil qui n'en déclare aucun vaut « non précisé » et n'en fait rien figurer sur le CV. |
| RG-19 | Déduction d'une source (v1.13) : le domaine retenu pour une entreprise est celui de l'expéditeur des messages **reçus** rattachés à ses candidatures, le plus fréquent d'abord. Les domaines des plateformes connues (`platform_domains`), des fournisseurs de messagerie grand public, des **outils de recrutement** (Flatchr, Teamtailor, WeRecruit, Taleez…) et des **job boards** sont écartés : ils ne désignent pas l'entreprise, et une source posée sur eux relèverait les offres de tout le monde. Une proposition n'est **jamais** ajoutée d'office ; le candidat la confirme — une par une ou toutes ensemble (EF-VEI-26) — ou l'écarte. L'identifiant proposé pour un job board est une **hypothèse** déduite du nom de l'entreprise : une source ajoutée en lot peut donc échouer à sa première consultation, et le candidat la corrige alors depuis la liste. Rien n'est déduit du corps des messages, dont seuls 300 caractères sont conservés (ENF-RGP-01). |
| RG-20 | Adresse de contact d'un message (v1.22) : pour un message reçu, l'adresse de réponse (`Reply-To`) si elle existe, sinon l'expéditeur ; pour un message envoyé par le candidat, son premier destinataire. Une adresse qui n'accepte pas de réponse (« no-reply », « noreply », « ne-pas-repondre », « donotreply », « notification », « mailer-daemon »…) n'est pas une adresse de contact. La relance s'adresse au contact du message le plus récent de la candidature qui en porte un. |
| RG-16 | Date de candidature saisie par le candidat : à la création, la date de dernière activité et la date du statut initial valent la date de candidature. Quand la date de candidature est modifiée, la date de dernière activité prend la nouvelle date si aucune activité n'a eu lieu depuis la création, sinon la plus récente des deux. |

## 10. Cas d'utilisation principaux

| ID | Cas | Acteur principal | Scénario nominal (résumé) |
|---|---|---|---|
| UC-01 | Consulter l'état de sa recherche | Candidat | Ouvre le tableau de bord → consulte indicateurs et relances → ouvre une candidature → lit sa chronologie. |
| UC-02 | Synchroniser la messagerie | Planificateur | Récupère les nouveaux messages → pré-filtre → classe → rattache → met à jour statuts et libellés → journalise. |
| UC-03 | Surveiller une entreprise | Candidat | Ajoute une source → le planificateur la consulte → les nouvelles offres sont notées → récapitulatif e-mail si pertinent. |
| UC-04 | Postuler à une offre repérée | Candidat | Ouvre une offre → génère le CV adapté → télécharge le PDF → postule hors système → déclare avoir postulé. |
| UC-05 | Préparer une candidature externe | Candidat | Colle une annonce → génère CV et réponse de motivation → ajoute la candidature manuellement. |
| UC-06 | Restaurer la base | Candidat | Exécute le script de restauration → vérifie le contrôle post-restauration. |

## 11. Hypothèses

| ID | Hypothèse | Impact si fausse |
|---|---|---|
| H-01 | Le volume est inférieur à 5 000 candidatures et 50 000 offres sur la durée de vie du projet. | Revoir index et purge. |
| H-02 | Le poste du candidat dispose de Docker Desktop et de 4 Go de RAM libres. | Proposer une installation sans Docker. |
| H-03 | La majorité des entreprises ciblées publient leurs offres via un ATS supporté. | Renforcer l'adaptateur générique. |
| H-04 | Le projet Google Cloud reste en mode « test » (usage personnel). | L'autorisation Gmail expire tous les 7 jours : reconnexion manuelle. |
| H-05 | Le volume de données tient dans l'offre gratuite de Neon (0,5 Go de stockage). | Passer à une offre payante ou purger les offres anciennes. |
| H-06 | Le poste du candidat dispose d'une connexion internet lors de l'utilisation. | Sans connexion, l'application est inutilisable (base distante). |

## 12. Questions ouvertes (à trancher par le Business Owner)

| ID | Question | Proposition par défaut |
|---|---|---|
| Q-01 | Faut-il une photo réelle sur le CV généré, ou garder l'emplacement « Photo » ? | Emplacement conservé, photo ajoutée à la main. |
| Q-02 | La ligne « Compétences data » du profil doit être complétée avec les compétences techniques réelles. | Bloquant pour les CV data uniquement. |
| Q-03 | Le RPO de 24 h convient-il, ou faut-il s'appuyer sur la restauration à un instant donné de Neon (fenêtre limitée selon l'offre) ? | 24 h par sauvegarde logique quotidienne sur le poste ; restauration Neon en complément. |
| Q-04 | Le récapitulatif des offres doit-il être envoyé à chaque passage ou une fois par jour ? | À chaque passage produisant au moins une offre pertinente. |
| Q-05 | La recherche par sous-chaîne d'EF-CAN-03 (« mcdo ») impose un parcours complet de `applications`, interdit par ENF-PERF-04. Laquelle des deux assouplir ? (bloque T-102) | Aucune depuis v1.1 : index trigramme PostgreSQL (`pg_trgm`) sur les clés normalisées, compatible avec la recherche par sous-chaîne. |
| Q-06 | EF-TDB-02 (« ayant atteint Entretien ») et EF-TDB-04 (entretiens et refus par semaine) supposent de connaître les statuts passés et leur date, que le modèle actuel ne conserve pas. Faut-il un historique des statuts ? (bloque T-101, impact schéma) | Oui : table `application_status_history` (candidature, statut, date, origine), alimentée à chaque changement. |
| Q-07 | Le changement manuel de statut (EF-CAN-07) est-il soumis à RG-04 ? Une Proposition reçue après un Refus doit-elle remplacer le Refus (lecture littérale de RG-04) ? (bloque T-101) | Manuel : tout statut accepté. Automatique : RG-04 tel quel. |
| Q-08 | Les messages écartés par RG-10 ou classés « hors sujet » ne sont pas conservés : après une synchronisation interrompue (ENF-FIA-03), ils seraient reclassés par l'IA. Faut-il mémoriser les identifiants traités ? (bloque T-302) | Oui : table des identifiants Gmail traités (sans contenu), compatible ENF-RGP-01. |
| Q-09 | Quelle est la liste initiale des mots-clés d'emploi et des plateformes connues (RG-10), et où est-elle paramétrée ? (bloque T-302) | Liste initiale dans `settings`, modifiable dans Réglages. |
| Q-10 | RG-09 ne chiffre pas la baisse de score par critère non satisfait. Faut-il une grille (points par critère) ou laisser l'IA noter librement dans 0–100 ? (bloque T-404) | Grille indicative donnée à l'IA dans le prompt ; seul l'intervalle 0–100 est testé. |
| Q-11 | En mode test Google (H-04), l'autorisation expire tous les 7 jours. Comment le candidat est-il prévenu ? (bloque T-305) | Échec `invalid_grant` : connexion marquée expirée, bandeau « Reconnecter Gmail » dans l'interface. |
| Q-12 | Pour un CV adapté à une offre saisie à la main (EF-CVX-05), faut-il conserver l'entreprise, l'intitulé et le texte de l'offre ? (bloque T-504) | Conserver entreprise et intitulé dans `cv_versions` ; pas le texte. |
| Q-13 | Quelle offre Neon retenir (gratuite ou payante) ? Elle fixe la fenêtre de restauration à un instant donné et la mise en veille de la base. | Offre gratuite ; la sauvegarde quotidienne sur le poste couvre ENF-FIA-04 à 08. |
| Q-14 | Quelle région Neon ? (ENF-RGP-03 exige l'Union européenne) | Francfort (`aws-eu-central-1`). |
| Q-16 | Le profil de référence (CV, cibles) devient propre à chaque utilisateur : faut-il le stocker en base plutôt que dans `backend/data/profile.json` ? (bloque T-501) | Oui : en base, par utilisateur, validé par le même schéma. |
| Q-15 | Pour l'alternance, faut-il suivre des informations propres (école, rythme, date de début) ? | Non en v1.1 : le rythme figure dans le profil (disponibilités), repris dans le CV. |
| Q-17 | Les indicateurs EF-TDB-01, 05, 06 et 09 portent sur toutes les candidatures de l'utilisateur, donc sur toute la table `applications` (application mono-utilisateur) : le planificateur choisit le `Seq Scan`, interdit par ENF-PERF-04 ; un index couvrant ne change pas son choix. Que faire ? (bloque T-601) | Tranchée le 22/09/2026 : ENF-PERF-04 limitée aux requêtes sélectives ; indicateurs bornés à 50 ms par requête (ENF-PERF-05). |
| Q-18 | ~~Où héberger l'API et l'interface ?~~ **Tranchée le 24/09/2026 (BES-39)** : interface sur Vercel, API sur Northflank (région de l'Union européenne), base sur Neon ; l'interface relaie `/api` vers l'API, ce qui garde une seule origine (cookie `SameSite=Strict`, garde d'origine, retour OAuth inchangés). | Voir ADR-15 et `docs/DEPLOIEMENT.md`. |

## 13. Traçabilité besoins → exigences

| Besoin | Exigences métier | Exigences système |
|---|---|---|
| BES-01 | EXM-01 | EF-GML-01 à 12, EF-CAN-06, 07, 09, 11, EF-VEI-19, 20 |
| BES-02 | EXM-01, EXM-02 | EF-GML-11, EF-CAN-01 à 05, 08, 10 |
| BES-03 | EXM-03 | EF-GML-13 à 17 |
| BES-04 | EXM-04 | EF-CAN-12, EF-TDB-07 |
| BES-05 | EXM-05, EXM-06 | EF-VEI-01 à 18, ENF-COL-01 à 04 |
| BES-06 | EXM-07 | EF-CVX-01, 02, 04 à 11 |
| BES-24 | EXM-07 | EF-CVX-18, 19, 20, RG-18 |
| BES-07 | EXM-08 | EF-CVX-12, 13 |
| BES-08 | EXM-09 | EF-TDB-01 à 08 |
| BES-09 | EXM-10 | EF-IA-01 à 06, EF-CFG-02, 03, ENF-COU-01 |
| BES-10 | — (choix de solution, C-02, C-05) | ENF-SEC-01, ENF-SEC-15, ENF-SEC-17, ENF-RGP-03, ENF-PERF-04 |
| BES-11 | — (choix de solution, C-09) | ENF-SEC-05, ENF-SEC-16 |
| BES-13 | EXM-07, EXM-12 | EF-CVX-14 à 17, RG-12, RG-15 |
| BES-14 | EXM-13 | EF-AUT-01 à 08, ENF-SEC-18 à 20, ENF-RGP-02 |
| EF-AUT-09 | Un visiteur sans session qui ouvre l'adresse racine doit voir une page de présentation du service — suivi des candidatures depuis Gmail, classement des réponses, relances préparées, tableau de bord, données conservées — donnant accès à la connexion et à la création de compte ; avec une session, la même adresse ouvre le tableau de bord. (v1.24, BES-36) | S | EXM-13 | T | Sans session, `/` présente le service et ses deux accès ; avec session, `/` affiche le tableau de bord ; la page de présentation ne demande aucune donnée d'utilisateur à l'API. |
| EF-AUT-10 | L'accès « Créer un compte » de la page de présentation doit ouvrir le formulaire directement sur la création de compte. (v1.24) | C | EXM-13 | T | `/connexion?mode=inscription` ouvre l'onglet « Créer un compte ». |
| EF-AUT-13 | L'interface doit connaître l'état de session d'un visiteur sans produire d'erreur : une route publique répond toujours 200, avec le compte de la session ou rien. (v1.28, BES-41) | S | EXM-13 | T | `GET /api/auth/session` : 200 `{ account }` avec une session valide, 200 `{ account: null }` sans cookie, avec un cookie inconnu ou expiré. |
| BES-15 | EXM-14 | EF-DOC-01, 02 |
| BES-16 | EXM-01 | EF-GML-01 |
| BES-12 | EXM-11 | EF-GML-19, EF-CAN-13, 14, EF-VEI-20 à 22, EF-TDB-09, RG-09, RG-10 |
| BES-17 | EXM-09 | ENF-PERF-04, ENF-PERF-05 |
| BES-18 | EXM-02, EXM-04 | EF-CAN-15, EF-CAN-16, RG-16 |
| BES-19 | EXM-01 | EF-GML-05, EF-CFG-04, ENF-FIA-09 |
| BES-20 | EXM-10 | RG-13, EF-IA-01, EF-IA-05, ENF-COU-01 |
| BES-21 | EXM-01 | RG-17, EF-GML-08, EF-GML-11, EF-CAN-11 |
| BES-22 | EXM-01 | RG-17 |
| BES-23 | EXM-15 | EF-EXE-01 à 05, ENF-PERF-06 |
| BES-25 | EXM-05 | EF-VEI-23, 24, 25, RG-19 |
| BES-26 | EXM-05 | EF-VEI-26 |
| BES-27 | EXM-05 | EF-VEI-27 |
| BES-28 | EXM-05, EXM-10 | EF-VEI-28, ENF-COU-01 |
| BES-29 | — (organisation de la mise en production) | ENF-MAI-07, EF-TDB-08 |
| ENF-MAI-08 | Chaque pull request vers `dev` ou `main` et chaque poussée sur ces branches doivent exécuter automatiquement le contrôle de types, le lint, les tests unitaires, les tests d'intégration sur un PostgreSQL jetable (seuil de couverture ENF-MAI-01), l'audit des dépendances et la construction de l'image de l'API ; seul un code qui passe ces vérifications est déployé. (v1.27, BES-40) | I |
| BES-30 | EXM-01 | EF-GML-08, RG-17, ENF-RGP-01 |
| BES-31 | EXM-01 | EF-GML-20, RG-17, RG-04 |
| BES-32 | EXM-01, EXM-02 | RG-03, EF-GML-09, EF-GML-11 |
| BES-33 | EXM-09 | EF-TDB-04, EF-TDB-10, EF-TDB-11 |
| BES-34 | EXM-04 | RG-06, RG-20, EF-CAN-17, EF-TDB-07, RG-13 |
| BES-38 | EXM-13 | EF-AUT-11, EF-AUT-12, EF-LEG-01, EF-LEG-02, ENF-RGP-04, ENF-RGP-05 |
| BES-39 | — (choix de réalisation, C-05) | ENF-SEC-01, ENF-SEC-21 |
| BES-40 | — (organisation) | ENF-MAI-08, ENF-MAI-01, ENF-MAI-02, ENF-SEC-10 |
| BES-41 | EXM-13 | EF-AUT-13, EF-SEO-01, ENF-PERF-07 |
| BES-35 | EXM-01 | EF-CFG-05, EF-CFG-02 (retirée de l'écran) |

La traçabilité fine exigence → tâche → test est tenue à jour dans `docs/TRACABILITE.md`.
