#!/bin/sh
# SQLite 線上備份迴圈（db-backup sidecar 用）。
#
# 用 `VACUUM INTO` 取一致快照——對 WAL 模式的在跑資料庫安全（走讀交易，
# 不 checkpoint、不阻塞後端寫入），並順帶壓實與去碎片。輸出 gzip，依天數輪替。
# 目的地在 HDD bind mount（與 DB 的 docker volume 不同實體碟），災難時可直接取用。
set -eu

SRC="${DB_PATH:-/db/db.sqlite}"
DEST_DIR="${BACKUP_DIR:-/backups}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"   # 預設每日
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"            # 保留天數

mkdir -p "$DEST_DIR"
echo "[backup] source=$SRC dest=$DEST_DIR interval=${INTERVAL}s keep=${KEEP_DAYS}d"

while true; do
  if [ ! -f "$SRC" ]; then
    echo "[backup] 來源不存在（後端尚未建 DB？）：$SRC — 稍後重試" >&2
    sleep 30
    continue
  fi
  ts=$(date -u +%Y%m%d-%H%M%S)
  tmp="$DEST_DIR/.db-$ts.sqlite.tmp"
  out="$DEST_DIR/db-$ts.sqlite.gz"
  rm -f "$tmp"
  # VACUUM INTO 目的地必須不存在；.tmp 以秒級時間戳命名，先移除保險
  if sqlite3 "$SRC" "VACUUM INTO '$tmp'"; then
    gzip -c "$tmp" > "$out"
    rm -f "$tmp"
    echo "[backup] 已寫 $out ($(du -h "$out" | cut -f1))"
    # 依 mtime 輪替（busybox find 支援 -mtime/-delete）
    find "$DEST_DIR" -name 'db-*.sqlite.gz' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
  else
    echo "[backup] 失敗於 $ts" >&2
    rm -f "$tmp"
  fi
  sleep "$INTERVAL"
done
