#!/usr/bin/env bash
# Sauvegarde logique quotidienne de la base Tracandi (ENF-FIA-04, ENF-FIA-06, ENF-FIA-08, ENF-SEC-15, ENF-SEC-17).
#
# - pg_dump au format custom compressé (instantané cohérent : une seule transaction en lecture), rôle en lecture
#   seule tracandi_backup (URL DATABASE_URL_BACKUP, lue dans l'environnement ou dans .env, jamais affichée) ;
# - archive écrite sous un nom provisoire, contrôlée (table des matières lisible, au moins une table), puis renommée :
#   une archive tracandi_*.dump est toujours complète ;
# - rétention : archives de plus de KEEP_DAYS jours (30) supprimées, seulement après une sauvegarde réussie ;
# - journal horodaté (UTC) sans secret, sur la sortie standard et dans BACKUP_DIR/backup.log.
#
# Réglages (environnement, sinon .env, sinon défaut) :
#   DATABASE_URL_BACKUP  obligatoire ; postgresql://tracandi_backup:…@<hôte direct Neon>/<base>?sslmode=verify-full
#   BACKUP_DIR           dossier de destination, doit exister (défaut : backups/ du dépôt, créé au besoin)
#                        ex. BACKUP_DIR=/run/media/<utilisateur>/<disque>/tracandi-backups
#   KEEP_DAYS            rétention en jours (défaut 30)
#   PG_CLIENT            auto (défaut), local ou docker (outils de l'image postgres:18)
#
# Codes de retour : 0 OK, 2 configuration (URL absente ou non sûre, dossier absent), 3 échec de pg_dump,
# 4 archive invalide, 5 échec de la rétention (archive du jour valide).
# Usage : scripts/db/backup.sh
set -euo pipefail
umask 077

# shellcheck source=scripts/db/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  [[ $# -eq 0 ]] || fail "$EXIT_USAGE" "usage: backup.sh (no argument; settings come from the environment or .env)"

  local default_dir="$REPO_ROOT/backups"
  BACKUP_DIR="$(read_setting BACKUP_DIR "$default_dir")"
  KEEP_DAYS="$(read_setting KEEP_DAYS 30)"
  [[ "$KEEP_DAYS" =~ ^[1-9][0-9]*$ ]] || fail "$EXIT_CONFIG" "KEEP_DAYS must be a positive integer"
  if [[ "$BACKUP_DIR" == "$default_dir" ]]; then mkdir -p "$BACKUP_DIR"; fi
  # Un disque externe débranché ne doit pas faire écrire la sauvegarde ailleurs : le dossier doit déjà exister.
  require_backup_dir "$BACKUP_DIR"
  LOG_FILE="$BACKUP_DIR/backup.log"

  parse_database_url "$(read_setting DATABASE_URL_BACKUP)" DATABASE_URL_BACKUP
  select_pg_client
  export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-20}"

  local stamp archive partial started
  stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  archive="$BACKUP_DIR/${ARCHIVE_PREFIX}${stamp}${ARCHIVE_SUFFIX}"
  partial="$archive.partial"
  started="$(now_ms)"
  log "Backup started: database=$DB_NAME host=$DB_HOST client=$PG_CLIENT_MODE dir=$BACKUP_DIR"

  # Propriétaires et droits conservés dans l'archive (restauration fidèle vers Neon) ; restore-check les ignore.
  if ! pg_tool pg_dump --dbname="$DB_URL" --format=custom --compress=6 --no-password </dev/null >"$partial"; then
    rm -f "$partial"
    fail "$EXIT_DATABASE" "pg_dump failed (database=$DB_NAME host=$DB_HOST)"
  fi

  local tables
  tables="$(archive_table_count "$partial")" \
    || { rm -f "$partial"; fail "$EXIT_VERIFY" "archive is unreadable (pg_restore --list failed)"; }
  if [[ ! -s "$partial" || "$tables" -lt 1 ]]; then
    rm -f "$partial"
    fail "$EXIT_VERIFY" "archive is empty or unreadable (tables=$tables)"
  fi
  mv "$partial" "$archive"
  log "Backup OK: $archive tables=$tables size=$(du -h "$archive" | cut -f1) duration=$(elapsed_since "$started")"

  apply_retention || fail "$EXIT_RETENTION" "retention failed (today's archive is valid: $archive)"
  return "$EXIT_OK"
}

# Supprime les archives de plus de KEEP_DAYS jours, d'après l'horodatage de leur nom (indépendant des dates du
# système de fichiers, qu'une copie peut changer). Les archives provisoires abandonnées sont aussi retirées.
apply_retention() {
  local cutoff name path removed=0
  cutoff="${ARCHIVE_PREFIX}$(date -u -d "-${KEEP_DAYS} days" +%Y-%m-%dT%H-%M-%SZ)${ARCHIVE_SUFFIX}"
  while IFS= read -r name; do
    path="$BACKUP_DIR/$name"
    if [[ "$name" < "$cutoff" || "$name" == *.partial ]]; then
      rm -f -- "$path" || return 1
      log "Retention: removed $name"
      removed=$((removed + 1))
    fi
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name "${ARCHIVE_PREFIX}????-??-??T??-??-??Z${ARCHIVE_SUFFIX}" \
    -o -name "${ARCHIVE_PREFIX}*${ARCHIVE_SUFFIX}.partial" -mmin +60 \) -printf '%f\n')
  log "Retention: kept archives newer than $KEEP_DAYS days, removed=$removed"
}

main "$@"
