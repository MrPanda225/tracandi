#!/bin/sh
# ⚠ DESTRUCTIF : remplace la base tracandi par le contenu d'une sauvegarde (UC-06).
# Toujours lancer restore-check.sh sur l'archive avant. Demande une confirmation explicite.
# Usage : scripts/db/restore.sh backups/tracandi_AAAA-MM-JJ_HH-MM-SS.sql.gz
set -eu

ARCHIVE="${1:?Usage: restore.sh <archive.sql.gz>}"
MYSQL_EXEC="${MYSQL_EXEC-docker compose exec -T db}"
OPTIONS_FILE="${OPTIONS_FILE:-/etc/mysql/restore.cnf}"   # compte disposant des droits DDL sur tracandi

[ -f "$ARCHIVE" ] || { echo "Archive not found: $ARCHIVE" >&2; exit 1; }
gzip -t "$ARCHIVE"

printf 'This will REPLACE the tracandi database with %s.\nType RESTORE to continue: ' "$ARCHIVE"
read -r CONFIRM
[ "$CONFIRM" = "RESTORE" ] || { echo "Aborted"; exit 1; }

echo "[$(date -Iseconds)] Safety dump of current state before restore"
BACKUP_DIR="$(dirname "$ARCHIVE")" "$(dirname "$0")/backup.sh"

echo "[$(date -Iseconds)] Restoring $ARCHIVE"
# shellcheck disable=SC2086
gunzip -c "$ARCHIVE" | $MYSQL_EXEC mysql --defaults-extra-file="$OPTIONS_FILE"
echo "[$(date -Iseconds)] Restore done — stop the backend during restore and run npm run db:migrate afterwards"
