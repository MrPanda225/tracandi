#!/usr/bin/env bash
# Base PostgreSQL de la recette locale (conteneur Docker dédié, volume dédié, port 5435 par défaut).
# Usage :
#   scripts/recette/db.sh up      démarre la base (la crée au premier lancement) et vérifie qu'on s'y connecte
#   scripts/recette/db.sh reset   supprime le conteneur ET le volume de la recette (données fictives perdues), puis up
#   scripts/recette/db.sh down    arrête le conteneur (les données restent dans le volume)
set -euo pipefail
# shellcheck source=scripts/recette/env.sh
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

container_exists() { docker container inspect "$RECETTE_DB_CONTAINER" >/dev/null 2>&1; }

up() {
  command -v docker >/dev/null 2>&1 || recette_fail "docker introuvable"
  docker info >/dev/null 2>&1 || recette_fail "Docker ne répond pas : démarrez Docker Desktop, puis relancez"
  if ! container_exists; then
    recette_log "création de la base $RECETTE_DB_NAME (conteneur $RECETTE_DB_CONTAINER, port $RECETTE_DB_PORT)"
    docker run -d --name "$RECETTE_DB_CONTAINER" \
      -e POSTGRES_DB="$RECETTE_DB_NAME" -e POSTGRES_USER="$RECETTE_DB_USER" -e POSTGRES_PASSWORD="$RECETTE_DB_PASSWORD" \
      -v "$RECETTE_DB_VOLUME:/var/lib/postgresql" -p "127.0.0.1:${RECETTE_DB_PORT}:5432" \
      "$RECETTE_DB_IMAGE" >/dev/null
  else
    docker start "$RECETTE_DB_CONTAINER" >/dev/null
  fi
  wait_for_login
  recette_log "base prête : 127.0.0.1:${RECETTE_DB_PORT}/${RECETTE_DB_NAME}"
}

# pg_isready dit « prêt » dès que le serveur écoute, même si le rôle attendu n'existe pas (volume initialisé avec un
# autre POSTGRES_USER) : on vérifie une vraie connexion avec le rôle de la recette.
wait_for_login() {
  local attempt
  for attempt in $(seq 1 30); do
    if docker exec -e PGPASSWORD="$RECETTE_DB_PASSWORD" "$RECETTE_DB_CONTAINER" \
      psql -h 127.0.0.1 -U "$RECETTE_DB_USER" -d "$RECETTE_DB_NAME" -tAc 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  recette_fail "connexion impossible avec le rôle $RECETTE_DB_USER : volume $RECETTE_DB_VOLUME initialisé autrement ? scripts/recette/db.sh reset (attempt $attempt)"
}

reset() {
  if container_exists; then docker rm -f "$RECETTE_DB_CONTAINER" >/dev/null; fi
  if docker volume inspect "$RECETTE_DB_VOLUME" >/dev/null 2>&1; then docker volume rm "$RECETTE_DB_VOLUME" >/dev/null; fi
  recette_log "conteneur et volume de la recette supprimés"
  up
}

down() {
  if container_exists; then docker stop "$RECETTE_DB_CONTAINER" >/dev/null; fi
  recette_log "base de recette arrêtée"
}

case "${1:-up}" in
  up) up ;;
  reset) reset ;;
  down) down ;;
  *) recette_fail "usage : db.sh up|reset|down" ;;
esac
