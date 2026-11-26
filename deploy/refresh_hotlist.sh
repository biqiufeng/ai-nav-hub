#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
LOG_DIR="${APP_DIR}/logs"
LOCK_FILE="${LOG_DIR}/hotlist.lock"
LOG_FILE="${LOG_DIR}/hotlist-$(date +%Y%m%d).log"

mkdir -p "${LOG_DIR}" "${APP_DIR}/web/data"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

{
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] Refreshing hotlist & AI news"
  python3 -u "${APP_DIR}/crawler/fetch_all.py" --hotlist-only --hotlist-output "${APP_DIR}/web/data/hotlist.json"
  python3 -u "${APP_DIR}/crawler/fetch_all.py" --news-only --news-output "${APP_DIR}/web/data/news.json" || true
} >> "${LOG_FILE}" 2>&1

shopt -s nullglob
logs=("${LOG_DIR}"/hotlist-*.log)
if (( ${#logs[@]} > 7 )); then
  mapfile -t old_logs < <(ls -1t "${LOG_DIR}"/hotlist-*.log | tail -n +8)
  if (( ${#old_logs[@]} > 0 )); then
    rm -f "${old_logs[@]}"
  fi
fi
