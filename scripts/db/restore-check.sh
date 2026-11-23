#!/usr/bin/env bash
# Restauration de contrôle d'une sauvegarde dans le PostgreSQL LOCAL de Docker (ENF-FIA-05, ENF-FIA-07, ADR-12).
# Ne touche jamais la base distante : l'hôte de contrôle doit être la boucle locale.
#
# 1. recrée la base jetable CHECK_DB (défaut tracandi_restore_check) sur le PostgreSQL local ;
# 2. y restaure l'archive (sans propriétaires ni droits, rôles Neon absents en local), en s'arrêtant à la première
#    erreur ;
# 3. compare le nombre de tables restaurées à celui de la table des matières de l'archive, affiche quelques comptages
#    de lignes et la durée de restauration (à rapprocher du RTO de 30 min, ENF-FIA-07) ;
# 4. supprime la base de contrôle (KEEP_CHECK_DB=1 la garde pour examen).
#
# Réglages (environnement, sinon .env, sinon défaut) : BACKUP_DIR (comme backup.sh), CHECK_DB,
# TEST_DB_HOST / TEST_DB_PORT / TEST_DB_USER / TEST_DB_PASSWORD (base Docker locale, docker-compose.yml),
# EXPECTED_MIN_TABLES (défaut 1), PG_CLIENT (comme backup.sh).
# Si le PostgreSQL local ne répond pas, `docker compose up -d --wait db` est tenté une fois.
#
# Codes de retour : 0 OK, 1 usage, 2 configuration (archive introuvable, hôte non local), 3 restauration en échec,
# 4 vérification en échec (tables manquantes).
# Usage : scripts/db/restore-check.sh [archive.dump]   (défaut : la plus récente de BACKUP_DIR)
set -euo pipefail
umask 077

# shellcheck source=scripts/db/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Tables dont le nombre de lignes est affiché (contrôle de vraisemblance, sans donnée personnelle).
readonly COUNTED_TABLES=(users applications companies emails job_offers)

main() {
  [[ $# -le 1 ]] || fail "$EXIT_USAGE" "usage: restore-check.sh [archive.dump]"
  local backup_dir archive
  backup_dir="$(read_setting BACKUP_DIR "$REPO_ROOT/backups")"
  archive="${1:-$(latest_archive "$backup_dir")}"
  [[ -n "$archive" && -f "$archive" ]] || fail "$EXIT_CONFIG" "no backup archive found (BACKUP_DIR=$backup_dir)"

  local check_db host port user password min_tables
  check_db="$(read_setting CHECK_DB tracandi_restore_check)"
  host="$(read_setting TEST_DB_HOST 127.0.0.1)"
  port="$(read_setting TEST_DB_PORT 5432)"
  user="$(read_setting TEST_DB_USER tracandi_test)"
  password="$(read_setting TEST_DB_PASSWORD tracandi_test)"
  min_tables="$(read_setting EXPECTED_MIN_TABLES 1)"
  [[ "$check_db" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || fail "$EXIT_CONFIG" "CHECK_DB must be a plain lowercase identifier"
  [[ "$check_db" != "$(read_setting TEST_DB_NAME tracandi_test)" ]] \
    || fail "$EXIT_CONFIG" "CHECK_DB must not be the integration test database"
  case "$host" in
    127.0.0.1 | localhost) ;;
    *) fail "$EXIT_CONFIG" "TEST_DB_HOST must be the local Docker database (127.0.0.1)" ;;
  esac
  [[ "$port" =~ ^[0-9]+$ ]] || fail "$EXIT_CONFIG" "TEST_DB_PORT must be a number"
  # Les NOTICE du serveur (« database … does not exist, skipping ») n'encombrent pas le journal.
  export PGPASSWORD="$password" PGCONNECT_TIMEOUT=10 PGOPTIONS='-c client_min_messages=warning'
  select_pg_client

  local admin_url="postgresql://${user}@${host}:${port}/postgres"
  local check_url="postgresql://${user}@${host}:${port}/${check_db}"
  ensure_local_database_up "$host" "$port"

  log "Restore check started: archive=$archive into $check_db (host=$host port=$port client=$PG_CLIENT_MODE)"
  local started expected
  started="$(now_ms)"
  expected="$(archive_table_count "$archive")"

  pg_tool psql --dbname="$admin_url" --no-psqlrc --quiet -v ON_ERROR_STOP=1 </dev/null \
    --command="DROP DATABASE IF EXISTS \"$check_db\" WITH (FORCE)" --command="CREATE DATABASE \"$check_db\"" \
    || fail "$EXIT_DATABASE" "cannot recreate $check_db on the local database"
  if ! pg_tool pg_restore --dbname="$check_url" --no-owner --no-privileges --exit-on-error --single-transaction \
    --no-password <"$archive"; then
    fail "$EXIT_DATABASE" "pg_restore failed into $check_db (archive=$archive)"
  fi
  local duration
  duration="$(elapsed_since "$started")"

  local restored counts=""
  restored="$(query "$check_url" "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")"
  local table
  for table in "${COUNTED_TABLES[@]}"; do
    if [[ "$(query "$check_url" "SELECT to_regclass('public.$table') IS NOT NULL")" == t ]]; then
      counts+=" $table=$(query "$check_url" "SELECT count(*) FROM public.$table")"
    fi
  done

  if [[ "${KEEP_CHECK_DB:-0}" != 1 ]]; then
    pg_tool psql --dbname="$admin_url" --no-psqlrc --quiet </dev/null \
      --command="DROP DATABASE IF EXISTS \"$check_db\" WITH (FORCE)" >/dev/null || true
  fi

  if [[ "$restored" -ne "$expected" || "$restored" -lt "$min_tables" ]]; then
    fail "$EXIT_VERIFY" "restore check failed: tables=$restored, archive lists $expected, expected >= $min_tables"
  fi
  log "Restore check OK in $duration: tables=$restored/$expected rows:$counts"
  return "$EXIT_OK"
}

# Une valeur scalaire, sans en-tête ni alignement.
query() {
  pg_tool psql --dbname="$1" --no-psqlrc --tuples-only --no-align -v ON_ERROR_STOP=1 --command="$2" </dev/null
}

# Le PostgreSQL local répond, sinon le service Docker `db` est démarré une fois (jamais arrêté ici).
ensure_local_database_up() {
  if pg_tool pg_isready --host="$1" --port="$2" --quiet </dev/null; then return 0; fi
  log "Local database not ready: docker compose up -d --wait db"
  docker compose --file "$REPO_ROOT/docker-compose.yml" up -d --wait db >/dev/null 2>&1 \
    || fail "$EXIT_CONFIG" "local Docker database unavailable (docker compose up -d db)"
}

main "$@"
