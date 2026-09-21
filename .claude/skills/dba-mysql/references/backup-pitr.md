# Point-in-Time Recovery (PITR)

## Principle

PITR lets you restore a database to any specific moment — not just the last backup.
It's the difference between "I lose everything since last night" and "I lose 3 minutes of data."

**Required components:**
1. A full logical backup (`mysqldump`) — the foundation
2. Binary logs — a record of every change since that backup

---

## Enable binary logging

**Do this BEFORE you need PITR — it cannot be applied retroactively.**

```ini
# /etc/mysql/my.cnf  (or /etc/mysql/mysql.conf.d/mysqld.cnf depending on distro)
[mysqld]
log_bin                    = /var/lib/mysql/binlog
binlog_expire_logs_seconds = 604800   # Keep 7 days (MySQL 8.0+)
max_binlog_size            = 100M
server_id                  = 1        # Required if using replication
```

```bash
# Restart MySQL to apply changes
sudo systemctl restart mysql

# Verify binary logging is active
mysql -u root -p -e "SHOW VARIABLES LIKE 'log_bin';"
# → log_bin | ON
```

---

## How binary logs work

```
Day 0, 8:00 PM  →  full mysqldump (world_backup.sql)
                    → creates binlog.000001 (clean starting point)

Day 0, 8:01 PM  →  INSERT INTO city VALUES (...) -- recorded in binlog.000001
Day 0, 9:00 PM  →  UPDATE country SET population = ... -- recorded
Day 1, 6:00 AM  →  binlog.000001 reaches 100MB → rotates to binlog.000002
Day 1, 9:30 AM  →  ⚠️ CRASH / accidental DELETE

To restore to Day 1, 9:29 AM:
  1. Restore world_backup.sql (state at Day 0, 8:00 PM)
  2. Apply binlog.000001 (changes Day 0 8:01 PM → 9:00 PM)
  3. Apply binlog.000002 up to 9:29 AM (not the 9:30 AM changes)
```

---

## Full PITR procedure

### Step 1 — Full logical backup with binary log checkpoint

```bash
sudo mysqldump \
    --user=root \
    --password \
    --single-transaction \
    --flush-logs \
    --delete-master-logs \
    --databases world \
    > world_full_backup.sql
```

**What the critical flags do:**
- `--flush-logs`: closes the current binary log and opens a fresh one after the dump
- `--delete-master-logs`: removes binary logs OLDER than the dump (already covered by the dump)
- `--single-transaction`: consistent snapshot without table lock (InnoDB)

### Step 2 — Changes accumulate normally

```sql
-- These operations are recorded in the binary logs
source world_mysql_update_A.sql;
source world_mysql_update_B.sql;
-- ... all normal system transactions
```

### Step 3 — Crash simulation (or real incident)

```bash
# Stop MySQL
sudo systemctl stop mysql

# Delete the database files (simulates a disk crash)
sudo rm -rf /var/lib/mysql/world

# Attempt access → expected error
sudo mysql --user=root --password \
    --execute="SELECT * FROM world.city;"
```

### Step 4 — Identify binary logs to apply

```bash
# List available binary logs
sudo mysql --user=root --password \
    --execute="SHOW BINARY LOGS;"

# Typical output:
# +---------------+-----------+
# | Log_name      | File_size |
# +---------------+-----------+
# | binlog.000003 | 1234      |
# | binlog.000004 | 5678      |
# +---------------+-----------+
```

### Step 5 — Extract binary logs to SQL

```bash
# Convert binary logs to readable SQL statements
sudo mysqlbinlog \
    /var/lib/mysql/binlog.000003 \
    /var/lib/mysql/binlog.000004 \
    > logfile.sql

# To restore up to a specific moment (stop-datetime)
sudo mysqlbinlog \
    --stop-datetime="2024-01-15 09:29:59" \
    /var/lib/mysql/binlog.000003 \
    /var/lib/mysql/binlog.000004 \
    > logfile.sql
```

### Step 6 — Restore the full backup

```bash
sudo mysql --user=root --password < world_full_backup.sql

# Verify — should have data BEFORE the last updates
sudo mysql --user=root --password \
    --execute="SELECT * FROM world.city WHERE countrycode='CAN';"
# → Empty set (expected — binlog changes not yet applied)
```

### Step 7 — Apply binary log changes

```bash
sudo mysql --user=root --password < logfile.sql

# Verify — should now have all data
sudo mysql --user=root --password \
    --execute="SELECT * FROM world.city WHERE countrycode='CAN';"
# → Rows present ✓
```

---

## Restore to a precise moment (stop-datetime)

To skip an accidental operation at 9:30 AM and restore the state at 9:29 AM:

```bash
# Option 1: stop-datetime
sudo mysqlbinlog \
    --stop-datetime="2024-01-15 09:29:59" \
    /var/lib/mysql/binlog.000004 \
    > logfile_until_929.sql

# Option 2: stop-position (more precise — inspect the log first)
sudo mysqlbinlog /var/lib/mysql/binlog.000004 | grep -A5 "DROP TABLE"
# Identify the exact position before the DROP

sudo mysqlbinlog \
    --stop-position=4567 \
    /var/lib/mysql/binlog.000004 \
    > logfile_until_before_drop.sql
```

---

## Binary log management

```sql
-- Check current binary log status
SHOW MASTER STATUS;

-- List all binary logs
SHOW BINARY LOGS;

-- Purge binary logs older than 7 days
PURGE BINARY LOGS BEFORE DATE_SUB(NOW(), INTERVAL 7 DAY);

-- Purge up to a specific log file
PURGE BINARY LOGS TO 'binlog.000010';

-- Force manual rotation
FLUSH LOGS;
```

**Recommended retention policy:**
- Keep binary logs at least as long as your oldest valid backup
- Daily backup → keep 7+ days of binary logs
- Weekly backup → keep 30+ days of binary logs

---

## What PITR does NOT cover

| Scenario | Covered by PITR? | Solution |
|----------|-----------------|----------|
| Hardware corruption before backup | ❌ | Offsite backup, replication |
| DROP DATABASE (if recorded in logs) | ✅ Recoverable | Stop replay before the event in mysqlbinlog |
| Binary log corruption itself | ❌ | Checksums, log monitoring |
| Uncommitted data | ❌ | Uncommitted transactions are not in the logs |
| Before binary logging was enabled | ❌ | Enable BEFORE you need it |

---

## Production PITR checklist

```bash
# 1. Verify binary logging is active
mysql -u root -p -e "SHOW VARIABLES LIKE 'log_bin%';"

# 2. Check retention policy
mysql -u root -p -e "SHOW VARIABLES LIKE 'binlog_expire%';"

# 3. Check binary log disk usage
ls -lh /var/lib/mysql/binlog.*

# 4. Test a full PITR on a staging environment (minimum monthly)
# Never discover a procedure is broken during a real incident
```
