#!/bin/sh
# SQLite online backup loop (used by the db-backup sidecar).
#
# `VACUUM INTO` takes a consistent snapshot, which is safe on a live WAL-mode database (a read
# transaction: no checkpoint, doesn't block backend writes) and compacts it along the way.
# Output is gzipped and rotated by age. Bind-mount the destination on a different disk from the DB
# volume so it survives a disk failure.
set -eu

SRC="${DB_PATH:-/db/db.sqlite}"
DEST_DIR="${BACKUP_DIR:-/backups}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"   # daily by default
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"            # days to keep

mkdir -p "$DEST_DIR"
echo "[backup] source=$SRC dest=$DEST_DIR interval=${INTERVAL}s keep=${KEEP_DAYS}d"

while true; do
  if [ ! -f "$SRC" ]; then
    echo "[backup] source missing (backend hasn't created the DB yet?): $SRC, retrying shortly" >&2
    sleep 30
    continue
  fi
  ts=$(date -u +%Y%m%d-%H%M%S)
  tmp="$DEST_DIR/.db-$ts.sqlite.tmp"
  out="$DEST_DIR/db-$ts.sqlite.gz"
  rm -f "$tmp"
  # VACUUM INTO needs a destination that doesn't exist yet; .tmp is named by the second, remove it to be safe
  if sqlite3 "$SRC" "VACUUM INTO '$tmp'"; then
    gzip -c "$tmp" > "$out"
    rm -f "$tmp"
    echo "[backup] wrote $out ($(du -h "$out" | cut -f1))"
    # rotate by mtime (busybox find supports -mtime/-delete)
    find "$DEST_DIR" -name 'db-*.sqlite.gz' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
  else
    echo "[backup] failed at $ts" >&2
    rm -f "$tmp"
  fi
  sleep "$INTERVAL"
done
