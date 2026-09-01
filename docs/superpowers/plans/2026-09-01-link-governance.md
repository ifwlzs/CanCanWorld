# 重复与失效链接治理实现计划

**目标：** 后台提供重复 URL 分组与失效书签治理，重复组由用户选定保留项后删除其余，失效判定按连续失败次数与确定性错误，结论可解释。

**架构：** 共享契约定义查询与写入结构；`LinkGovernanceRepository` 用 SQL 聚合完成分组与连续失败计数，写入走单事务；管理员路由负责鉴权、CSRF、校验与错误映射；前端治理页分两个视图，服务端分页。

**技术栈：** TypeScript、Zod 4、Hono、MySQL 8 窗口函数、Vue 3、Element Plus、Vitest。

---

## 文件结构

### 创建

- `backend/src/repositories/link-governance-repository.ts`：分组、失效判定与合并事务。
- `backend/src/routes/admin-governance-routes.ts`：治理接口。
- `backend/tests/link-governance-contract.test.ts`：契约测试。
- `backend/tests/link-governance-repository.test.ts`：SQL 形状与事务测试。
- `backend/tests/admin-governance-routes.test.ts`：路由测试。
- `frontend/src/components/AdminGovernance.vue`：治理视图组件。
- `frontend/tests/AdminGovernance.test.ts`：治理交互测试。

### 修改

- `packages/contracts/src/index.ts`：治理查询与写入契约。
- `backend/src/app.ts`：挂载治理路由。
- `frontend/src/components/AdminPanel.vue`：新增治理导航页签。
- `frontend/src/styles.css`：治理视图布局。

## 任务 1：共享契约

- [ ] 编写失败测试：分页边界、保留 ID 必须在删除集合之外、删除集合上限、失效查询分页。
- [ ] 实现重复分组查询、合并输入、失效查询与批量清理契约。
- [ ] 运行 contracts build 与定向测试，提交 `feat: 定义链接治理契约`。

## 任务 2：重复分组与合并

- [ ] 编写失败测试：分组只含书签且 url_hash 非空、按成员数倒序稳定分页、合并校验保留 ID 属于该组、待删除不含保留 ID、事务回滚与连接释放。
- [ ] 实现 `findDuplicateGroups` 与 `mergeDuplicates`，复用 `deleteNodeRelations` 清理关联数据。
- [ ] 运行后端定向测试，提交 `feat: 增加重复链接分组与合并`。

## 任务 3：失效判定

- [ ] 编写失败测试：确定性错误命中、连续失败达 3 次命中、失败 2 次不命中、最近成功后重置计数、JavaScript 书签排除、从未检测排除、401/403 排除、超出有效期排除。
- [ ] 实现 `findBrokenBookmarks`，用窗口函数在库内计算连续失败次数并返回判定原因。
- [ ] 运行后端定向测试，提交 `feat: 增加失效链接判定`。

## 任务 4：治理路由

- [ ] 编写鉴权、CSRF、契约边界、畸形 JSON、领域错误透传与完整路径注册测试。
- [ ] 增加四个管理员接口并在 `app.ts` 挂载。
- [ ] 运行后端全量测试，提交 `feat: 提供链接治理接口`。

## 任务 5：前端治理页

- [ ] 先写失败测试：两视图切换、保留项单选、其余默认待删除、合并确认与取消、批量清理上限、失败保留状态、空视图说明。
- [ ] 实现 `AdminGovernance.vue` 并接入 `AdminPanel` 导航。
- [ ] 运行前端全量测试与 typecheck，提交 `feat: 接入链接治理视图`。

## 任务 6：门禁与发布

- [ ] 运行 `npx --yes bun@1.4.0 run check`。
- [ ] 用生产库只读快照验证分组数量约 223 组、失效数量落在预期区间；在隔离库验证合并事务与回滚。
- [ ] 整体代码审查，合并 `main`，推送 GitHub 与 Gitea。
- [ ] 记录回收站阶段需回头把合并删除改为移入回收站。
