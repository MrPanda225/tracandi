#!/usr/bin/env bash
# Base PostgreSQL de test des copies de travail (.claude/worktrees/), distincte du service `db` de docker-compose.yml.
# Ses identifiants sont les valeurs par défaut fictives de backend/tests/integration/test-database.ts : aucun .env n'est
# lu ni nécessaire. Base jetable, sans donnée réelle, joignable seulement depuis 127.0.0.1.
# Usage :
#   scripts/test-db/db.sh up      démarre la base (la crée au premier lancement) et vérifie qu'on s'y connecte
#   scripts/test-db/db.sh down    arrête le conteneur (le volume reste)
#   scripts/test-db/db.sh reset   supprime le conteneur ET le volume, puis up
set -euo pipefail
# shellcheck source=scripts/test-db/env.sh
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

container_exists() { docker container inspect "$TEST_COPIES_CONTAINER" >/dev/null 2>&1; }

# pg_isready répond dès que le serveur écoute, même si le rôle attendu n'existe pas : on vérifie une vraie connexion.
wait_for_login() {
  local attempt
  for attempt in $(seq 1 30); do
    if docker exec -e PGPASSWORD="$TEST_COPIES_PASSWORD" "$TEST_COPIES_CONTAINER" \
      psql -h 127.0.0.1 -U "$TEST_COPIES_USER" -d "$TEST_COPIES_NAME" -tAc 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  test_db_fail "connexion impossible après $attempt essais : volume $TEST_COPIES_VOLUME initialisé autrement ? scripts/test-db/db.sh reset"
}

up() {
  command -v docker >/dev/null 2>&1 || test_db_fail "docker introuvable"
  docker info >/dev/null 2>&1 || test_db_fail "Docker ne répond pas : démarrez Docker Desktop, puis relancez"
  if ! container_exists; then
    test_db_log "création de $TEST_COPIES_NAME (conteneur $TEST_COPIES_CONTAINER, port $TEST_COPIES_PORT)"
    docker run -d --name "$TEST_COPIES_CONTAINER" \
      -e POSTGRES_DB="$TEST_COPIES_NAME" -e POSTGRES_USER="$TEST_COPIES_USER" \
      -e POSTGRES_PASSWORD="$TEST_COPIES_PASSWORD" \
      -v "$TEST_COPIES_VOLUME:/var/lib/postgresql" -p "127.0.0.1:${TEST_COPIES_PORT}:5432" \
      "$TEST_COPIES_IMAGE" >/dev/null
  else
    docker start "$TEST_COPIES_CONTAINER" >/dev/null
  fi
  wait_for_login
  test_db_log "base prête : 127.0.0.1:${TEST_COPIES_PORT}/${TEST_COPIES_NAME}"
}

down() {
  container_exists && docker stop "$TEST_COPIES_CONTAINER" >/dev/null
  test_db_log "base arrêtée (volume $TEST_COPIES_VOLUME conservé)"
}

reset() {
  container_exists && docker rm -f "$TEST_COPIES_CONTAINER" >/dev/null
  docker volume rm "$TEST_COPIES_VOLUME" >/dev/null 2>&1 || true
  up
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  reset) reset ;;
  *) echo "Usage : $0 up|down|reset" >&2; exit 64 ;;
esac
