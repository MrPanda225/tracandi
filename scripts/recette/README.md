# Recette locale : toute l'application, sans Neon ni clé réelle

Ce harnais fait tourner **toutes les pages** de Tracandi sur le poste, pour les recettes des agents et du Business
Owner : tableau de bord, candidatures, Atelier CV, sites surveillés, offres, réglages (`ENABLED_FEATURES=watch,cv`).
Il ne touche jamais à la base Neon de production ni aux clés de l'exploitant, et il ne modifie aucune ligne du code
de l'application.

> **⚠ Pour une recette, n'utilisez jamais `npm run db:migrate` ni `npm run dev` (backend).** Ces deux commandes
> chargent `../.env`, c'est-à-dire la base Neon de production (données réelles des utilisatrices) et les vraies clés
> d'IA. Utilisez `scripts/recette/migrate.sh` et `scripts/recette/run-backend.sh`, qui vident l'environnement
> (`env -i`) et refusent toute URL de base autre que la base locale de recette.

## Ce que fait le harnais

| Fichier | Rôle |
|---|---|
| `db.sh` | Base PostgreSQL 18 **propre à la recette** : conteneur `tracandi-recette-db`, volume `tracandi-recette-data`, port `127.0.0.1:5435`, base `tracandi_recette`, rôle `recette`. Distincte du service `db` de `docker-compose.yml` (tests d'intégration). |
| `migrate.sh` | Migrations Drizzle sur la base de recette, sous `env -i`, URL contrôlée (`127.0.0.1:5435/tracandi_recette` seulement). |
| `run-backend.sh` | Démarre la base, migre, puis lance l'API sur `http://127.0.0.1:4000` avec des réglages fictifs et `preload.mjs`. |
| `run-frontend.sh` | Lance l'interface (Vite) sur `http://127.0.0.1:5173`, relais `/api` vers l'API de recette (`vite.config.mjs`). |
| `preload.mjs` | Chargé par `node --import` : intercepte Resend, Groq et tout appel sortant (détail ci-dessous). |
| `last-mail.sh` | Affiche le dernier e-mail capté : lien d'activation ou code de connexion. |
| `launch.example.json` | Configuration des deux serveurs pour l'aperçu de Claude Code (`preview_start`). |

`preload.mjs` remplace, dans le seul processus de l'API :
- **Resend** : aucun e-mail n'est envoyé ; chacun est écrit dans `scripts/recette/.run/mails.jsonl` ;
- **Groq** : un faux modèle local répond avec les réponses enregistrées de `backend/tests/fixtures/llm/`, ou une
  réponse construite à partir de la demande (notes des offres, intitulé d'une offre collée, CV adapté) ; chaque appel
  est noté dans `.run/llm-calls.jsonl` ;
- **tout autre hôte** non local (par `fetch` comme par `http(s).request`) : refusé, noté dans `.run/blocked.jsonl`.

Le dossier `.run/` n'est jamais commité.

## Lancer

Prérequis : Docker démarré, `(cd backend && npm ci --ignore-scripts)` et `(cd frontend && npm ci --ignore-scripts)`.

```bash
scripts/recette/run-backend.sh          # base + migrations + API sur :4000 (reste au premier plan)
scripts/recette/run-frontend.sh         # interface sur http://127.0.0.1:5173, dans un autre terminal
```

Ports déjà pris (une autre recette tourne) : choisir les deux ports, les mêmes pour les deux commandes.

```bash
RECETTE_API_PORT=4001 RECETTE_WEB_PORT=5174 scripts/recette/run-backend.sh
RECETTE_API_PORT=4001 RECETTE_WEB_PORT=5174 scripts/recette/run-frontend.sh
```

Deux recettes en parallèle partagent la même base de recette (mêmes comptes, mêmes données).

Dans Claude Code : copier `scripts/recette/launch.example.json` en `.claude/launch.json` (fichier non suivi), puis
démarrer `recette-backend` et `recette-frontend` avec `preview_start`.

`npm --prefix frontend run dev` convient aussi quand l'API de recette est sur le port 4000 : Vite ne lit pas le `.env`
de la racine et relaie `/api` vers `127.0.0.1:4000`.

## Compte de test

La base de recette est vide au premier lancement : créez un compte depuis l'écran d'inscription, avec une adresse
fictive (par exemple `recette@example.test`) et un mot de passe de votre choix, propre à la recette.

Le bandeau cookies, tant qu'il n'est pas fermé (« Compris »), peut masquer un bouton en affichage mobile.

1. Inscription : l'e-mail d'activation est capté. `scripts/recette/last-mail.sh` affiche le **lien d'activation** :
   l'ouvrir dans le navigateur.
2. Connexion : après le mot de passe, l'écran demande un code à 6 chiffres. `scripts/recette/last-mail.sh` affiche le
   **code de connexion**.

Le compte reste dans le volume de la recette d'une séance à l'autre (jusqu'à `db.sh reset`).

## Simuler l'IA en panne

```bash
touch scripts/recette/.run/ia-down      # le faux Groq répond 503 à chaque appel
rm scripts/recette/.run/ia-down         # retour à la normale
```

Attendu : après les nouvelles tentatives du routeur, un message du type « Aucun service d'IA n'a pu traiter la
demande. Réessayez dans quelques minutes. »

## Réinitialiser

```bash
scripts/recette/db.sh reset             # supprime le conteneur ET le volume de la recette (données fictives), puis recrée
scripts/recette/db.sh down              # arrête seulement le conteneur
```

### Piège connu : le volume des tests d'intégration

Le service `db` de `docker-compose.yml` crée son rôle (`POSTGRES_USER`) **une seule fois**, à la création du volume
`tracandi_pg-test-data`. Si `TEST_DB_USER` a changé depuis (par exemple dans `.env`), le conteneur démarre, son
contrôle de santé reste vert (`pg_isready` ne vérifie pas le rôle), mais `npm run test:integration` ne peut pas se
connecter. C'est pourquoi la recette a sa propre base. Pour remettre les tests d'intégration d'aplomb (le volume ne
contient que des données de test) :

```bash
docker compose rm -sf db                # arrête et supprime le conteneur db (pas les autres services)
docker volume rm tracandi_pg-test-data  # supprime le volume de test : il sera recréé avec le rôle actuel
docker compose up -d db
```

Vérifier avant que personne n'utilise la base de test (autres sessions, autres terminaux).

## Ce qui n'est pas couvert

- **La qualité d'une vraie IA** : le faux modèle renvoie des réponses enregistrées ; les écrans et les enchaînements
  sont vérifiés, pas la pertinence des structurations, diagnostics, CV adaptés, notes ou relances.
- **Gmail** : identifiants Google fictifs, appels sortants bloqués ; connexion, synchronisation et libellés ne peuvent
  pas aboutir. L'écran Réglages s'affiche, avec Gmail non connecté.
- **La veille réelle** : la collecte des sites carrières est bloquée (appels sortants refusés), le passage planifié est
  repoussé une fois l'an (`CRON_SCRAPER`) ; les écrans Sites et Offres s'affichent, vides tant qu'aucune offre n'est
  saisie.
- **Les e-mails** : rien n'est envoyé, le contenu est lu dans `.run/mails.jsonl`.
- **OCR et nombre de pages du CV Word** : dépendent de `tesseract` et de LibreOffice, présents dans l'image de l'API et
  la CI, pas forcément sur le poste.
