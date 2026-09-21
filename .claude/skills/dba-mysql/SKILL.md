---
name: dba-mysql
description: >
  Apply DBA expertise to MySQL database tasks: backup/restore (logical, physical, PITR),
  query optimization, shell scripting, cron automation, and multi-table SQL.
  Use this skill whenever the user mentions MySQL, MariaDB, database backup, restore,
  mysqldump, binary logs, query plan, EXPLAIN, cron jobs, shell scripts for DB,
  or any SQL tuning/optimization question — even if they don't say "DBA" explicitly.
  Also triggers for: slow queries, data loss scenarios, database automation,
  index design, truncate/restore cycles, and job scheduling for databases.
---

# DBA MySQL Skill

Production-grade guidance for MySQL database administration. Covers the full DBA
lifecycle: query design → optimization → backup → restore → automation.

## Context Gathering Protocol

DBA tasks fail without knowing the environment. Before proposing any solution:

**Required context — always ask if missing:**
- **MySQL version**: 5.7, 8.0, 8.x? (syntax and features differ significantly)
- **Environment**: local Linux, cloud VM, Docker, managed service (RDS, Cloud SQL)?
- **Database size**: small (<1 GB), medium (1–100 GB), large (>100 GB)?
- **Availability constraint**: can we afford downtime, or must it be online?
- **Recovery objective**: RPO (how much data loss is acceptable?) / RTO (how fast must restore be)?

Individual tasks need additional context — check the relevant reference file.

**Gathering order:**
1. If context is in the current conversation → proceed immediately
2. If ambiguous → ask the 1–2 most critical questions before writing any command
3. Never assume a production environment is safe to run destructive commands on without confirmation

---

## Design Direction

Commit to **precision over completeness**. A DBA skill that gives one correct,
safe, production-tested command beats five commands with caveats. Every recommendation must:

- State **what it does** before giving the command
- Flag **destructive operations** explicitly (`rm`, `TRUNCATE`, `DROP`)
- Provide a **verification step** after every operation
- Respect the **least-privilege principle** — never suggest `root` if a limited user works

**Differentiation**: This skill treats safety as a first-class concern — not an afterthought.
Every backup command includes a restore verification. Every cron job includes a log path.

---

## Core Domains

### 1. SQL Queries & Multi-Table Access
→ *Read [sql-queries.md](references/sql-queries.md) for COUNT/DISTINCT/LIMIT, JOINs, sub-queries, aliases*

Use when: writing SELECT statements, optimizing WHERE clauses, working with multiple tables.

**Quick reference:**
```sql
-- COUNT with filter
SELECT COUNT(column) FROM table WHERE condition;

-- DISTINCT in COUNT
SELECT COUNT(DISTINCT column) FROM table WHERE condition;

-- Implicit JOIN with aliases
SELECT E.EMP_ID, E.F_NAME, J.JOB_TITLE
FROM EMPLOYEES E, JOBS J
WHERE E.JOB_ID = J.JOB_IDENT;

-- Subquery
SELECT * FROM EMPLOYEES
WHERE JOB_ID IN (SELECT JOB_IDENT FROM JOBS);

-- Pagination
SELECT * FROM table LIMIT 25 OFFSET 10;
```

**DO**: Prefer explicit `JOIN ... ON` over implicit joins in production (clearer, optimizer-friendly)
**DO**: Use table aliases consistently throughout the query
**DON'T**: Use `SELECT *` in production — always name columns explicitly
**DON'T**: Nest subqueries more than 2 levels deep without considering CTEs

---

### 2. Query Optimization & EXPLAIN
→ *Read [query-optimization.md](references/query-optimization.md) for EXPLAIN output, index strategy, optimizer hints*

Use when: slow queries, EXPLAIN analysis, index decisions, query plan tuning.

**Quick reference:**
```sql
-- Basic EXPLAIN
EXPLAIN SELECT * FROM film WHERE rating = 'PG';

-- Extended JSON format (MySQL 8+)
EXPLAIN FORMAT=JSON SELECT ...;

-- Analyze actual execution (MySQL 8.0.18+)
EXPLAIN ANALYZE SELECT ...;
```

**Key EXPLAIN columns to watch:**
| Column | Danger signal |
|--------|--------------|
| `type` | `ALL` = full table scan → add index |
| `rows` | Very high vs actual results → bad filter |
| `Extra` | `Using filesort` or `Using temporary` → review ORDER BY / GROUP BY |
| `key` | `NULL` = no index used |

**DO**: Run EXPLAIN before optimizing — never guess
**DO**: Add indexes on columns used in WHERE, JOIN ON, and ORDER BY
**DON'T**: Add indexes on every column — writes slow down, cardinality matters
**DON'T**: Use optimizer hints until you've confirmed the optimizer is wrong

---

### 3. Logical Backup & Restore (mysqldump)
→ *Read [backup-logical.md](references/backup-logical.md) for full script, cron setup, truncate/restore cycle*

Use when: scheduled backups, export/import, development snapshots, disaster simulation.

**The complete backup script pattern:**
```bash
#!/bin/sh
DATABASE='sakila'
BACKUPFOLDER=/home/backups
KEEP_DAYS=30

echo "[$(date)] Starting backup of $DATABASE"

SQLFILE=$BACKUPFOLDER/all-db-$(date +%d-%m-%Y_%H-%M-%S).sql
ZIPFILE=$BACKUPFOLDER/all-db-$(date +%d-%m-%Y_%H-%M-%S).gz

mkdir -p $BACKUPFOLDER

if mysqldump $DATABASE > $SQLFILE; then
    echo "Dump created"
    if gzip -c $SQLFILE > $ZIPFILE; then
        echo "Compressed successfully"
        rm $SQLFILE
    else
        echo "Compression failed"; exit 1
    fi
else
    echo "mysqldump failed"; exit 1
fi

find $BACKUPFOLDER -mtime +$KEEP_DAYS -delete
echo "[$(date)] Backup complete: $ZIPFILE"
```

**Restore:**
```bash
gunzip /path/to/backup.gz
mysql database_name < /path/to/backup.sql
```

**Cron syntax reference:**
```
┌─ min (0-59)   ┌─ hour (0-23)  ┌─ day (1-31)
│               │               │   ┌─ month (1-12)
│               │               │   │   ┌─ weekday (0-7, 0=Sun)
│               │               │   │   │
*/2 * * * *    → every 2 minutes
0 6 * * *      → daily at 6 AM
0 0 * * 1      → every Monday at midnight
```

**DO**: Always test restore on a separate database before trusting a backup
**DO**: Log cron output: `script.sh > /path/backup.log 2>&1`
**DO**: Store credentials in `~/.my.cnf` — never hardcode passwords in scripts
**DON'T**: Run mysqldump on production without `--single-transaction` for InnoDB (avoids table locks)
**DON'T**: Forget `FOREIGN_KEY_CHECKS=0` when truncating tables with constraints

---

### 4. Physical Backup & Restore
→ *Read [backup-physical.md](references/backup-physical.md) for file-level copy, ownership, and restore procedure*

Use when: large databases, disaster recovery, fastest possible restore, OS-level migration.

**Key principle**: Physical backup copies raw files from `/var/lib/mysql`. Faster than logical for large databases. Requires MySQL to be stopped (or use Percona XtraBackup for online).

**Offline physical backup:**
```bash
# 1. Stop MySQL
sudo systemctl stop mysql

# 2. Copy data directory
sudo cp -R /var/lib/mysql /path/to/backup_directory

# 3. Verify
sudo ls -l /path/to/backup_directory

# 4. Restart
sudo systemctl start mysql
```

**Physical restore:**
```bash
# 1. Stop MySQL
sudo systemctl stop mysql

# 2. Move current data aside (safety net)
sudo mv /var/lib/mysql /var/lib/mysql_old

# 3. Copy backup back
sudo cp -R /path/to/backup_directory /var/lib/mysql

# 4. Fix ownership (CRITICAL — MySQL won't start otherwise)
sudo chown -R mysql:mysql /var/lib/mysql

# 5. Restart and verify
sudo systemctl start mysql
```

**Comparison: Logical vs Physical:**
| Aspect | Logical (mysqldump) | Physical (cp -R) |
|--------|--------------------|--------------------|
| Speed | Slower | Much faster |
| Size | Larger (SQL text) | Smaller (binary) |
| Portability | Cross-version | Same MySQL version |
| Downtime | None (--single-transaction) | Required (offline) |
| Use case | Dev snapshots, migrations | DR, large prod DBs |

**DO**: Verify disk space before backup — `df -h /var/lib/mysql`
**DON'T**: Start MySQL before running `chown -R mysql:mysql` — it will fail silently
**DON'T**: Use physical backup across incompatible MySQL versions

---

### 5. Point-in-Time Recovery (PITR)
→ *Read [backup-pitr.md](references/backup-pitr.md) for binary log setup, crash simulation, full recovery procedure*

Use when: data corruption, accidental DELETE/DROP, need to restore to a specific moment.

**Prerequisites — binary logging must be enabled:**
```ini
# /etc/mysql/my.cnf
[mysqld]
log_bin = /var/lib/mysql/binlog
```

**PITR workflow:**
```bash
# 1. Full logical backup (creates clean binary log checkpoint)
sudo mysqldump \
  --user=root --password \
  --flush-logs \
  --delete-master-logs \
  --databases world \
  > world_full_backup.sql

# 2. [Time passes, changes accumulate in binary logs]

# 3. When disaster strikes — check binary logs
sudo mysql -u root -p -e "SHOW BINARY LOGS;"

# 4. Extract logs to SQL
sudo mysqlbinlog \
  /var/lib/mysql/binlog.000003 \
  /var/lib/mysql/binlog.000004 \
  > logfile.sql

# 5. Restore full backup
sudo mysql --user=root --password < world_full_backup.sql

# 6. Apply binary log changes
sudo mysql --user=root --password < logfile.sql

# 7. Verify
sudo mysql -u root -p -e "SELECT * FROM world.city WHERE countrycode='CAN';"
```

**What `--flush-logs --delete-master-logs` does:**
- `--flush-logs`: closes current binary log, opens a fresh one after the dump
- `--delete-master-logs`: purges old binary logs (before the backup point) — safe to delete since the dump covers that state

**DO**: Enable binary logging before you need PITR — you cannot retroactively capture changes
**DO**: Test PITR on a staging server before a real incident
**DON'T**: Delete binary logs manually unless you're certain they're older than your oldest valid backup
**DON'T**: Use PITR as a substitute for regular full backups — it's a complement

---

## Defensive Patterns

**Before any destructive operation, always:**
```bash
# Check what you're about to affect
SELECT COUNT(*) FROM target_table;
SHOW DATABASES;
SELECT DATABASE();

# Verify MySQL service state
sudo systemctl status mysql

# Check disk space
df -h /var/lib/mysql
```

**After any restore, always verify:**
```sql
SHOW FULL TABLES WHERE table_type = 'BASE TABLE';
SELECT COUNT(*) FROM critical_table;
SELECT * FROM critical_table LIMIT 5;
```

---

## Anti-Patterns to Flag

When the user proposes these, push back and explain why:

| Anti-pattern | Problem | Better alternative |
|---|---|---|
| `mysqldump` without `--single-transaction` on InnoDB | Table locks block writes | Add `--single-transaction` |
| Passwords in shell scripts | Security risk | Use `~/.my.cnf` |
| Physical backup without stopping MySQL | Corrupt backup | Stop MySQL first, or use Percona XtraBackup |
| No backup verification | Backups may be corrupt | Always test restore |
| `find -delete` without `-mtime` test first | Data loss | Dry run with `-print` first |
| `TRUNCATE` without `FOREIGN_KEY_CHECKS=0` | Silent failures | Wrap with FK checks disabled |
| `SELECT *` in production queries | Over-fetching, fragile | Explicit column list |
| Binary logs not enabled | No PITR possible | Enable before you need it |

---

## Reference Files

| File | Contents | Read when |
|------|----------|-----------|
| [sql-queries.md](references/sql-queries.md) | COUNT, DISTINCT, LIMIT, JOINs, sub-queries, examples | Writing or debugging SQL |
| [query-optimization.md](references/query-optimization.md) | EXPLAIN columns, index strategy, optimizer hints, tools | Slow queries, performance tuning |
| [backup-logical.md](references/backup-logical.md) | mysqldump script, cron setup, truncate/restore cycle, .my.cnf | Scheduled backups, dev workflows |
| [backup-physical.md](references/backup-physical.md) | File-level copy, ownership fix, online vs offline methods | Large databases, DR, OS migration |
| [backup-pitr.md](references/backup-pitr.md) | Binary log setup, PITR procedure, crash simulation | Data corruption, specific-moment restore |
