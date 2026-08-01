#!/usr/bin/env bash
# leedtopsmm postgres zaxira nusxasi. Cron orqali kunlik ishga tushiriladi.
set -euo pipefail

BACKUP_DIR="/opt/leedtopsmm/backups"
STAMP="$(date +%F-%H%M)"
OUT_FILE="$BACKUP_DIR/leedtopsmm-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

cd /opt/leedtopsmm
docker compose -p leedtopsmm exec -T postgres pg_dump -U postgres leedtopsmm | gzip > "$OUT_FILE"

if [ ! -s "$OUT_FILE" ]; then
  echo "XATO: zaxira fayli bo'sh — $OUT_FILE" >&2
  rm -f "$OUT_FILE"
  exit 1
fi

find "$BACKUP_DIR" -name 'leedtopsmm-*.sql.gz' -mtime +14 -delete

echo "OK: $OUT_FILE"
