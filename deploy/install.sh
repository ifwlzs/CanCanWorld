#!/usr/bin/env bash
set -Eeuo pipefail

# 默认安装参数可由命令行覆盖，私密配置始终由外部文件提供。
INSTALL_DIR="/opt/cancanworld"
SERVICE_USER="cancanworld"
SERVER_NAME="_"
ENV_FILE_SOURCE=""
SKIP_NGINX=0

usage() {
  cat <<'EOF'
用法：
  sudo ./deploy/install.sh --env-file /path/cancanworld.env [选项]

选项：
  --server-name NAME    Nginx 域名，默认 _
  --install-dir PATH   安装目录，默认 /opt/cancanworld
  --service-user USER  系统服务用户，默认 cancanworld
  --skip-nginx         仅部署后端和前端文件，不修改 Nginx
  --help               显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE_SOURCE="${2:-}"; shift 2 ;;
    --server-name) SERVER_NAME="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --service-user) SERVICE_USER="${2:-}"; shift 2 ;;
    --skip-nginx) SKIP_NGINX=1; shift ;;
    --help) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || { echo "请使用 sudo 或 root 执行部署脚本" >&2; exit 1; }
[[ "$INSTALL_DIR" == /* && "$INSTALL_DIR" != "/" ]] || { echo "--install-dir 必须是非根绝对路径" >&2; exit 2; }
[[ "$SERVICE_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "--service-user 格式不合法" >&2; exit 2; }
[[ "$SERVER_NAME" =~ ^[A-Za-z0-9._*[:space:]-]+$ ]] || { echo "--server-name 包含不支持的字符" >&2; exit 2; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
VERSION="$(tr -d '\r\n' < "$PACKAGE_ROOT/VERSION")"
[[ "$VERSION" =~ ^[0-9A-Za-z._-]+$ ]] || { echo "发布包 VERSION 不合法" >&2; exit 1; }
CONFIG_DIR="$INSTALL_DIR/config"
CONFIG_FILE="$CONFIG_DIR/cancanworld.env"
RELEASE_DIR="$INSTALL_DIR/releases/$VERSION"
SERVICE_FILE="/etc/systemd/system/cancanworld.service"
NGINX_FILE="/etc/nginx/conf.d/cancanworld.conf"

for command in install cp sed grep find systemctl curl runuser useradd readlink; do
  command -v "$command" >/dev/null 2>&1 || { echo "缺少部署命令：$command" >&2; exit 1; }
done
if [[ "$SKIP_NGINX" -eq 0 ]]; then
  command -v nginx >/dev/null 2>&1 || { echo "缺少 Nginx，请先安装或使用 --skip-nginx" >&2; exit 1; }
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  NOLOGIN_SHELL="$(command -v nologin || printf '%s' /usr/sbin/nologin)"
  useradd --system --home-dir "$INSTALL_DIR" --shell "$NOLOGIN_SHELL" "$SERVICE_USER"
fi
install -d -m 0755 "$INSTALL_DIR" "$INSTALL_DIR/releases" "$CONFIG_DIR"
if [[ "$SKIP_NGINX" -eq 0 ]]; then install -d -m 0755 /etc/nginx/conf.d; fi

CONFIG_TO_VALIDATE="$CONFIG_FILE"
if [[ -n "$ENV_FILE_SOURCE" ]]; then
  [[ -f "$ENV_FILE_SOURCE" ]] || { echo "生产环境文件不存在：$ENV_FILE_SOURCE" >&2; exit 2; }
  CONFIG_TO_VALIDATE="$ENV_FILE_SOURCE"
elif [[ ! -f "$CONFIG_FILE" ]]; then
  install -m 0640 -o root -g "$SERVICE_USER" "$PACKAGE_ROOT/config/cancanworld.env.example" "$CONFIG_FILE"
  echo "已生成 $CONFIG_FILE，请填写生产配置后重新执行部署脚本" >&2
  exit 2
fi

# 必填项和示例占位符在写库前检查，防止弱密钥或空配置启动到生产环境。
for key in DATABASE_HOST DATABASE_PORT DATABASE_NAME DATABASE_USER DATABASE_PASSWORD SERVER_PORT FRONTEND_ORIGIN SESSION_SECRET CSRF_SECRET; do
  grep -Eq "^${key}=.+" "$CONFIG_TO_VALIDATE" || { echo "生产配置缺少：$key" >&2; exit 2; }
done
if grep -Eq '=(CHANGE_ME|CHANGE_TO_)' "$CONFIG_TO_VALIDATE"; then
  echo "生产配置仍包含 CHANGE_ME 或 CHANGE_TO_ 占位值" >&2
  exit 2
fi
SERVER_PORT="$(sed -n 's/^SERVER_PORT=//p' "$CONFIG_TO_VALIDATE" | tail -n 1 | tr -d '\r"' | tr -d "'")"
[[ "$SERVER_PORT" =~ ^[0-9]+$ ]] && (( SERVER_PORT >= 1 && SERVER_PORT <= 65535 )) || { echo "SERVER_PORT 不合法" >&2; exit 2; }

[[ ! -e "$RELEASE_DIR" ]] || { echo "版本已经部署：$VERSION" >&2; exit 2; }
install -d -m 0755 "$RELEASE_DIR"
cp -a "$PACKAGE_ROOT/bin" "$PACKAGE_ROOT/public" "$PACKAGE_ROOT/migrations" "$RELEASE_DIR/"
chown -R root:root "$RELEASE_DIR"
# Windows 生成的 tar 权限不作为生产权限依据，目录、静态文件和可执行文件分别收紧。
find "$RELEASE_DIR" -type d -exec chmod 0755 {} +
find "$RELEASE_DIR" -type f -exec chmod 0644 {} +
chmod 0755 "$RELEASE_DIR/bin/cancanworld-server" "$RELEASE_DIR/bin/cancanworld-migrate"

PREVIOUS_RELEASE=""
if [[ -L "$INSTALL_DIR/current" ]]; then PREVIOUS_RELEASE="$(readlink -f "$INSTALL_DIR/current")"; fi
rm -f "$INSTALL_DIR/current.next" "$INSTALL_DIR/current.rollback"
BACKUP_DIR="$(mktemp -d)"
[[ ! -f "$SERVICE_FILE" ]] || cp -a "$SERVICE_FILE" "$BACKUP_DIR/cancanworld.service"
[[ ! -f "$NGINX_FILE" ]] || cp -a "$NGINX_FILE" "$BACKUP_DIR/cancanworld.conf"
[[ ! -f "$CONFIG_FILE" ]] || cp -a "$CONFIG_FILE" "$BACKUP_DIR/cancanworld.env"
DEPLOY_SUCCEEDED=0

# 任意安装步骤失败时恢复程序链接和服务配置；数据库迁移本身保持幂等，不执行逆向 DDL。
rollback() {
  local status="$?"
  trap - EXIT
  if [[ "$DEPLOY_SUCCEEDED" -eq 0 ]]; then
    set +e
    if [[ -n "$PREVIOUS_RELEASE" ]]; then
      ln -s "$PREVIOUS_RELEASE" "$INSTALL_DIR/current.rollback"
      mv -Tf "$INSTALL_DIR/current.rollback" "$INSTALL_DIR/current"
    else
      rm -f "$INSTALL_DIR/current"
    fi
    if [[ -f "$BACKUP_DIR/cancanworld.service" ]]; then cp -a "$BACKUP_DIR/cancanworld.service" "$SERVICE_FILE"; else rm -f "$SERVICE_FILE"; fi
    if [[ -f "$BACKUP_DIR/cancanworld.conf" ]]; then cp -a "$BACKUP_DIR/cancanworld.conf" "$NGINX_FILE"; else rm -f "$NGINX_FILE"; fi
    if [[ -f "$BACKUP_DIR/cancanworld.env" ]]; then cp -a "$BACKUP_DIR/cancanworld.env" "$CONFIG_FILE"; else rm -f "$CONFIG_FILE"; fi
    systemctl daemon-reload
    if [[ -n "$PREVIOUS_RELEASE" ]]; then
      systemctl restart cancanworld.service
    else
      systemctl stop cancanworld.service
      systemctl disable cancanworld.service >/dev/null 2>&1
    fi
    if [[ "$SKIP_NGINX" -eq 0 ]]; then nginx -t && systemctl reload nginx; fi
    rm -rf "$RELEASE_DIR"
  fi
  rm -rf "$BACKUP_DIR"
  exit "$status"
}
trap rollback EXIT

# 外部生产配置通过校验并建立旧配置备份后才覆盖正式环境文件。
if [[ -n "$ENV_FILE_SOURCE" ]]; then install -m 0640 -o root -g "$SERVICE_USER" "$ENV_FILE_SOURCE" "$CONFIG_FILE"; fi

# 迁移器直接读取 dotenv 文件，全部迁移成功后才切换 current 软链接。
runuser -u "$SERVICE_USER" -- "$RELEASE_DIR/bin/cancanworld-migrate" --env-file "$CONFIG_FILE" --migration-dir "$RELEASE_DIR/migrations"

ln -s "$RELEASE_DIR" "$INSTALL_DIR/current.next"
mv -Tf "$INSTALL_DIR/current.next" "$INSTALL_DIR/current"

escape_sed() { printf '%s' "$1" | sed 's/[&|]/\\&/g'; }
sed \
  -e "s|__SERVICE_USER__|$(escape_sed "$SERVICE_USER")|g" \
  -e "s|__INSTALL_DIR__|$(escape_sed "$INSTALL_DIR")|g" \
  -e "s|__CONFIG_FILE__|$(escape_sed "$CONFIG_FILE")|g" \
  "$PACKAGE_ROOT/deploy/cancanworld.service" > "$SERVICE_FILE"

if [[ "$SKIP_NGINX" -eq 0 ]]; then
  sed \
    -e "s|__SERVER_NAME__|$(escape_sed "$SERVER_NAME")|g" \
    -e "s|__INSTALL_DIR__|$(escape_sed "$INSTALL_DIR")|g" \
    -e "s|__SERVER_PORT__|$SERVER_PORT|g" \
    "$PACKAGE_ROOT/deploy/nginx.conf" > "$NGINX_FILE"
  nginx -t
fi

systemctl daemon-reload
systemctl enable cancanworld.service >/dev/null
systemctl restart cancanworld.service
if [[ "$SKIP_NGINX" -eq 0 ]]; then
  systemctl enable nginx >/dev/null
  if systemctl is-active --quiet nginx; then systemctl reload nginx; else systemctl start nginx; fi
fi

HEALTH_URL="http://127.0.0.1:${SERVER_PORT}/api/v1/health"
for _ in {1..30}; do
  if curl --fail --silent --show-error --max-time 2 "$HEALTH_URL" >/dev/null; then
    DEPLOY_SUCCEEDED=1
    trap - EXIT
    rm -rf "$BACKUP_DIR"
    echo "CanCanWorld $VERSION 部署成功"
    echo "健康检查：$HEALTH_URL"
    exit 0
  fi
  sleep 1
done

echo "新版本健康检查失败，退出时自动回退程序和服务配置" >&2
journalctl -u cancanworld.service -n 50 --no-pager >&2 || true
exit 1
