#!/usr/bin/env bash
# Interface de recette : Vite avec la configuration de frontend/, sur RECETTE_WEB_PORT (5173), relais /api vers l'API
# de recette (RECETTE_API_PORT, 4000). Vite ne lit pas le .env de la racine : aucun secret n'y passe.
# Usage : scripts/recette/run-frontend.sh   (interface sur http://127.0.0.1:${RECETTE_WEB_PORT:-5173})
set -euo pipefail
# shellcheck source=scripts/recette/env.sh
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

cd "$RECETTE_ROOT/frontend"
[[ -x node_modules/.bin/vite ]] || recette_fail "dépendances absentes : (cd frontend && npm ci --ignore-scripts)"
recette_log "interface sur http://127.0.0.1:${RECETTE_WEB_PORT} (API http://127.0.0.1:${RECETTE_API_PORT})"
exec env RECETTE_API_PORT="$RECETTE_API_PORT" RECETTE_WEB_PORT="$RECETTE_WEB_PORT" \
  node_modules/.bin/vite --config "$RECETTE_SCRIPTS/vite.config.mjs"
