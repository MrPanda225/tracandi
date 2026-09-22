#!/bin/sh
# Sauvegarde logique quotidienne de la base tracandi (ENF-FIA-04, ENF-FIA-08).
# - --single-transaction : instantané cohérent InnoDB sans verrouiller les écritures
# - identifiants lus depuis un fichier d'options (jamais dans la ligne de commande)
# - vérification de l'archive, rétention, journalisation, code retour non nul en cas d'échec
# Usage : scripts/db/backup.sh            (cron : 0 3 * * * /chemin/scripts/db/backup.sh >> /chemin/backups/backup.log 2>&1)
set -eu

DATABASE="${DATABASE:-tracandi}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../../backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
# Préfixe d'exécution : dans Docker par défaut ; MYSQL_EXEC="" pour un MySQL installé localement.
MYSQL_EXEC="${MYSQL_EXEC-docker compose exec -T db}"
OPTIONS_FILE="${OPTIONS_FILE:-/etc/mysql/backup.cnf}"

STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
ARCHIVE="$BACKUP_DIR/${DATABASE}_${STAMP}.sql.gz"
mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] Backup of $DATABASE started"

# shellcheck disable=SC2086  # MYSQL_EXEC doit être découpé en mots
if ! $MYSQL_EXEC mysqldump --defaults-extra-file="$OPTIONS_FILE" \
      --single-transaction --routines --triggers --events \
      --no-tablespaces --set-gtid-purged=OFF --databases "$DATABASE" \
      | gzip -c > "$ARCHIVE"; then
  echo "[$(date -Iseconds)] ERROR mysqldump failed" >&2
  rm -f "$ARCHIVE"
  exit 1
fi

if ! gzip -t "$ARCHIVE" || ! gunzip -c "$ARCHIVE" | tail -n 1 | grep -q "Dump completed"; then
  echo "[$(date -Iseconds)] ERROR archive is corrupt or incomplete: $ARCHIVE" >&2
  exit 1
fi

# Rétention : on liste d'abord (trace dans le log), puis on supprime.
find "$BACKUP_DIR" -name "${DATABASE}_*.sql.gz" -mtime +"$KEEP_DAYS" -print -delete

echo "[$(date -Iseconds)] Backup OK: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
