#!/usr/bin/env bash
# leedtopsmm postgres bazasini zaxira nusxadan tiklash.
# Ishlatish: scripts/restore.sh <backup-file.sql.gz> [--yes]
set -euo pipefail

FILE="${1:-}"
CONFIRM="${2:-}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Ishlatish: $0 <backup-file.sql.gz> [--yes]" >&2
  exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  read -r -p "DIQQAT: bu joriy 'leedtopsmm' bazasini butunlay almashtiradi. Davom etasizmi? (yes/NO) " ans
  if [ "$ans" != "yes" ]; then
    echo "Bekor qilindi."
    exit 1
  fi
fi

cd /opt/leedtopsmm
gunzip -c "$FILE" | docker compose -p leedtopsmm exec -T postgres psql -U postgres leedtopsmm

echo "OK: tiklandi $FILE dan"
