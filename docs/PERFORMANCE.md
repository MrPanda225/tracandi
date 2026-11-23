# Performance — jeu de charge et mesures (T-703)

Exigences : ENF-PERF-01, 02, 04, 05, 06 (cahier des charges §7.1). ENF-PERF-03 est remplacée par ENF-PERF-08
(Atelier CV, mesurée sur `job_runs`, hors de cette tâche).

## Le jeu de charge

`backend/src/db/loadDataset.ts` remplit une base avec des données **fictives et reproductibles**. Une graine fixe
(703 par défaut) donne toujours les mêmes lignes. Aucun appel externe n'est fait.

| Utilisateur | Entreprises | Candidatures | Messages | Sources | Offres |
|---|---|---|---|---|---|
| principal (volume d'ENF-PERF-01) | 200 | 1 000 | 10 000 | 20 | 5 000 |
| chacun des autres (2 par défaut) | 20 | 100 | 1 000 | 2 | 500 |

- **Candidatures** : réparties sur les 12 derniers mois et sur tous les statuts. La part de chaque statut suit un
  tableau de suivi réel : 38 % Envoyée, 22 % Refusée, 20 % Accusé reçu, 12 % Entretien, 5 % À postuler, 3 %
  Proposition. Chaque candidature a l'historique de ses statuts, dans l'ordre de RG-04.
- **Messages** : pour chaque candidature envoyée, le message du candidat, puis une réponse par étape (deux pour un
  entretien). Le reste du volume est fait d'alertes emploi rattachées à aucune candidature, comme dans une vraie
  boîte. Un tiers des réponses et toutes les alertes viennent d'une adresse sans contact (RG-20).
- **Offres** : 1 % d'entre elles attendent encore leur note (RG-31).
- Les noms d'entreprises (« Atelier Conseil », « Cobalt Numérique »…) et les intitulés ont des clés RG-25 et RG-26
  toutes distinctes.
- Les autres utilisateurs sont là pour que chaque requête doive filtrer par utilisateur (EF-AUT-06).

Le premier jeu (T-102 à T-601) donnait neuf accusés de réception par candidature. La lecture des accusés à relire
(EF-GML-20) n'y était donc plus une requête sélective. Le nouveau jeu suit la forme d'une vraie boîte, et cette
requête est servie par `ix_emails_user_category`.

### Remplir une base locale pour une recette

```bash
docker compose up -d db
cd backend
LOAD_DATABASE_URL='postgresql://<rôle>:<mot de passe>@127.0.0.1:5432/tracandi_recette' npm run db:seed:load
```

La base `tracandi_recette` doit exister au préalable : la commande ne la crée pas. Elle :

1. refuse toute base qui n'est pas sur le poste (127.0.0.1, localhost, ::1). Le jeu ne va jamais sur Neon ;
2. applique les migrations ;
3. crée `charge-1@example.test`, `charge-2@example.test`, etc., avec le mot de passe `jeu de charge local`.

Options :

- `--seed <n>` : change la graine ;
- `--users <n>` : change le nombre d'utilisateurs ;
- `--email <adresse>` : donne le volume principal à un compte **existant et vide**. Une testeuse crée son compte
  dans l'application branchée sur cette base locale, puis le remplit. C'est le seul moyen de s'y connecter, car le
  code de connexion part par e-mail.

La commande refuse une base qui contient déjà le jeu, ainsi qu'un compte qui a déjà des candidatures. Les tests
d'intégration recréent `tracandi_test` à chaque passage : pour une recette, il faut une autre base (ici
`tracandi_recette`).

## Méthode

- **Base** : PostgreSQL 18 local (Docker), statistiques rafraîchies par `VACUUM ANALYZE` après le remplissage.
- **ENF-PERF-01, 06** : `tests/integration/load-performance.test.ts` ouvre chaque écran comme le navigateur. Il
  envoie en parallèle les appels que l'écran fait à son ouverture (`frontend/src/api`), au travers de l'API réelle
  (Supertest, session réelle, garde de session comprise). La mesure retenue est la plus lente de 3 ouvertures,
  après une première qui chauffe les caches. Seuils : 1 s pour les données d'un écran (la moitié des 2 s
  d'ENF-PERF-01, l'autre moitié allant au réseau et à l'affichage) et 2 s par route (ENF-PERF-06).
- **ENF-PERF-02** : le même test synchronise 100 nouveaux messages sur la base chargée. Trois sur cinq sont des
  réponses qui se rattachent aux candidatures du jeu (RG-03), les autres des alertes emploi. Gmail et l'IA sont
  simulés et répondent aussitôt : la mesure porte sur le travail de l'application. Le temps des services
  externes est estimé à part, plus bas.
- **ENF-PERF-04** : le SQL de chaque requête est capturé tel que Drizzle l'envoie, puis passé à
  `EXPLAIN (ANALYZE, FORMAT JSON)` ; on cherche un `Seq Scan` sur `applications`, `emails` ou `job_offers`. Les
  contrôles sont dans `load-performance.test.ts` et dans les `*-query-plans.test.ts`.
- **ENF-PERF-05** : `stats-query-plans.test.ts`, chaque requête du tableau de bord sous 50 ms.

## Résultats

Mesures du 23/11/2026, poste de développement (PostgreSQL 18 local sous Docker), volume complet du tableau
ci-dessus. Temps vu par le client, de l'envoi de la requête à la réponse, au travers de l'API réelle.

### Écrans (ENF-PERF-01, ENF-PERF-06)

| Écran | Appels à l'ouverture | Données de l'écran | Route la plus lente | Seuil |
|---|---|---|---|---|
| Tableau de bord | 3 | 12,6 ms | 12,4 ms | 1 s / 2 s |
| Candidatures (liste par défaut) | 1 | 5,8 ms | 5,8 ms | 1 s / 2 s |
| Candidatures, recherche « data » | 1 | 7,4 ms | 7,4 ms | 1 s / 2 s |
| Candidatures du 1er au 15 septembre | 1 | 7,3 ms | 7,2 ms | 1 s / 2 s |
| Candidatures triées par entreprise | 1 | 5,1 ms | 5,1 ms | 1 s / 2 s |
| Détail d'une candidature | 2 | 4,1 ms | 4,0 ms | 1 s / 2 s |
| Offres | 1 | 5,9 ms | 5,9 ms | 1 s / 2 s |
| Sources | 3 | 6,9 ms | 6,8 ms | 1 s / 2 s |
| Réglages | 4 | 5,0 ms | 4,9 ms | 1 s / 2 s |

Le remplissage de la base prend environ 1,5 s. En production, la base Neon ajoute un aller-retour réseau par
requête (estimation : quelques dizaines de millisecondes en Europe, non mesurée ici) : la marge reste de plus d'un ordre de grandeur sous le seuil.

### Synchronisation (ENF-PERF-02)

100 nouveaux messages : 0,4 s, dont 60 réponses rattachées aux candidatures du jeu et 40 alertes.

### Plans des requêtes (`EXPLAIN ANALYZE`, temps d'exécution dans PostgreSQL)

| Requête | Temps | Parcours complet d'une grande table | Index utilisés |
|---|---|---|---|
| Liste par défaut (date de candidature) | 1,3 ms | `emails` (repère « à relancer ») | `ix_applications_applied` |
| Liste triée par entreprise | 1,0 ms | `emails` (repère) | `uq_companies_user_name_key`, `ix_applications_company_activity` |
| Liste d'une période (1er au 15 septembre) | 0,1 ms | aucun | `ix_applications_applied`, `ix_emails_application_received` |
| Liste filtrée « Entretien » (12 %) | 0,9 ms | `emails` (repère) | `ix_applications_status_activity` |
| Liste filtrée « Proposition » (3 %) | 0,1 ms | aucun | `ix_applications_status_activity`, `ix_emails_application_received` |
| Liste filtrée « CDI » | 1,0 ms | `emails` (repère) | `ix_applications_contract_status` |
| Recherche « hublot labs » (une entreprise) | 0,6 ms | `applications` | `ix_emails_application_received` |
| Recherche « data » (40 % des candidatures) | 1,5 ms | `applications`, `emails` | — |
| Détail d'une candidature | 0,05 ms | aucun | `applications_pkey`, `ix_emails_application_received` |
| Messages d'une candidature | 0,02 ms | aucun | `ix_emails_application_received` |
| Accusés de réception à relire (EF-GML-20) | 0,5 ms | aucun | `ix_emails_user_category` |
| Offres à regarder (toutes celles du candidat) | 1,6 ms | `job_offers` | — |
| Tableau de bord, 8 requêtes (ENF-PERF-05) | 0,6 ms au plus | `applications` (agrégats, exemptés) | `ix_status_history_status_changed`, `ix_job_offers_status_score`… |

Les listes complètes (par défaut, par entreprise), les offres du candidat et les agrégats du tableau de bord lisent
par nature tout ce qui appartient au candidat. Ce ne sont pas des requêtes sélectives au sens d'ENF-PERF-04
(EF-CAN-20, Q-17) : elles sont chronométrées.

### Écart constaté sur ENF-PERF-04

Deux cas ne respectent pas la lettre d'ENF-PERF-04, alors que leur temps d'exécution reste sous 2 ms :

1. **Repère « à relancer » (RG-06 v1.22) dans une liste filtrée.** Quand le filtre (statut, contrat, recherche
   large) garde plus de quelques pour cent des candidatures, PostgreSQL évalue l'existence d'une adresse de contact
   en hachant la table `emails` entière. Même avec `enable_seqscan = off`, aucun autre chemin n'existe : aucun
   index ne porte `emails(application_id) WHERE contact_address IS NOT NULL`. Sur un filtre étroit (« Proposition »,
   une période), il passe par `ix_emails_application_received`.
2. **Recherche par sous-chaîne.** La table `applications` du candidat tient en 17 pages. PostgreSQL la lit en
   entier plutôt que d'utiliser les index trigrammes, ce qui est le bon choix à cette taille. Avec
   `enable_seqscan = off`, la requête passe bien par `uq_applications_company_title` et `companies_pkey` : l'index
   existe et serait pris sur une table plus grosse.

Correction proposée pour le premier cas, **non faite ici** : un index partiel
`ix_emails_application_contact ON emails(application_id) WHERE contact_address IS NOT NULL`. Il demande une
migration, et T-904 en porte une en parallèle ; deux migrations en même temps entreraient en conflit de numéro.
Pour le second cas, il faut décider s'il faut préciser ENF-PERF-04 (parcours admis sous un nombre de pages donné) :
c'est une demande de modification du cahier des charges, à arbitrer par le Business Owner.

### ENF-PERF-02 : le temps des services externes

La synchronisation de 100 messages sur la base chargée prend 0,4 s, Gmail et l'IA simulés. En réel :

- lecture Gmail : 5 unités par lecture et 50 unités par seconde (`GMAIL_UNITS_PER_SECOND`), soit 10 s pour
  100 messages ;
- classement : 100 messages font au plus 10 lots de 10 (`CLASSIFY_BATCH_SIZE`), classés 3 à la fois. À environ
  10 s par lot pour un modèle gratuit, il faut environ 40 s ;
- au total, environ 1 minute, sous les 3 minutes demandées. Le pire cas, un modèle saturé qui passe au suivant
  (RG-13), reste borné par le délai maximal de chaque fournisseur (EF-IA-10).
