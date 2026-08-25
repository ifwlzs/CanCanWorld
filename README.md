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
