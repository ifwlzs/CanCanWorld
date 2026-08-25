#!/usr/bin/env bash
set -Eeuo pipefail

# Docker 部署目录只保存 Compose 配置和生产环境文件，应用内容固化在版本镜像中。
INSTALL_DIR="${CANCANWORLD_DOCKER_DIR:-/opt/cancanworld-docker}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$PACKAGE_ROOT/VERSION" ]]; then VERSION="$(tr -d '\r\n' < "$PACKAGE_ROOT/VERSION")"; else VERSION="development"; fi
COMPOSE_FILE=""
ENV_FILE=""

set_install_paths() {
  COMPOSE_FILE="$INSTALL_DIR/compose.yaml"
  ENV_FILE="$INSTALL_DIR/cancanworld.env"
}
set_install_paths

print_banner() {
  cat <<EOF

============================================================
  CanCanWorld Docker 部署管理器
  发布版本：$VERSION
  默认访问端口：3080（容器内置 Nginx）
============================================================
EOF
}

prompt_value() {
  local label="$1" default_value="$2" result_name="$3" input
  # Bash Readline 提供 Delete、Backspace、方向键和 Home/End 编辑能力。
  read -e -r -p "$label [$default_value]：" input
  printf -v "$result_name" '%s' "${input:-$default_value}"
}

prompt_required() {
  local label="$1" result_name="$2" secret="${3:-0}" input=""
  while [[ -z "$input" ]]; do
    if [[ "$secret" -eq 1 ]]; then
      # 密码输入启用行编辑但保持无回显。
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

prompt_secret_optional() {
  local label="$1" result_name="$2" input=""
  read -e -r -s -p "$label（留空自动生成）：" input
  printf '\n'
  printf -v "$result_name" '%s' "$input"
}

confirm() {
  local label="$1" default_answer="${2:-y}" answer suffix
  if [[ "$default_answer" == "y" ]]; then suffix="Y/n"; else suffix="y/N"; fi
  read -e -r -p "$label [$suffix]：" answer
  answer="${answer:-$default_answer}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

generate_secret() {
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

# 双引号 dotenv 值需要保护反斜杠、引号和 Compose 的美元符号插值。
dotenv_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\$\$}"
  printf '"%s"' "$value"
}

read_env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '\r"'
}

require_docker() {
  command -v docker >/dev/null 2>&1 || { echo "缺少 Docker，请先安装 Docker Engine。" >&2; return 1; }
  docker compose version >/dev/null 2>&1 || { echo "缺少 Docker Compose v2 插件。" >&2; return 1; }
  # 标准 systemd 安装自动启用并启动 Docker；非 systemd 和 rootless Docker 直接沿用当前守护进程。
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files docker.service >/dev/null 2>&1; then
    systemctl enable --now docker.service >/dev/null
  fi
  docker info >/dev/null 2>&1 || { echo "Docker 守护进程未运行或当前用户无访问权限。" >&2; return 1; }
}

compose_command() {
  local profile profile_args=()
  [[ -f "$COMPOSE_FILE" && -f "$ENV_FILE" ]] || { echo "尚未完成 Docker 安装：$INSTALL_DIR" >&2; return 1; }
  profile="$(read_env_value "$ENV_FILE" COMPOSE_PROFILES)"
  [[ -z "$profile" ]] || profile_args=(--profile "$profile")
  docker compose --project-directory "$INSTALL_DIR" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "${profile_args[@]}" "$@"
}

wait_for_health() {
  local attempt
  for attempt in {1..60}; do
    if compose_command exec -T cancanworld curl --fail --silent --show-error http://127.0.0.1:3080/api/v1/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "容器在 120 秒内未通过健康检查，最近日志如下：" >&2
  compose_command logs --tail 100 cancanworld >&2 || true
  return 1
}

write_environment() {
  local target="$1" image="$2" host_port="$3" frontend_origin="$4" profiles="$5"
  local database_host="$6" database_port="$7" database_name="$8" database_user="$9" database_password="${10}"
  local mysql_root_password="${11}" session_secret csrf_secret
  session_secret="$(generate_secret)"
  csrf_secret="$(generate_secret)"
  umask 077
  cat > "$target" <<EOF
# 由 CanCanWorld Docker 部署向导生成；同时供 Compose 插值和应用容器读取。
CANCANWORLD_IMAGE=$(dotenv_quote "$image")
CANCANWORLD_PORT=$host_port
CANCANWORLD_ENV_FILE=$(dotenv_quote "$INSTALL_DIR/cancanworld.env")
COMPOSE_PROFILES=$profiles
MYSQL_ROOT_PASSWORD=$(dotenv_quote "$mysql_root_password")
DATABASE_HOST=$(dotenv_quote "$database_host")
DATABASE_PORT=$database_port
DATABASE_NAME=$(dotenv_quote "$database_name")
DATABASE_USER=$(dotenv_quote "$database_user")
DATABASE_PASSWORD=$(dotenv_quote "$database_password")
DATABASE_POOL_SIZE=10
SERVER_HOST=127.0.0.1
SERVER_PORT=3081
FRONTEND_ORIGIN=$(dotenv_quote "$frontend_origin")
SESSION_SECRET=$session_secret
CSRF_SECRET=$csrf_secret
SESSION_TTL_SECONDS=604800
IMPORT_MAX_FILE_BYTES=10485760
IMPORT_MAX_NODES=100000
IMPORT_MAX_DEPTH=256
IMPORT_JOB_TTL_SECONDS=86400
LINK_CHECK_INTERVAL_SECONDS=1800
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
MIGRATION_RETRIES=60
MIGRATION_RETRY_SECONDS=2
EOF
  chmod 0600 "$target"
}

install_current_package() {
  local install_dir host_port frontend_origin bundled profiles database_host database_port database_name database_user
  local database_password mysql_root_password image temp_env reuse_existing=0
  [[ -f "$PACKAGE_ROOT/deploy/docker/Dockerfile" && -d "$PACKAGE_ROOT/bin" && -d "$PACKAGE_ROOT/public" ]] || {
    echo "安装或升级请从解压后的 Linux 发布包运行 deploy/docker-install.sh。" >&2
    return 1
  }

  prompt_value "Docker 配置目录" "$INSTALL_DIR" install_dir
  [[ "$install_dir" =~ ^/[A-Za-z0-9._/-]+$ && "$install_dir" != "/" && "$install_dir" != *"/../"* && "$install_dir" != *"/.." ]] || {
    echo "配置目录必须是无空格、无上级跳转的非根绝对路径。" >&2
    return 2
  }
  INSTALL_DIR="$install_dir"
  set_install_paths

  if [[ -f "$ENV_FILE" ]] && confirm "检测到现有 Docker 配置，升级时继续复用" "y"; then
    reuse_existing=1
    host_port="$(read_env_value "$ENV_FILE" CANCANWORLD_PORT)"
    host_port="${host_port:-3080}"
  else
    prompt_value "宿主机访问端口" "3080" host_port
    [[ "$host_port" =~ ^[0-9]+$ ]] && (( host_port >= 1 && host_port <= 65535 )) || { echo "访问端口不合法。" >&2; return 2; }
    prompt_value "浏览器访问地址" "http://127.0.0.1:${host_port}" frontend_origin
    [[ "$frontend_origin" =~ ^https?://[^[:space:]]+$ ]] || { echo "浏览器访问地址必须是完整的 http:// 或 https:// URL。" >&2; return 2; }

    bundled=1
    confirm "使用 Docker 内置 MySQL 8" "y" || bundled=0
    if [[ "$bundled" -eq 1 ]]; then
      profiles="bundled-db"
      database_host="mysql"
      database_port="3306"
      prompt_value "MySQL 数据库名" "db_cancanworld" database_name
      prompt_value "MySQL 应用用户名" "cancanworld" database_user
      prompt_secret_optional "MySQL 应用用户密码" database_password
      database_password="${database_password:-$(generate_secret)}"
      mysql_root_password="$(generate_secret)"
    else
      profiles=""
      prompt_value "MySQL 地址" "host.docker.internal" database_host
      prompt_value "MySQL 端口" "3306" database_port
      prompt_value "MySQL 数据库名" "db_cancanworld" database_name
      prompt_required "MySQL 用户名" database_user
      prompt_required "MySQL 密码（输入隐藏）" database_password 1
      # 外部数据库模式仍生成占位 root 密钥，满足 Compose 模型插值但不会启动 MySQL 服务。
      mysql_root_password="$(generate_secret)"
    fi
    [[ "$database_port" =~ ^[0-9]+$ ]] && (( database_port >= 1 && database_port <= 65535 )) || { echo "MySQL 端口不合法。" >&2; return 2; }
    [[ "$database_name" =~ ^[A-Za-z0-9_]+$ ]] || { echo "数据库名只能包含字母、数字和下划线。" >&2; return 2; }
    [[ "$database_user" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "数据库用户名包含不支持的字符。" >&2; return 2; }
  fi

  image="cancanworld:${VERSION}"
  printf '\n部署摘要：\n'
  printf '  版本：%s\n  配置目录：%s\n  浏览器端口：%s\n  Web 入口：容器内置 Nginx\n  镜像：%s\n  开机启动：Docker restart=unless-stopped\n' \
    "$VERSION" "$INSTALL_DIR" "$host_port" "$image"
  [[ "$reuse_existing" -eq 1 ]] || printf '  MySQL：%s\n' "$([[ "$bundled" -eq 1 ]] && echo 'Docker 内置 MySQL 8' || echo '外部 MySQL')"
  confirm "确认构建并启动" "y" || { echo "已取消。"; return 0; }

  install -d -m 0700 "$INSTALL_DIR"
  install -d -m 0755 /usr/local/sbin
  temp_env="$(mktemp "$INSTALL_DIR/cancanworld.env.XXXXXX")"
  if [[ "$reuse_existing" -eq 1 ]]; then
    cp -a "$ENV_FILE" "$temp_env"
    if grep -q '^CANCANWORLD_IMAGE=' "$temp_env"; then
      sed -i "s|^CANCANWORLD_IMAGE=.*|CANCANWORLD_IMAGE=$(dotenv_quote "$image")|" "$temp_env"
    else
      printf '\nCANCANWORLD_IMAGE=%s\n' "$(dotenv_quote "$image")" >> "$temp_env"
    fi
  else
    write_environment "$temp_env" "$image" "$host_port" "$frontend_origin" "$profiles" \
      "$database_host" "$database_port" "$database_name" "$database_user" "$database_password" "$mysql_root_password"
  fi

  echo "正在构建 $image ..."
  if ! docker build --build-arg "APP_VERSION=$VERSION" --tag "$image" --file "$PACKAGE_ROOT/deploy/docker/Dockerfile" "$PACKAGE_ROOT"; then
    rm -f "$temp_env"
    return 1
  fi

  install -m 0644 "$PACKAGE_ROOT/deploy/docker/compose.yaml" "$COMPOSE_FILE"
  install -m 0755 "$PACKAGE_ROOT/deploy/docker-install.sh" "$INSTALL_DIR/docker-install.sh"
  mv -f "$temp_env" "$ENV_FILE"
  chmod 0600 "$ENV_FILE"

  # 固定管理入口只保存安装目录，不保存数据库密码或其他生产配置。
  cat > /usr/local/sbin/cancanworldctl <<EOF
#!/usr/bin/env bash
export CANCANWORLD_DOCKER_DIR=$(printf '%q' "$INSTALL_DIR")
exec bash $(printf '%q' "$INSTALL_DIR/docker-install.sh") "\$@"
EOF
  chmod 0755 /usr/local/sbin/cancanworldctl

  compose_command up -d --remove-orphans
  if wait_for_health; then
    echo "CanCanWorld $VERSION Docker 部署成功。"
    echo "访问地址：$(read_env_value "$ENV_FILE" FRONTEND_ORIGIN)"
    echo "管理命令：sudo cancanworldctl"
  else
    return 1
  fi
}

service_action() {
  local action="$1"
  case "$action" in
    start) compose_command up -d; echo "CanCanWorld 容器已启动。" ;;
    stop) compose_command stop; echo "CanCanWorld 容器已停止。" ;;
    restart) compose_command restart; wait_for_health; echo "CanCanWorld 容器已重启。" ;;
    status) compose_command ps ;;
    logs) compose_command logs --follow --tail 200 ;;
    health)
      compose_command exec -T cancanworld curl --fail --silent --show-error http://127.0.0.1:3080/api/v1/health
      printf '\n健康检查通过。\n'
      ;;
    down) compose_command down; echo "容器和网络已删除，MySQL 数据卷继续保留。" ;;
  esac
}

interactive_menu() {
  [[ "${EUID}" -eq 0 ]] || { echo "请使用 sudo bash ./deploy/docker-install.sh" >&2; exit 1; }
  require_docker
  while true; do
    local choice
    print_banner
    cat <<'EOF'
  1) 安装 / 升级当前发布包
  2) 启动容器
  3) 停止容器
  4) 重启容器
  5) 查看状态
  6) 查看实时日志
  7) 健康检查
  8) 删除容器（保留数据库卷）
  0) 退出
EOF
    read -e -r -p "请选择 [0-8]：" choice
    case "$choice" in
      1) install_current_package || true ;;
      2) service_action start || true ;;
      3) service_action stop || true ;;
      4) service_action restart || true ;;
      5) service_action status || true ;;
      6) service_action logs || true ;;
      7) service_action health || true ;;
      8) service_action down || true ;;
      0) echo "退出 Docker 部署管理器。"; return 0 ;;
      *) echo "选项无效。" ;;
    esac
    [[ "$choice" == "6" ]] || { printf '\n'; read -e -r -p "按 Enter 返回菜单..." _; }
  done
}

usage() {
  cat <<'EOF'
用法：
  sudo bash ./deploy/docker-install.sh

说明：
  无参数进入交互式 Docker 部署管理器。默认宿主机端口为 3080，容器内置 Nginx，
  默认同时启动 MySQL 8 并使用命名卷持久化。安装后可执行 sudo cancanworldctl 管理。
EOF
}

case "${1:-}" in
  "") interactive_menu ;;
  --help|-h) usage ;;
  *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
esac
