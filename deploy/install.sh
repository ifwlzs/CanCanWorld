#!/usr/bin/env bash
set -Eeuo pipefail

# 默认安装参数可由命令行覆盖，私密配置始终由外部文件提供。
INSTALL_DIR="${CANCANWORLD_INSTALL_DIR:-/opt/cancanworld}"
SERVICE_USER="cancanworld"
SERVER_NAME="_"
SERVER_HOST_OVERRIDE=""
SERVER_PORT_OVERRIDE=""
ENV_FILE_SOURCE=""
SKIP_NGINX=0
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$PACKAGE_ROOT/VERSION" ]]; then VERSION="$(tr -d '\r\n' < "$PACKAGE_ROOT/VERSION")"; else VERSION="development"; fi

print_banner() {
  cat <<EOF

============================================================
  CanCanWorld 部署管理器
  发布版本：$VERSION
  默认端口：3080
============================================================
EOF
}

prompt_value() {
  local label="$1" default_value="$2" result_name="$3" input
  # 使用 Bash Readline 接管终端编辑，支持 Delete、方向键、Home/End 等按键。
  read -e -r -p "$label [$default_value]：" input
  printf -v "$result_name" '%s' "${input:-$default_value}"
}

prompt_required() {
  local label="$1" result_name="$2" secret="${3:-0}" input=""
  while [[ -z "$input" ]]; do
    if [[ "$secret" -eq 1 ]]; then
      # 密码同样启用 Readline，但继续关闭回显，避免敏感值显示在终端。
      read -e -r -s -p "$label：" input
      printf '\n'
    else
      read -e -r -p "$label：" input
    fi
    [[ -n "$input" ]] || echo "该项不能为空。"
  done
  [[ "$input" != *$'\n'* && "$input" != *$'\r'* ]] || { echo "配置值不能包含换行" >&2; return 2; }
  printf -v "$result_name" '%s' "$input"
}

confirm() {
  local label="$1" default_answer="${2:-y}" answer suffix
  if [[ "$default_answer" == "y" ]]; then suffix="Y/n"; else suffix="y/N"; fi
  read -e -r -p "$label [$suffix]：" answer
  answer="${answer:-$default_answer}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

read_env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '\r"' | tr -d "'"
}

dotenv_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

generate_secret() {
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

write_interactive_env() {
  local target="$1" database_host="$2" database_port="$3" database_name="$4"
  local database_user="$5" database_password="$6" frontend_origin="$7" server_host="$8" server_port="$9"
  local session_secret csrf_secret
  session_secret="$(generate_secret)"
  csrf_secret="$(generate_secret)"
  umask 077
  cat > "$target" <<EOF
# 由 CanCanWorld 交互式部署向导生成，文件权限固定为 0600。
DATABASE_HOST=$(dotenv_quote "$database_host")
DATABASE_PORT=$database_port
DATABASE_NAME=$(dotenv_quote "$database_name")
DATABASE_USER=$(dotenv_quote "$database_user")
DATABASE_PASSWORD=$(dotenv_quote "$database_password")
DATABASE_POOL_SIZE=10
  SERVER_HOST=$server_host
SERVER_PORT=$server_port
FRONTEND_ORIGIN=$(dotenv_quote "$frontend_origin")
SESSION_SECRET=$session_secret
CSRF_SECRET=$csrf_secret
SESSION_TTL_SECONDS=604800
IMPORT_MAX_FILE_BYTES=10485760
IMPORT_MAX_NODES=100000
IMPORT_MAX_DEPTH=256
IMPORT_JOB_TTL_SECONDS=86400
LINK_CHECK_CONCURRENCY=10
LINK_CHECK_PER_HOST_CONCURRENCY=2
LINK_CHECK_TIMEOUT_MS=10000
LINK_CHECK_MAX_REDIRECTS=5
LINK_CHECK_MAX_RESPONSE_BYTES=65536
LINK_CHECK_ALLOWED_PORTS=80,443
LINK_CHECK_ALLOWED_CIDRS=
LINK_CHECK_HISTORY_RETENTION_DAYS=30
LOG_LEVEL=info
NODE_ENV=production
EOF
  chmod 0600 "$target"
}

service_action() {
  local action="$1"
  case "$action" in
    start) systemctl start cancanworld.service; echo "CanCanWorld 已启动。" ;;
    stop) systemctl stop cancanworld.service; echo "CanCanWorld 已停止。" ;;
    restart) systemctl restart cancanworld.service; echo "CanCanWorld 已重启。" ;;
    status) systemctl status cancanworld.service --no-pager --full || true ;;
    logs) journalctl -u cancanworld.service -f --no-pager || true ;;
    enable) systemctl enable cancanworld.service; echo "已启用开机启动。" ;;
    disable) systemctl disable cancanworld.service; echo "已关闭开机启动，当前服务不会被停止。" ;;
    health)
      local config_file="$INSTALL_DIR/config/cancanworld.env" port
      port="$(read_env_value "$config_file" SERVER_PORT)"
      port="${port:-3080}"
      if curl --fail --silent --show-error "http://127.0.0.1:${port}/api/v1/health"; then
        printf '\n健康检查通过：http://127.0.0.1:%s/api/v1/health\n' "$port"
      else
        echo "健康检查失败，请查看状态和日志。" >&2
        return 1
      fi
      ;;
  esac
}

interactive_install() {
  local install_dir service_user server_name server_host server_port database_host database_port database_name
  local database_user database_password frontend_origin nginx_choice existing_config reuse_existing temp_env=""
  prompt_value "安装目录" "$INSTALL_DIR" install_dir
  prompt_value "系统服务用户" "cancanworld" service_user
  existing_config="$install_dir/config/cancanworld.env"
  server_port="$(read_env_value "$existing_config" SERVER_PORT)"
  prompt_value "后端监听端口" "${server_port:-3080}" server_port
  prompt_value "访问域名或服务器 IP（用于 Nginx）" "_" server_name
  nginx_choice=1
  confirm "配置并启用 Nginx" "y" || nginx_choice=0
  if [[ "$nginx_choice" -eq 1 ]]; then
    prompt_value "后端监听地址" "127.0.0.1" server_host
  else
    prompt_value "后端监听地址" "0.0.0.0" server_host
  fi

  reuse_existing=0
  if [[ -f "$existing_config" ]] && confirm "检测到现有生产配置，继续复用" "y"; then
    reuse_existing=1
  else
    prompt_value "MySQL 地址" "127.0.0.1" database_host
    prompt_value "MySQL 端口" "3306" database_port
    prompt_value "MySQL 数据库名" "db_cancanworld" database_name
    prompt_required "MySQL 用户名" database_user
    prompt_required "MySQL 密码（输入隐藏）" database_password 1
    if [[ "$server_name" == "_" ]]; then
      prompt_value "浏览器访问地址" "http://127.0.0.1" frontend_origin
    else
      prompt_value "浏览器访问地址" "http://$server_name" frontend_origin
    fi
    temp_env="$(mktemp)"
    write_interactive_env "$temp_env" "$database_host" "$database_port" "$database_name" "$database_user" "$database_password" "$frontend_origin" "$server_host" "$server_port"
  fi

  printf '\n部署摘要：\n'
  printf '  版本：%s\n  目录：%s\n  服务用户：%s\n  后端监听：%s:%s\n  Nginx：%s\n  开机启动：启用\n' \
    "$VERSION" "$install_dir" "$service_user" "$server_host" "$server_port" "$([[ "$nginx_choice" -eq 1 ]] && echo 启用 || echo 跳过)"
  if ! confirm "确认开始安装或升级" "y"; then
    [[ -z "$temp_env" ]] || rm -f "$temp_env"
    echo "已取消。"
    return 0
  fi

  local command=(bash "$SCRIPT_DIR/install.sh" --install-dir "$install_dir" --service-user "$service_user" --server-name "$server_name" --host "$server_host" --port "$server_port")
  [[ "$nginx_choice" -eq 1 ]] || command+=(--skip-nginx)
  [[ "$reuse_existing" -eq 1 ]] || command+=(--env-file "$temp_env")
  if "${command[@]}"; then
    echo "安装完成。以后可再次运行本脚本进入管理菜单。"
    if [[ "$nginx_choice" -eq 0 ]]; then
      # 后端只注册 API 路由；跳过 Nginx 时必须另行托管 public 静态文件，根路径不会显示前端。
      echo "已跳过 Nginx：后端端口 ${server_port} 仅提供 API，根路径返回 40400；请启用 Nginx 或单独托管 public 目录。"
    fi
  else
    local status="$?"
    [[ -z "$temp_env" ]] || rm -f "$temp_env"
    return "$status"
  fi
  [[ -z "$temp_env" ]] || rm -f "$temp_env"
}

interactive_menu() {
  [[ "${EUID}" -eq 0 ]] || { echo "交互式部署请使用：sudo bash ./deploy/install.sh" >&2; exit 1; }
  for command in systemctl curl sed od tr; do
    command -v "$command" >/dev/null 2>&1 || { echo "缺少命令：$command" >&2; exit 1; }
  done
  while true; do
    local active enabled choice
    active="$(systemctl is-active cancanworld.service 2>/dev/null || true)"
    enabled="$(systemctl is-enabled cancanworld.service 2>/dev/null || true)"
    print_banner
    printf '  当前状态：%s    开机启动：%s\n\n' "${active:-未安装}" "${enabled:-未安装}"
    cat <<'EOF'
  1) 安装 / 升级
  2) 启动服务
  3) 停止服务
  4) 重启服务
  5) 查看状态
  6) 查看实时日志
  7) 健康检查
  8) 启用开机启动
  9) 关闭开机启动
  0) 退出
EOF
    read -e -r -p "请选择 [0-9]：" choice
    case "$choice" in
      1) interactive_install || true ;;
      2) service_action start || true ;;
      3) service_action stop || true ;;
      4) service_action restart || true ;;
      5) service_action status ;;
      6) service_action logs ;;
      7) service_action health || true ;;
      8) service_action enable || true ;;
      9) service_action disable || true ;;
      0) echo "退出部署管理器。"; return 0 ;;
      *) echo "选项无效。" ;;
    esac
    [[ "$choice" == "6" ]] || { printf '\n'; read -e -r -p "按 Enter 返回菜单..." _; }
  done
}

usage() {
  cat <<'EOF'
用法：
  sudo bash ./deploy/install.sh
  sudo bash ./deploy/install.sh --env-file /path/cancanworld.env [选项]

选项：
  --server-name NAME    Nginx 域名，默认 _
  --host HOST           后端监听地址；使用 Nginx 时默认 127.0.0.1
  --port PORT           后端监听端口，默认 3080
  --install-dir PATH   安装目录，默认 /opt/cancanworld
  --service-user USER  系统服务用户，默认 cancanworld
  --skip-nginx         仅部署后端和前端文件，不修改 Nginx
  --help               显示帮助
EOF
}

if [[ $# -eq 0 ]]; then
  interactive_menu
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE_SOURCE="${2:-}"; shift 2 ;;
    --server-name) SERVER_NAME="${2:-}"; shift 2 ;;
    --host) SERVER_HOST_OVERRIDE="${2:-}"; shift 2 ;;
    --port) SERVER_PORT_OVERRIDE="${2:-}"; shift 2 ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --service-user) SERVICE_USER="${2:-}"; shift 2 ;;
    --skip-nginx) SKIP_NGINX=1; shift ;;
    --help) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || { echo "请使用 sudo 或 root 执行部署脚本" >&2; exit 1; }
[[ "$INSTALL_DIR" =~ ^/[A-Za-z0-9._/-]+$ && "$INSTALL_DIR" != "/" && "$INSTALL_DIR" != *"/../"* && "$INSTALL_DIR" != *"/.." ]] || { echo "--install-dir 必须是无空格、无上级跳转的非根绝对路径" >&2; exit 2; }
[[ "$SERVICE_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "--service-user 格式不合法" >&2; exit 2; }
[[ "$SERVER_NAME" =~ ^[A-Za-z0-9._*[:space:]-]+$ ]] || { echo "--server-name 包含不支持的字符" >&2; exit 2; }
[[ -z "$SERVER_HOST_OVERRIDE" || "$SERVER_HOST_OVERRIDE" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "--host 格式不合法" >&2; exit 2; }

[[ "$VERSION" =~ ^[0-9A-Za-z._-]+$ ]] || { echo "发布包 VERSION 不合法" >&2; exit 1; }
CONFIG_DIR="$INSTALL_DIR/config"
CONFIG_FILE="$CONFIG_DIR/cancanworld.env"
RELEASE_DIR="$INSTALL_DIR/releases/$VERSION"
SERVICE_FILE="/etc/systemd/system/cancanworld.service"
NGINX_FILE="/etc/nginx/conf.d/cancanworld.conf"
MANAGER_FILE="/usr/local/sbin/cancanworldctl"

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
install -d -m 0755 "$INSTALL_DIR" "$INSTALL_DIR/releases" "$CONFIG_DIR" /usr/local/sbin
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
for key in DATABASE_HOST DATABASE_PORT DATABASE_NAME DATABASE_USER DATABASE_PASSWORD FRONTEND_ORIGIN SESSION_SECRET CSRF_SECRET; do
  grep -Eq "^${key}=.+" "$CONFIG_TO_VALIDATE" || { echo "生产配置缺少：$key" >&2; exit 2; }
done
if grep -Eq '=(CHANGE_ME|CHANGE_TO_)' "$CONFIG_TO_VALIDATE"; then
  echo "生产配置仍包含 CHANGE_ME 或 CHANGE_TO_ 占位值" >&2
  exit 2
fi
SERVER_PORT="${SERVER_PORT_OVERRIDE:-$(read_env_value "$CONFIG_TO_VALIDATE" SERVER_PORT)}"
SERVER_PORT="${SERVER_PORT:-3080}"
[[ "$SERVER_PORT" =~ ^[0-9]+$ ]] && (( SERVER_PORT >= 1 && SERVER_PORT <= 65535 )) || { echo "SERVER_PORT 不合法" >&2; exit 2; }
SERVER_HOST="${SERVER_HOST_OVERRIDE:-$(read_env_value "$CONFIG_TO_VALIDATE" SERVER_HOST)}"
SERVER_HOST="${SERVER_HOST:-127.0.0.1}"
[[ "$SERVER_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "SERVER_HOST 不合法" >&2; exit 2; }

[[ ! -e "$RELEASE_DIR" ]] || { echo "版本已经部署：$VERSION" >&2; exit 2; }
install -d -m 0755 "$RELEASE_DIR"
cp -a "$PACKAGE_ROOT/bin" "$PACKAGE_ROOT/public" "$PACKAGE_ROOT/migrations" "$PACKAGE_ROOT/deploy" "$PACKAGE_ROOT/config" "$PACKAGE_ROOT/VERSION" "$RELEASE_DIR/"
chown -R root:root "$RELEASE_DIR"
# Windows 生成的 tar 权限不作为生产权限依据，目录、静态文件和可执行文件分别收紧。
find "$RELEASE_DIR" -type d -exec chmod 0755 {} +
find "$RELEASE_DIR" -type f -exec chmod 0644 {} +
chmod 0755 "$RELEASE_DIR/bin/cancanworld-server" "$RELEASE_DIR/bin/cancanworld-migrate"
chmod 0755 "$RELEASE_DIR/deploy/install.sh"

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
      rm -f "$MANAGER_FILE"
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
# 命令行 --port 优先于环境文件；两者都未提供时明确写入默认端口 3080。
if grep -q '^SERVER_PORT=' "$CONFIG_FILE"; then
  sed -i "s/^SERVER_PORT=.*/SERVER_PORT=$SERVER_PORT/" "$CONFIG_FILE"
else
  printf '\nSERVER_PORT=%s\n' "$SERVER_PORT" >> "$CONFIG_FILE"
fi
if grep -q '^SERVER_HOST=' "$CONFIG_FILE"; then
  sed -i "s/^SERVER_HOST=.*/SERVER_HOST=$SERVER_HOST/" "$CONFIG_FILE"
else
  printf '\nSERVER_HOST=%s\n' "$SERVER_HOST" >> "$CONFIG_FILE"
fi

# 迁移器直接读取 dotenv 文件，全部迁移成功后才切换 current 软链接。
runuser -u "$SERVICE_USER" -- "$RELEASE_DIR/bin/cancanworld-migrate" --env-file "$CONFIG_FILE" --migration-dir "$RELEASE_DIR/migrations"

ln -s "$RELEASE_DIR" "$INSTALL_DIR/current.next"
mv -Tf "$INSTALL_DIR/current.next" "$INSTALL_DIR/current"

# 安装固定系统入口，之后执行 sudo cancanworldctl 即可再次打开交互式管理器。
cat > "$MANAGER_FILE" <<EOF
#!/usr/bin/env bash
export CANCANWORLD_INSTALL_DIR="$INSTALL_DIR"
exec bash "$INSTALL_DIR/current/deploy/install.sh" "\$@"
EOF
chmod 0755 "$MANAGER_FILE"

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
    if [[ "$SKIP_NGINX" -eq 1 ]]; then
      # --skip-nginx 不会把 Vue 静态文件交给 Bun 提供，避免用户误把 API 根路径当作前端地址。
      echo "提示：已跳过 Nginx，${SERVER_PORT} 端口仅提供 API；前端需启用 Nginx 或单独托管 current/public。"
    fi
    exit 0
  fi
  sleep 1
done

echo "新版本健康检查失败，退出时自动回退程序和服务配置" >&2
journalctl -u cancanworld.service -n 50 --no-pager >&2 || true
exit 1
