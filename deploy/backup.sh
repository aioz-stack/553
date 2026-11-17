#!/usr/bin/env bash
# Nightly backup: database dump + .env + storage/app. Schedule via aaPanel Cron
# (e.g. 02:30 daily) and copy the output off-server (S3/Backblaze/another VPS).
set -euo pipefail

APP_DIR=/www/wwwroot/pusoy13
BACKUP_DIR=/www/backup/pusoy13
STAMP=$(date -u +%Y%m%d-%H%M%S)
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

# Credentials come from a root-only option file, never the command line:
#   /root/.pusoy-backup.cnf  ->  [client]\nuser=...\npassword=...
DB_NAME=$(grep ^DB_DATABASE= "$APP_DIR/.env" | cut -d= -f2)

mysqldump --defaults-extra-file=/root/.pusoy-backup.cnf --single-transaction --routines --triggers "$DB_NAME" \
  | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

tar -czf "$BACKUP_DIR/files-$STAMP.tar.gz" -C "$APP_DIR" .env storage/app

find "$BACKUP_DIR" -type f -mtime +$KEEP_DAYS -delete
echo "Backup complete: $STAMP"
