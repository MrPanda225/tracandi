---
paths:
  - "database/**"
  - "backend/src/db/**"
  - "backend/src/modules/**/repository.ts"
  - "backend/tests/integration/**"
  - "scripts/db/**"
---
# Règles base de données MySQL (skill `dba-mysql`)

Référence complète : `.claude/skills/dba-mysql/SKILL.md`. Environnement : **MySQL 8.4 LTS, Docker, base < 1 Go,
RPO 24 h, RTO 30 min** (cahier des charges §7.3).

## Schéma
- Source de vérité : `database/migrations/*.sql`, numérotées `NNN_description.sql`, appliquées dans l'ordre.
- **Une migration commitée n'est jamais modifiée** (bloqué par hook) : créer la suivante (`/project:new-migration`).
- Conventions : InnoDB, `utf8mb4` / `utf8mb4_0900_ai_ci`, PK `id INT UNSIGNED AUTO_INCREMENT`, dates `DATETIME(3)` UTC,
  snake_case, contraintes nommées `fk_<table>_<cible>`, `uq_<table>_<cols>`, `ix_<table>_<cols>`, `ck_<table>_<règle>`.
- Toute colonne de filtre, de jointure ou de tri fréquente est indexée ; justifier chaque index par la requête qu'il sert
  (commentaire `COMMENT 'EF-xxx'`). Pas d'index « au cas où » (coût en écriture).
- Une migration destructive (`DROP`, `ALTER ... DROP COLUMN`, changement de type) exige l'accord explicite du Business Owner.

## Requêtes (repositories)
- **Toujours paramétrées** (`?` avec `mysql2`), jamais de concaténation de valeur (ENF-SEC-05).
  Un identifiant dynamique (nom de colonne de tri) passe par une liste blanche.
- Jamais `SELECT *` : colonnes nommées.
- `JOIN ... ON` explicites, alias cohérents ; pas plus de 2 niveaux de sous-requêtes (sinon CTE).
- Écritures multi-tables dans une transaction (`withTransaction`) ; verrouillage `SELECT ... FOR UPDATE` si lecture-puis-écriture concurrente.
- Upsert : `INSERT ... ON DUPLICATE KEY UPDATE` sur une clé unique ; lire l'id via `LAST_INSERT_ID(id)` si besoin.
- Pagination : `LIMIT ? OFFSET ?` bornés (maximum 500).
- Toute nouvelle requête de lecture sur `applications`, `emails`, `job_offers` est vérifiée par `EXPLAIN` :
  `type = ALL` ou `Using filesort` sur un gros volume → ajouter ou corriger un index (ENF-PERF-04).
  Coller le résultat de l'`EXPLAIN` dans la description du commit quand un index est créé.

## Comptes (moindre privilège)
- Backend : `jobpilot_app` (DML seulement). Migrations : `jobpilot_migrator`. Sauvegarde : `jobpilot_backup`.
  Tests : `jobpilot_test` sur `jobpilot_test` uniquement. Ne jamais utiliser `root` dans le code.

## Tests d'intégration
- Base `jobpilot_test` recréée par migrations au début de la suite ; tables vidées entre tests avec
  `SET FOREIGN_KEY_CHECKS = 0; TRUNCATE ...; SET FOREIGN_KEY_CHECKS = 1;`.
- Jamais de test sur la base `jobpilot`.

## Sauvegarde / restauration
- `scripts/db/backup.sh` (mysqldump `--single-transaction`, identifiants via fichier d'options, vérification, rétention 30 j).
- `scripts/db/restore-check.sh` restaure dans `jobpilot_restore_check` et vérifie. `scripts/db/restore.sh` est destructif :
  **jamais exécuté par Claude Code** (refusé dans settings.json).
- Opérations destructives : afficher d'abord ce qui sera touché (`SELECT COUNT(*)`, `SELECT DATABASE()`), demander confirmation.
