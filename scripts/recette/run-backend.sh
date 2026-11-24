#!/usr/bin/env bash
# Backend de recette locale : toutes les pages, sans Neon ni clé réelle. À utiliser à la place de `npm run dev`, qui
# charge ../.env (base de production, clés IA, OAuth Google).
# 1. démarre la base de recette (db.sh up) et applique les migrations (migrate.sh) ;
# 2. lance src/server.ts sous `env -i` avec des réglages fictifs, ENABLED_FEATURES=watch,cv (toutes les pages) ;
# 3. charge preload.mjs : Resend → fichier .run/mails.jsonl, Groq → réponses enregistrées, tout autre appel sortant
#    bloqué (.run/blocked.jsonl).
# Usage : scripts/recette/run-backend.sh   (API sur http://127.0.0.1:${RECETTE_API_PORT:-4000})
set -euo pipefail
# shellcheck source=scripts/recette/env.sh
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

"$RECETTE_SCRIPTS/db.sh" up
"$RECETTE_SCRIPTS/migrate.sh"
mkdir -p "$RECETTE_RUN_DIR"
assert_recette_url "$RECETTE_DB_URL"

cd "$RECETTE_ROOT/backend"
recette_log "backend sur http://127.0.0.1:${RECETTE_API_PORT} — e-mails captés dans $RECETTE_RUN_DIR/mails.jsonl"
# Valeurs fictives : elles satisfont la validation de la configuration, aucune n'ouvre un service réel.
# CRON_SCRAPER une fois l'an : la veille ne part pas seule (ses appels sortants seraient bloqués de toute façon).
exec env -i PATH="$PATH" HOME="$HOME" RECETTE_RUN_DIR="$RECETTE_RUN_DIR" \
  HOST=127.0.0.1 PORT="$RECETTE_API_PORT" FRONTEND_ORIGIN="http://127.0.0.1:${RECETTE_WEB_PORT}" COOKIE_SECURE=true \
  DATABASE_URL_APP="$RECETTE_DB_URL" \
  GROQ_API_KEY=gsk_faux_recette GROQ_MODEL_1=faux-groq-1 \
  RESEND_API_KEY=re_faux_recette \
  GOOGLE_CLIENT_ID=faux.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=faux \
  GOOGLE_REDIRECT_URI="http://localhost:${RECETTE_API_PORT}/api/gmail/callback" \
  TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  ENABLED_FEATURES=watch,cv CV_ANALYSES_PER_DAY=0 \
  CRON_SCRAPER='0 3 1 1 *' \
  node --import "$RECETTE_SCRIPTS/preload.mjs" --import tsx src/server.ts
