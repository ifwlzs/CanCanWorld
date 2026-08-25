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

## Linux 打包部署

在安装 Bun 与 PowerShell 7（`pwsh`）的 Windows 构建机上生成 Linux x64 独立发布包，打包时自动执行完整质量门禁：

```powershell
bun run package:linux
```

产物位于 `release/cancanworld-<版本>-linux-x64.tar.gz`，旁边的 `.sha256` 文件用于传输校验。发布包包含独立后端、独立迁移器、前端静态文件、SQL 迁移、systemd 和 Nginx 配置；目标服务器无需安装 Node.js 或 Bun。

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
