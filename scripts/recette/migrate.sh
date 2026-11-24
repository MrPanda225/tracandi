#!/usr/bin/env bash
# Migrations sur la base de RECETTE uniquement. À utiliser à la place de `npm run db:migrate`, qui charge ../.env et
# viserait donc la base Neon de production.
# - environnement vidé (`env -i`) : aucune variable de l'exploitant ne passe, .env n'est pas chargé ;
# - URL construite ici et contrôlée (assert_recette_url) : seule 127.0.0.1:<port>/tracandi_recette est admise.
# Usage : scripts/recette/migrate.sh
set -euo pipefail
# shellcheck source=scripts/recette/env.sh
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

assert_recette_url "$RECETTE_DB_URL"
cd "$RECETTE_ROOT/backend"
[[ -x node_modules/.bin/tsx ]] || recette_fail "dépendances absentes : (cd backend && npm ci --ignore-scripts)"
recette_log "migrations sur $RECETTE_DB_NAME (127.0.0.1:${RECETTE_DB_PORT})"
env -i PATH="$PATH" HOME="$HOME" DATABASE_URL_MIGRATOR="$RECETTE_DB_URL" \
  node --import tsx src/db/migrate.ts
