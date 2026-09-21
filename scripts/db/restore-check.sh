#!/bin/sh
# Restaure une sauvegarde dans la base de contrôle jobpilot_restore_check et vérifie son contenu
# (ENF-FIA-05). Ne touche JAMAIS à la base de production.
# Usage : scripts/db/restore-check.sh [archive.sql.gz]   (défaut : la plus récente)
set -eu

BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../../backups}"
MYSQL_EXEC="${MYSQL_EXEC-docker compose exec -T db}"
OPTIONS_FILE="${OPTIONS_FILE:-/etc/mysql/backup.cnf}"
CHECK_DB="jobpilot_restore_check"
EXPECTED_TABLES="${EXPECTED_TABLES:-9}"

ARCHIVE="${1:-$(ls -1t "$BACKUP_DIR"/jobpilot_*.sql.gz 2>/dev/null | head -n 1)}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "No backup archive found" >&2; exit 1; }

echo "[$(date -Iseconds)] Restore check of $ARCHIVE into $CHECK_DB"
START=$(date +%s)

# shellcheck disable=SC2086
$MYSQL_EXEC mysql --defaults-extra-file="$OPTIONS_FILE" -e "DROP DATABASE IF EXISTS $CHECK_DB; CREATE DATABASE $CHECK_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
# Le dump contient "CREATE DATABASE jobpilot / USE jobpilot" : on redirige vers la base de contrôle.
gunzip -c "$ARCHIVE" \
  | sed -e 's/^CREATE DATABASE .*`jobpilot`.*$//' -e "s/^USE \`jobpilot\`;/USE \`$CHECK_DB\`;/" \
  | $MYSQL_EXEC mysql --defaults-extra-file="$OPTIONS_FILE" "$CHECK_DB"

# shellcheck disable=SC2086
TABLES=$($MYSQL_EXEC mysql --defaults-extra-file="$OPTIONS_FILE" -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$CHECK_DB' AND table_type = 'BASE TABLE';")
# shellcheck disable=SC2086
ROWS=$($MYSQL_EXEC mysql --defaults-extra-file="$OPTIONS_FILE" -N -e \
  "SELECT (SELECT COUNT(*) FROM $CHECK_DB.applications), (SELECT COUNT(*) FROM $CHECK_DB.emails), (SELECT COUNT(*) FROM $CHECK_DB.job_offers);")

DURATION=$(( $(date +%s) - START ))
if [ "$TABLES" -lt "$EXPECTED_TABLES" ]; then
  echo "[$(date -Iseconds)] ERROR restore check failed: $TABLES tables, expected >= $EXPECTED_TABLES" >&2
  exit 1
fi
echo "[$(date -Iseconds)] Restore check OK in ${DURATION}s — tables=$TABLES applications/emails/offers=$(echo "$ROWS" | tr '\t' '/')"
