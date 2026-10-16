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
| 1.29 | 25/09/2026 | Sahiré YAPI (Business Owner) | À valider — la file d'exécution borne aussi le nombre de traitements longs menés en même temps sur tout le serveur, pour ne jamais dépasser les ressources de l'hébergement (BES-42, EF-EXE-06) |
| 1.30 | 26/09/2026 | Sahiré YAPI (Business Owner) | À valider — Atelier CV refondu : le candidat importe son CV au format PDF et colle une offre ; le système calcule un score de compatibilité et des sous-scores expliqués, produit un CV adapté fidèle, liste les compétences manquantes et fournit un Word lisible par les ATS, sans rien conserver. Diagnostic confié au fournisseur IA déjà utilisé (option b du 26/09/2026 : pas de SharpAPI). Remplace la génération depuis le profil et le modèle Word (BES-43, EXM-16, EF-CVX-21 à 33, RG-21 à 23, ENF-RGP-06 à 08, ENF-SEC-22, ENF-PERF-08) |
| 1.31 | 30/09/2026 | Sahiré YAPI (Business Owner) | À valider — CV adapté tenant sur une page A4, compétences cochées comprises, rejeté et redemandé sinon ; aperçu en page A4 ; Atelier CV allégé : texte d'aide borné, résultat essentiel visible sans défiler, explications, modifications et texte lu repliés (BES-44, RG-24, EF-CVX-36 à 38, ENF-UTI-05 à 07 ; EF-CVX-24 et 29 précisées) |
| 1.32 | 30/09/2026 | Sahiré YAPI (Business Owner) | À valider — retours de la première testeuse : rattachement par conversation Gmail et clés d'intitulé et d'entreprise tolérantes, fusion de deux candidatures ; statut « Test technique » ; relance jamais adressée à une plateforme ; lien vers l'offre ; tri au choix et filtre par période de candidature ; entreprise et intitulé modifiables ; couleurs des statuts ; import d'un tableau CSV (BES-45, RG-25, RG-26, EF-CAN-18 à 24 ; RG-01 à 05, RG-07, RG-20, EF-CAN-01 modifiées) |
| 1.33 | 01/10/2026 | Sahiré YAPI (Business Owner) | À valider — veille élargie et gratuite : critères de recherche du candidat ; sources officielles France Travail et La bonne alternance, SIREN par l'API Recherche d'entreprises ; logiciels de recrutement Cegid Talentsoft, Teamtailor, Personio, Workable et Ashby ; recherche des pages carrières des entreprises des candidatures ; consultation espacée des sources inchangées ; coordonnées des recruteurs jamais conservées, offres purgées après 60 jours. Services payants écartés, rendu JavaScript reporté (BES-46, EF-VEI-29 à 42, RG-27, ENF-COL-05, ENF-SEC-23, ENF-RGP-09 à 11 ; EF-VEI-08, RG-08, RG-09, RG-19, ENF-RGP-05 modifiées) |

| 1.34 | 01/10/2026 | Sahiré YAPI (Business Owner) | À valider — tableau de bord réordonné (suivi hebdomadaire avant la liste à relancer) et liste à relancer dépliée à la demande ; relance rédigée sur un ton personnel et motivé, appuyée sur la description de l'offre enregistrée (BES-47, EF-TDB-12, EF-TDB-07 et EF-CAN-17 modifiées) |
| 1.35 | 02/10/2026 | Sahiré YAPI (Business Owner) | À valider — veille automatique par utilisateur : CV types, profil déduit et validé, offres choisies par niveau, trois passages par jour avec fenêtre depuis la dernière consultation réussie et reprise sans perte, exécution par un modèle d'IA local hébergé par l'exploitant avec secours vers les autres fournisseurs (BES-48, EXM-17, EF-VEI-43 à 55, EF-CVX-39 à 44, EF-IA-07 à 15, EF-EXE-07 et 08, EF-CFG-06 à 09, RG-28 à 31, ENF-COU-02, ENF-FIA-11, ENF-RGP-12 à 14, ENF-SEC-24 et 25, ENF-PERF-09, ENF-COL-06, ENF-MAI-09 ; EF-VEI-06, 10, 31 et 42, EF-IA-02 et 05, EF-CFG-05, RG-09, RG-13, C-03, ENF-RGP-02, 05, 06, 08 et ENF-MAI-07 modifiées) ; Q-22 à Q-26 |
| 1.37 | 13/10/2026 | Sahiré YAPI (Business Owner) | À valider — refus formulé « nous n'y donnerons pas suite » classé en alerte d'emploi : formes élidées reconnues, et une alerte qui remercie pour la candidature et la refuse est classée refusée (BES-50, RG-17 précisée) |
| 1.38 | 14/10/2026 | Sahiré YAPI (Business Owner) | À valider — Atelier CV : un CV adapté fidèle n'est plus refusé pour une ligature ou un caractère invisible du PDF, et une compétence absente du CV est retirée au lieu de faire échouer l'adaptation (BES-51, RG-21 précisée) |
| 1.40 | 16/10/2026 | Sahiré YAPI (Business Owner) | À valider — refus non reconnus : formules « notre choix s'est orienté vers… », tutoiement des accusés de réception et des refus (BES-53, RG-17 précisée) |

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
| Catégorie de message | Nature d'un message : candidature envoyée, accusé de réception, test technique (v1.32), entretien, proposition, refus, alerte emploi, hors sujet. |
| Statut | État d'avancement d'une candidature (voir RG-01). |
| Source surveillée | Page ou service listant les offres d'une entreprise. |
| ATS | *Applicant Tracking System* : logiciel de recrutement publiant les offres d'une entreprise (Greenhouse, Lever, Workday…). |
| Offre | Annonce d'emploi détectée sur une source surveillée. |
| Score de pertinence | Entier de 0 à 100 exprimant l'adéquation d'une offre au profil. |
| Profil de référence | Données factuelles du candidat (identité, expériences, formations, compétences) servant de source unique aux CV. |
| Cible | Type de poste recherché, défini par un libellé, une liste de mots-clés et les types de contrat acceptés. |
| Type de contrat | Nature du contrat d'une offre ou d'une candidature : **CDI**, **CDD**, **alternance** (apprentissage ou professionnalisation), **job étudiant** (temps partiel compatible avec les études, quel que soit le contrat juridique), **autre** (stage, intérim, freelance…) ou **non précisé**. |
| Fournisseur IA | Service de modèle de langage : Claude (Anthropic), Gemini (Google), Groq, ou le modèle local hébergé par l'exploitant (v1.35). |
| Tâche IA | Traitement confié à un fournisseur IA (classer, noter, extraire, rédiger). |
| CV type (v1.35) | CV importé par l'utilisateur pour représenter un type de poste visé, de 1 à 4. Jamais conservé : seul le profil déduit et validé l'est (ENF-RGP-14). |
| Profil déduit (v1.35) | Années d'expérience, niveau et cibles que le système déduit des CV types ; il ne sert qu'après validation de l'utilisateur (EF-VEI-46). |
| Offre type déduite (v1.35) | Cible (intitulé, mots-clés, types de contrat, niveau) que le système propose à partir des CV types ; validée, elle devient un critère de recherche (EF-VEI-29). |
| Offre choisie (v1.35) | Offre que l'utilisateur entre lui-même pour un niveau, de 1 à 3 par niveau ; seuls ses traits sont conservés (ENF-RGP-14). |
| Niveau (v1.35) | Junior, confirmé ou senior, déduit des années d'expérience (RG-28). |
| Passage, créneau (v1.35) | Exécution de la veille d'un utilisateur à l'un des trois créneaux : matin 7 h, midi 13 h, soir 19 h, heure de Paris. |
| Fenêtre (v1.35) | Période couverte par la consultation d'une source : depuis le début de sa dernière consultation réussie (RG-30). |
| Fournisseur local (v1.35) | Modèle d'IA installé sur le serveur personnel (homelab) de l'exploitant ; gratuit ; partagé par les utilisateurs ; essayé en premier pour les tâches de fond (RG-13). |

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
| BES-42 | « En production, je ne dois pas avoir ce genre d'erreur ; je t'ai dit d'utiliser un système de queue pour la synchronisation, ça peut prendre du temps, pour éviter de surcharger le tout. » (25/09/2026, après un arrêt de l'API par manque de mémoire sur l'hébergement) |
| BES-43 | « Atelier CV – Adaptation à une offre. L'utilisateur importe son CV (PDF ou DOCX, 5 Mo maximum), puis colle le texte complet d'une offre d'emploi. Tracandi vérifie que le fichier est lisible et l'envoie à l'API SharpAPI, qui calcule un score de compatibilité global et des sous-scores (compétences, expérience, formation, stack technique…) avec une explication en français pour chacun. Ce diagnostic, le CV et l'offre sont ensuite transmis à un modèle d'IA via Groq, qui rédige une version du CV adaptée à l'offre. L'IA a le droit de reformuler, de réorganiser et de reprendre le vocabulaire de l'offre, mais elle ne doit jamais inventer une expérience, un diplôme, un chiffre ou une compétence. Les compétences demandées par l'offre mais absentes du CV sont listées à part, et l'utilisateur peut cocher celles qu'il possède vraiment pour les ajouter. L'écran final affiche le score, les points faibles, le détail des modifications (avant/après avec la raison) et le CV corrigé. Ce CV est téléchargeable dans un format lisible par les ATS : une seule colonne, des titres de sections standards, sans tableaux ni images. Le CV n'est ni stocké ni conservé après l'analyse, pour respecter le RGPD. » (26/09/2026 ; précisé le même jour : option b, le diagnostic est calculé par le fournisseur IA déjà utilisé et non par SharpAPI, qui conserve les CV de 30 à 90 jours et coûte au moins 50 $ par mois ; précisé encore le 26/09/2026 : seul un CV au format PDF est traité, et un PDF scanné est lu par reconnaissance de caractères) |
| BES-44 | « Je trouve qu'il y a trop de texte là, je veux optimiser mon parcours ; aussi il faudrait s'assurer que ça tienne sur une seule page A4 et tout. » (30/09/2026) |
| BES-45 | Retours d'une testeuse en production (30/09/2026) : « Parfois ça me met deux offres différentes alors que c'est la même » ; « Y'en a ça me met que je suis en entretien alors que non c'est juste un test technique » ; « Je peux pas afficher dans l'ordre que je veux au moment où je veux (ça serait bien un système de filtrage) » ; « Rajoute un champ dans la création d'une candidature pour le lien vers la candidature » ; « Trouve-moi un moyen de connecter mon tableau Google Sheet à ton site » ; codes couleur : « rouge foncé pour pas de réponse, rouge si l'offre n'a pas été acceptée, jaune si j'ai pas postulé et je veux le faire, orange le processus est en cours, vert si c'est validé » ; « l'adresse mail du destinataire n'est pas toujours la bonne ». Business Owner : « on doit pouvoir filtrer par date aussi et test technique ». |
| BES-46 | « Commence par éliminer tout ce qui est payant, on va s'attaquer à tout ce qui est gratuit, déjà avec les API officielles : tout ce qui est gratuit, tu mets l'infrastructure en place […] Pour les sites carrière, j'aime bien la façon d'utiliser les logiciels de recrutement, vu que tu arrives à retrouver les sites carrière à partir des noms des entreprises ; optimise la recherche aussi sur leurs différentes offres qui seront postées là, et active un scraping intelligent […] Tout ce qui est sites JavaScript, pour l'instant ce n'est pas la priorité. » (01/10/2026, après l'étude des sources du 30/09/2026 ; objectif rappelé : « récupérer des offres fraîches, optimisées pour mon CV et qui correspondent à mes attentes », dans le respect du RGPD) |
| BES-47 | « Je ne veux pas que sur le tableau de bord les relances soient en haut : il faut que le graphique soit avant les relances, et optimise le tout. […] Les mails rédigés par l'IA sont plutôt impersonnels : booste le prompt système des différentes IA pour que le mail soit plus personnel, du genre donner l'impression au recruteur que ça nous touche de travailler pour eux. » (01/10/2026) |
| BES-35 | « On va retaper la section Réglages en gardant que ce qui est utile à savoir pour l'utilisateur : déjà retire-moi le fournisseur d'IA, et optimise la section boîte mail en suivant les principes ux-design et ui-design. » (24/09/2026) |
| BES-23 | « Applique un système de queue pour mes traitements trop longs et même des websockets, avec une architecture asynchrone. » (23/09/2026) |
| BES-48 | « Au niveau de l'offre, ajouter le moyen de rajouter des CV types : on demande à l'utilisateur de mettre quatre ou trois de ces CV types en fonction de sa recherche, et le système doit pouvoir déterminer son nombre d'années d'expérience, ce qu'il recherche, et les offres types qui sont en rapport avec ce qu'il veut. Ensuite on lui demande qu'il entre trois offres qu'il veut, en fonction du type (senior, junior et autres), dans la configuration / les paramètres. Les offres doivent se lancer de façon automatique, chaque jour trois fois : une fois le matin pour récupérer toutes les offres du matin, une fois le midi pour récupérer toutes les offres entre-temps, et une fois le soir pour récupérer toutes les offres entre ces deux plages. Elle doit être opérée pour chaque utilisateur, en passant par le modèle d'IA local installé sur mon serveur (homelab), qui sera chargé d'agir comme un agent. Avec toutes les configurations, mais au niveau de Tracandi, ça doit être configuré par l'utilisateur. » (02/10/2026) |
| BES-50 | « En continuant, fix ce bug de classement. » (13/10/2026, capture à l'appui : refus « Merci pour votre candidature […] nous n'y donnerons pas suite » étiqueté « Alertes emploi » au lieu de « Statut/Refusée ») |
| BES-51 | « J'ai ce souci avec une de mes testeuses. » puis « Fix it. » (14/10/2026, capture à l'appui : message « On n'a pas réussi à adapter votre CV fidèlement et sur une page » sur une offre de développement de systèmes embarqués) |
| BES-53 | « J'ai ce genre de mail qui ne sont pas détectés sous le bon statut. » (16/10/2026, captures à l'appui : refus d'OVHcloud « notre choix s'est orienté vers des profils… » non reconnu, refus de Winside Technology tutoyé classé « Alertes emploi », confirmation Free-Work rattachée aussi à « Sopra Steria ») |

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
| EXM-16 | Le système doit mesurer l'adéquation d'un CV existant à une offre et en produire une version adaptée, fidèle et lisible par les logiciels de recrutement, sans conserver le CV. | BES-43 |
| EXM-08 | Le système doit proposer des réponses rédigées aux questions de formulaires de candidature. | BES-07 |
| EXM-09 | Le système doit fournir des indicateurs de suivi de la recherche d'emploi. | BES-08 |
| EXM-10 | Le système doit répartir les traitements automatisés entre deux fournisseurs IA, avec continuité de service si l'un est indisponible. | BES-09 |
| EXM-11 | Le système doit distinguer les offres et les candidatures selon le type de contrat recherché : CDI, CDD, alternance ou job étudiant. | BES-12 |
| EXM-17 | Le système doit relever, pour chaque utilisateur et en trois passages par jour, les offres publiées depuis le passage précédent qui correspondent à ce que l'utilisateur a validé à partir de ses CV et de ses offres choisies, en s'appuyant sur un modèle d'IA gratuit hébergé par l'exploitant. | BES-48 |
| EXM-18 | Le système doit vérifier l'adresse e-mail d'un compte à sa création et confirmer l'identité du candidat par un code à usage unique envoyé par e-mail à chaque connexion. | BES-49 |

## 5. Périmètre

### 5.1 Dans le périmètre
Suivi des candidatures depuis Gmail ; saisie manuelle de candidatures ; veille de sites carrières d'entreprises choisies
et des API publiques et gratuites d'offres d'emploi (France Travail, La bonne alternance — v1.33, BES-46) ;
notation des offres ; génération de CV (.docx, .pdf) ; rédaction de réponses de motivation ; tableau de bord ;
sauvegarde et restauration de la base ; veille automatique par utilisateur à partir de CV types, d'offres choisies et d'un modèle d'IA local (v1.35, BES-48).

### 5.2 Hors périmètre (exclusions explicites)
- Envoi automatique de candidatures au nom du candidat.
- Envoi automatique de relances : le système signale, le candidat relance lui-même.
- Agent autonome qui choisit lui-même ses sources, ses requêtes ou le nombre de ses étapes ; conservation des fichiers de CV (v1.35, BES-48, Q-22 et Q-26).
- Collecte sur LinkedIn, Indeed, Welcome to the Jungle ou toute plateforme dont les conditions interdisent l'automatisation.
- Messageries autres que Gmail.
- Partage de données entre utilisateurs, rôles d'administration,
  application mobile native. (Le multi-utilisateur avec comptes séparés est dans le périmètre depuis v1.2, BES-14 ;
  l'hébergement en ligne de l'interface et de l'API, depuis v1.26, BES-39.)
- Rendu des pages carrières exécutant du JavaScript côté client (navigateur automatisé). Reporté à une version ultérieure (v1.33, BES-46).
- Services payants de recherche, de collecte ou de rendu (API de moteurs de recherche, proxys, navigateurs distants) ;
  services qui contournent une protection anti-robots, quel que soit leur prix (v1.33, BES-46).

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
| EF-CAN-01 | Le système doit afficher les candidatures regroupées par entreprise, entreprises triées alphabétiquement (v1.32 : lorsque la liste est triée par entreprise, EF-CAN-20). | M | EXM-02 | D | — |
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
| EF-CAN-17 | Le candidat doit pouvoir, depuis une candidature à relancer, obtenir en un geste un brouillon de relance dans sa boîte Gmail : réponse dans le fil de la candidature, adressée à l'adresse de contact (RG-20), objet et texte rédigés (80 à 150 mots, rien d'affirmé qui ne figure dans la candidature). Le texte doit être **personnel** : il nomme l'entreprise et le poste, dit ce qui attire le candidat vers cette entreprise-là en s'appuyant sur la description de l'offre qu'il a enregistrée (EF-CAN-15) quand elle existe, et se termine par une disponibilité concrète ; ni formule toute faite, ni flatterie inventée, ni fait absent de la candidature. Le brouillon s'ouvre dans Gmail ; le système ne l'envoie jamais. (v1.22, BES-34 ; ton personnel v1.34, BES-47) | S | EXM-04 | T | Candidature à relancer : un brouillon est créé dans le fil, adressé au contact, et Gmail s'ouvre dessus ; aucun message n'est envoyé ; sans adresse de contact : 409 ; aucun fournisseur d'IA : 502 ; le prompt porte l'entreprise, le poste et la description de l'offre quand elle est enregistrée, et interdit d'inventer un motif d'intérêt. |
| EF-CAN-18 | Le candidat peut fusionner deux candidatures de la même entreprise : leurs messages sont réunis, le statut retenu suit RG-04, les notes sont mises bout à bout et la date de candidature est la plus ancienne. (v1.32) | S | EXM-02 | T | Deux candidatures fusionnées : une seule reste, avec tous les messages dans sa chronologie. |
| EF-CAN-19 | Le candidat peut renseigner et modifier le lien de l'offre ou de la candidature (adresse http ou https, 1 000 caractères au plus), ouvert dans un nouvel onglet. (v1.32) | M | EXM-02 | T | Lien saisi à la création : enregistré et cliquable dans le détail ; `javascript:alert(1)` : refusé (400). |
| EF-CAN-20 | Le candidat peut trier les candidatures par dernière activité, date de candidature, statut ou entreprise, dans l'ordre croissant ou décroissant ; par défaut, la date de candidature, la plus récente d'abord (Business Owner, 30/09/2026) ; le tri choisi est gardé pendant la session. (v1.32) | S | EXM-02 | T | Tri par date de candidature décroissante : la plus récente en tête ; avec le jeu de charge d'ENF-PERF-01, chaque tri de la liste complète répond en moins de 200 ms (la liste complète n'est pas une requête sélective au sens d'ENF-PERF-04). |
| EF-CAN-21 | Le candidat peut modifier l'entreprise et l'intitulé d'une candidature ; si une autre candidature porte déjà la même entreprise et le même intitulé (RG-25, RG-26), la modification est refusée et la fusion proposée (EF-CAN-18). (v1.32) | S | EXM-02 | T | Renommage vers une candidature existante : 409 et proposition de fusion. |
| EF-CAN-22 | Le système doit afficher chaque statut avec son libellé et une couleur : À postuler jaune ; Envoyée, Accusé reçu, Test technique et Entretien orange (« en cours ») ; Proposition vert ; Refusée rouge ; le repère « À relancer » (RG-06) rouge foncé (« sans réponse »). (v1.32) | C | EXM-02 | I | Libellé toujours présent ; contraste du texte sur son fond ≥ 4,5:1 (WCAG 1.4.3). |
| EF-CAN-23 | Le candidat peut importer des candidatures depuis un fichier CSV (1 Mo et 1 000 lignes au plus), en associant chaque colonne à un champ (entreprise, intitulé, lien, date de candidature, statut, notes) après un aperçu des premières lignes ; une ligne qui désigne une candidature existante (RG-03 (a) et (b)) est ignorée. (v1.32) | S | EXM-01 | T | Tableau fictif de 20 lignes exporté de Google Sheets : 20 candidatures ; le même fichier importé de nouveau : aucune de plus. |
| EF-CAN-24 | Le candidat peut filtrer les candidatures par période de candidature (du … au …, bornes incluses, jours de Paris), en plus des autres filtres. (v1.32) | S | EXM-02 | T | Période du 1er au 15 septembre : seules les candidatures de ces jours ; plan `EXPLAIN` sans parcours séquentiel complet. |

### 6.3 Veille des offres (VEI)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-VEI-01 | Le candidat peut ajouter une source surveillée en indiquant nom d'entreprise, type de source et identifiant. | M | EXM-05 | T | Réponse 201. |
| EF-VEI-02 | Le système doit rejeter un identifiant non conforme à RG-08 pour le type de source choisi. | M | ENF-SEC-04 | T | Identifiant `../../etc` pour Greenhouse : réponse 400. |
| EF-VEI-03 | Le système doit rejeter l'ajout d'une source déjà surveillée. | S | EXM-05 | T | Réponse 409. |
| EF-VEI-04 | Le candidat peut suspendre puis réactiver une source. | S | EXM-05 | T | Source suspendue : non consultée au passage suivant. |
| EF-VEI-05 | Le candidat peut retirer une source surveillée. | S | EXM-05 | T | Offres de la source supprimées en cascade. |
| EF-VEI-06 | Le système doit consulter, pour chaque utilisateur qui a activé sa veille automatique (EF-CFG-07), les sources actives dues (EF-VEI-42) à 7 h, 13 h et 19 h, heure de Paris, et enregistrer chacun de ces trois passages (EF-VEI-51). (v1.35) | M | EXM-05 | T | Expression cron par défaut vérifiée ; trois passages enregistrés par jour pour un utilisateur actif. |
| EF-VEI-07 | Le candidat peut déclencher une consultation immédiate de toutes les sources actives. | M | EXM-05 | T | Réponse avec nombre de sources, nouvelles offres, offres pertinentes. |
| EF-VEI-08 | Le système doit prendre en charge les types de source Greenhouse, Lever, SmartRecruiters, Recruitee, Workday, Cegid Talentsoft, Teamtailor, Personio, Workable, Ashby (v1.33), France Travail et La bonne alternance (v1.33, EF-VEI-32 et 34) et page carrières générique. | M | EXM-05 | T | Un test par type sur réponse enregistrée (fixture). |
| EF-VEI-09 | Le système doit enregistrer une offre uniquement si elle est absente de la base pour sa source. | M | EXM-05 | T | Deux consultations identiques : zéro nouvelle offre à la seconde. |
| EF-VEI-10 | Le système doit enregistrer la date de dernière consultation de chaque source et le début de sa dernière consultation **réussie** (RG-30). (v1.35) | S | ENF-FIA-02 | T | — |
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
| EF-VEI-29 | Le candidat peut enregistrer ses critères de recherche : 1 à 5 cibles (intitulé, 1 à 15 mots-clés, types de contrat acceptés), une commune, un rayon de 5 à 100 km, l'acceptation du télétravail et jusqu'à 10 codes ROME. (v1.33) | M | EXM-05, EXM-06 | T | Critères valides : 200 et relus à l'identique. Rayon de 150 km ou code ROME « 1405 » : 400. |
| EF-VEI-30 | Le système doit retrouver la commune saisie — code INSEE, département, coordonnées du centre — auprès du service public du découpage administratif, en ne lui transmettant que le texte saisi. (v1.33) | S | EXM-05 | T | « Nanterre » : proposée avec le code 92050 et le département 92 (service simulé). |
| EF-VEI-31 | Le système doit noter les offres (RG-09, RG-10) selon les critères de recherche du candidat, qu'il les ait saisis (EF-VEI-29) ou validés à partir de ses CV types (EF-VEI-46) ; sans critères, la veille refuse, avec un message qui le dit. (v1.33 ; v1.35 : le profil de référence n'est plus un secours, il disparaît avec T-515) | M | EXM-06, EXM-17 | T | Critères enregistrés : le prompt de notation porte leurs cibles, leur commune et le niveau (RG-28) ; sans critères : refus. |
| EF-VEI-32 | Le candidat peut activer une source « France Travail » unique, interrogée à chaque consultation selon ses critères : mots-clés de chaque cible, codes ROME, commune et rayon, types de contrat acceptés, offres publiées depuis la consultation précédente (31 jours au plus). (v1.33) | M | EXM-05 | T | API simulée : requête portant ces paramètres ; offres enregistrées avec le nom de l'employeur, l'intitulé, le lieu, le contrat et le lien vers l'offre sur francetravail.fr. |
| EF-VEI-33 | Le système doit écarter des offres France Travail celles relayées par un partenaire dont la collecte est exclue (§5.2 : LinkedIn, Indeed, Welcome to the Jungle). (v1.33) | M | EXM-05 | T | Offre dont le partenaire d'origine est « Indeed » : non enregistrée. |
| EF-VEI-34 | Le candidat peut activer une source « La bonne alternance » unique, interrogée selon la commune, le rayon et les codes ROME de ses critères, lorsqu'une de ses cibles accepte l'alternance. (v1.33) | S | EXM-05, EXM-11 | T | API simulée : offres enregistrées au type « alternance » ; sans cible acceptant l'alternance, la source est refusée (400). |
| EF-VEI-35 | Le système doit signaler sur une offre que son employeur est une entreprise des candidatures du candidat — même SIREN quand la source et l'entreprise en portent un, sinon même clé d'entreprise (RG-26). (v1.33) | S | EXM-05 | T | Offre France Travail de « CAPGEMINI » alors qu'une candidature vise « Capgemini » : signalée. |
| EF-VEI-36 | Le système peut retrouver le SIREN d'une entreprise des candidatures auprès de l'API Recherche d'entreprises, sans en demander les dirigeants, et ne le retient que lorsqu'un seul résultat actif porte la même clé d'entreprise (RG-26). (v1.33) | C | EXM-05 | T | Deux homonymes actifs : aucun SIREN retenu. |
| EF-VEI-37 | Le système doit refuser de consulter une source officielle dont les identifiants d'accès ne sont pas configurés sur le serveur, avec un message qui le dit, sans affecter les autres sources (ENF-FIA-02). (v1.33) | M | EXM-05 | T | Identifiants France Travail absents : erreur « identifiants non configurés » sur cette source, les autres consultées. |
| EF-VEI-38 | Le candidat peut lancer la recherche des pages carrières des entreprises proposées (EF-VEI-23) : pour chacune, le système lit l'accueil du site (domaine de RG-19) et, au besoin, la page carrières qu'il désigne (un seul rebond, EF-VEI-27), reconnaît le logiciel de recrutement à ses liens, cadres et scripts (RG-27) et en déduit le type et l'identifiant de la source. (v1.33) | S | EXM-05 | T | Accueil liant `https://jobs.ashbyhq.com/acme` : proposition Ashby « acme ». Accueil sans logiciel reconnu mais liant « Carrières » : proposition « page carrières » sur cette page. |
| EF-VEI-39 | Le système doit vérifier chaque source détectée en la consultant une fois, et présenter la proposition « vérifiée » avec son nombre d'offres, ou « à confirmer » lorsque la source n'a rien pu rendre. (v1.33) | S | EXM-05 | T | Board Ashby simulé à 4 offres : proposition vérifiée, 4 offres. Board en 404 : à confirmer. |
| EF-VEI-40 | La recherche des pages carrières doit s'exécuter dans la file d'exécution (EF-EXE-01), n'ajouter aucune source d'office (RG-19) et respecter les règles de collecte (ENF-COL-01 à 04). (v1.33) | M | EXM-05 | T | Réponse 202 avec l'identifiant de l'exécution ; aucune source créée à la fin. |
| EF-VEI-41 | Le système doit reconnaître qu'une source n'a pas changé par l'empreinte de sa liste d'offres (identifiants triés), et non par la page entière. (v1.33) | S | EXM-05 | T | Deux consultations aux mêmes offres dans un ordre différent : empreinte identique. |
| EF-VEI-42 | Le système doit espacer la consultation planifiée d'une source restée identique : après n consultations identiques consécutives, la suivante n'a lieu qu'après 8 h × 2^(n-1), 72 h au plus ; une offre nouvelle ramène la source au rythme d'EF-VEI-06. La consultation demandée par le candidat (EF-VEI-07) lit toujours toutes les sources actives. (v1.33) (v1.35 : un passage planifié lit les sources dues ; il est enregistré même s'il n'en lit aucune.) | S | EXM-05 | T | Source identique 3 fois : écartée de la passe planifiée suivante ; consultée par « Consulter maintenant ». |
| EF-VEI-43 | Le système doit déduire d'un CV type le nombre d'années d'expérience professionnelle, entier de 0 à 50, par un calcul sur les périodes des expériences lues (RG-29) ; le modèle d'IA ne fournit jamais ce nombre. (v1.35) | M | EXM-17 | T | CV fictif de deux expériences, 09/2022–08/2024 et 09/2024–06/2025 : 34 mois, soit 3 ans ; deux périodes qui se chevauchent comptées une fois. |
| EF-VEI-44 | Le système doit déduire du profil le niveau de l'utilisateur — junior, confirmé ou senior — selon les seuils de RG-28. (v1.35) | M | EXM-17 | T | 2 ans : junior ; 3 et 7 ans : confirmé ; 8 ans : senior. |
| EF-VEI-45 | Le système doit proposer à l'utilisateur de 1 à 5 offres types déduites de ses CV types, chacune avec un intitulé, de 1 à 15 mots-clés, des types de contrat et un niveau, au format des cibles d'EF-VEI-29. (v1.35) | M | EXM-17 | T | Deux CV fictifs de profils différents : au moins deux offres types proposées, toutes conformes au schéma des cibles ; réponse hors schéma rejetée (EF-IA-03). |
| EF-VEI-46 | Le système ne doit tenir compte du profil déduit et des offres types déduites qu'après la validation explicite de l'utilisateur. (v1.35) | M | EXM-17 | T | Avant validation : la notation et les requêtes aux sources officielles n'utilisent que les critères enregistrés (EF-VEI-29) ; après : elles utilisent les critères validés. |
| EF-VEI-47 | L'utilisateur peut corriger les années d'expérience, le niveau et les offres types déduites avant de les valider. (v1.35) | S | EXM-17 | T | Années corrigées de 3 à 6 : niveau recalculé par RG-28 ; valeur hors de 0 à 50 : réponse 400. |
| EF-VEI-48 | L'utilisateur peut enregistrer, pour chacun des niveaux junior, confirmé et senior, de 1 à 3 offres choisies, chacune sous la forme d'un texte de 200 à 20 000 caractères. (v1.35) | M | EXM-17 | T | Trois offres acceptées pour un niveau, une quatrième refusée ; texte de 199 ou de 20 001 caractères : réponse 400. |
| EF-VEI-49 | Le système doit extraire de chaque offre choisie son intitulé, de 1 à 15 mots-clés, le nombre d'années d'expérience demandé (RG-29) et son niveau (RG-28), et les montrer à l'utilisateur pour correction. (v1.35) | M | EXM-17 | T | Offre fictive « 5 ans d'expérience minimum » : 5 ans, niveau confirmé ; traits affichés et modifiables. |
| EF-VEI-50 | Le système doit tenir compte, dans la notation d'une offre, du niveau de l'utilisateur et des traits de ses offres choisies de ce niveau. (v1.35 ; modifie EF-VEI-31 et RG-09) | M | EXM-17, EXM-06 | T | Même offre exigeant 8 ans : notée plus haut pour un utilisateur senior que pour un utilisateur junior (modèle simulé) ; le prompt porte le niveau et les intitulés des offres choisies. |
| EF-VEI-51 | Le système doit lancer la veille de chaque utilisateur qui a activé sa veille automatique, à chacun de ses créneaux, et enregistrer chaque passage avec son créneau, son début, sa fin, son résultat et ses compteurs. (v1.35 ; précise EF-VEI-06) | M | EXM-17 | T | Horloge simulée : trois passages enregistrés par jour (matin, midi, soir) pour chaque utilisateur actif ; aucun pour un utilisateur qui n'a pas activé sa veille. |
| EF-VEI-52 | Le système doit faire porter la consultation de chaque source, lors d'un passage, sur les offres publiées depuis le début de sa dernière consultation réussie (RG-30). (v1.35) | M | EXM-17 | T | Source consultée avec succès à 7 h 00 : la consultation de 13 h porte sur les offres publiées depuis 7 h 00 ; première consultation d'une source : 7 jours. |
| EF-VEI-53 | Le système doit faire couvrir par la consultation suivante d'une source la période d'une consultation échouée ou non tenue, sans perdre d'offre et sans en enregistrer deux fois. (v1.35) | M | EXM-17, ENF-FIA-01 | T | Consultation de 7 h en échec (aucun fournisseur de notation) : celle de 13 h couvre depuis la dernière consultation réussie, l'échec n'avançant pas la fenêtre ; serveur arrêté de 6 h à 14 h : celle de 19 h couvre la nuit et la journée ; zéro doublon (EF-VEI-09). |
| EF-VEI-54 | Le système doit enregistrer toute offre lue même lorsque sa notation n'a pas pu avoir lieu, et la noter au passage suivant. (v1.35) | M | EXM-17, ENF-FIA-02 | T | Modèle local et secours simulés en échec : les offres lues sont enregistrées sans note, le compteur « en attente de note » les dénombre ; au passage suivant elles sont notées, sans doublon. |
| EF-VEI-55 | Le système ne doit lancer le passage d'un utilisateur que s'il a des critères enregistrés ou un profil validé, et doit lui indiquer dans les Réglages pourquoi sinon. (v1.35 ; précise EF-VEI-31) | S | EXM-17 | T | Utilisateur sans critères ni profil validé : passage ignoré, message affiché ; aucune source consultée. |

### 6.4 Production de CV et de réponses (CVX)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| ~~EF-CVX-01~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-02~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-03~~ | *Supprimée en v1.1 (BES-13) : aucun CV générique n'est produit ; tout CV est adapté à une offre.* | — | — | — | — |
| ~~EF-CVX-04~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-05~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-06~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-07~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-08~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-09~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-10~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-11~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| EF-CVX-12 | Le système doit rédiger une réponse de 80 à 140 mots à une question de formulaire, pour une offre donnée. | S | EXM-08 | T | Nombre de mots contrôlé ; hors bornes : nouvelle tentative puis erreur. |
| EF-CVX-13 | Le candidat peut modifier la réponse rédigée avant de la copier. | S | EXM-08 | D | — |
| ~~EF-CVX-14~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-15~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-16~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-17~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-18~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-19~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| ~~EF-CVX-20~~ | *Remplacée en v1.30 (BES-43) : le CV source est celui que le candidat importe, adapté par l'Atelier (EF-CVX-21 à 33).* | — | — | — | — |
| EF-CVX-21 | Le candidat peut importer un CV au format PDF d'au plus 5 Mo ; tout autre format est refusé. (v1.30) | M | EXM-16 | T | Fichier de 5 Mo + 1 octet, fichier DOCX, ou fichier dont le contenu n'est pas un PDF quelle que soit son extension : refusé avec un message en français. |
| EF-CVX-22 | Le système doit lire par reconnaissance optique de caractères (OCR), sur son propre serveur, les pages d'un CV PDF qui ne portent pas de texte (CV scanné ou exporté en image), dans la limite de 3 pages, en français et en anglais. (v1.30) | M | EXM-16 | T | PDF d'une page scannée (fixture fictive) : le texte extrait contient le nom de l'entreprise et l'intitulé de poste de la page ; aucun appel réseau pendant l'OCR. |
| EF-CVX-34 | Le système doit refuser, en indiquant la cause, un CV dont ni la lecture ni l'OCR ne tirent de texte (PDF protégé, corrompu, page blanche ou illisible), ou dont l'OCR dépasserait 3 pages, sans rien transmettre au fournisseur IA. (v1.30) | M | EXM-16 | T | PDF protégé par mot de passe, page blanche, scan de 4 pages : message explicite, aucun appel IA. |
| EF-CVX-35 | Le candidat peut voir, dès la lecture de son CV, le texte lu tel qu'il sera transmis au fournisseur IA et les coordonnées mises à part. (v1.30, précisée le 26/09/2026 pour tester la lecture) | S | EXM-16, ENF-RGP-07 | T | CV fictif lu : son texte s'affiche sans l'e-mail ni le téléphone, qui figurent dans la liste des coordonnées mises à part ; une coordonnée absente est marquée « non repéré ». |
| EF-CVX-23 | Le candidat doit fournir le texte de l'offre, de 200 à 20 000 caractères. (v1.30) | M | EXM-16 | T | 199 ou 20 001 caractères : réponse 400. |
| EF-CVX-24 | Le système doit afficher, pour un CV et une offre, quatre sous-scores entiers de 0 à 100 (compétences, expérience, formation, stack technique), chacun avec une explication en français de 1 à 3 phrases, et le score global calculé selon RG-23. (v1.30 ; v1.31 : l'explication s'affiche sur demande, ENF-UTI-07) | M | EXM-16 | T | Diagnostic IA simulé : quatre sous-scores et leurs explications affichés ; score global conforme à RG-23 ; sous-score hors de 0 à 100 : réponse rejetée (EF-IA-03). |
| EF-CVX-25 | Le système doit produire un CV adapté à l'offre à partir du CV importé, du texte de l'offre et du diagnostic. (v1.30) | M | EXM-16 | T | — |
| EF-CVX-26 | Le système doit rejeter tout CV adapté qui enfreint RG-21, sans jamais le montrer au candidat. (v1.30) | M | EXM-16 | T | Réponse IA simulée contenant une entreprise ou un chiffre absents du CV importé : rejetée, tâche confiée à nouveau (EF-IA-02), puis erreur explicite si aucune réponse n'est conforme. |
| EF-CVX-27 | Le système doit lister à part les compétences exigées par l'offre et absentes du CV importé. (v1.30) | M | EXM-16 | T | Offre exigeant « Power BI », CV qui ne le cite pas : compétence listée, absente du CV adapté. |
| EF-CVX-28 | Le candidat peut cocher les compétences manquantes qu'il possède ; elles sont ajoutées à la section « Compétences » du CV adapté, sans nouveau calcul du score. (v1.30) | S | EXM-16 | T | Deux compétences cochées : présentes dans le fichier téléchargé, score inchangé. |
| EF-CVX-29 | Le système doit afficher chaque modification apportée au CV avec sa section, le texte avant, le texte après et la raison. (v1.30 ; v1.31 : la liste s'affiche sur demande, ENF-UTI-07) | M | EXM-16 | T | Chaque modification affichée porte ses quatre éléments. |
| EF-CVX-30 | Le système doit présenter comme points faibles les sous-scores inférieurs à 50 et les compétences manquantes. (v1.30) | S | EXM-16 | T | Sous-score de 42 : affiché parmi les points faibles ; de 50 : non. |
| EF-CVX-31 | Le candidat peut télécharger le CV adapté au format Word (.docx) conforme à RG-22. (v1.30) | M | EXM-16 | T | Fichier sans tableau, image, zone de texte ni contenu d'en-tête ou de pied de page ; titres de RG-22 présents. |
| EF-CVX-32 | Le système doit mener l'analyse dans la file d'exécution, sans faire attendre la requête, et en publier l'avancement. (v1.30) | M | EXM-15, EXM-16 | T | Réponse en moins d'une seconde avec un identifiant d'exécution (EF-EXE-01) ; chaque étape (lecture, diagnostic, adaptation) publiée en direct (EF-EXE-04). |
| EF-CVX-33 | Le candidat peut lancer au plus N analyses par jour (jour calendaire de Paris), N fixé par la configuration, 5 par défaut ; 0 lève la limite, pour les tests (précisé le 26/09/2026). Une analyse en échec n'est pas comptée. (v1.30) | S | EXM-16, ENF-COU-01 | T | Sixième analyse du même jour : réponse 429 avec un message ; le lendemain : acceptée. |
| EF-CVX-36 | Le système doit produire un fichier Word du CV adapté conforme à RG-24. (v1.31) | M | EXM-16 | T | CV fictif long (12 expériences de 8 réalisations, 40 compétences, 3 compétences cochées) : le fichier converti en PDF compte 1 page, en corps de 10 pt au moins, et cite les 12 expériences. |
| EF-CVX-37 | Le système doit rejeter tout CV adapté qui ne tient pas dans RG-24, et confier la tâche au fournisseur suivant (EF-IA-02). (v1.31) | M | EXM-16 | T | Réponse IA simulée trop longue pour une page : rejetée, tâche confiée à nouveau ; erreur explicite si aucune réponse ne tient. |
| EF-CVX-38 | L'aperçu du CV adapté doit montrer une page A4 : mêmes rubriques, même ordre, même police et marges proportionnelles à celles du fichier Word. (v1.31) | S | EXM-16 | D | Sur 1440 px et 390 px, l'aperçu a les proportions A4 (1 : 1,414) et tout son contenu tient dans la page. |
| EF-CVX-39 | L'utilisateur peut importer de 1 à 4 CV types au format PDF d'au plus 5 Mo, chacun avec un libellé de 1 à 80 caractères ; l'écran l'invite à en fournir 3 ou 4. (v1.35) | M | EXM-17 | T | Quatre CV acceptés ; un cinquième refusé avec un message en français ; libellé vide ou de 81 caractères : réponse 400. |
| EF-CVX-40 | Le système doit lire un CV type avec les contrôles de l'Atelier CV : format et taille (EF-CVX-21), lecture optique de 3 pages au plus (EF-CVX-22), refus motivé d'un fichier illisible (EF-CVX-34), coordonnées mises à part (EF-CVX-35). (v1.35) | M | EXM-17, EXM-16 | T | Fichier DOCX ou PDF protégé : refusé sans appel IA ; PDF scanné fictif d'une page : texte lu sans appel réseau. |
| EF-CVX-41 | L'utilisateur peut remplacer un CV type par un autre fichier ; le profil déduit de l'ancien est effacé et recalculé. (v1.35) | S | EXM-17 | T | Après remplacement, aucune trace de l'ancien profil ; nouveau profil proposé à valider. |
| EF-CVX-42 | L'utilisateur peut supprimer un CV type ; le profil déduit qui en venait est effacé, les critères qu'il a validés restent. (v1.35) | S | EXM-17, ENF-RGP-02 | T | Après suppression : zéro ligne conservée pour ce CV ; critères validés inchangés. |
| EF-CVX-43 | Le système doit mener la lecture et la déduction d'un CV type dans la file d'exécution, répondre en moins d'une seconde avec l'identifiant de l'exécution et en publier l'avancement. (v1.35) | M | EXM-15, EXM-17 | T | Réponse en moins d'une seconde ; étapes « lecture », « déduction » publiées (EF-EXE-04). |
| EF-CVX-44 | Le système doit limiter à N le nombre de déductions de profil lancées par un utilisateur par jour calendaire de Paris, N fixé par la configuration, 5 par défaut. (v1.35) | S | ENF-COU-01, EXM-17 | T | Sixième déduction du jour : réponse 429 avec un message ; le lendemain : acceptée ; une déduction en échec n'est pas comptée. |

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
| EF-TDB-07 | Le système doit afficher la liste des candidatures à relancer, de la plus ancienne à la plus récente. Seules les 5 premières sont dépliées ; le candidat affiche les suivantes en une action, et le nombre total reste visible. (liste repliée v1.34, BES-47) | M | EXM-04 | T |
| EF-TDB-12 | Le tableau de bord doit présenter ses blocs dans cet ordre : indicateurs clés, suivi des 5 dernières semaines, candidatures à relancer, puis répartitions (statut, type de contrat, canal). (v1.34, BES-47) | S | EXM-09 | T |
| EF-TDB-08 | Le système doit afficher le nombre d'offres à l'état « nouvelle » de score supérieur ou égal à S, lorsque la veille des offres est activée (ENF-MAI-07). | S | EXM-06 | T |
| EF-TDB-09 | Le système doit afficher le nombre de candidatures et le taux de réponse (RG-07) par type de contrat. | S | EXM-11 | T |

### 6.6 Orchestration IA (IA)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-IA-01 | Le système doit confier chaque tâche IA au fournisseur prioritaire défini par RG-13. | M | EXM-10 | T | Fournisseurs simulés : appel au prioritaire vérifié. |
| EF-IA-02 | Le système doit confier la tâche au fournisseur suivant lorsque le prioritaire renvoie une erreur, dépasse son délai maximal (EF-IA-10) ou produit une réponse non conforme au schéma. (v1.35) | M | EXM-10 | T | Trois tests, un par cas d'échec. |
| EF-IA-03 | Le système doit valider chaque réponse IA contre le schéma de la tâche avant toute utilisation. | M | ENF-SEC-06 | T | Réponse hors schéma : jamais persistée. |
| EF-IA-04 | Le système doit informer le candidat lorsqu'aucun fournisseur n'a pu réaliser une tâche. | M | EXM-10 | T | Réponse HTTP 502 avec message explicite. |
| EF-IA-05 | Le système doit fonctionner lorsqu'une seule clé d'API est configurée, quel que soit le fournisseur, ou lorsque seul le fournisseur local (EF-IA-07) est configuré. (v1.35) | M | EXM-10 | T | Démarrage réussi avec la seule clé Gemini, ou la seule clé Groq, ou le seul fournisseur local. |
| EF-IA-06 | Le système doit enregistrer pour chaque appel IA le fournisseur, la tâche, la durée, le nombre de jetons et le résultat. | S | ENF-COU-01 | T | Une ligne `llm_calls` par appel. |
| EF-IA-07 | Le système doit pouvoir confier une tâche IA à un fournisseur « local » hébergé par l'exploitant, joint à l'adresse fournie par la configuration du serveur, sans clé d'un service tiers. (v1.35) | M | EXM-17, EXM-10 | T | Fournisseur simulé répondant au format des fournisseurs existants : tâche réussie ; démarrage réussi avec le seul fournisseur local configuré (EF-IA-05 étendue). |
| EF-IA-08 | Le système doit confier au fournisseur local, avant tous les autres, les tâches IA d'un passage planifié (notation et extraction des offres) et celles de la déduction d'un profil ; les fournisseurs de RG-13 prennent le relais en cas d'échec. (v1.35 ; modifie RG-13) | M | EXM-17 | T | Passage simulé : premier appel au local ; local en échec : appel au fournisseur suivant de la route. |
| EF-IA-09 | Le système ne doit pas confier en premier au fournisseur local une tâche dont l'utilisateur attend le résultat à l'écran (diagnostic de CV, classement à la demande, rédaction). (v1.35) | M | EXM-17 | T | Route de `diagnose_cv`, `tailor_cv`, `write_follow_up` : le local n'est pas en tête. |
| EF-IA-10 | Le système doit appliquer à chaque fournisseur son propre délai maximal par appel : 60 secondes par défaut, 600 secondes par défaut pour le fournisseur local, tous deux fixés par la configuration. (v1.35 ; modifie EF-IA-02) | M | EXM-17 | T | Fournisseur simulé répondant en 90 s : abandonné s'il est hébergé, accepté s'il est local ; réponse du local en 601 s : abandonnée. |
| EF-IA-11 | Le système doit limiter le nombre de jetons de sortie demandés à un fournisseur selon le plafond configuré pour lui, 2 000 par défaut pour le fournisseur local. (v1.35) | M | EXM-17 | T | Appel simulé au local : `max_tokens` = 2 000 ; appel à un fournisseur hébergé : plafond actuel inchangé. |
| EF-IA-12 | Le système doit noter les offres par lots dont la taille et la longueur de description sont fixées par la configuration, 5 offres et 800 caractères par défaut pour un passage dont le premier fournisseur est local (15 offres et 2 000 caractères sinon). (v1.35 ; le lot de 15 offres et les 2 000 caractères ne sont aujourd'hui que dans le code et `.claude/rules/llm.md`, pas dans le cahier des charges) | M | EXM-17 | T | Douze offres à noter, premier fournisseur local : trois appels de 5, 5 et 2 offres ; description de 3 000 caractères : tronquée à 800. |
| EF-IA-13 | Le système doit confier la tâche au fournisseur suivant dans les 10 secondes lorsque le fournisseur local est injoignable (connexion refusée ou sans réponse). (v1.35) | M | EXM-17, ENF-FIA-11 | T | Adresse injoignable simulée : appel au fournisseur suivant après 10 secondes au plus. |
| EF-IA-14 | Le système doit cesser d'appeler le fournisseur local pour le reste d'un passage après deux échecs de connexion consécutifs. (v1.35) | S | EXM-17 | T | Passage de 20 offres, local éteint : deux tentatives vers le local, aucune autre ; le passage suivant le retente. |
| EF-IA-15 | Le système peut réserver une tâche IA au seul fournisseur local, selon la configuration du serveur, sans secours vers un fournisseur hébergé. (v1.35) | C | EXM-17, ENF-RGP-13 | T | Tâche réservée et local éteint : la tâche échoue avec le message d'EF-IA-04, aucun fournisseur hébergé n'est appelé. |

### 6.7 Réglages (CFG)

| ID | Exigence | Prio | Source | Vérif. |
|---|---|---|---|---|
| EF-CFG-01 | Le système doit afficher l'adresse Gmail connectée et la date de dernière synchronisation. | M | EXM-01 | D |
| EF-CFG-02 | ~~Le système doit afficher les fournisseurs IA configurés et la tâche attribuée à chacun.~~ Retirée de l'écran en v1.23 (BES-35) : l'information ne sert pas au candidat ; la route `GET /api/settings/ai` reste documentée pour le diagnostic. | — | EXM-10 | — |
| EF-CFG-05 | L'écran Réglages doit présenter d'abord l'état de la boîte Gmail (connectée, synchronisation en cours, autorisation expirée — signalé par un libellé, pas par la seule couleur) et l'action « Synchroniser maintenant », puis les préférences, puis l'entretien, et tenir la déconnexion à l'écart des autres actions. La période de la première synchronisation n'est proposée que tant que celle-ci n'a pas eu lieu. (v1.23, BES-35) Si la veille est activée sur le serveur, la section « Veille automatique » (EF-CFG-06) vient après les préférences et avant l'entretien. (v1.35) | S | EXM-01 | T |
| EF-CFG-03 | Le système doit afficher le coût IA estimé du mois en cours. | C | ENF-COU-01 | T |
| EF-CFG-04 | Le candidat doit pouvoir régler, depuis l'écran Réglages, la période de la première synchronisation (N jours, EF-GML-05). | M | BES-19 | T |
| EF-CFG-06 | L'écran Réglages doit proposer une section « Veille automatique » regroupant les CV types, le profil déduit à valider, le niveau, les offres choisies par niveau et les créneaux. (v1.35) Acceptation : Sur 1440 px et 390 px : chaque élément est accessible depuis la section ; aucune adresse de modèle ni réglage de serveur n'y figure ; avec la fonctionnalité `watch` désactivée, la section et ses routes sont absentes (ENF-MAI-07). | M | EXM-17 | D |
| EF-CFG-07 | L'utilisateur peut activer ou arrêter sa veille automatique et choisir ceux des trois créneaux — matin, midi, soir — qu'il utilise ; au moins un créneau lorsqu'elle est activée. (v1.35) Acceptation : Veille activée avec zéro créneau : réponse 400 ; créneau « midi » décoché : aucun passage de 13 h pour cet utilisateur. | S | EXM-17 | T |
| EF-CFG-08 | L'écran Réglages doit afficher, pour chaque créneau du jour, l'état du passage (à venir, en file, en cours, réussi, en échec, ignoré), ses compteurs (offres lues, nouvelles, notées, en attente de note) et la date du dernier passage réussi. (v1.35) Acceptation : Après un passage simulé : état et compteurs affichés, sans contenu d'offre ni de CV. | S | EXM-17, EXM-15 | D |
| EF-CFG-09 | L'écran Réglages peut indiquer si le dernier passage a été mené par le modèle local ou par un fournisseur de secours, sans afficher l'adresse du modèle. (v1.35) Acceptation : Passage simulé en secours : libellé « secours » ; adresse et jeton absents de la réponse de l'API. | C | EXM-17, ENF-SEC-25 | T |

### 6.8 Comptes et accès (AUT)

| ID | Exigence | Prio | Source | Vérif. | Critère d'acceptation |
|---|---|---|---|---|---|
| EF-AUT-01 | Une personne peut créer un compte avec une adresse e-mail et un mot de passe ; le compte est créé inactif et n'ouvre pas de session tant que l'adresse n'est pas confirmée (EF-AUT-14). (v1.36, BES-49 modifiée) | M | EXM-13, EXM-18 | T | Réponse 201 sans cookie de session ; adresse déjà utilisée : réponse 409. |
| EF-AUT-02 | Le système doit refuser un mot de passe de moins de 12 ou de plus de 128 caractères. | M | EXM-13 | T | Mot de passe de 11 caractères : réponse 400. |
| EF-AUT-03 | L'utilisateur peut se connecter avec son adresse et son mot de passe ; la session ne s'ouvre qu'après confirmation du code à usage unique envoyé à son adresse (EF-AUT-16). (v1.36, BES-49 modifiée) | M | EXM-13, EXM-18 | T | Adresse et mot de passe corrects : réponse 200 sans cookie de session, le code est demandé ; code confirmé dans le délai : cookie de session `HttpOnly`, `SameSite=Strict`. |
| EF-AUT-04 | L'utilisateur peut se déconnecter ; sa session est alors invalidée côté serveur. | M | EXM-13 | T | Requête suivante avec l'ancien cookie : réponse 401. |
| EF-AUT-05 | Le système doit refuser avec le code 401 toute requête sans session valide, à l'exception de la création de compte, de la connexion, de l'activation, du code à usage unique, de l'état de santé et de la documentation. (v1.36, BES-49 modifiée) | M | EXM-13 | T | `GET /api/applications` sans cookie : 401. |
| EF-AUT-06 | Le système doit limiter chaque lecture et chaque modification aux données de l'utilisateur connecté. | M | EXM-13 | T | Candidature d'un autre utilisateur : réponse 404, jamais 403 (pas de divulgation d'existence). |
| EF-AUT-07 | Une session doit expirer 24 heures après son ouverture. (v1.36, BES-49 modifiée ; remplace les 7 jours de v1.2, retour d'une testeuse du 11/10/2026 sur un poste partagé) | M | EXM-13 | T | Horloge simulée à H+24 : réponse 401. |
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
| EF-EXE-06 | Le système doit mener au plus N traitements longs à la fois, tous candidats confondus (N fixé par la configuration, 1 par défaut) ; les autres attendent leur tour dans l'ordre de leur demande, sans être perdus, et l'ordre des traitements d'un même candidat (EF-EXE-02) est conservé. (v1.29, BES-42) | M | EXM-15 | T | Avec N = 1, les traitements de deux candidats ne se chevauchent jamais et s'enchaînent dans l'ordre de leur demande ; avec N = 2, ils peuvent se chevaucher. |
| EF-EXE-07 | Le système doit limiter à N le nombre d'offres notées par un utilisateur lors d'un passage, N fixé par la configuration, 20 par défaut, en notant d'abord les offres en attente de note puis les plus récemment publiées (RG-31). (v1.35) | M | EXM-17, EXM-15 | T | 35 offres à noter : 20 notées, 15 enregistrées sans note et reprises au passage suivant ; N = 0 lève la limite (tests). |
| EF-EXE-08 | Le système doit ignorer (état « ignoré ») le passage d'un utilisateur dont le passage précédent est encore en file ou en cours ; les offres que ce dernier n'a pas notées sont reprises au créneau suivant. (v1.35 ; déjà vrai pour la file : `enqueueUnlessPending`, à couvrir par un test de créneau) | S | EXM-17, EXM-15 | T | Passage de 7 h encore en cours à 13 h : une ligne « ignoré » pour 13 h, aucune seconde exécution simultanée ; au créneau de 19 h, les offres restées sans note sont reprises. |


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
| ~~ENF-PERF-03~~ | *Remplacée en v1.30 (BES-43) par ENF-PERF-08.* | — |
| ENF-PERF-04 | Avec le jeu de charge d'ENF-PERF-01, aucune requête sélective de l'application (liste, recherche, détail, rattachement) ne doit effectuer de parcours séquentiel complet (`Seq Scan` dans `EXPLAIN`) sur les tables `applications`, `emails` ou `job_offers`. | I (EXPLAIN) |
| ENF-PERF-05 | Avec le jeu de charge d'ENF-PERF-01, chaque requête de calcul des indicateurs du tableau de bord (EF-TDB-01 à 09) doit s'exécuter en moins de 50 ms sur la base locale de test. | T (`EXPLAIN ANALYZE`) |
| ENF-PERF-06 | Aucune route de l'API ne doit dépasser 2 secondes : un traitement plus long est mis en file et suivi (EF-EXE-01). | T |
| ENF-PERF-07 | Construites pour la production et mesurées par Lighthouse en profil mobile, la page de présentation et la page de connexion doivent obtenir un score de performance d'au moins 90, un score SEO et « bonnes pratiques » de 100, et afficher leur plus grand élément en moins de 3 s ; le titre et le texte principal de la présentation sont visibles sans attendre la fin d'une animation, et la console reste sans erreur pour un visiteur. Les écrans Candidatures et Réglages, mesurés de même avec une session, doivent obtenir au moins 90 en performance et 100 en accessibilité, sans décalage de mise en page notable (CLS < 0,1) ; leur SEO n'est pas mesuré, puisqu'ils sont volontairement fermés aux moteurs (EF-SEO-01). (v1.28, BES-41) | I (Lighthouse) |
| ENF-PERF-08 | 95 % des analyses de l'Atelier CV (lecture, diagnostic, adaptation) doivent s'achever en moins de 90 secondes, plus 60 secondes par page lue par OCR. (v1.30, BES-43) | T (mesure `job_runs`) |
| ENF-PERF-09 | Un passage d'un utilisateur ne doit pas durer plus de 45 minutes ; au-delà, il s'arrête proprement et laisse les offres restantes en attente de note. (v1.35) Acceptation : Horloge simulée : passage arrêté à 45 minutes, offres restantes sans note, résultat « réussi » avec le compteur d'attente. | T |

### 7.2 Sécurité
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-SEC-01 | En local, l'API et l'interface doivent être joignables uniquement depuis l'adresse 127.0.0.1. Hébergées (v1.26, BES-39), elles ne sont servies qu'en HTTPS, l'interface relayant l'API sous sa propre origine. | I |
| ENF-SEC-21 | Derrière les relais de l'hébergement, les limites de fréquence (ENF-SEC-19) doivent s'appliquer à chaque visiteur, identifié par l'adresse que les relais transmettent, et non au relais qu'ils partagent ; en local, cette adresse transmise est ignorée. (v1.26, BES-39) | T |
| ENF-SEC-22 | Un CV importé doit être refusé avant lecture au-delà de 5 Mo, identifié par son contenu et non par son nom, et jamais exécuté. Il est lu en mémoire ; seules les images de pages que l'OCR requiert passent par un dossier temporaire propre à l'analyse, inaccessible aux autres, effacé dès la fin de la lecture, y compris en cas d'échec. Les outils d'OCR sont lancés sans shell, avec une liste d'arguments fixe et un délai maximal de 60 secondes par page. (v1.30, BES-43) | T |
| ENF-SEC-23 | Les identifiants d'accès aux API officielles (France Travail, La bonne alternance) doivent être lus dans la configuration du serveur, jamais renvoyés par l'API ni journalisés ; le jeton d'accès obtenu n'est gardé qu'en mémoire. (v1.33) | T + I |
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
| ENF-SEC-18 | Les mots de passe doivent être stockés sous forme d'empreinte salée calculée par une fonction lente (scrypt, paramètres OWASP ; depuis la v1.28, le réglage équivalent N = 2^15, r = 8, p = 3, qui demande 32 Mo par calcul au lieu de 128, pour tenir dans le conteneur d'hébergement), jamais en clair ni dans les journaux. | T |
| ENF-SEC-19 | La connexion doit renvoyer la même réponse pour une adresse inconnue et un mot de passe faux, et accepter au plus 10 tentatives par 15 minutes et par adresse IP. | T |
| ENF-SEC-20 | Le jeton de session doit être aléatoire (256 bits au moins) et stocké en base sous forme d'empreinte uniquement. | T |
| ENF-SEC-17 | Les identifiants de connexion à la base hébergée doivent être propres à chaque compte (application, migrations, sauvegarde), distincts et révocables séparément. | I |
| ENF-SEC-24 | Le système doit présenter à chaque appel du modèle local un jeton secret fourni par la configuration du serveur, et ne doit appeler qu'en https une adresse hors réseau privé. (v1.35) Acceptation : Adresse `http://` publique : démarrage refusé avec un message ; adresse du réseau privé en `http://` : acceptée ; jeton présent dans l'en-tête de l'appel simulé. | T |
| ENF-SEC-25 | Le système ne doit jamais renvoyer ni journaliser l'adresse ni le jeton du modèle local. (v1.35) Acceptation : Jeton fictif reconnaissable : absent des réponses de l'API, des journaux et des messages d'erreur. | T + I |
| ENF-SEC-26 | Un code à usage unique (activation ou connexion) doit être aléatoire, à usage unique, stocké en base sous forme d'empreinte uniquement (comme ENF-SEC-20), expirer au plus tard 15 minutes après son envoi, et être invalidé après 5 tentatives erronées consécutives. (v1.36, BES-49) Acceptation : Sixième tentative erronée : code invalidé, un nouvel envoi est nécessaire ; code consommé ou expiré : refusé à sa deuxième utilisation. | T |

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
| ENF-FIA-11 | L'indisponibilité du modèle local ne doit jamais empêcher la collecte des offres. (v1.35) Acceptation : Local et secours injoignables : les sources sont consultées, les offres enregistrées sans note (EF-VEI-54). | T |

### 7.4 Maintenabilité
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-MAI-01 | La couverture de tests doit atteindre au moins 80 % des lignes des modules métier (`backend/src/modules`, `backend/src/llm`, `backend/src/scraper`). | T |
| ENF-MAI-02 | Le code doit passer le contrôle de types strict et le linter sans erreur. | T |
| ENF-MAI-03 | L'ajout d'un type de source ne doit nécessiter aucune modification de code hors du nouveau fichier adaptateur et du registre des adaptateurs. | I |
| ENF-MAI-04 | L'ajout d'une tâche IA ne doit nécessiter aucune modification des fournisseurs existants. | I |
| ENF-MAI-05 | Toute modification de structure de base doit passer par un fichier de migration versionné. | I |
| ENF-MAI-06 | Chaque exigence de ce document doit être couverte par au moins un test ou une procédure de vérification référencée dans `docs/TRACABILITE.md`. | I |
| ENF-MAI-07 | La veille des offres (§6.3) et la production de CV (§6.4) doivent chacune pouvoir être activées ou désactivées par la configuration du serveur, sans modification de code. Une fonctionnalité désactivée n'expose aucune route d'API ni aucun traitement planifié, et ses écrans restent dans la navigation en affichant « En préparation » sans charger leur contenu ; une fonctionnalité que la configuration ne nomme pas est désactivée ; un nom inconnu empêche le démarrage. Le tableau de bord, les candidatures, la synchronisation Gmail et les réglages sont toujours actifs. (BES-29) (v1.35 : la section « Veille automatique » des réglages et les routes des CV types et des offres choisies relèvent de la fonctionnalité `watch`.) | T |
| ENF-MAI-09 | Le serveur doit lire dans sa configuration l'adresse, le modèle, le jeton, le délai, le plafond de sortie, la taille des lots et le plafond d'offres du fournisseur local, avec leurs valeurs par défaut, et refuser de démarrer sur une valeur invalide. (v1.35 ; précise ENF-MAI-07) Acceptation : Délai négatif ou adresse malformée : démarrage refusé avec un message qui nomme la variable. | T |

### 7.5 Utilisabilité et portabilité
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-UTI-01 | L'interface doit être rédigée en français. | I |
| ENF-UTI-02 | L'interface doit rester utilisable sur un écran de 360 px de large. | D |
| ENF-UTI-03 | Chaque action longue (plus de 1 seconde) doit afficher un indicateur d'attente. | D |
| ENF-UTI-04 | Les animations de la page de présentation (chargement, survol, mouvement 3D, micro-interactions) doivent s'arrêter lorsque le système de l'utilisateur demande de réduire les animations, sans rien retirer du contenu ni des accès. (v1.24, BES-36) | T |
| ENF-UTI-05 | Avant l'analyse, la page Atelier CV doit afficher au plus 40 mots de texte d'aide, libellés, boutons et messages d'erreur non comptés. (v1.31, BES-44) | I |
| ENF-UTI-06 | À l'arrivée du résultat de l'Atelier CV, le score, le CV adapté et son bouton de téléchargement doivent être visibles sans défiler sur un écran de 1440 × 900 ; sur 390 px, le téléchargement doit être atteint en une action depuis le score. (v1.31, BES-44) | D |
| ENF-UTI-07 | Dans le résultat de l'Atelier CV, les explications des sous-scores, la liste des modifications et le texte transmis à l'IA doivent être repliés et s'afficher sur demande en une action. (v1.31, BES-44) | T |
| ENF-POR-01 | Le système complet doit démarrer par une seule commande `docker compose up` sous Windows, macOS et Linux. | D |

### 7.6 Collecte responsable (veille)
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-COL-01 | Le système ne doit consulter aucune URL interdite par le fichier robots.txt du site. | T |
| ENF-COL-02 | Le système doit espacer d'au moins 3 secondes deux requêtes vers un même hôte. | T |
| ENF-COL-03 | Le système doit s'identifier par un agent utilisateur contenant une adresse de contact. | T |
| ENF-COL-04 | Le système doit limiter chaque requête de collecte à 15 secondes et à 3 Mo de réponse. | T |
| ENF-COL-05 | Les API officielles (France Travail, La bonne alternance, Recherche d'entreprises, découpage administratif) doivent être appelées selon leurs conditions d'utilisation et au plus à la moitié de leur débit publié, chaque appel limité à 15 secondes et 3 Mo. Le fichier robots.txt, destiné aux robots d'exploration, ne s'applique pas à ces API documentées ; il s'applique à tous les sites et logiciels de recrutement (ENF-COL-01). (v1.33) | T |
| ENF-COL-06 | Le modèle d'IA ne doit jamais choisir l'adresse d'une requête sortante : toute collecte est émise par le code, vers les sources que l'utilisateur a ajoutées ou activées (RG-19) et selon ENF-COL-01 à 05. (v1.35) Acceptation : Réponse simulée du modèle contenant une adresse : aucune requête émise vers elle ; aucune source créée à la fin du passage. | T |

### 7.7 Données personnelles (RGPD)
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-RGP-01 | Le système ne doit conserver d'un message que ses métadonnées (expéditeur, objet, date, adresse de contact selon RG-20 depuis v1.22) et un extrait de 300 caractères maximum. Le début du corps (2 000 caractères de texte au plus) peut être lu en mémoire pour le classer (EF-GML-08, RG-17), sans être ni conservé ni journalisé ; seuls 1 000 de ces caractères sont transmis à l'IA. (précisée v1.18, BES-30) | T |
| ENF-RGP-02 | L'utilisateur peut supprimer son compte et l'intégralité de ses données par une action unique, CV types (profil déduit), offres choisies et créneaux compris. (v1.35) | T |
| ENF-RGP-03 | Les données doivent être stockées exclusivement sur le poste du candidat et dans la base hébergée, située dans l'Union européenne, à l'exception des contenus transmis aux fournisseurs IA pour traitement. | I |
| ENF-RGP-04 | Le système ne doit déposer aucun cookie ni traceur autre que le cookie de session (aucune mesure d'audience, aucune publicité, aucun service tiers dans le navigateur). (v1.25) | I |
| ENF-RGP-05 | La politique de confidentialité doit indiquer le responsable du traitement et son contact, les données traitées, les finalités et leurs bases légales, les durées de conservation (sauvegardes comprises), les destinataires (Neon, Google, Groq, Gemini, Anthropic, le modèle d'IA local de l'exploitant (v1.35), Resend pour les e-mails d'activation et de connexion (v1.36, BES-49) et, s'il est retenu (Q-25), le service de tunnel qui y mène, avec son pays d'hébergement), les sources d'offres consultées et ce qui leur est transmis (v1.33 : France Travail, La bonne alternance, API Recherche d'entreprises, découpage administratif — critères de recherche seulement), la durée de conservation des offres (ENF-RGP-10), les transferts hors de l'Union européenne, les droits et leur exercice, le recours auprès de la CNIL, et le respect de la politique d'utilisation limitée des données des API Google. (v1.25 ; v1.36) | I |
| ENF-RGP-15 | Le système ne doit transmettre à Resend que l'adresse e-mail du destinataire et le contenu du message d'activation ou du code de connexion, jamais le mot de passe ni une autre donnée du compte. (v1.36, BES-49) Acceptation : Requête envoyée à Resend : seuls l'adresse et le message préparé par le serveur y figurent. | T |
| ENF-RGP-06 | Le système ne doit enregistrer ni en base, ni sur disque (hors dossier temporaire de l'OCR, ENF-SEC-22), ni dans les journaux le CV importé, son texte, le texte de l'offre ou le CV adapté ; seuls les compteurs de l'exécution sont journalisés. Le résultat d'une analyse reste en mémoire 30 minutes au plus, puis est effacé. (v1.30, BES-43) (v1.35 : s'applique aussi à la lecture d'un CV type et au texte d'une offre choisie ; seules les données énumérées par ENF-RGP-14 sont conservées.) | T + I |
| ENF-RGP-07 | Le système ne doit transmettre au fournisseur IA ni le nom, ni l'adresse e-mail, ni le téléphone, ni l'adresse postale, ni les liens de profil figurant dans le CV importé ; ils sont retirés du texte avant envoi et rétablis dans le CV téléchargé. (v1.30, BES-43) | T |
| ENF-RGP-08 | La politique de confidentialité doit décrire le traitement de l'Atelier CV : données lues, transmission au fournisseur IA sans les coordonnées, absence de conservation, et celui des CV types et des offres choisies (v1.35). (v1.30, BES-43) | I |
| ENF-RGP-09 | Le système ne doit conserver d'une offre aucune coordonnée de recruteur : les champs de contact des sources ne sont pas lus, et les adresses e-mail et numéros de téléphone sont retirés du texte de l'offre avant son enregistrement et avant tout envoi à l'IA. (v1.33) | T |
| ENF-RGP-10 | Le système doit supprimer chaque jour les offres à l'état « nouvelle » ou « écartée » que leur source ne publie plus depuis plus de 60 jours ; les offres gardées ou postulées sont conservées. Une offre encore publiée n'est pas supprimée : elle reviendrait au passage suivant comme nouvelle, une offre écartée comprise. (v1.33) | T |
| ENF-RGP-11 | Les requêtes vers les sources officielles ne doivent porter que des critères de recherche (mots-clés, codes ROME, commune, rayon, types de contrat) ou le nom d'une entreprise, jamais une donnée d'identité ni de contact du candidat. (v1.33) | T |
| ENF-RGP-12 | Le système ne doit journaliser d'un passage que des compteurs et des états, jamais le texte d'un CV, d'une offre, d'un prompt ou d'une réponse du modèle. (v1.35 ; étend EF-IA-06 et ENF-RGP-06) Acceptation : Passage simulé avec textes fictifs reconnaissables : aucun de ces textes dans les journaux ni dans `job_runs`, `job_run_counters`, `llm_calls`. | T |
| ENF-RGP-13 | Le système ne doit transmettre au fournisseur local que le texte d'un CV type sans ses coordonnées (ENF-RGP-07), le texte d'une offre sans coordonnée de recruteur (ENF-RGP-09) et les critères de l'utilisateur, et jamais son adresse e-mail, son nom, ses messages ni ses candidatures. (v1.35) Acceptation : Prompt capturé d'une déduction et d'une notation : aucune adresse e-mail, aucun numéro de téléphone, aucun message Gmail. | T |
| ENF-RGP-14 | Le système ne doit conserver d'un CV type que son libellé, ses années d'expérience, son niveau et les cibles validées, et d'une offre choisie que son niveau, son intitulé, ses mots-clés et ses années d'expérience, jamais le fichier ni le texte ; ces données sont supprimées avec le compte (ENF-RGP-02). (v1.35 ; précise ENF-RGP-06) Acceptation : Après import et validation : aucune colonne de la base ne contient le texte ; suppression du compte : zéro ligne restante. | T + I |

### 7.8 Coûts
| ID | Exigence | Vérif. |
|---|---|---|
| ENF-COU-01 | Le coût des appels IA ne doit pas dépasser 10 € par mois pour 300 messages liés à l'emploi, 500 nouvelles offres et 150 analyses de l'Atelier CV par mois (analyses ajoutées en v1.30, BES-43). | T (agrégat `llm_calls`) |
| ENF-COU-02 | Le système doit enregistrer les appels du fournisseur local avec un coût de 0 € et ne pas les compter dans les 10 € mensuels d'ENF-COU-01. (v1.35) Acceptation : Appels `local` simulés : lignes `llm_calls` avec le fournisseur `local`, coût estimé du mois inchangé. | T |
| ENF-COU-03 | L'envoi des e-mails d'activation et de connexion doit rester dans le palier gratuit de Resend (100 e-mails par jour, 3 000 par mois, tous comptes confondus) : les demandes de nouvel envoi sont limitées en fréquence (EF-AUT-15, EF-AUT-17) et le système ne doit jamais dépasser le palier en usage normal du nombre de comptes de test en cours (Q-27). (v1.36, BES-49) | T (agrégat des envois) |

## 8. Contraintes

| ID | Contrainte | Origine |
|---|---|---|
| C-01 | L'interface est réalisée en React. | Business Owner |
| C-02 | La base de données est PostgreSQL, hébergée par Neon. | Business Owner (v1.1, BES-10) |
| C-03 | Les fournisseurs IA sont Claude (Anthropic), Gemini (Google) et Groq, avec les clés du candidat, et un modèle local hébergé par l'exploitant (v1.35, BES-48). | Business Owner |
| C-04 | La messagerie supportée est Gmail. | Existant |
| C-05 | Le système est multi-utilisateur à comptes séparés. En local, l'API et l'interface s'exécutent via Docker. Hébergé (v1.26), l'interface est servie par Vercel, qui relaie `/api` vers l'API servie par Northflank en une seule instance (planificateur et file d'exécution internes) ; la base est hébergée par Neon. | Business Owner (v1.2, BES-14 ; v1.26, BES-39) |
| C-06 | Le développement est réalisé de manière incrémentale par Claude Code, lot par lot, suivant `docs/ROADMAP.md`. | Organisation |
| C-07 | Le code respecte les principes des skills `clean-code` et `security` fournis dans `.claude/skills/`, et la règle `.claude/rules/database.md`. | Organisation |
| C-09 | L'accès aux données passe par l'ORM Drizzle. | Business Owner (v1.1, BES-11) |
| C-08 | Le CV reproduit le modèle Word « CV pour Forum » déjà utilisé par le candidat. | Existant |
| C-10 | Le modèle d'IA local est celui installé sur le serveur personnel (homelab) de l'exploitant ; son usage ne consomme aucun crédit et n'est jamais appelé par une adresse publique sans jeton (BES-48). | Business Owner (v1.35) |
| C-11 | Les e-mails d'activation et de connexion sont envoyés par Resend, palier gratuit ; le domaine d'envoi est vérifié et géré par le Business Owner (BES-49). | Business Owner (v1.36) |

## 9. Règles de gestion

| ID | Règle |
|---|---|
| RG-01 | Les statuts de candidature sont : **À postuler**, **Envoyée**, **Accusé reçu**, **Test technique** (v1.32 : exercice, test de code ou évaluation à faire, distinct d'un entretien), **Entretien**, **Proposition**, **Refusée**. |
| RG-02 | Correspondance catégorie → statut : candidature envoyée → Envoyée ; accusé de réception → Accusé reçu ; test technique → Test technique (v1.32) ; entretien → Entretien ; proposition → Proposition ; refus → Refusée. Alerte emploi et hors sujet ne modifient aucune candidature. |
| RG-03 | Rattachement d'un message : (0) (v1.32) un message dont la conversation Gmail contient déjà un message rattaché va à la même candidature, sans passer par (a) à (d) ; (a) entreprise identifiée par sa clé (RG-26) ; (b) si le message mentionne un intitulé, candidature de cette entreprise dont la clé d'intitulé (RG-25) est identique ; (c) si le message ne mentionne aucun intitulé, candidature de l'entreprise dont la dernière activité est la plus récente ; (d) sinon, création d'une candidature avec l'intitulé mentionné ou, à défaut, « Candidature ». Si l'employeur n'est pas identifiable, l'entreprise retenue est la plateforme ; si aucune plateforme n'est identifiable, l'entreprise est déduite du domaine de l'adresse du correspondant — le destinataire d'un message envoyé, l'expéditeur d'un message reçu — lorsque ce domaine la désigne selon RG-19 (ni messagerie grand public, ni plateforme, ni outil de recrutement, ni job board) : « data-praxis.fr » donne « Data Praxis » (v1.20, BES-32) ; à défaut, l'entreprise retenue est « Entreprise inconnue ». |
| RG-04 | Évolution du statut : rang À postuler 0, Envoyée 1, Accusé reçu 2, Test technique 3, Entretien 4, Proposition 5, Refusée 6 (v1.32). Un nouveau statut remplace le statut courant si et seulement si il vaut Proposition ou Refusée, ou si son rang est supérieur. Les messages sont traités par date croissante. La date de dernière activité prend la plus grande des deux dates. |
| RG-05 | Libellés Gmail de statut : Refusée → « Statut/Refusée » ; Entretien et Proposition → « Statut/Entretien » ; Envoyée, Accusé reçu et Test technique (v1.32) → « Statut/En attente ». À postuler → aucun libellé. |
| RG-06 | Une candidature est « à relancer » lorsque son statut est Envoyée ou Accusé reçu, que sa dernière activité date de plus de D jours, D paramétrable avec 10 par défaut, et qu'au moins un de ses messages porte une adresse de contact (RG-20) — une candidature à laquelle on ne peut pas écrire n'est pas proposée à la relance (v1.22, BES-34). |
| RG-07 | Taux de réponse = (Test technique + Entretien + Proposition + Refusée) / total des candidatures × 100, arrondi à l'entier le plus proche ; 0 lorsque le total est nul. |
| RG-08 | Format d'identifiant de source : Greenhouse, Lever, SmartRecruiters, Recruitee → `^[a-z0-9][a-z0-9._-]{0,80}$` (insensible à la casse) ; Workday → URL https sur un sous-domaine de `myworkdayjobs.com` contenant le nom du site carrières ; page générique → URL https. (v1.33) Teamtailor, Personio, Workable → même motif que Greenhouse ; Cegid Talentsoft → sous-domaine client de `talent-soft.com`, `^[a-z0-9][a-z0-9-]{0,62}$` ; Ashby → nom du board, `^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$` (casse conservée) ; France Travail et La bonne alternance → la valeur fixe « criteres » (une seule source de chaque par candidat, interrogée selon ses critères, EF-VEI-29). |
| RG-09 | Critères de notation : correspondance à une cible des critères de recherche (EF-VEI-29) ou, à défaut, du profil (v1.33) ; lieu dans la zone de recherche ou télétravail ; type de contrat de l'offre accepté par la cible (CDI, CDD, alternance, job étudiant ; « non précisé » ne pénalise pas) ; **(v1.35) expérience exigée compatible avec le niveau de l'utilisateur (RG-28) : une offre dont l'expérience exigée correspond à son niveau ou à un niveau inférieur ne pénalise pas, à défaut de niveau enregistré l'expérience exigée est de 3 ans au plus, et les offres choisies de son niveau guident la notation (EF-VEI-50)**. Un critère non satisfait abaisse le score. |
| RG-10 | Pré-filtre sans IA : un message est retenu si son objet ou son extrait contient un mot-clé d'emploi, ou si son expéditeur appartient à la liste des plateformes connues. Une offre est retenue pour notation IA si son intitulé ou sa description contient au moins un mot-clé d'une cible et si son type de contrat n'est pas « autre ». Les listes sont paramétrables. |
| ~~RG-11~~ | *Remplacée en v1.30 (BES-43) par RG-22 : le CV produit suit le format lisible par les ATS, non plus la charte du modèle Word.* |
| ~~RG-12~~ | *Remplacée en v1.30 (BES-43) par RG-21 : la fidélité se vérifie contre le CV importé.* |
| ~~RG-15~~ | *Remplacée en v1.30 (BES-43) par RG-22.* |
| RG-13 | Routage IA (v1.8) : trois emplacements Groq (modèles gratuits, choisis dans la configuration) sont essayés dans l'ordre, puis les secours historiques. Classement des messages, notation des offres, extraction de pages, diagnostic d'un CV importé (v1.30) → Groq 1, 2, 3, Gemini, Claude. CV adapté, réponse de motivation, relance (v1.22) → Groq 1, 2, 3, Claude, Gemini. Un emplacement vide est ignoré. **(v1.35)** Pour un passage planifié (notation et extraction des offres) et pour la déduction d'un profil à partir d'un CV type, le fournisseur local passe avant tous les autres, qui prennent le relais selon l'ordre ci-dessus ; il n'est jamais en tête pour les autres tâches. Chaque fournisseur a son délai maximal par appel, son plafond de sortie et la taille de ses lots (EF-IA-10 à 12). |
| RG-17 | Indices lexicaux de statut (v1.10, lecture v1.18) : dans un message **reçu**, l'objet et le début du corps (2 000 caractères de texte, citations des réponses précédentes exclues ; l'extrait de Gmail à défaut de corps lisible) sont comparés, sans accents ni casse, à une liste d'expressions de refus puis à une liste d'expressions d'accusé de réception, en français et en anglais. Une expression de refus précédée, dans sa phrase, d'une condition (« si », « sans réponse », « au cas où », « if »…) ne compte pas : « sans réponse sous 4 semaines, considérez que votre candidature n'a pas été retenue » reste un accusé de réception (v1.18). Une expression de refus impose « refus » (un refus poli ouvert par « nous avons bien reçu votre candidature » est donc classé « refus ») ; certaines expressions — « suite favorable », « suite positive » — ne valent refus que sous une négation proche. À défaut de refus, une expression d'accusé de réception impose « accusé de réception » lorsque l'IA n'a rien reconnu de plus fort. Jamais corrigés : une proposition d'embauche, un entretien reconnu (vers l'accusé de réception), une alerte emploi (vers le refus), un message envoyé par le candidat. **(v1.37)** Les formes élidées (« nous n'y donnerons pas suite », « n'y donnons aucune suite », « ne pourrons y donner suite ») valent refus. Une alerte emploi reconnue par l'IA devient un refus lorsque le message porte à la fois une expression de refus et une expression d'accusé de réception (« merci pour votre candidature ») : le couple désigne la candidature du candidat, ce que ne fait pas une alerte listant un poste pourvu. **(v1.40)** Les refus reformulés valent refus : « notre choix s'est orienté vers des profils… », « notre choix s'est porté sur un autre profil », « nous avons choisi de poursuivre avec d'autres candidats », « profils (dont les compétences sont) plus en adéquation », « candidatures plus en adéquation » — jamais « plus en adéquation » seul, qu'une alerte emploi peut employer, ni « notre choix s'est porté sur vous ». Le tutoiement est reconnu pour les accusés de réception (« merci pour ta candidature », « ta candidature a bien été… », « étudié ta candidature »), pour les formules neutres (« merci d'avoir postulé », « merci d'avoir pris le temps de postuler »), pour l'examen raconté au passé (« après avoir examiné votre candidature ») et pour les refus (« au regret de t'informer », « ne pas retenir ta candidature »), de sorte qu'une alerte emploi qui remercie et refuse devient un refus. |
| RG-14 | Clé normalisée d'un nom : minuscules, accents supprimés, tout caractère non alphanumérique remplacé par une espace, espaces multiples réduits, espaces de bord supprimées. |
| ~~RG-18~~ | *Supprimée en v1.30 (BES-43) : le niveau d'études n'est plus saisi dans un profil, il figure dans le CV importé.* |
| RG-19 | Déduction d'une source (v1.13) : le domaine retenu pour une entreprise est celui de l'expéditeur des messages **reçus** rattachés à ses candidatures, le plus fréquent d'abord. Les domaines des plateformes connues (`platform_domains`), des fournisseurs de messagerie grand public, des **outils de recrutement** (Flatchr, Teamtailor, WeRecruit, Taleez…) et des **job boards** sont écartés : ils ne désignent pas l'entreprise, et une source posée sur eux relèverait les offres de tout le monde. Une proposition n'est **jamais** ajoutée d'office ; le candidat la confirme — une par une ou toutes ensemble (EF-VEI-26) — ou l'écarte. L'identifiant proposé pour un job board est une **hypothèse** déduite du nom de l'entreprise : une source ajoutée en lot peut donc échouer à sa première consultation, et le candidat la corrige alors depuis la liste. Rien n'est déduit du corps des messages, dont seuls 300 caractères sont conservés (ENF-RGP-01). La lecture des propositions ne fait aucune requête sortante ; seule la recherche des pages carrières, demandée par le candidat (EF-VEI-38), consulte les sites, et ses résultats — type, identifiant, vérification — remplacent l'hypothèse tirée du nom (v1.33). |
| RG-20 | Adresse de contact d'un message (v1.22) : pour un message reçu, l'adresse de réponse (`Reply-To`) si elle existe, sinon l'expéditeur ; pour un message envoyé par le candidat, son premier destinataire. Une adresse qui n'accepte pas de réponse (« no-reply », « noreply », « ne-pas-repondre », « donotreply », « notification », « mailer-daemon »…) n'est pas une adresse de contact ; le mot peut figurer n'importe où dans la partie locale (« jobs-noreply ») (v1.32). Une adresse d'une plateforme, d'un outil de recrutement ou d'un job board (domaines de RG-19) n'est pas une adresse de contact (v1.32). La relance s'adresse au contact du message le plus récent de la candidature qui en porte un. |
| RG-21 | Fidélité au CV importé (v1.30) : chaque entreprise, établissement de formation, période, intitulé de poste, diplôme, nombre et chiffre cités dans le CV adapté doit figurer à l'identique dans le texte du CV importé ; chaque compétence et chaque outil doivent figurer dans ce texte ou avoir été cochés par le candidat (EF-CVX-28). Autorisé : reformuler une activité réellement décrite avec le vocabulaire de l'offre, réordonner, sélectionner, raccourcir. Interdit : ajouter une expérience, un diplôme, une certification, un chiffre, une compétence ou un outil. (v1.38) La comparaison avec le CV importé ignore les ligatures (« ﬁ » lu « fi »), les caractères invisibles (trait d'union conditionnel, espace de largeur nulle), les variantes typographiques d'apostrophe et de tiret (« − » compris), comme elle ignore déjà la casse et les accents. Une compétence, une certification, un centre d'intérêt ou une langue absents du CV sont retirés du CV adapté, avec les modifications qui les annoncent, au lieu de faire refuser tout le CV ; rien d'inventé n'est jamais montré, et tout autre écart (entreprise, intitulé, lieu, période, diplôme, établissement, chiffre nouveau) rejette toujours la réponse. |
| RG-22 | Format lisible par les ATS (v1.30) : une seule colonne de texte réel ; titres de sections usuels, dans cet ordre lorsqu'ils ont un contenu — Profil, Expériences professionnelles, Formation, Compétences, Certifications, Langues, Centres d'intérêt ; aucun tableau, image, zone de texte, colonne de section ni contenu d'en-tête ou de pied de page ; coordonnées dans le corps du document, en tête. |
| RG-23 | Score global (v1.30) : moyenne pondérée, arrondie à l'entier le plus proche, des sous-scores — compétences 40 %, expérience 30 %, stack technique 15 %, formation 15 %. Calculé par le système, jamais demandé à l'IA, pour qu'un même diagnostic donne toujours le même score. |
| RG-24 | Une page A4 (v1.31) : le CV adapté tient sur une page A4 (21 × 29,7 cm), marges de 1,5 cm au moins, corps de texte de 10 pt au moins, coordonnées, titres et compétences cochées (EF-CVX-28) compris. Pour y parvenir, sont permis (RG-21) : sélectionner les réalisations les plus utiles à l'offre, les raccourcir, les regrouper ; chaque expérience et chaque formation du CV importé restent citées, au moins par leur intitulé, leur établissement et leur période. |
| RG-25 | Clé d'un intitulé de poste (v1.32) : la clé normalisée (RG-14), dont on retire les marqueurs de genre (« h f », « f h », « h », « f » en fin d'intitulé), les types de contrat (« cdi », « cdd », « alternance », « stage », « freelance », « interim ») et les références (« ref », « reference », « n » suivis de chiffres). « Data Analyst H/F », « Data analyst (F/H) - CDI » et « Data Analyst » ont la même clé. |
| RG-26 | Clé d'une entreprise (v1.32) : la clé normalisée (RG-14), dont on retire en fin de nom les formes juridiques et suffixes « sa », « sas », « sasu », « sarl », « se », « gmbh », « inc », « ltd », « llc », « group », « groupe », « france ». « Capgemini », « CAPGEMINI SE » et « Capgemini France » désignent la même entreprise. Les entreprises déjà enregistrées ne sont pas fusionnées d'office : le candidat fusionne leurs candidatures (EF-CAN-18). |
| RG-27 | Reconnaissance d'un logiciel de recrutement (v1.33) : une adresse présente dans un lien, un cadre (`iframe`) ou un script d'une page désigne une source lorsqu'elle suit l'un de ces motifs — `job-boards.greenhouse.io/‹board›` ou `boards.greenhouse.io/‹board›` → Greenhouse ; `jobs.lever.co/‹site›` → Lever ; `jobs.smartrecruiters.com/‹société›` ou `careers.smartrecruiters.com/‹société›` → SmartRecruiters ; `‹site›.recruitee.com` → Recruitee ; `‹hôte›.myworkdayjobs.com/…/‹site›` → Workday ; `‹client›.talent-soft.com` → Cegid Talentsoft ; `‹société›.teamtailor.com` → Teamtailor ; `‹société›.jobs.personio.de` ou `.jobs.personio.com` → Personio ; `apply.workable.com/‹compte›` → Workable ; `jobs.ashbyhq.com/‹board›` → Ashby ; `careers.flatchr.io/…` et les autres logiciels sans flux public → page carrières sur cette adresse. Le motif le plus fréquent sur la page l'emporte ; les sous-domaines techniques (`www`, `api`, `app`, `cdn`, `assets`, `static`) ne sont jamais des identifiants. |
| RG-16 | Date de candidature saisie par le candidat : à la création, la date de dernière activité et la date du statut initial valent la date de candidature. Quand la date de candidature est modifiée, la date de dernière activité prend la nouvelle date si aucune activité n'a eu lieu depuis la création, sinon la plus récente des deux. |
| RG-28 | Niveau (v1.35) : à partir des années d'expérience, junior de 0 à 2 ans, confirmé de 3 à 7 ans, senior à partir de 8 ans. Pour une offre sans années exigées, le niveau est lu dans l'intitulé (junior, débutant, confirmé, senior, lead, principal) ; à défaut, « non précisé ». |
| RG-29 | Années d'expérience (v1.35) : pour un CV, durée cumulée des périodes d'expérience lues, périodes chevauchantes comptées une fois, alternances et stages compris, arrondie à l'entier le plus proche ; pour une offre, nombre le plus élevé d'une expression du type « n ans d'expérience » ou « n+ ans ». Calculées par le code, jamais demandées au modèle, pour qu'un même texte donne toujours le même nombre. |
| RG-30 | Fenêtre d'une consultation (v1.35) : depuis le début de la dernière consultation réussie de la même source, 7 jours à la première consultation, 31 jours au plus (limite de l'API France Travail). Une consultation échouée n'avance pas la fenêtre. Créneaux d'un passage : matin 7 h, midi 13 h, soir 19 h, heure de Paris. |
| RG-31 | Ordre de notation (v1.35) : offres en attente de note d'abord, puis offres les plus récemment publiées ; à publication égale, plus ancienne détection d'abord. |

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
| H-07 | Le modèle local (processeur seul, 4 cœurs) note environ 40 secondes par offre, d'après la mesure du 02/10/2026 sur 8 offres, et le homelab fonctionne au moins 16 heures par jour. | Moins d'offres notées par passage, plus de reprises (EF-VEI-54), davantage de secours hébergés. |
| H-08 | Un utilisateur dispose d'un à quatre CV au format PDF représentant ce qu'il recherche. | Saisie manuelle des critères (EF-VEI-29), déjà disponible. |
| H-09 | Moins de dix utilisateurs actifs partagent le modèle local. | Revoir les plafonds (EF-EXE-07), la rotation des utilisateurs et l'ordre de la file. |

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
| Q-12 | *Sans objet depuis v1.30 (BES-43) : aucune donnée de l'offre ni du CV n'est conservée (ENF-RGP-06).* | — |
| Q-13 | Quelle offre Neon retenir (gratuite ou payante) ? Elle fixe la fenêtre de restauration à un instant donné et la mise en veille de la base. | Offre gratuite ; la sauvegarde quotidienne sur le poste couvre ENF-FIA-04 à 08. |
| Q-14 | Quelle région Neon ? (ENF-RGP-03 exige l'Union européenne) | Francfort (`aws-eu-central-1`). |
| Q-16 | Le profil de référence (CV, cibles) devient propre à chaque utilisateur : faut-il le stocker en base plutôt que dans `backend/data/profile.json` ? (bloque T-501) | Oui : en base, par utilisateur, validé par le même schéma. |
| Q-15 | Pour l'alternance, faut-il suivre des informations propres (école, rythme, date de début) ? | Non en v1.1 : le rythme figure dans le profil (disponibilités), repris dans le CV. |
| Q-17 | Les indicateurs EF-TDB-01, 05, 06 et 09 portent sur toutes les candidatures de l'utilisateur, donc sur toute la table `applications` (application mono-utilisateur) : le planificateur choisit le `Seq Scan`, interdit par ENF-PERF-04 ; un index couvrant ne change pas son choix. Que faire ? (bloque T-601) | Tranchée le 22/09/2026 : ENF-PERF-04 limitée aux requêtes sélectives ; indicateurs bornés à 50 ms par requête (ENF-PERF-05). |
| Q-18 | ~~Où héberger l'API et l'interface ?~~ **Tranchée le 24/09/2026 (BES-39)** : interface sur Vercel, API sur Northflank (région de l'Union européenne), base sur Neon ; l'interface relaie `/api` vers l'API, ce qui garde une seule origine (cookie `SameSite=Strict`, garde d'origine, retour OAuth inchangés). | Voir ADR-15 et `docs/DEPLOIEMENT.md`. |
| Q-19 | Combien de temps garder une offre que le candidat n'a ni gardée ni postulée ? (v1.33) | 60 jours après que sa source a cessé de la publier (ENF-RGP-10). |
| Q-20 | Welcome Kit, logiciel de recrutement public du groupe Welcome to the Jungle : à surveiller ou à exclure ? (v1.33) | Exclu, dans l'esprit du §5.2 : ses offres renvoient vers welcometothejungle.com. |
| Q-21 | Quand traiter les pages carrières qui n'affichent leurs offres qu'en JavaScript ? (v1.33) | Plus tard, sur demande ; seule piste conforme relevée : un service de rendu qui s'annonce comme robot et respecte robots.txt. |
| Q-22 | CV types (v1.35, BES-48) : sont-ils importés par l'utilisateur ou fournis par le système, et faut-il conserver les fichiers ? (bloque EF-CVX-39 à 44, ENF-RGP-14) | CV importés par l'utilisateur (1 à 4), jamais conservés ; seul le profil déduit, validé par l'utilisateur, est conservé. |
| Q-23 | Offres à entrer par niveau (v1.35) : texte d'offre ou simple intitulé ? trois en tout ou trois par niveau ? (bloque EF-VEI-48 et 49) | Texte collé de 200 à 20 000 caractères, trois par niveau (junior, confirmé, senior), traits seuls conservés ; pas de lien. |
| Q-24 | Qui règle quoi (v1.35) : l'utilisateur règle sa recherche, l'exploitant règle le modèle local ? (bloque EF-CFG-06, 07, ENF-MAI-09) | L'utilisateur règle ses CV, niveaux, offres choisies et créneaux ; l'exploitant règle adresse, modèle, jeton, délais et plafonds par la configuration du serveur ; le modèle est partagé. |
| Q-25 | Comment l'API hébergée joint-elle le modèle local du homelab ? (v1.35 ; ADR-17) | Tunnel gratuit vers un proxy à jeton (option A) ; à défaut, travailleur de veille chez l'exploitant (B) ou fournisseur local réservé au déploiement local (C). Jamais le port du modèle ouvert sur Internet. |
| Q-26 | « Agir comme un agent » (v1.35) : enchaînement borné piloté par le code, ou agent autonome ? | Enchaînement borné (le modèle extrait et note, le code consulte, enregistre et compte) ; l'agent autonome est une autre demande. |
| Q-27 | Un code à chaque connexion (EF-AUT-16) peut approcher le palier gratuit de Resend (100 e-mails par jour) si plusieurs comptes de test se connectent souvent le même jour. (v1.36, BES-49) | Accepté le temps des tests (peu de comptes) ; à revoir avant une mise en production avec plus d'utilisateurs — palier payant, ou code demandé seulement sur un appareil non reconnu. |

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
| EF-AUT-14 | À la création d'un compte, le système doit envoyer par e-mail (Resend) un lien ou un code d'activation à usage unique, valable un temps limité ; la connexion est refusée tant qu'il n'est pas confirmé. (v1.36, BES-49) | M | EXM-18 | T | Connexion avant confirmation : refusée avec un message invitant à activer le compte ; lien ou code expiré : refusé ; confirmation dans le délai : compte activé. |
| EF-AUT-15 | Le candidat peut demander un nouvel envoi du lien ou du code d'activation si le précédent a expiré ou n'est pas arrivé, avec une limite de fréquence anti-abus. (v1.36, BES-49) | S | EXM-18 | T | Trois demandes en une minute pour la même adresse : la quatrième est refusée (429), sans indiquer si l'adresse existe. |
| EF-AUT-16 | Après une adresse et un mot de passe corrects, l'utilisateur doit saisir un code à usage unique de six chiffres envoyé par e-mail (Resend), valable un temps limité, avant que la session ne s'ouvre. (v1.36, BES-49) | M | EXM-18 | T | Code absent, faux ou expiré : pas de session, réponse 401 ; code correct dans le délai : session ouverte (EF-AUT-03). |
| EF-AUT-17 | Le candidat peut demander un nouvel envoi du code de connexion si le précédent a expiré ou n'est pas arrivé, avec une limite de fréquence anti-abus. (v1.36, BES-49) | S | EXM-18 | T | Trois demandes en une minute pour la même tentative de connexion : la quatrième est refusée (429). |
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
| BES-42 | EXM-15 | EF-EXE-06 |
| BES-43 | EXM-16 | EF-CVX-21 à 35, RG-21, RG-22, RG-23, ENF-RGP-06, 07, 08, ENF-SEC-22, ENF-PERF-08 |
| BES-44 | EXM-16 | RG-24, EF-CVX-36, 37, 38, ENF-UTI-05, 06, 07 (EF-CVX-24 et 29 précisées) |
| BES-45 | EXM-01, EXM-02, EXM-04 | RG-25, RG-26, EF-CAN-18 à 24 ; RG-01 à 05, RG-07, RG-20, EF-CAN-01 modifiées |
| BES-46 | EXM-05, EXM-06, EXM-11 | EF-VEI-29 à 42, RG-27, ENF-COL-05, ENF-SEC-23, ENF-RGP-09, 10, 11 ; EF-VEI-08, RG-08, RG-09, RG-19, ENF-RGP-05 modifiées |
| BES-47 | EXM-04, EXM-09 | EF-TDB-12 ; EF-TDB-07 et EF-CAN-17 modifiées |
| BES-35 | EXM-01 | EF-CFG-05, EF-CFG-02 (retirée de l'écran) |
| BES-48 | EXM-17 | EF-VEI-43 à 55, EF-CVX-39 à 44, EF-IA-07 à 15, EF-EXE-07, 08, EF-CFG-06 à 09, RG-28 à 31, ENF-COU-02, ENF-FIA-11, ENF-RGP-12, 13, 14, ENF-SEC-24, 25, ENF-PERF-09, ENF-COL-06, ENF-MAI-09 ; EF-VEI-06, 10, 31, 42, EF-IA-02, 05, EF-CFG-05, RG-09, RG-13, C-03, ENF-RGP-02, 05, 06, 08, ENF-MAI-07 modifiées |
| BES-50 | EXM-01 | RG-17 précisée |
| BES-51 | EXM-16 | RG-21 précisée |
| BES-53 | EXM-01 | RG-17 précisée |

La traçabilité fine exigence → tâche → test est tenue à jour dans `docs/TRACABILITE.md`.
