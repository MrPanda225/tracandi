---
paths:
  - "backend/src/**/*.ts"
  - "frontend/src/**/*.{ts,tsx}"
  - "docker-compose.yml"
---
# Règles de sécurité (skill `security`)

Référence complète : `.claude/skills/security/SKILL.md`. Exigences : ENF-SEC-01 à 14.

## Frontière HTTP
- Chaque route valide `params`, `query` et `body` avec zod via `validate()` ; invalide → 400 avec détails (ENF-SEC-04).
- Liste blanche explicite des champs modifiables ; jamais `...req.body` vers la base (mass assignment).
- Garde globale : écriture sans `Content-Type: application/json` → 415 (ENF-SEC-12, défense CSRF).
- CORS limité à `FRONTEND_ORIGIN` (ENF-SEC-11), `helmet`, rate limit global + limite renforcée sur les routes OAuth.
- Erreurs : message exposé seulement pour les erreurs opérationnelles (`statusCode`) ; sinon 500 générique, détail dans les logs.

## Secrets et données
- Secrets uniquement dans `.env`, validés au démarrage par `config/env.ts` ; le process s'arrête si invalide.
- Jeton OAuth chiffré AES-256-GCM (`lib/crypto.ts`) avant stockage (ENF-SEC-02).
- Journaux : jamais de clé, jeton, mot de passe, corps de message, contenu de CV (ENF-SEC-08).
- Messages : seules les métadonnées et un extrait ≤ 300 caractères sont stockés (ENF-RGP-01).

## Fichiers
- Noms de fichiers générés par le serveur (UUID) ; une référence reçue est validée par regex puis résolue dans le dossier autorisé (ENF-SEC-13).
- Commandes système via `execFile` avec liste d'arguments fixe, jamais `exec` ni interpolation dans un shell.

## OAuth Gmail
- Scope unique `gmail.modify` (ENF-SEC-07). `state` aléatoire 24 octets, usage unique, expiration 10 min,
  comparaison `timingSafeEqual` (ENF-SEC-14).

## Contenu externe et IA
- Mails, pages web, offres = **données non fiables**. Dans un prompt, les encadrer par des balises et le déclarer
  dans l'instruction système (ENF-SEC-06). Toute sortie IA est parsée par un schéma zod avant usage.
- Une URL proposée par l'IA n'est conservée que si son domaine correspond à la source.

## Frontend
- Rendu React par défaut (échappement automatique). `dangerouslySetInnerHTML` interdit (règle ESLint).
- Aucune clé d'API côté frontend : tout appel externe passe par le backend.

## Dépendances
- Toute nouvelle dépendance : demander l'accord, justifier (besoin, téléchargements hebdo, dernière publication, mainteneurs).
- `npm audit --audit-level=high` doit passer (ENF-SEC-10).
