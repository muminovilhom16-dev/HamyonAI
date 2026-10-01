#!/bin/sh
# Daily PostgreSQL backup with retention (TZ §39: daily, 7 days).
# Optional: BACKUP_ENCRYPTION_KEY → AES-256 (openssl) encrypted dumps.
set -eu

run_once() (
  set -eu
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  file="/backups/hamyon-$ts.sql.gz"
  trap 'rm -f "$file.tmp"' EXIT
  # pipefail is not POSIX: check pg_dump's status explicitly.
  { pg_dump --no-owner --format=plain || echo "PG_DUMP_FAILED" >&2; } 2>/backups/.last-error | gzip -9 > "$file.tmp"
  if grep -q PG_DUMP_FAILED /backups/.last-error; then cat /backups/.last-error >&2; exit 1; fi
  if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_KEY -in "$file.tmp" -out "$file.enc"
    rm -f "$file.tmp"
    file="$file.enc"
  else
    mv "$file.tmp" "$file"
  fi
  chmod 600 "$file"
  find /backups -name 'hamyon-*' -type f -mtime +"${BACKUP_RETENTION_DAYS:-7}" -delete
  rm -f /backups/.last-error
  echo "backup ok: $file"
)

case "${1:-once}" in
  once) run_once ;;
  loop)
    echo "backup loop: daily at ${BACKUP_HOUR_UTC:-21}:00 UTC, keep ${BACKUP_RETENTION_DAYS:-7} days"
    while true; do
      if [ "$(date -u +%H)" = "$(printf '%02d' "${BACKUP_HOUR_UTC:-21}")" ] && [ ! -f "/backups/.done-$(date -u +%Y%m%d)" ]; then
        if run_once; then touch "/backups/.done-$(date -u +%Y%m%d)"; else echo "backup FAILED, will retry" >&2; fi
        find /backups -name '.done-*' -mtime +2 -delete
      fi
      sleep 300
    done ;;
  restore)
    # ./backup.sh restore <file> — restores into the running database (DESTRUCTIVE).
    f="$2"
    case "$f" in
      *.enc) openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in "$f" | gunzip | psql ;;
      *) gunzip -c "$f" | psql ;;
    esac ;;
esac
