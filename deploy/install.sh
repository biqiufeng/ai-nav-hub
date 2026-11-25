#!/usr/bin/env bash
set -euo pipefail

# Portable one-click installer / updater for any Linux ECS (Ubuntu/Debian/CentOS/Alibaba Cloud Linux).
# Examples:
#   sudo bash deploy/install.sh
#   SITE_ADDR=:8080 sudo -E bash deploy/install.sh
#   SITE_ADDR=nav.example.com WEB_SERVER=caddy sudo -E bash deploy/install.sh
#   curl -fsSL https://raw.githubusercontent.com/biqiufeng/ai-nav-hub/main/deploy/install.sh | sudo bash

REPO_URL="${REPO_URL:-https://github.com/biqiufeng/ai-nav-hub.git}"
APP_DIR="${APP_DIR:-/opt/ai-nav-hub}"
SITE_ADDR="${SITE_ADDR:-:80}"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 4 * * 1}"
WEB_SERVER="${WEB_SERVER:-auto}" # auto | caddy | nginx | none

log() { printf "\n[%s] %s\n" "$(date +%H:%M:%S)" "$*"; }

if [[ "${EUID}" -ne 0 ]] && [[ "${WEB_SERVER}" != "none" ]]; then
  echo "请使用 root 或 sudo 运行（例如: sudo -E bash $0），或设置 WEB_SERVER=none 仅拉取数据。" >&2
  exit 1
fi

install_pkg() {
  local pkg="$1"
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${pkg}"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q "${pkg}"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y -q "${pkg}"
  else
    echo "未识别的包管理器，请手动安装: ${pkg}" >&2
    exit 1
  fi
}

install_caddy_official() {
  if command -v caddy >/dev/null 2>&1; then
    return 0
  fi
  log "正在安装 Caddy..."
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.tar.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q 'dnf-command(copr)' || true
    dnf copr enable -y @caddy/caddy
    dnf install -y -q caddy
  else
    echo "请手动安装 Caddy 或设置 WEB_SERVER=nginx" >&2
    exit 1
  fi
}

# 1. Ensure prerequisites
for cmd in python3 git curl flock; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    case "${cmd}" in
      flock) install_pkg util-linux ;;
      *) install_pkg "${cmd}" ;;
    esac
  fi
done

# 2. Sync repository into APP_DIR
SCRIPT_SRC_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" ]] && [[ -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
if [[ -n "${SCRIPT_SRC_DIR}" ]] && [[ -f "${SCRIPT_SRC_DIR}/crawler/fetch_all.py" ]] && [[ -f "${SCRIPT_SRC_DIR}/web/index.html" ]]; then
  if [[ "${SCRIPT_SRC_DIR}" != "${APP_DIR}" ]]; then
    log "同步本地项目到 ${APP_DIR}..."
    mkdir -p "${APP_DIR}"
    cp -a "${SCRIPT_SRC_DIR}/." "${APP_DIR}/"
  fi
elif [[ -d "${APP_DIR}/.git" ]]; then
  log "更新已有仓库 ${APP_DIR}..."
  git -C "${APP_DIR}" pull --ff-only
else
  log "从 ${REPO_URL} 克隆到 ${APP_DIR}..."
  git clone --depth 1 "${REPO_URL}" "${APP_DIR}"
fi

chmod +x "${APP_DIR}/crawler/fetch_all.py" "${APP_DIR}/deploy/run_weekly_crawl.sh" "${APP_DIR}/deploy/install.sh"

# 3. Run initial crawl
log "执行全量抓取生成 web/data/catalog.json..."
APP_DIR="${APP_DIR}" "${APP_DIR}/deploy/run_weekly_crawl.sh"

# 4. Configure Web Server
if [[ "${WEB_SERVER}" == "auto" ]]; then
  if command -v caddy >/dev/null 2>&1; then
    WEB_SERVER="caddy"
  elif command -v nginx >/dev/null 2>&1; then
    WEB_SERVER="nginx"
  else
    install_caddy_official
    WEB_SERVER="caddy"
  fi
fi

if [[ "${WEB_SERVER}" == "caddy" ]]; then
  install_caddy_official
  log "配置 Caddy (${SITE_ADDR} -> ${APP_DIR}/web)..."
  if [[ -f /etc/caddy/Caddyfile ]] && [[ ! -f /etc/caddy/Caddyfile.bak ]]; then
    cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
  fi
  sed -e "s|^:80 {|${SITE_ADDR} {|g" \
      -e "s|/opt/ai-nav-hub|${APP_DIR}|g" \
      "${APP_DIR}/deploy/Caddyfile" > /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile
  systemctl enable --now caddy
  systemctl reload caddy
elif [[ "${WEB_SERVER}" == "nginx" ]]; then
  if ! command -v nginx >/dev/null 2>&1; then
    install_pkg nginx
  fi
  PORT_NUM="${SITE_ADDR##*:}"
  if [[ -z "${PORT_NUM}" || "${PORT_NUM}" == "${SITE_ADDR}" ]]; then
    PORT_NUM="80"
    SERVER_NAME="${SITE_ADDR}"
  else
    SERVER_NAME="_"
  fi
  log "配置 Nginx (listen ${PORT_NUM}, server_name ${SERVER_NAME} -> ${APP_DIR}/web)..."
  NGINX_CONF_DIR="/etc/nginx/conf.d"
  if [[ -d /etc/nginx/sites-available ]]; then
    NGINX_TARGET="/etc/nginx/sites-available/ai-nav-hub.conf"
    NGINX_LINK="/etc/nginx/sites-enabled/ai-nav-hub.conf"
  else
    NGINX_TARGET="${NGINX_CONF_DIR}/ai-nav-hub.conf"
    NGINX_LINK=""
  fi
  sed -e "s|__PORT__|${PORT_NUM}|g" \
      -e "s|__SERVER_NAME__|${SERVER_NAME}|g" \
      -e "s|__APP_DIR__|${APP_DIR}|g" \
      "${APP_DIR}/deploy/nginx.conf.template" > "${NGINX_TARGET}"
  if [[ -n "${NGINX_LINK}" ]]; then
    ln -sf "${NGINX_TARGET}" "${NGINX_LINK}"
    rm -f /etc/nginx/sites-enabled/default || true
  fi
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
elif [[ "${WEB_SERVER}" == "none" ]]; then
  log "WEB_SERVER=none：已跳过 Web 服务器配置，静态文件位于 ${APP_DIR}/web"
else
  echo "不支持的 WEB_SERVER=${WEB_SERVER}（可选: auto | caddy | nginx | none）" >&2
  exit 1
fi

# 5. Register weekly cron job idempotently (preserve all existing jobs)
CRON_CMD="${CRON_SCHEDULE} APP_DIR=${APP_DIR} ${APP_DIR}/deploy/run_weekly_crawl.sh"
(
  (crontab -l 2>/dev/null || true) | grep -v "run_weekly_crawl.sh"
  echo "${CRON_CMD}"
) | crontab -

log "部署完成！"
echo "  项目目录: ${APP_DIR}"
echo "  监听配置: ${SITE_ADDR} (Web: ${WEB_SERVER})"
echo "  定时任务: ${CRON_CMD}"
echo "  抓取日志: ${APP_DIR}/logs/"
