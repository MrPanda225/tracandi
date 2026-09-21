# Physical Backup — MySQL

## Principle

A physical backup copies raw disk files directly:
data files (`.ibd`), table structures, logs, and configuration files.

**Main advantage:** much faster than a logical dump on large databases.
**Main constraint:** MySQL must be stopped, or use Percona XtraBackup for online backups.

---

## Physical backup techniques

| Technique | Description | Typical tool |
|-----------|-------------|--------------|
| **File-based** | Direct copy of DB files | `cp -R`, `rsync` |
| **Block-level** | Disk block-level capture (incremental possible) | LVM snapshot, Percona XtraBackup |
| **Online backup** | Backup without stopping MySQL | Percona XtraBackup, `mysqlbackup` |
| **Snapshot** | Point-in-time copy of the storage volume | Cloud snapshots, LVM, ZFS |
| **With compression** | Compressed backup to save space | `pigz`, tool-specific options |

---

## Offline physical backup (cp method)

### Prerequisites

```bash
# Check available disk space before starting
df -h /var/lib/mysql
df -h /path/to/backup_directory

# Check database size
du -sh /var/lib/mysql/
```

### Full procedure

```bash
# 1. Stop MySQL cleanly
sudo systemctl stop mysql

# Confirm MySQL is stopped
sudo systemctl status mysql

# 2. Recursively copy the data directory
sudo cp -R /var/lib/mysql /path/to/backup_directory

# Flag explanation:
# cp   = copy
# -R   = recursive (directories + subdirectories)

# 3. Verify the backup
sudo ls -lh /path/to/backup_directory/

# 4. Restart MySQL
sudo systemctl start mysql
sudo systemctl status mysql
```

---

## Physical restore

```bash
# 1. Stop MySQL
sudo systemctl stop mysql

# 2. Move current data aside (safety net)
sudo mv /var/lib/mysql /var/lib/mysql_old

# 3. Restore from backup
sudo cp -R /path/to/backup_directory /var/lib/mysql

# 4. CRITICAL — fix file ownership
# MySQL won't start if files are not owned by the mysql user
sudo chown -R mysql:mysql /var/lib/mysql

# Flag explanation:
# chown       = change ownership
# -R          = recursive
# mysql:mysql = user:group

# 5. Restart and verify
sudo systemctl start mysql
sudo systemctl status mysql

# 6. Check data integrity
mysql -u root -p -e "SHOW DATABASES;"
mysql -u root -p -e "USE world; SHOW TABLES;"
```

---

## Online physical backup — Percona XtraBackup

For environments where stopping MySQL is not acceptable.

```bash
# Install (Ubuntu/Debian)
sudo apt-get install percona-xtrabackup-80

# Online backup (without stopping MySQL)
sudo xtrabackup \
    --backup \
    --target-dir=/path/to/backup \
    --user=root \
    --password

# Prepare the backup before restoring
sudo xtrabackup --prepare --target-dir=/path/to/backup

# Restore
sudo systemctl stop mysql
sudo xtrabackup \
    --copy-back \
    --target-dir=/path/to/backup
sudo chown -R mysql:mysql /var/lib/mysql
sudo systemctl start mysql
```

---

## Cloud snapshot backups

Used in cloud production environments (AWS RDS, GCP Cloud SQL, Azure MySQL).

### AWS RDS — Manual snapshot

```bash
# Via AWS CLI
aws rds create-db-snapshot \
    --db-instance-identifier my-mysql-instance \
    --db-snapshot-identifier my-snapshot-$(date +%Y%m%d)

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier my-mysql-restored \
    --db-snapshot-identifier my-snapshot-20240101
```

### LVM Snapshot (Linux, on-premise)

```bash
# Create an LVM snapshot (near-instant)
sudo lvcreate -L10G -s -n mysql_snap /dev/vg0/mysql

# Mount the snapshot
sudo mount /dev/vg0/mysql_snap /mnt/mysql_backup

# Copy files
sudo cp -R /mnt/mysql_backup /path/to/backup

# Remove the snapshot
sudo umount /mnt/mysql_backup
sudo lvremove /dev/vg0/mysql_snap
```

---

## Full comparison

| Aspect | mysqldump (logical) | cp -R (physical offline) | Percona XtraBackup (physical online) |
|--------|--------------------|--------------------------|------------------------------------|
| Downtime required | No | Yes | No |
| Backup speed | Slow | Fast | Fast |
| Backup size | Large (SQL text) | Small (binary) | Small |
| Portability | Cross-version, cross-OS | Same MySQL version | Same MySQL version |
| Granularity | Table, database, all | Full server | Database or server |
| Granular restore | Yes (table by table) | No (all or nothing) | Yes (with options) |
| Use case | Dev, migration, small DBs | Fast DR, cloning | Prod, large databases |

---

## Best practices

```bash
# Always check disk space before backup
df -h

# Test restore on a staging server, never on production
# (An untested backup does not exist)

# Automate with post-backup verification
BACKUP_SIZE=$(du -sh /path/to/backup | cut -f1)
echo "Backup created: $BACKUP_SIZE"

# Keep the old mysql directory for at least 24h before deleting it
# Do NOT immediately run: sudo rm -rf /var/lib/mysql_old
```

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| MySQL won't start after restore | Wrong file ownership | `sudo chown -R mysql:mysql /var/lib/mysql` |
| "No space left on device" | Disk full during restore | Check `df -h` beforehand, free up space |
| Corrupt backup | MySQL not stopped during `cp` | Always run `systemctl stop mysql` first |
| Restore fails on different version | Binary incompatibility | Verify `mysql --version` matches source and destination |
