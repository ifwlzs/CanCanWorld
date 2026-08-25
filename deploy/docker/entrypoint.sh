#!/usr/bin/env bash
set -Eeuo pipefail

MIGRATION_RETRIES="${MIGRATION_RETRIES:-60}"
MIGRATION_RETRY_SECONDS="${MIGRATION_RETRY_SECONDS:-2}"

# MySQL 容器首次初始化需要时间，迁移器在有限次数内等待数据库可用。
for ((attempt = 1; attempt <= MIGRATION_RETRIES; attempt++)); do
  if /opt/cancanworld/bin/cancanworld-migrate --migration-dir /opt/cancanworld/migrations; then
    break
  fi
  if (( attempt == MIGRATION_RETRIES )); then
    echo "数据库迁移在 ${MIGRATION_RETRIES} 次尝试后仍未成功，容器退出。" >&2
    exit 1
  fi
  echo "数据库尚未就绪，${MIGRATION_RETRY_SECONDS} 秒后重试迁移（${attempt}/${MIGRATION_RETRIES}）。" >&2
  sleep "$MIGRATION_RETRY_SECONDS"
done

/opt/cancanworld/bin/cancanworld-server &
backend_pid="$!"
nginx -g 'daemon off;' &
nginx_pid="$!"

# 收到容器停止信号时同时关闭 Nginx 和 Bun，避免遗留子进程。
shutdown() {
  trap - INT TERM
  kill -TERM "$nginx_pid" "$backend_pid" 2>/dev/null || true
  wait "$nginx_pid" "$backend_pid" 2>/dev/null || true
}
trap 'shutdown; exit 0' INT TERM

# 任一核心进程退出都终止另一个进程，让 Docker 的重启策略恢复完整服务。
set +e
wait -n "$backend_pid" "$nginx_pid"
status="$?"
set -e
shutdown
exit "$status"
