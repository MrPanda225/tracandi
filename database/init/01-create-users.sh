#!/bin/sh
# Exécuté une seule fois par l'image mysql au premier démarrage (volume vide).
# Crée les comptes à moindre privilège (docs/ARCHITECTURE.md §5).
# Les mots de passe viennent des variables d'environnement, jamais du dépôt.
set -eu

: "${MYSQL_APP_PASSWORD:?missing}" "${MYSQL_MIGRATOR_PASSWORD:?missing}" "${MYSQL_BACKUP_PASSWORD:?missing}" "${MYSQL_TEST_PASSWORD:?missing}"

mysql --user=root --password="$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS jobpilot_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'jobpilot_app'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON jobpilot.* TO 'jobpilot_app'@'%';

CREATE USER IF NOT EXISTS 'jobpilot_migrator'@'%' IDENTIFIED BY '${MYSQL_MIGRATOR_PASSWORD}';
GRANT ALL PRIVILEGES ON jobpilot.* TO 'jobpilot_migrator'@'%';

CREATE USER IF NOT EXISTS 'jobpilot_backup'@'localhost' IDENTIFIED BY '${MYSQL_BACKUP_PASSWORD}';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT, LOCK TABLES ON jobpilot.* TO 'jobpilot_backup'@'localhost';
GRANT PROCESS, RELOAD ON *.* TO 'jobpilot_backup'@'localhost';

CREATE USER IF NOT EXISTS 'jobpilot_test'@'%' IDENTIFIED BY '${MYSQL_TEST_PASSWORD}';
GRANT ALL PRIVILEGES ON jobpilot_test.* TO 'jobpilot_test'@'%';
GRANT ALL PRIVILEGES ON jobpilot_restore_check.* TO 'jobpilot_backup'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "JobPilot users created"
