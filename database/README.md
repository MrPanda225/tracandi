# Base de données

- `migrations/` : fichiers `NNN_description.sql`, appliqués dans l'ordre par `npm run db:migrate`
  (compte `jobpilot_migrator`). Une migration appliquée n'est **jamais** modifiée.
- `conf/my.cnf` : configuration serveur (UTC, utf8mb4, mode strict, binlogs, slow log).
- `init/01-create-users.sh` : comptes à moindre privilège, exécuté au premier démarrage du conteneur.
- Sauvegarde / restauration : `scripts/db/backup.sh`, `scripts/db/restore-check.sh`, `scripts/db/restore.sh`.

Règles détaillées : `.claude/rules/database-mysql.md`.
