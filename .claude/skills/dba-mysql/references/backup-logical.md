# Logical Backup — mysqldump

## Configure ~/.my.cnf (secure credentials)

Never put passwords in a shell script. Use the MySQL config file instead:

```ini
# ~/.my.cnf
[client]
host     = localhost
port     = 3306
user     = root
password = YourPassword
```

```bash
# Strict permissions required — MySQL refuses to read if too open
chmod 600 ~/.my.cnf
```

After this, `mysql` and `mysqldump` pick up credentials automatically.

---

## Full backup script — sqlbackup.sh

```bash
#!/bin/sh
# sqlbackup.sh — Automated MySQL backup with rotation

DATABASE='sakila'
BACKUPFOLDER=/home/backups
KEEP_DAYS=30

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup of $DATABASE"

# Create backup folder if it doesn't exist
mkdir -p $BACKUPFOLDER

# Timestamped file names
TIMESTAMP=$(date +%d-%m-%Y_%H-%M-%S)
SQLFILE=$BACKUPFOLDER/all-database-$TIMESTAMP.sql
ZIPFILE=$BACKUPFOLDER/all-database-$TIMESTAMP.gz

# 1. Dump
if mysqldump \
    --single-transaction \
    --routines \
    --triggers \
    $DATABASE > $SQLFILE; then

    echo "SQL dump created: $SQLFILE"

    # 2. Compress
    if gzip -c $SQLFILE > $ZIPFILE; then
        echo "Compression successful: $ZIPFILE"
        rm $SQLFILE
    else
        echo "ERROR: compression failed"
        exit 1
    fi
else
    echo "ERROR: mysqldump failed"
    exit 1
fi

# 3. Rotation — delete backups older than $KEEP_DAYS days
find $BACKUPFOLDER -name "*.gz" -mtime +$KEEP_DAYS -delete
echo "Old backups (>$KEEP_DAYS days) deleted"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete: $ZIPFILE"
```

**Key mysqldump options:**

| Option | Effect |
|--------|--------|
| `--single-transaction` | Consistent backup without table lock (InnoDB only) |
| `--routines` | Include stored procedures and functions |
| `--triggers` | Include triggers |
| `--all-databases` | Dump all databases |
| `--databases db1 db2` | Dump specific databases |
| `--flush-logs` | Open a new binary log after the dump |
| `--delete-master-logs` | Purge binary logs predating the dump |

---

## Setup and permissions

```bash
# Make the script executable
sudo chmod u+x+r sqlbackup.sh

# Create the backup folder
mkdir -p /home/backups

# Test manually before scheduling with cron
bash sqlbackup.sh

# Verify the result
ls -lh /home/backups/
```

---

## Cron automation

```bash
# Open the cron editor
crontab -e
```

```cron
# Syntax: min hour day month weekday command
# Every 2 minutes (testing only)
*/2 * * * * /home/project/sqlbackup.sh >> /home/project/backup.log 2>&1

# Daily at 6 AM
0 6 * * * /home/project/sqlbackup.sh >> /home/project/backup.log 2>&1

# Every Monday at midnight
0 0 * * 1 /home/project/sqlbackup.sh >> /home/project/backup.log 2>&1
```

```bash
# Start / stop / check cron service
sudo service cron start
sudo service cron stop
sudo service cron status

# Verify backups were created
ls -l /home/backups/
```

**Always redirect both stdout AND stderr** (`>> log 2>&1`) — otherwise errors are silent.

---

## Truncate — simulating data loss

```bash
# truncate.sh — empties all tables in a database
#!/bin/sh

mysql -Nse 'show tables' sakila | \
    while read table; do mysql \
    -e "use sakila; SET FOREIGN_KEY_CHECKS=0; TRUNCATE TABLE $table; SET FOREIGN_KEY_CHECKS=1;"; \
    done
```

```bash
sudo chmod u+x+r truncate.sh
bash truncate.sh

# Verify tables are empty
mysql -e "use sakila; SELECT * FROM staff;"
# → should return "Empty set"
```

---

## Restore from logical backup

```bash
# 1. List available backups
ls -lh /home/backups/

# 2. Decompress
gunzip /home/backups/all-database-07-10-2024_01-08-01.gz

# 3. Restore
mysql sakila < /home/backups/all-database-07-10-2024_01-08-01.sql

# 4. Verify
mysql -e "use sakila; SELECT * FROM staff;"
```

---

## Parameterized restore script (advanced)

```bash
#!/bin/sh
# restore.sh <database_name> <sql_file>

if [ $# -ne 2 ]; then
    echo "Usage: $0 <database_name> <sql_file>"
    exit 1
fi

DB=$1
SQLFILE=$2

if [ ! -f "$SQLFILE" ]; then
    echo "ERROR: file $SQLFILE not found"
    exit 1
fi

mysql $DB < $SQLFILE && echo "Restore successful" || echo "ERROR: restore failed"
```

---

## Parameterized backup script (advanced)

```bash
#!/bin/sh
# flexible_backup.sh <database_name> <backup_directory>

DB=$1
BACKUPDIR=$2

# Check that the database exists
DBNAME=$(mysql -Nse "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='$DB';")

if [ ! -d "$BACKUPDIR" ]; then
    mkdir -p "$BACKUPDIR"
fi

if [ "$DB" = "$DBNAME" ]; then
    SQLFILE=$BACKUPDIR/$DB-$(date +%d-%m-%Y).sql
    if mysqldump $DB > $SQLFILE; then
        echo "Backup created: $SQLFILE"
    else
        echo "ERROR: backup failed"
    fi
else
    echo "ERROR: database '$DB' does not exist"
fi
```

---

## Cleanup

```bash
# Remove all backups (WARNING — irreversible)
sudo rm -rfv /home/backups
```
