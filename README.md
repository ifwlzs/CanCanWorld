# CanCanWorld 书签导航

CanCanWorld 是以 OneNav 使用体验为功能基线、重新设计无限目录和浏览器书签导入能力的单体书签导航系统。

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Element Plus、Pinia
- 后端：Bun、Hono、TypeScript、Drizzle ORM
- 数据库：MySQL 8

## 本地启动

1. 安装 Bun `1.4.0`。
2. 根据 `.env.example` 在根目录创建 `.env`，填写已轮换的 MySQL 凭据和随机密钥。
3. 执行 `bun install`。
4. 执行 `bun run db:migrate`。
5. 执行 `bun run dev`。

前端默认地址为 `http://localhost:5173`，后端健康检查为 `http://localhost:3080/api/v1/health`。

完整设计和验收规则见 [开发.md](./开发.md)。

## Docker 部署（推荐）

Linux 发布包内置单容器 Web 运行时：Nginx 在容器内监听 `3080`，直接提供 Vue 前端，并将 `/api/` 转发给只监听容器回环地址的 Bun 后端。宿主机无需安装 Nginx、Bun、Node.js 或额外安装脚本。

`main` 分支由 GitHub Actions 自动执行完整质量门禁并发布 `linux/amd64` 镜像：

```text
ghcr.io/ifwlzs/cancanworld:latest
ghcr.io/ifwlzs/cancanworld:sha-<提交短哈希>
```

推送 `v*` 标签时还会发布同名镜像标签，并创建包含 Linux 压缩包和 SHA-256 的 GitHub Release。

目标服务器安装 Docker Engine 和 Docker Compose v2 后，解压发布包、生成配置并直接启动：

```bash
tar -xzf cancanworld-<版本>-linux-x64.tar.gz
cd cancanworld-<版本>-linux-x64
cp config/docker.env.example .env

# 编辑数据库密码、两份应用密钥和真实访问地址。
nano .env

docker compose up -d --build
```

使用 GHCR 镜像时，将 `.env` 中的镜像地址改为：

```dotenv
CANCANWORLD_IMAGE=ghcr.io/ifwlzs/cancanworld:latest
```

然后跳过服务器本地构建：

```bash
docker compose pull
docker compose up -d --no-build
```

私有 GHCR Package 需要先使用具备 `read:packages` 权限的 GitHub Token 登录：

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io --username ifwlzs --password-stdin
```

默认配置将完整网站映射到宿主机 `3080` 端口，只启动 CanCanWorld 应用容器。数据库使用 `.env` 中配置的外部 MySQL，不创建 MySQL 容器或数据库命名卷。容器使用 `restart: unless-stopped` 随 Docker 自动恢复。

`.env` 中必须修改以下配置：

```dotenv
DATABASE_PASSWORD=随机应用数据库密码
DATABASE_HOST=host.docker.internal
DATABASE_PORT=3306
DATABASE_NAME=db_cancanworld
DATABASE_USER=finedb
FRONTEND_ORIGIN=http://nas.lan:3080
SESSION_SECRET=至少32个随机字符
CSRF_SECRET=另一份至少32个随机字符
```

MySQL 必须提前创建数据库和账号，并授予应用迁移所需的建表、修改表和索引权限。数据库位于 Docker 宿主机时可使用 `host.docker.internal`；如果 MySQL 在其他机器，请填写该机器的局域网 IP 或 DNS。MySQL 不能只监听 `127.0.0.1`，还需允许来自 Docker 网段的连接。

容器内 Nginx 使用 `server_name _`，因此宿主机 3080 端口收到的 `nas`、`nas.lan`、`192.168.2.190` 等 Host 都会进入同一个站点。Docker 端口默认绑定宿主机所有网卡；如宿主机防火墙启用，请放行 TCP 3080。前端通过同源地址访问 API，不要求把所有地址都写入 `FRONTEND_ORIGIN`；该值填你常用的访问地址即可。

常用管理命令：

```bash
docker compose ps
docker compose logs -f --tail 200 cancanworld
docker compose restart
docker compose down
```

## Linux 原生部署

在安装 Bun 与 PowerShell 7（`pwsh`）的 Windows 构建机上生成 Linux x64 独立发布包，打包时自动执行完整质量门禁：

```powershell
bun run package:linux
```

产物位于 `release/cancanworld-<版本>-linux-x64.tar.gz`，旁边的 `.sha256` 文件用于传输校验。发布包包含独立后端、独立迁移器、前端静态文件、SQL 迁移、Docker 部署文件，以及可选的 systemd 和宿主机 Nginx 配置；目标服务器无需安装 Node.js 或 Bun。

将发布包和生产环境文件上传到 Linux x64 服务器后执行：

```bash
tar -xzf cancanworld-<版本>-linux-x64.tar.gz
cd cancanworld-<版本>-linux-x64
sudo bash ./deploy/install.sh
```

交互式菜单提供安装/升级、启动、停止、重启、状态、实时日志、健康检查和开机启动开关。安装向导逐项询问 MySQL、域名/IP、Nginx 和后端端口，端口默认 `3080`，会话及 CSRF 密钥自动生成且数据库密码输入不回显。

如果安装时选择跳过 Nginx，`3080` 端口只提供 `/api/v1/*` 后端接口，访问根路径会返回 `40400 接口不存在`；需要启用 Nginx 托管 `current/public`，或自行配置其他静态文件服务器。

安装脚本默认部署到 `/opt/cancanworld`，自动执行数据库迁移、配置 systemd、启用开机启动、配置 Nginx、启动服务并检查 `/api/v1/health`。已有版本使用 `current` 软链接原子切换，新服务健康检查失败时自动回退程序版本和配置。已经安装过的服务器可在交互向导中直接复用现有生产配置。安装完成后随时执行以下命令重新进入管理菜单：

```bash
sudo cancanworldctl
```

无人值守部署仍可使用参数模式：

```bash
sudo bash ./deploy/install.sh \
  --env-file /path/cancanworld.env \
  --server-name nav.example.com \
  --host 127.0.0.1 \
  --port 3080
```
