FROM debian:bookworm-slim

ARG APP_VERSION=development

# 运行镜像只安装 Nginx、证书和健康检查工具，Bun 后端使用发布包内的独立可执行文件。
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl nginx \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default

WORKDIR /opt/cancanworld

# 发布包已经完成前后端构建，镜像阶段不再下载依赖或接触源码。
COPY bin/ ./bin/
COPY public/ ./public/
COPY migrations/ ./migrations/
COPY deploy/docker/nginx.conf /etc/nginx/nginx.conf
COPY deploy/docker/entrypoint.sh /usr/local/bin/cancanworld-entrypoint

RUN chmod 0755 ./bin/cancanworld-server ./bin/cancanworld-migrate /usr/local/bin/cancanworld-entrypoint \
  && chown -R www-data:www-data ./public

LABEL org.opencontainers.image.title="CanCanWorld" \
  org.opencontainers.image.description="内置 Nginx 的 CanCanWorld 书签导航" \
  org.opencontainers.image.version="$APP_VERSION"

# Nginx 对外提供前端和 API，Bun 后端仅在容器内部监听 3081。
ENV NODE_ENV=production \
  SERVER_HOST=127.0.0.1 \
  SERVER_PORT=3081

EXPOSE 3080

# 通过 Nginx 检查完整反向代理链路，而不是只检查后端进程。
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=4 \
  CMD curl --fail --silent --show-error http://127.0.0.1:3080/api/v1/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/cancanworld-entrypoint"]
