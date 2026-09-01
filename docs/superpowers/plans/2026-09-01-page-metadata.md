# 书签元数据抓取实现计划

**目标：** 新建或编辑书签时，管理员点击按钮由服务端抓取目标页面标题和描述并回填表单，抓取出口复用现有地址策略。

**架构：** 共享契约定义抓取输入和结果；`PageMetadataFetcher` 复用 `UrlPolicy` 与 pinned lookup 发起请求并用 `parse5` 提取元数据；管理员路由负责鉴权、CSRF、校验和错误映射；`NodeEditor` 增加按钮、加载锁和覆盖确认。

**技术栈：** TypeScript、Zod 4、Hono、parse5、Vue 3、Element Plus、Vitest。

---

## 文件结构

### 创建

- `backend/src/services/page-metadata-fetcher.ts`：抓取与元数据提取服务。
- `backend/src/routes/admin-metadata-routes.ts`：管理员抓取接口。
- `backend/tests/page-metadata-fetcher.test.ts`：提取逻辑与编码测试。
- `backend/tests/admin-metadata-routes.test.ts`：路由鉴权与错误映射测试。

### 修改

- `packages/contracts/src/index.ts`：抓取输入与结果契约。
- `backend/src/config/env.ts`：抓取响应体上限配置。
- `backend/src/app.ts`：挂载抓取路由。
- `frontend/src/components/NodeEditor.vue`：获取信息按钮、加载锁与覆盖确认。
- `frontend/tests/NodeEditorMetadata.test.ts`：抓取交互测试。
- `.env.example`：新增配置项说明。

## 任务 1：共享契约

- [x] 编写失败测试，覆盖 URL 必填、长度上限和结果字段可空。
- [x] 实现 `pageMetadataInputSchema`、`PageMetadataInput`、`PageMetadataResult`。
- [x] 运行 contracts build 与定向测试，提交 `feat: 定义页面元数据契约`。

## 任务 2：抓取服务

- [x] 先写失败测试：三级标题与描述优先级、HTML 实体解码、非 UTF-8 转码、缺失元数据、空白折叠、超长截断、非 HTML 拒绝、响应体上限截断、重定向后地址。
- [x] 实现 `PageMetadataFetcher`，复用 `UrlPolicy` 与 `createPinnedLookup`，逐跳重校验重定向。
- [x] 增加 `PAGE_METADATA_MAX_RESPONSE_BYTES` 配置并同步 `.env.example`。
- [x] 运行后端定向测试，提交 `feat: 增加页面元数据抓取服务`。

## 任务 3：管理员路由

- [x] 编写鉴权、CSRF 缺失与错误、契约边界、畸形 JSON、领域错误透传测试。
- [x] 增加 `POST /api/v1/admin/page-metadata`，接入 `requireAdmin`、`malformedJsonGuard` 和窄接口注入。
- [x] 在 `app.ts` 挂载并补完整路径注册测试。
- [x] 运行后端全量测试，提交 `feat: 提供页面元数据接口`。

## 任务 4：编辑器交互

- [x] 先写失败测试：地址为空时按钮禁用、加载期间锁定、空字段直填、非空字段确认覆盖、取消保留原值、失败后表单不变。
- [x] 在 `NodeEditor` 增加按钮与抓取处理，成功后按覆盖策略写入草稿。
- [x] 运行前端全量测试与 typecheck，提交 `feat: 编辑器接入元数据抓取`。

## 任务 5：门禁与发布

- [x] 运行 `npx --yes bun@1.4.0 run check`。
- [x] 用真实公网地址验证抓取结果，并确认内网地址被策略拒绝。
- [x] 整体代码审查，合并 `main`，推送 GitHub 与 Gitea。
