#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
LOG_DIR="${APP_DIR}/logs"
LOCK_FILE="${LOG_DIR}/crawl.lock"
LOG_FILE="${LOG_DIR}/crawl-$(date +%Y%m%d).log"

mkdir -p "${LOG_DIR}" "${APP_DIR}/web/data"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] Another crawl is already running, skipping." >> "${LOG_FILE}"
  exit 0
fi

{
  echo "=========================================="
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] Starting weekly AI navigation crawl (APP_DIR=${APP_DIR})"
  python3 -u "${APP_DIR}/crawler/fetch_all.py" --output "${APP_DIR}/web/data/catalog.json"
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] Crawl finished successfully"
} >> "${LOG_FILE}" 2>&1

# Keep only last 12 weekly log files safely under set -euo pipefail
shopt -s nullglob
logs=("${LOG_DIR}"/crawl-*.log)
if (( ${#logs[@]} > 12 )); then
  mapfile -t old_logs < <(ls -1t "${LOG_DIR}"/crawl-*.log | tail -n +13)
  if (( ${#old_logs[@]} > 0 )); then
    rm -f "${old_logs[@]}"
  fi
fi
