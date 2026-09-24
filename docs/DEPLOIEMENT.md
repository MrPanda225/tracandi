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
| `SCHEDULER_TIMEZONE` | `Europe/Paris` |

`HOST=0.0.0.0` et `PORT=4000` sont fixés par l'image.

### 2.3 Migrations

Tâche Northflank (*Job*, déclenchée à la main avant chaque déploiement qui apporte une migration) :

- même image que le service ;
- commande : `node dist/db/migrate.js` ;
- variable : `DATABASE_URL_MIGRATOR` (rôle `tracandi_owner`) — **uniquement sur cette tâche**, jamais sur le service.

### 2.4 Adresse publique

Northflank attribue une adresse du type `https://p01--api--xxxx.code.run`. Notez-en l'**hôte** pour l'étape 3.

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

## Limites connues

- **Aperçus Vercel** : ils partagent l'API de production (relais figé dans `vercel.json`) ; leur origine diffère de
  `FRONTEND_ORIGIN`, donc l'API refuse leurs écritures (garde d'origine) — voulu.
- **Flux en direct** : si un relais coupe une connexion longue, le navigateur la rouvre seul (`EventSource`).
- **Sauvegardes** : `scripts/db/` est encore en version MySQL jusqu'à T-701 ; Neon garde son propre historique de
  restauration en attendant.
