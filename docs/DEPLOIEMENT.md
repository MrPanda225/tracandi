# Déploiement — Vercel (interface) et Northflank (API)

Architecture retenue (ADR-15, cahier v1.26) :

```
Navigateur ──HTTPS──▶ Vercel (interface React)
                         └── /api/* relayé ──HTTPS──▶ Northflank (API Node, 1 instance) ──TLS──▶ Neon (PostgreSQL, UE)
```

Le navigateur ne voit qu'**une seule origine**, celle de Vercel : le cookie de session (`SameSite=Strict`), la garde
d'origine et le retour de Google après l'autorisation Gmail fonctionnent sans CORS ni cookie tiers.

Ordre de mise en place : **1. Neon → 2. Northflank → 3. Vercel → 4. Google Cloud → 5. Vérification.**

---

## 0. Intégration et déploiement continus

- **CI** — `.github/workflows/ci.yml`, à chaque PR vers `dev`/`main` et à chaque poussée sur ces branches :
  - `backend` : types, lint, tests unitaires **et d'intégration** (PostgreSQL 18 jetable, jamais Neon), couverture
    ≥ 80 %, audit ;
  - `frontend` : types, lint, tests, build, audit ;
  - `api-image` : construction de `backend/Dockerfile`.
- **CD** — Vercel et Northflank déploient d'eux-mêmes la branche `main` (intégration GitHub de chaque plateforme).
- **La CI est la porte du déploiement** : sur GitHub, *Settings → Branches → Branch protection rules* pour `main` et
  `dev` : « Require a pull request before merging » et « Require status checks to pass » avec les trois vérifications
  `API — types, lint, tests unitaires et d'intégration`, `Interface — types, lint, tests, build` et `Image de l'API
  (Northflank)`. Une branche rouge ne peut alors plus être fusionnée, donc plus être déployée.

## 1. Base Neon (déjà en place)

- Région Union européenne (Francfort), connexion `sslmode=verify-full` (ENF-SEC-15).
- Trois rôles (ARCHITECTURE.md §5) : `tracandi_owner` (migrations), `tracandi_app` (API), `tracandi_backup` (sauvegardes).

## 2. API sur Northflank

### 2.1 Service

- **Type** : *Combined service* (build + déploiement) relié au dépôt GitHub `MrPanda225/tracandi`, branche `main`.
- **Build** : Dockerfile `backend/Dockerfile`, contexte `backend/`.
- **Région** : une région de l'Union européenne (RGPD).
- **Instances** : **1, sans mise à l'échelle automatique**. Le planificateur (synchronisation Gmail toutes les 30 min) et
  la file d'exécution tournent dans le processus : deux instances doubleraient chaque passe.
- **Port** : `4000`, HTTP, **public** (Vercel doit le joindre).
- **Contrôle de santé** : HTTP `GET /api/health` sur le port 4000, attendu `200`.
- **Ressources** : 0,5 vCPU / 1 Go suffisent tant que l'Atelier CV est désactivé (LibreOffice n'est alors jamais lancé).

### 2.2 Variables d'environnement (secrets Northflank)

| Variable | Valeur |
|---|---|
| `DATABASE_URL_APP` | URL Neon du rôle `tracandi_app`, avec `sslmode=verify-full` |
| `FRONTEND_ORIGIN` | `https://<domaine-vercel>` (exactement, sans `/` final) |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `2` (relais de Vercel, puis équilibreur de Northflank — ENF-SEC-21) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | client OAuth du projet Google Cloud |
| `GOOGLE_REDIRECT_URI` | `https://<domaine-vercel>/api/gmail/callback` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` — **à conserver** : la perdre rend les jetons Gmail illisibles |
| `GROQ_API_KEY`, `GROQ_MODEL_1..3` / `GEMINI_*` / `ANTHROPIC_*` | au moins un fournisseur d'IA |
| `ENABLED_FEATURES` | vide (périmètre de production, ENF-MAI-07) |
| `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET` | facultatives, les deux ou aucune : source France Travail de la veille (`docs/SOURCES_OFFICIELLES.md`) |
| `LBA_API_KEY` | facultative : source La bonne alternance de la veille (`docs/SOURCES_OFFICIELLES.md`) |
| `SCHEDULER_TIMEZONE` | `Europe/Paris` |
| `CV_ANALYSES_PER_DAY` | facultatif, `5` par défaut : analyses de l'Atelier CV par candidat et par jour (EF-CVX-33, coût de l'IA). `0` lève la limite : à réserver aux tests |
| `MAX_CONCURRENT_JOBS` | facultatif, `1` par défaut : traitements longs menés en même temps sur tout le serveur (EF-EXE-06). À relever seulement avec un plan plus grand que 256 Mo |

`HOST=0.0.0.0` et `PORT=4000` sont fixés par l'image.

### 2.3 Migrations

Tâche Northflank (*Job*, déclenchée à la main avant chaque déploiement qui apporte une migration) :

- même image que le service ;
- commande : `node dist/db/migrate.js` ;
- variable : `DATABASE_URL_MIGRATOR` (rôle `tracandi_owner`) — **uniquement sur cette tâche**, jamais sur le service.

### 2.4 Adresse publique

Northflank attribue une adresse du type `https://p01--api--xxxx.code.run`. Notez-en l'**hôte** pour l'étape 3.
Le port 4000 doit être en **HTTP** et **Public** : en TCP, Northflank ne l'expose pas.

En production (25/09/2026) : `p01--api--sxm9wcswsc89.code.run`, région Europe - West (Londres, Royaume-Uni, pays
sous décision d'adéquation de la Commission européenne ; mentionné dans la politique de confidentialité).

## 3. Interface sur Vercel

1. **Nouveau projet** depuis le dépôt GitHub, **Root Directory : `frontend`**. `frontend/vercel.json` fixe le reste
   (Vite, `npm ci --ignore-scripts`, sortie `dist`).
2. **Relais de l'API** : dans `frontend/vercel.json`, remplacez `REMPLACER-PAR-L-HOTE-NORTHFLANK` par l'hôte de
   l'étape 2.4, puis commitez. Tant que ce n'est pas fait, le build s'arrête avec un message explicite.
3. **Variables d'environnement** (Production) :

   | Variable | Valeur |
   |---|---|
   | `VITE_LEGAL_PUBLISHER` | nom de l'éditeur (mentions légales) |
   | `VITE_LEGAL_CONTACT` | adresse e-mail de contact |
   | `VITE_LEGAL_HOST` | `Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis` (à vérifier sur vercel.com/legal) |

   `VITE_API_URL` reste **vide** : l'interface appelle `/api`, relayé par Vercel.
4. **Branche de production** : `main`. Les branches `dev` et de tâche obtiennent des déploiements d'aperçu, qui
   n'ont pas d'API dédiée (leurs appels partent vers la même API : ne pas y tester avec de vraies données).
5. (Facultatif) **Domaine** personnalisé : mettez alors à jour `FRONTEND_ORIGIN` et `GOOGLE_REDIRECT_URI` (étape 2.2)
   et les URI autorisées Google (étape 4).

`vercel.json` pose aussi les en-têtes de sécurité (CSP n'autorisant que l'origine du site, HSTS, `X-Frame-Options`,
`Referrer-Policy`) et met en cache un an les ressources à empreinte (`/assets/*`), jamais `index.html`.

**Référencement** (EF-SEO-01) : `robots.txt`, `llms.txt` et `favicon.svg` (dossier `frontend/public/`) sont servis tels
quels, avant le retour à l'application. Une fois le domaine définitif connu, ajoutez à `robots.txt` la ligne
`Sitemap: https://<domaine>/sitemap.xml` avec un `sitemap.xml` des cinq pages publiques, et à `index.html` les balises
`og:url` et `og:image` (adresses absolues), puis déclarez le domaine dans Google Search Console.

## 4. Google Cloud (client OAuth Gmail)

- **URI de redirection autorisée** : `https://<domaine-vercel>/api/gmail/callback`.
- **Origine JavaScript autorisée** : `https://<domaine-vercel>`.
- **Écran de consentement** : liens vers `https://<domaine-vercel>/confidentialite` et `/mentions-legales`.
- Le scope `gmail.modify` est **restreint** : en mode « test », l'autorisation expire tous les 7 jours (Q-11) et seuls
  les comptes de test ajoutés peuvent se connecter. Une ouverture au public demande la **validation Google**
  (vérification de l'application et évaluation de sécurité) ; la politique de confidentialité contient déjà la
  mention d'utilisation limitée exigée.

## 5. Vérification après déploiement

1. `https://<domaine-vercel>/api/health` → `{"status":"ok"}` (le relais fonctionne).
2. `https://<domaine-vercel>/` → page de présentation ; créer un compte, se connecter.
3. Réglages → Connecter Gmail → retour sur Réglages avec « Gmail est connecté ».
4. « Synchroniser maintenant » : l'avancement s'affiche en direct (flux `/api/jobs/stream` à travers le relais).
5. Journaux Northflank : aucune erreur ; la ligne `api listening` indique `features: []`.
6. `https://<domaine-vercel>/robots.txt` et `/llms.txt` renvoient du texte, pas la page de l'application.
7. Lighthouse (mobile) sur `/` et `/connexion` : performance ≥ 90, SEO et bonnes pratiques à 100 (ENF-PERF-07).

## 6. Sauvegardes (T-701)

Exigences : ENF-FIA-04 (sauvegarde logique quotidienne), ENF-FIA-05 (restauration de contrôle automatique),
ENF-FIA-06 (RPO 24 h), ENF-FIA-07 (RTO 30 min), ENF-FIA-08 (conservation 30 jours) ; Q-03 et Q-13 : offre Neon
gratuite, la sauvegarde quotidienne sur le poste de l'exploitant suffit, la restauration Neon à un instant donné
s'ajoute en complément (ADR-10).

| Script | Rôle |
|---|---|
| `scripts/db/backup.sh` | `pg_dump` de Neon vers `BACKUP_DIR`, format custom compressé, `tracandi_<AAAA-MM-JJTHH-MM-SSZ>.dump` (UTC) ; rétention 30 jours |
| `scripts/db/restore-check.sh` | restaure la dernière archive dans une base jetable du PostgreSQL Docker local, compare le nombre de tables à celui de l'archive, affiche quelques comptages et la durée |
| `scripts/db/restore.sh` | ⚠ destructif : remplace le contenu de la base cible (Neon) ; `--yes-i-know` et double confirmation |
| `scripts/db/backup-role.sql` | droits en lecture seule du rôle `tracandi_backup` |
| `scripts/db/tracandi-backup.service`, `.timer` | planification quotidienne (systemd utilisateur) ; `crontab.example` en alternative |

### 6.1 Rôle `tracandi_backup` sur Neon (une fois, à la main)

1. Générer un mot de passe : `openssl rand -hex 24` (hexadécimal : aucun caractère à échapper dans l'URL).
2. Console Neon → *SQL Editor*, base de l'application, **rôle propriétaire des tables** (celui de
   `DATABASE_URL_MIGRATOR`) : `CREATE ROLE tracandi_backup WITH LOGIN PASSWORD '<mot de passe>';`.
   Un rôle créé depuis l'onglet *Roles* de la console est membre de `neon_superuser` : il ne serait pas en lecture
   seule (ENF-SEC-09), d'où la création en SQL.
3. Coller et exécuter `scripts/db/backup-role.sql` dans le même éditeur, avec le même rôle (rejouable).
4. Dans `.env` : `DATABASE_URL_BACKUP=postgresql://tracandi_backup:<mot de passe>@<hôte direct, sans « -pooler »>/<base>?sslmode=verify-full`.
   Le script ajoute `PGSSLROOTCERT=system` (autorités du système) si l'URL ne précise pas `sslrootcert`.

### 6.2 Réglages (`.env` ou environnement)

| Clé | Défaut | Rôle |
|---|---|---|
| `DATABASE_URL_BACKUP` | — | URL du rôle `tracandi_backup` ; jamais affichée, le mot de passe passe par `PGPASSWORD` |
| `BACKUP_DIR` | `backups/` du dépôt | dossier des archives et de `backup.log` ; **doit exister** (disque débranché = échec, jamais d'écriture ailleurs), jamais `/`. Exemple : `BACKUP_DIR=/run/media/<utilisateur>/<disque>/tracandi-backups` |
| `KEEP_DAYS` | `30` | rétention, d'après l'horodatage du nom des archives |
| `PG_CLIENT` | `auto` | `local` (outils du poste, version ≥ 18 exigée), `docker` (outils de l'image `postgres:18`, échange par l'entrée et la sortie standard ; pour une base distante, le magasin d'autorités de l'hôte est monté en lecture seule, l'image n'ayant pas `ca-certificates` ; un `sslrootcert=` dans l'URL exige `local`) ; `auto` choisit `local` si `pg_dump --version` ≥ 18 |
| `CHECK_DB` | `tracandi_restore_check` | base jetable du contrôle, supprimée après (`KEEP_CHECK_DB=1` la garde) ; jamais `tracandi_test` |
| `TEST_DB_*` | `docker-compose.yml` | PostgreSQL local du contrôle ; hôte `127.0.0.1` exigé |
| `RESTORE_DATABASE_URL` | `DATABASE_URL_MIGRATOR` | cible de `restore.sh` (rôle propriétaire) |

Disque externe : en NTFS ou exFAT, les droits Unix (fichiers en `600`) ne s'appliquent pas ; les archives contiennent
les données personnelles des utilisatrices (RGPD) : ranger le disque, ou le chiffrer.

Codes de retour, communs aux trois scripts : `0` réussite, `1` usage ou confirmation refusée, `2` configuration
(URL absente ou sans `sslmode=verify-full`, dossier absent, hôte de contrôle non local), `3` échec de `pg_dump` ou de
la restauration, `4` archive ou contrôle invalide, `5` échec de la rétention (archive du jour valide).

### 6.3 Premier essai, à la main

```bash
scripts/db/backup.sh && scripts/db/restore-check.sh
```

Attendu : `Backup OK: … tables=N`, puis `Restore check OK in X s: tables=N/N rows: users=… applications=…`. La
durée affichée est la durée de restauration, à rapprocher du RTO de 30 minutes (ENF-FIA-07). Le PostgreSQL local est
démarré au besoin (`docker compose up -d --wait db`), jamais arrêté.

### 6.4 Planification quotidienne (systemd utilisateur, recommandé)

```bash
mkdir -p ~/.config/systemd/user
sed "s|@REPO_ROOT@|$PWD|g" scripts/db/tracandi-backup.service > ~/.config/systemd/user/tracandi-backup.service
cp scripts/db/tracandi-backup.timer ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now tracandi-backup.timer
loginctl enable-linger "$USER"
```

Chaque jour à 12 h 30 (`Persistent=true` : un passage manqué, poste éteint, est rattrapé au démarrage), sauvegarde
puis contrôle ; en cas d'échec (disque débranché, réseau absent), nouvel essai une heure plus tard, au plus six par
jour, ce qui tient le RPO de 24 h. Suivi : `systemctl --user list-timers tracandi-backup.timer`,
`journalctl --user -u tracandi-backup`, et `BACKUP_DIR/backup.log`. Sans systemd : `scripts/db/crontab.example`
(cron ne rattrape pas un passage manqué).

- La limite de six essais (`StartLimitIntervalSec=1d`, `StartLimitBurst=6`) porte sur une fenêtre glissante de
  24 heures : une fois atteinte, systemd ne relance plus l'unité, même au passage suivant du minuteur. Après avoir
  réglé la cause : `systemctl --user reset-failed tracandi-backup`.
- `loginctl enable-linger` fait tourner le minuteur sans session ouverte, mais **Docker Desktop ne démarre qu'avec
  la session graphique** : sans elle, la sauvegarde réussit (outils du poste) et la restauration de contrôle échoue
  faute de PostgreSQL local, puis elle est réessayée. Ouvrir sa session une fois par jour suffit.

### 6.5 Restauration de la base Neon (incident)

1. `scripts/db/restore-check.sh <archive>` : l'archive se restaure et contient ce qu'on attend.
2. Northflank : service API à 0 instance (plus aucune écriture pendant la restauration).
3. `scripts/db/restore.sh --yes-i-know <archive>` : affiche l'hôte, la base, le nombre de tables et d'utilisateurs
   actuels, demande de retaper le nom de la base puis `RESTAURER`, fait une copie de sécurité
   (`BACKUP_DIR/pre-restore_tracandi_<horodatage>.dump`, jamais supprimée par la rétention), puis restaure en une seule
   transaction (un échec ne change rien).
4. Service `migrate` (Northflank, §2.3) si l'archive est antérieure à la dernière migration, puis API à 1 instance.

Alternative sans archive : restauration Neon à un instant donné (console → *Backup & Restore*), dans la fenêtre de
l'offre gratuite.

## Limites connues

- **Aperçus Vercel** : ils partagent l'API de production (relais figé dans `vercel.json`) ; leur origine diffère de
  `FRONTEND_ORIGIN`, donc l'API refuse leurs écritures (garde d'origine) — voulu.
- **Flux en direct** : si un relais coupe une connexion longue, le navigateur la rouvre seul (`EventSource`).
- **Sauvegardes** : poste de l'exploitant allumé au moins une fois par jour (RPO 24 h) ; la restauration de contrôle
  n'est jamais faite sur Neon, seulement dans le PostgreSQL Docker local.

## Recette locale (toutes les pages, sans Neon)

Pour les recettes des agents et du Business Owner : `scripts/recette/` (mode d'emploi : `scripts/recette/README.md`).
Base PostgreSQL dédiée en Docker (`127.0.0.1:5435`), `ENABLED_FEATURES=watch,cv`, e-mails captés dans un fichier,
IA simulée par les réponses enregistrées des tests, tout autre appel sortant bloqué.

```bash
scripts/recette/run-backend.sh          # base + migrations + API sur :4000
scripts/recette/run-frontend.sh         # interface sur :5173
scripts/recette/last-mail.sh            # lien d'activation ou code de connexion du dernier e-mail
```

**Jamais `npm run db:migrate` ni `npm run dev` (backend) pour une recette** : ils chargent `../.env`, donc la base de
production.
