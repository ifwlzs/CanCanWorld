# 后台批量节点操作实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [x]`）语法来跟踪进度。

**目标：** 为后台节点表增加多选和三种批量标签修改模式，并在普通 HTTP/LAN 部署下保持可用。

**架构：** 共享契约定义批量输入和结果结构；管理员路由负责鉴权、CSRF 和校验；Repository 在单事务中读取节点、跳过目录并替换书签标签。前端 AdminPanel 维护选中 ID，批量对话框只编辑标签和模式，成功后清空选择并刷新当前服务端查询。

**技术栈：** TypeScript、Zod 4、Hono、MySQL 8、Vue 3、Element Plus、Vitest。

---

## 文件结构

### 创建

- `backend/tests/admin-node-batch.test.ts`：批量契约、Repository 和路由测试。
- `frontend/tests/AdminBatchTags.test.ts`：批量标签交互测试。
- `backend/src/middleware/json.ts`：共享畸形 JSON 守卫，供查询与批量接口复用。

### 修改

- `packages/contracts/src/index.ts`：批量标签输入和结果契约。
- `backend/src/repositories/node-repository.ts`：增加批量标签事务方法与集合式标签替换。
- `backend/src/routes/admin-node-routes.ts`：增加管理员批量标签接口。
- `frontend/src/components/AdminPanel.vue`：增加选择列、批量操作栏、标签对话框和刷新处理。
- `frontend/src/styles.css`：批量操作栏和对话框稳定布局。

## 任务 1：共享契约

- [x] 编写失败测试，覆盖 `mode=add|remove|replace`、正整数 ID 去重、标签数量上限和空标签只允许 replace。
- [x] 实现 `adminNodeBatchTagSchema`、`AdminNodeBatchTagInput`、`AdminNodeBatchTagResult`。
- [x] 运行 contracts build 与定向测试，提交 `feat: 定义后台批量标签契约`。

## 任务 2：批量 Repository

- [x] 编写事务测试，覆盖三种模式、目录跳过、未知节点统计、标签大小写归一化、参数顺序和异常回滚。
- [x] 在 `AdminNodeRepository` 增加 `batchUpdateTags(input)`，使用连接级事务和现有标签替换逻辑。
- [x] 运行 Repository 定向测试，提交 `feat: 增加批量标签事务更新`。

## 任务 3：批量路由

- [x] 编写管理员、CSRF、畸形 JSON、统一 envelope 测试。
- [x] 增加 `POST /api/v1/admin/nodes/batch-tags` 路由，注入窄接口并透传 AppError。
- [x] 运行后端定向测试，提交 `feat: 提供批量标签接口`。

## 任务 4：前端交互

- [x] 先写失败测试，覆盖多选、目录跳过提示、追加/移除/覆盖提交、提交锁、成功后清空和刷新。
- [x] 在 AdminPanel 接入 `el-table` selection，增加批量操作栏和标签对话框；请求成功后调用当前查询 refresh。
- [x] 运行前端全量测试、typecheck 和 diff-check，提交 `feat: 接入后台批量标签操作`。

## 任务 5：门禁与发布

- [x] 运行 `npx --yes bun@1.4.0 run check`。
- [x] 检查真实 MySQL 事务 SQL 和异常回滚路径；启动前端开发服务验证按钮、选择、对话框和移动端布局。
- [x] 进行整体代码审查，合并 `main`，推送 GitHub 与 Gitea，并确认 GHCR 发布成功。
