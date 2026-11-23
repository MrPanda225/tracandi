#!/usr/bin/env bash
# ⚠ DESTRUCTIF : remplace le contenu de la base cible par celui d'une sauvegarde (UC-06, ENF-FIA-07).
# Réservé à l'exploitant, à la main. Claude Code ne l'exécute jamais ailleurs que sur la base Docker locale.
#
# Garde-fous :
# - refus sans l'option --yes-i-know ;
# - affichage de ce qui sera touché (hôte, base, nombre de tables et d'utilisateurs actuels) ;
# - double confirmation : retaper le nom de la base, puis le mot RESTAURER ;
# - copie de sécurité de la base cible avant restauration (pre-restore_tracandi_<horodatage>.dump dans BACKUP_DIR) ;
# - restauration en une seule transaction, arrêtée à la première erreur : en cas d'échec, rien n'est modifié.
#
# Avant : lancer restore-check.sh sur la même archive, arrêter l'API (Northflank : 0 instance).
# Après : appliquer les migrations (service migrate) si l'archive est antérieure à la dernière migration, puis
# relancer l'API.
#
# Réglages : RESTORE_DATABASE_URL (sinon DATABASE_URL_MIGRATOR, rôle propriétaire tracandi_owner), lus dans
# l'environnement ou dans .env, jamais affichés ; BACKUP_DIR (copie de sécurité) ; PG_CLIENT (comme backup.sh).
# --no-owner : n'applique ni propriétaires ni droits (base locale sans les rôles Neon).
#
# Codes de retour : 0 OK, 1 usage ou confirmation refusée, 2 configuration, 3 échec de la copie de sécurité ou de
# la restauration (base inchangée).
# Usage : scripts/db/restore.sh --yes-i-know [--no-owner] <archive.dump>
set -euo pipefail
umask 077

# shellcheck source=scripts/db/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

readonly USAGE="usage: restore.sh --yes-i-know [--no-owner] <archive.dump>"

main() {
  local acknowledged=0 no_owner=0 archive=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes-i-know) acknowledged=1 ;;
      --no-owner) no_owner=1 ;;
      -*) fail "$EXIT_USAGE" "unknown option $1; $USAGE" ;;
      *) [[ -z "$archive" ]] || fail "$EXIT_USAGE" "$USAGE"; archive="$1" ;;
    esac
    shift
  done
  [[ "$acknowledged" == 1 ]] || fail "$EXIT_USAGE" "refused without --yes-i-know (destructive); $USAGE"
  [[ -n "$archive" && -f "$archive" ]] || fail "$EXIT_USAGE" "archive not found; $USAGE"

  local url_name=RESTORE_DATABASE_URL
  [[ -n "$(read_setting RESTORE_DATABASE_URL)" ]] || url_name=DATABASE_URL_MIGRATOR
  parse_database_url "$(read_setting "$url_name")" "$url_name"
  select_pg_client
  export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-20}"

  local backup_dir
  backup_dir="$(read_setting BACKUP_DIR "$REPO_ROOT/backups")"
  [[ -d "$backup_dir" && -w "$backup_dir" ]] || fail "$EXIT_CONFIG" "BACKUP_DIR does not exist or is not writable"
  local tables_in_archive
  tables_in_archive="$(archive_table_count "$archive")"
  [[ "$tables_in_archive" -ge 1 ]] || fail "$EXIT_CONFIG" "archive is unreadable or has no table: $archive"

  describe_target "$archive" "$tables_in_archive"
  confirm "Retapez le nom de la base cible ($DB_NAME) pour continuer : " "$DB_NAME"
  confirm "Dernière confirmation, tapez RESTAURER : " RESTAURER

  local safety
  safety="$backup_dir/pre-restore_${ARCHIVE_PREFIX}$(date -u +%Y-%m-%dT%H-%M-%SZ)${ARCHIVE_SUFFIX}"
  log "Safety dump of the target before restore: $safety"
  pg_tool pg_dump --dbname="$DB_URL" --format=custom --compress=6 --no-password </dev/null >"$safety" \
    || { rm -f "$safety"; fail "$EXIT_DATABASE" "safety dump failed: nothing was restored"; }

  local options=(--dbname="$DB_URL" --clean --if-exists --exit-on-error --single-transaction --no-password)
  [[ "$no_owner" == 0 ]] || options+=(--no-owner --no-privileges)
  local started
  started="$(now_ms)"
  log "Restoring $archive into database=$DB_NAME host=$DB_HOST"
  pg_tool pg_restore "${options[@]}" <"$archive" \
    || fail "$EXIT_DATABASE" "pg_restore failed: transaction rolled back, database unchanged (safety dump: $safety)"
  log "Restore done in $(elapsed_since "$started"): $(target_summary)"
  log "Next: apply pending migrations (migrate service), then restart the API"
  return "$EXIT_OK"
}

# Ce qui sera remplacé (ENF-SEC : afficher avant toute opération destructive).
describe_target() {
  printf 'Cette opération REMPLACE le contenu de la base cible par l archive %s (%s tables).\n' "$1" "$2"
  printf 'Cible : hôte %s, base %s — état actuel : %s\n' "$DB_HOST" "$DB_NAME" "$(target_summary)"
}

target_summary() {
  local tables users="-"
  tables="$(target_query "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")"
  if [[ "$(target_query "SELECT to_regclass('public.users') IS NOT NULL")" == t ]]; then
    users="$(target_query "SELECT count(*) FROM public.users")"
  fi
  printf '%s tables=%s users=%s' "$(target_query "SELECT current_database()")" "$tables" "$users"
}

target_query() {
  pg_tool psql --dbname="$DB_URL" --no-psqlrc --tuples-only --no-align --no-password -v ON_ERROR_STOP=1 \
    --command="$1" </dev/null || fail "$EXIT_DATABASE" "cannot read the target database"
}

# Lit une réponse et sort (EXIT_USAGE) si elle ne vaut pas exactement $2.
confirm() {
  local answer=""
  printf '%s' "$1"
  read -r answer || true
  [[ "$answer" == "$2" ]] || fail "$EXIT_USAGE" "confirmation refused: nothing was changed"
}

main "$@"
