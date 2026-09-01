# 管理后台高级查询与筛选实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将管理后台节点列表改为服务端分页查询，增加组合筛选、持久化筛选预设和目录快速定位，同时保持前台目录树、公开搜索与单条写接口兼容。

**架构：** 共享契约定义唯一的查询与预设结构；独立 `AdminNodeRepository` 负责管理员 SQL、分页、路径和标签装配，管理员 Route 只处理鉴权与校验。前端用可测试的查询状态组合函数隔离竞态和错误保留，筛选抽屉负责编辑条件，`AdminPanel` 只负责表格编排与事件转发。

**技术栈：** TypeScript、Zod 4、Bun 1.4、Hono、MySQL 8、Vue 3 Composition API、Element Plus、Vitest、Vue Test Utils。

---

## 文件结构

### 创建

- `backend/src/repositories/admin-node-repository.ts`：管理员节点筛选 SQL、分页总数、当前页标签和完整路径装配。
- `backend/src/routes/admin-node-routes.ts`：`POST /query` 管理员查询接口及可注入的 Repository 边界。
- `backend/src/services/admin-node-filter-settings.ts`：筛选预设 JSON 的校验、读取与整体覆盖保存。
- `backend/tests/admin-node-contract.test.ts`：共享查询与预设 Schema 的边界测试。
- `backend/tests/admin-node-repository.test.ts`：筛选 SQL、参数、稳定排序、标签和路径装配测试。
- `backend/tests/admin-node-routes.test.ts`：管理员鉴权、CSRF、校验和统一响应测试。
- `backend/tests/admin-node-filter-settings.test.ts`：预设读取、保存和损坏数据回退测试。
- `backend/tests/admin-node-filter-routes.test.ts`：预设接口的管理员鉴权、CSRF、校验和响应测试。
- `frontend/src/components/admin-node-model.ts`：默认条件、筛选计数、路径显示和定位目录的纯函数。
- `frontend/src/composables/use-admin-node-query.ts`：服务端查询状态、过期响应抑制、分页和错误保留。
- `frontend/src/components/AdminNodeFilters.vue`：高级筛选抽屉和筛选预设交互。
- `frontend/tests/admin-node-model.test.ts`：前端纯模型测试。
- `frontend/tests/use-admin-node-query.test.ts`：请求竞态、分页和失败保留测试。
- `frontend/tests/AdminNodeFilters.test.ts`：筛选应用、重置和预设事件测试。
- `frontend/tests/AdminPanel.test.ts`：服务端表格、加载失败和定位事件集成测试。

### 修改

- `packages/contracts/src/index.ts`：管理员查询、分页结果、筛选预设输入与输出契约。
- `backend/src/app.ts`：注册管理员节点查询路由。
- `backend/src/routes/setting-routes.ts`：注册筛选预设 GET/PUT 接口。
- `frontend/src/components/AdminPanel.vue`：用服务端结果替换本地压平分页，接入筛选抽屉与路径定位。
- `frontend/src/App.vue`：处理后台定位目录事件，并在节点写入后触发后台查询刷新。
- `frontend/src/styles.css`：筛选工具栏、抽屉、预设菜单、路径按钮和移动端稳定尺寸。

## 任务 1：定义并验证共享契约

**文件：**

- 创建：`backend/tests/admin-node-contract.test.ts`
- 修改：`packages/contracts/src/index.ts`

- [ ] **步骤 1：编写失败的 Schema 测试**

```ts
import {
  adminNodeFilterPresetInputSchema,
  adminNodeFilterPresetListInputSchema,
  adminNodeQuerySchema
} from '@cancanworld/contracts'
import { describe, expect, it } from 'vitest'

describe('管理员节点查询契约', () => {
  it('填充稳定默认值并拒绝反向时间区间', () => {
    expect(adminNodeQuerySchema.parse({})).toMatchObject({
      folderId: 1,
      includeDescendants: true,
      nodeTypes: ['folder', 'bookmark'],
      tags: [],
      tagMode: 'any',
      health: [],
      sortBy: 'tree',
      sortDirection: 'asc',
      page: 1,
      pageSize: 50
    })
    expect(adminNodeQuerySchema.parse({ sortBy: 'createdAt' }).sortDirection).toBe('desc')
    expect(adminNodeQuerySchema.safeParse({
      createdFrom: '2026-09-02T00:00:00.000Z',
      createdTo: '2026-09-01T00:00:00.000Z'
    }).success).toBe(false)
  })

  it('拒绝空节点类型、重复集合和超过上限的分页', () => {
    expect(adminNodeQuerySchema.safeParse({ nodeTypes: [] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ nodeTypes: ['bookmark', 'bookmark'] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ pageSize: 201 }).success).toBe(false)
  })

  it('预设不保存页码且集合最多二十项', () => {
    const preset = {
      id: '3c5f5f80-c150-4f2c-bf2f-4aaf58211f2a',
      name: '异常私有书签',
      query: { nodeTypes: ['bookmark'], visibility: 'private', health: ['unreachable'] }
    }
    expect(adminNodeFilterPresetInputSchema.parse(preset).query).not.toHaveProperty('page')
    expect(adminNodeFilterPresetListInputSchema.safeParse(Array.from({ length: 21 }, (_, index) => ({
      ...preset,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    }))).success).toBe(false)
  })
})
```

- [ ] **步骤 2：运行测试，确认共享 Schema 尚不存在**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/contracts build
npx --yes bun@1.4.0 --filter @cancanworld/backend test -- admin-node-contract.test.ts
```

预期：FAIL，TypeScript 报告 `adminNodeQuerySchema`、`adminNodeFilterPresetInputSchema` 和 `adminNodeFilterPresetListInputSchema` 未导出。

- [ ] **步骤 3：实现查询、结果和预设契约**

在 `packages/contracts/src/index.ts` 增加以下结构，并使用 `superRefine` 校验两个时间区间和集合唯一性：

```ts
/** 管理员列表只查询可编辑节点；系统根和已废弃分割线不会进入结果。 */
const adminNodeQueryObjectSchema = z.object({
  keyword: z.string().trim().max(200).default(''),
  folderId: z.number().int().positive().default(1),
  includeDescendants: z.boolean().default(true),
  nodeTypes: z.array(z.enum(['folder', 'bookmark'])).min(1).max(2).default(['folder', 'bookmark']),
  visibility: visibilitySchema.optional(),
  enabled: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
  tagMode: z.enum(['any', 'all']).default('any'),
  health: z.array(z.enum(['unchecked', 'responded', 'unreachable'])).max(3).default([]),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  checkedFrom: z.string().datetime().optional(),
  checkedTo: z.string().datetime().optional(),
  sortBy: z.enum(['tree', 'title', 'createdAt', 'clickCount', 'lastCheckedAt']).default('tree'),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(20), z.literal(50), z.literal(100), z.literal(200)]).default(50)
})

type AdminNodeValidationFields = Pick<z.infer<typeof adminNodeQueryObjectSchema>,
  'nodeTypes' | 'tags' | 'health' | 'createdFrom' | 'createdTo' | 'checkedFrom' | 'checkedTo'>

/** 查询集合和时间区间在分页查询与保存预设之间复用同一校验。 */
function validateAdminNodeQuery(value: AdminNodeValidationFields, context: z.RefinementCtx): void {
  if (new Set(value.nodeTypes).size !== value.nodeTypes.length) context.addIssue({ code: 'custom', path: ['nodeTypes'], message: '节点类型不能重复' })
  if (new Set(value.tags.map((tag) => tag.toLocaleLowerCase())).size !== value.tags.length) context.addIssue({ code: 'custom', path: ['tags'], message: '标签不能重复' })
  if (new Set(value.health).size !== value.health.length) context.addIssue({ code: 'custom', path: ['health'], message: '检测结论不能重复' })
  if (value.createdFrom && value.createdTo && value.createdFrom > value.createdTo) context.addIssue({ code: 'custom', path: ['createdTo'], message: '创建结束时间不能早于开始时间' })
  if (value.checkedFrom && value.checkedTo && value.checkedFrom > value.checkedTo) context.addIssue({ code: 'custom', path: ['checkedTo'], message: '检测结束时间不能早于开始时间' })
}

/** 树顺序默认升序，时间和统计字段默认降序；显式方向始终优先。 */
function normalizeAdminNodeQuery<T extends { sortBy: 'tree' | 'title' | 'createdAt' | 'clickCount' | 'lastCheckedAt'; sortDirection?: 'asc' | 'desc' }>(value: T) {
  return { ...value, sortDirection: value.sortDirection ?? (value.sortBy === 'tree' ? 'asc' : 'desc') }
}

export const adminNodeQuerySchema = adminNodeQueryObjectSchema
  .superRefine(validateAdminNodeQuery)
  .transform(normalizeAdminNodeQuery)
export type AdminNodeQuery = z.infer<typeof adminNodeQuerySchema>

/** 管理员分页结果只返回当前页平铺节点，fullPath 不包含节点自身。 */
export interface AdminNodeQueryResult {
  items: NavigationNode[]
  total: number
  page: number
  pageSize: 20 | 50 | 100 | 200
}

const adminNodeSavedQueryObjectSchema = adminNodeQueryObjectSchema.omit({ page: true })
const adminNodeSavedQuerySchema = adminNodeSavedQueryObjectSchema
  .superRefine(validateAdminNodeQuery)
  .transform(normalizeAdminNodeQuery)

/** 筛选预设输入由浏览器生成稳定 UUID，更新时间由服务端补充。 */
export const adminNodeFilterPresetInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  query: adminNodeSavedQuerySchema
})
export type AdminNodeFilterPresetInput = z.infer<typeof adminNodeFilterPresetInputSchema>

export const adminNodeFilterPresetListInputSchema = z.array(adminNodeFilterPresetInputSchema).max(20)

/** 服务端返回的预设包含规范化条件和统一更新时间。 */
export const adminNodeFilterPresetSchema = adminNodeFilterPresetInputSchema.extend({
  updatedAt: z.string().datetime()
})
export type AdminNodeFilterPreset = z.infer<typeof adminNodeFilterPresetSchema>
```

注意：查询和保存结构必须先从基础 object 派生，再分别附加同一个 `superRefine` 和排序默认值转换；不要对 effects 调用 `.omit()`，也不要用类型断言绕过。

- [ ] **步骤 4：运行测试确认通过**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/contracts build
npx --yes bun@1.4.0 --filter @cancanworld/backend test -- admin-node-contract.test.ts
```

预期：新文件 `3` 项测试全部 PASS。

- [ ] **步骤 5：提交契约**

```powershell
git add packages/contracts/src/index.ts backend/tests/admin-node-contract.test.ts
git commit -m "feat: 定义后台节点查询契约"
```

## 任务 2：实现管理员节点查询 Repository

**文件：**

- 创建：`backend/src/repositories/admin-node-repository.ts`
- 创建：`backend/tests/admin-node-repository.test.ts`

- [ ] **步骤 1：编写失败的 Repository 测试**

使用带 `execute` 调用队列的 Pool 桩，至少建立以下测试：

```ts
it('组合目录、标签、检测结论和时间条件并使用稳定分页', async () => {
  const pool = poolStub([
    [[{ id: 9 }]],
    [[{ total: 1 }]],
    [[nodeRow({ id: 8, parent_id: 9 })]],
    [[{ node_id: 8, name: '更新' }]],
    [[{ node_id: 8, ancestor_title: '全部书签', depth: 2 }, { node_id: 8, ancestor_title: '软件', depth: 1 }]]
  ])
  const result = await new AdminNodeRepository(pool).query({
    ...adminNodeQuerySchema.parse({}),
    folderId: 9,
    nodeTypes: ['bookmark'],
    tags: ['更新', '工具'],
    tagMode: 'all',
    health: ['unreachable'],
    createdFrom: '2026-01-01T00:00:00.000Z',
    sortBy: 'createdAt',
    sortDirection: 'desc',
    page: 2,
    pageSize: 20
  })

  expect(result).toMatchObject({ total: 1, page: 2, pageSize: 20 })
  expect(result.items[0]).toMatchObject({ id: 8, tags: ['更新'], fullPath: ['全部书签', '软件'] })
  const sql = executedSql(pool).join('\n')
  expect(sql).toContain('WITH RECURSIVE scope_folders')
  expect(sql).toContain('COUNT(DISTINCT matched_tag.normalized_name) = ?')
  expect(sql).toContain('last_checked_at IS NOT NULL AND last_http_status IS NULL')
  expect(sql).toContain('ORDER BY n.created_at DESC, n.id DESC')
  expect(executedParams(pool)).toContain(20)
})

it('无效目录返回 404 且不执行结果查询', async () => {
  const pool = poolStub([[[/* 空目录结果 */]]])
  await expect(new AdminNodeRepository(pool).query(adminNodeQuerySchema.parse({ folderId: 999 })))
    .rejects.toMatchObject({ status: 404, code: 40401 })
  expect(pool.execute).toHaveBeenCalledTimes(1)
})
```

桩函数必须记录每条 SQL 和参数，`nodeRow()` 返回完整 `NodeRow` 字段，不能用 `as any` 绕过类型。

- [ ] **步骤 2：运行测试确认 Repository 不存在**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/backend test -- admin-node-repository.test.ts
```

预期：FAIL，模块 `admin-node-repository` 不存在。

- [ ] **步骤 3：实现受控 SQL 片段和分页装配**

`backend/src/repositories/admin-node-repository.ts` 必须暴露单一入口：

```ts
/** 管理员节点查询集中处理受控 SQL、分页、标签和路径，Route 不拼接查询语句。 */
export class AdminNodeRepository {
  constructor(private readonly pool: Pool) {}

  async query(input: AdminNodeQuery): Promise<AdminNodeQueryResult> {
    await this.requireScopeFolder(input.folderId)
    const filter = buildAdminNodeFilter(input)
    const total = await this.count(filter)
    const rows = await this.loadPage(input, filter)
    const ids = rows.map((row) => Number(row.id))
    const [tags, paths] = await Promise.all([this.loadTags(ids), this.loadPaths(ids)])
    return {
      items: rows.map((row) => mapAdminNode(row, tags.get(Number(row.id)) ?? [], paths.get(Number(row.id)) ?? [])),
      total,
      page: input.page,
      pageSize: input.pageSize
    }
  }
}
```

实现约束：

- `buildAdminNodeFilter()` 返回 `{ cteSql, whereSql, params }`，仅值进入参数数组。
- `nodeTypes`、健康分类和排序字段通过固定映射生成 SQL；请求值不得作为 SQL 标识符直接拼接。
- 目录范围 CTE 不返回范围起点本身；`includeDescendants=false` 使用 `n.parent_id = ?`。
- 标签 `any` 使用 `EXISTS`，`all` 使用相关子查询的 `COUNT(DISTINCT normalized_name)`。
- 关键词对名称、URL、备注、描述、标签和祖先目录名称使用同一个转义后的 `%keyword%` 参数。
- 总数与结果复用相同 filter builder，结果查询追加 `LIMIT ? OFFSET ?`。
- 非树排序追加同方向的 `n.id`；树排序使用递归构造的 `sort_path` 后追加 `n.id ASC`。
- `loadTags([])` 和 `loadPaths([])` 直接返回空 Map，不生成 `IN ()`。
- `loadPaths()` 只从当前页节点向上递归，按 depth 倒序装配 `fullPath`，不加载全部目录。
- 所有函数和复杂 SQL 前添加说明意图、参数和边界的中文注释。

- [ ] **步骤 4：补齐独立筛选测试并运行**

增加以下用例后运行：

```text
关键词六字段参数化匹配
includeDescendants=false 只查询直属节点
tagMode=any 使用 EXISTS
health 同时选择多个分类时使用 OR 分组
title/tree/lastCheckedAt 的稳定排序与空值末尾
空结果不查询标签和路径
目录和书签混合结果正确映射
```

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/backend test -- admin-node-repository.test.ts node-repository.test.ts
```

预期：管理员 Repository 新测试及现有节点 Repository `5` 项测试全部 PASS。

- [ ] **步骤 5：提交 Repository**

```powershell
git add backend/src/repositories/admin-node-repository.ts backend/tests/admin-node-repository.test.ts
git commit -m "feat: 增加后台节点分页查询"
```

## 任务 3：接入管理员查询 API

**文件：**

- 创建：`backend/src/routes/admin-node-routes.ts`
- 创建：`backend/tests/admin-node-routes.test.ts`
- 修改：`backend/src/app.ts`

- [ ] **步骤 1：编写失败的路由测试**

使用 Hono 测试应用直接挂载 Route，并注入只记录调用参数的 Reader：

```ts
interface AdminNodeQueryReader {
  query(input: AdminNodeQuery): Promise<AdminNodeQueryResult>
}

it('管理员携带 CSRF 后获得规范化分页结果', async () => {
  const reader: AdminNodeQueryReader = { query: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }) }
  const app = authenticatedApp(createAdminNodeRoutes(dependencies, reader), 'csrf-token')
  const response = await app.request('/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token' },
    body: JSON.stringify({ nodeTypes: ['bookmark'], page: 1 })
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ code: 0, data: { total: 0, page: 1, pageSize: 50 } })
  expect(reader.query).toHaveBeenCalledWith(expect.objectContaining({ nodeTypes: ['bookmark'], folderId: 1 }))
})
```

另写未登录返回 `401`、缺少 CSRF 返回 `403`、空 `nodeTypes` 返回 `422` 三个用例。测试中通过 `tokenHash()` 构造 `csrfHash`，不要伪造 `safeHashEqual`。

- [ ] **步骤 2：运行测试确认路由不存在**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/backend test -- admin-node-routes.test.ts
```

预期：FAIL，模块 `admin-node-routes` 不存在。

- [ ] **步骤 3：实现路由并注册**

```ts
/** Route 通过窄接口依赖查询仓储，生产使用真实 Repository，测试注入桩。 */
export interface AdminNodeQueryReader {
  query(input: AdminNodeQuery): Promise<AdminNodeQueryResult>
}

/** 管理员组合查询使用 POST JSON，必须同时通过会话和 CSRF 校验。 */
export function createAdminNodeRoutes(
  dependencies: AppDependencies,
  reader: AdminNodeQueryReader = new AdminNodeRepository(dependencies.pool)
) {
  const routes = new Hono<{ Variables: AppVariables }>()
  routes.post('/query', requireAdmin(), zValidator('json', adminNodeQuerySchema, validatorHook), async (context) => {
    const data = await reader.query(context.req.valid('json'))
    return context.json({ code: 0, message: 'success', data })
  })
  return routes
}
```

在 `backend/src/app.ts` 注册：

```ts
app.route('/api/v1/admin/nodes', createAdminNodeRoutes(dependencies))
```

- [ ] **步骤 4：运行路由和全后端测试**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/backend test
```

预期：原有 `11` 个测试文件和新增契约、Repository、Route 测试全部 PASS，既有跳过项保持 `3` 项。

- [ ] **步骤 5：提交 API**

```powershell
git add backend/src/routes/admin-node-routes.ts backend/tests/admin-node-routes.test.ts backend/src/app.ts
git commit -m "feat: 提供后台节点查询接口"
```

## 任务 4：持久化筛选预设

**文件：**

- 创建：`backend/src/services/admin-node-filter-settings.ts`
- 创建：`backend/tests/admin-node-filter-settings.test.ts`
- 创建：`backend/tests/admin-node-filter-routes.test.ts`
- 修改：`backend/src/routes/setting-routes.ts`

- [ ] **步骤 1：编写失败的设置服务测试**

```ts
it('读取损坏配置时返回空集合且记录警告', async () => {
  const pool = poolWithExecuteResult([[{ setting_value: '{broken' }]])
  const logger = { warn: vi.fn() }
  await expect(readAdminNodeFilters(pool, logger)).resolves.toEqual([])
  expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ settingKey: 'admin_node_filters' }), '后台筛选预设损坏，已使用空集合')
  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('{broken')
})

it('保存时由服务端覆盖更新时间并参数化 upsert', async () => {
  vi.useFakeTimers().setSystemTime(new Date('2026-09-01T03:00:00.000Z'))
  const pool = poolWithExecuteResult([])
  const saved = await writeAdminNodeFilters(pool, [{
    id: '3c5f5f80-c150-4f2c-bf2f-4aaf58211f2a',
    name: '私有书签',
    query: { nodeTypes: ['bookmark'], visibility: 'private' }
  }])
  expect(saved[0]?.updatedAt).toBe('2026-09-01T03:00:00.000Z')
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), [expect.any(String), expect.any(Date)])
})
```

- [ ] **步骤 2：运行测试确认服务不存在**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/backend test -- admin-node-filter-settings.test.ts
```

预期：FAIL，模块 `admin-node-filter-settings` 不存在。

- [ ] **步骤 3：实现服务和 GET/PUT 路由**

服务固定读取 `app_setting.setting_key = 'admin_node_filters'`。读取流程为 JSON 解析后使用 `z.array(adminNodeFilterPresetSchema).max(20)` 校验；任何损坏返回空集合并记录不含原始值的警告。写入先用 `adminNodeFilterPresetListInputSchema` 解析，再用一次 `INSERT ... ON DUPLICATE KEY UPDATE` 保存服务端时间。

在 `setting-routes.ts` 增加：

```ts
routes.get('/admin-node-filters', requireAdmin(), async (context) => {
  const data = await readAdminNodeFilters(dependencies.pool, context.get('logger'))
  return context.json({ code: 0, message: 'success', data })
})

routes.put('/admin-node-filters', requireAdmin(), async (context) => {
  const parsed = adminNodeFilterPresetListInputSchema.safeParse(await context.req.json())
  if (!parsed.success) throw validationError(parsed.error)
  const data = await writeAdminNodeFilters(dependencies.pool, parsed.data)
  return context.json({ code: 0, message: 'success', data })
})
```

- [ ] **步骤 4：增加预设接口鉴权和校验测试**

在 `backend/tests/admin-node-filter-routes.test.ts` 直接挂载 `createSettingRoutes()`，复用真实 `requireAdmin()`：

```ts
it('管理员可读取预设且 PUT 必须携带有效 CSRF', async () => {
  const app = authenticatedSettingApp({ storedValue: '[]', csrfToken: 'csrf-token' })
  expect((await app.request('/admin-node-filters')).status).toBe(200)

  const missingCsrf = await app.request('/admin-node-filters', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '[]'
  })
  expect(missingCsrf.status).toBe(403)

  const saved = await app.request('/admin-node-filters', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token' },
    body: '[]'
  })
  expect(saved.status).toBe(200)
})
```

另写匿名 GET 返回 `401`、超过 20 个预设 PUT 返回 `422` 两个用例。测试辅助函数必须用 `tokenHash()` 构造认证上下文中的 `csrfHash`。

- [ ] **步骤 5：运行设置服务、路由、类型检查和后端测试**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/backend test -- admin-node-filter-settings.test.ts admin-node-filter-routes.test.ts link-check-settings.test.ts
npx --yes bun@1.4.0 --filter @cancanworld/backend typecheck
```

预期：设置测试全部 PASS，后端类型检查退出码为 `0`。

- [ ] **步骤 6：提交筛选预设后端**

```powershell
git add backend/src/services/admin-node-filter-settings.ts backend/tests/admin-node-filter-settings.test.ts backend/tests/admin-node-filter-routes.test.ts backend/src/routes/setting-routes.ts
git commit -m "feat: 持久化后台筛选预设"
```

## 任务 5：实现前端查询模型和竞态控制

**文件：**

- 创建：`frontend/src/components/admin-node-model.ts`
- 创建：`frontend/src/composables/use-admin-node-query.ts`
- 创建：`frontend/tests/admin-node-model.test.ts`
- 创建：`frontend/tests/use-admin-node-query.test.ts`

- [ ] **步骤 1：编写失败的纯模型测试**

```ts
describe('后台节点筛选模型', () => {
  it('计算高级筛选数量但不重复计算关键词和节点类型', () => {
    expect(countAdvancedFilters({
      ...createDefaultAdminNodeQuery(),
      folderId: 9,
      includeDescendants: false,
      visibility: 'private',
      tags: ['工具'],
      health: ['unreachable']
    })).toBe(5)
  })

  it('用祖先路径和标题生成显示路径并返回定位目录', () => {
    const bookmark = node({ id: 8, parentId: 9, nodeType: 'bookmark', title: '官网', fullPath: ['全部书签', '软件'] })
    const folder = node({ id: 9, parentId: 2, nodeType: 'folder', title: '更新', fullPath: ['全部书签', '软件'] })
    expect(displayNodePath(bookmark)).toBe('全部书签 / 软件 / 官网')
    expect(locateFolderId(bookmark)).toBe(9)
    expect(locateFolderId(folder)).toBe(9)
  })
})
```

- [ ] **步骤 2：编写失败的查询组合函数测试**

使用可控 Promise 注入 requester，覆盖：

```ts
it('较慢的旧响应不会覆盖较新的筛选结果', async () => {
  const first = deferred<AdminNodeQueryResult>()
  const second = deferred<AdminNodeQueryResult>()
  const requester = vi.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
  const query = useAdminNodeQuery(requester)
  const oldRequest = query.refresh()
  query.draft.keyword = '新条件'
  const newRequest = query.applyDraft()
  second.resolve(resultWithIds([2]))
  await newRequest
  first.resolve(resultWithIds([1]))
  await oldRequest
  expect(query.items.value.map((item) => item.id)).toEqual([2])
})

it('刷新失败时保留旧结果和可重试错误', async () => {
  const requester = vi.fn()
    .mockResolvedValueOnce(resultWithIds([2]))
    .mockRejectedValueOnce(new Error('网络错误'))
  const query = useAdminNodeQuery(requester)
  await query.refresh()
  await query.refresh()
  expect(query.items.value.map((item) => item.id)).toEqual([2])
  expect(query.errorMessage.value).toBe('网络错误')
})
```

- [ ] **步骤 3：运行测试确认模块不存在**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/frontend test -- admin-node-model.test.ts use-admin-node-query.test.ts
```

预期：FAIL，两个前端模块不存在。

- [ ] **步骤 4：实现纯模型和查询组合函数**

`admin-node-model.ts` 只包含无副作用函数：

```ts
/** 默认查询与共享契约一致，页面重置时始终返回新对象。 */
export function createDefaultAdminNodeQuery(): AdminNodeQuery {
  return adminNodeQuerySchema.parse({})
}

/** 高级筛选计数用于工具栏徽标，关键词、类型、分页和排序不计入。 */
export function countAdvancedFilters(query: AdminNodeQuery): number {
  return Number(query.folderId !== 1) + Number(!query.includeDescendants) + Number(query.visibility !== undefined)
    + Number(query.enabled !== undefined) + Number(query.tags.length > 0) + Number(query.health.length > 0)
    + Number(Boolean(query.createdFrom || query.createdTo)) + Number(Boolean(query.checkedFrom || query.checkedTo))
}

/** 书签定位父目录，目录定位自身；系统根不会进入管理员结果。 */
export function locateFolderId(node: NavigationNode): number {
  return node.nodeType === 'folder' ? node.id : node.parentId ?? 1
}
```

`use-admin-node-query.ts` 注入默认 requester：

```ts
type AdminNodeRequester = (path: string, init: RequestInit) => Promise<AdminNodeQueryResult>

/** 管理员查询状态隔离响应竞态；失败只更新错误，不清空上一次成功结果。 */
export function useAdminNodeQuery(requester: AdminNodeRequester = apiRequest) {
  const draft = reactive<AdminNodeQuery>(createDefaultAdminNodeQuery())
  const applied = ref<AdminNodeQuery>(createDefaultAdminNodeQuery())
  const items = ref<NavigationNode[]>([])
  const total = ref(0)
  const loading = ref(false)
  const errorMessage = ref('')
  let requestVersion = 0

  async function refresh(): Promise<void> {
    const version = ++requestVersion
    loading.value = true
    try {
      const result = await requester('/api/v1/admin/nodes/query', { method: 'POST', body: JSON.stringify(applied.value) })
      if (version !== requestVersion) return
      items.value = result.items
      total.value = result.total
      errorMessage.value = ''
    } catch (error) {
      if (version === requestVersion) errorMessage.value = error instanceof Error ? error.message : '筛选结果刷新失败'
    } finally {
      if (version === requestVersion) loading.value = false
    }
  }

  return { draft, applied, items, total, loading, errorMessage, refresh, applyDraft, reset, changePage, changePageSize }
}
```

`applyDraft()` 克隆并解析 draft、设置 `page=1` 后刷新；`reset()` 恢复默认值并刷新；页码函数只修改 applied 的分页字段再刷新。不要直接把 reactive 对象赋给 ref，避免后续草稿编辑污染已应用条件。

- [ ] **步骤 5：运行测试和前端类型检查**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/frontend test -- admin-node-model.test.ts use-admin-node-query.test.ts
npx --yes bun@1.4.0 --filter @cancanworld/frontend typecheck
```

预期：模型和组合函数测试全部 PASS，类型检查退出码为 `0`。

- [ ] **步骤 6：提交前端查询模型**

```powershell
git add frontend/src/components/admin-node-model.ts frontend/src/composables/use-admin-node-query.ts frontend/tests/admin-node-model.test.ts frontend/tests/use-admin-node-query.test.ts
git commit -m "feat: 管理后台使用可控分页查询状态"
```

## 任务 6：实现筛选抽屉和预设交互

**文件：**

- 创建：`frontend/src/components/AdminNodeFilters.vue`
- 创建：`frontend/tests/AdminNodeFilters.test.ts`
- 修改：`frontend/src/styles.css`

- [ ] **步骤 1：编写失败的组件测试**

用 Element Plus 语义桩验证业务事件，不依赖内部 DOM：

```ts
it('应用时提交草稿副本并关闭抽屉', async () => {
  const wrapper = mountFilters({ modelValue: true })
  await wrapper.get('[data-testid="filter-visibility"]').setValue('private')
  await wrapper.get('[data-testid="filter-apply"]').trigger('click')
  expect(wrapper.emitted('apply')?.[0]?.[0]).toMatchObject({ visibility: 'private', page: 1 })
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
})

it('另存预设生成 UUID 并提交不含 page 的条件', async () => {
  vi.stubGlobal('crypto', { randomUUID: () => '3c5f5f80-c150-4f2c-bf2f-4aaf58211f2a' })
  const wrapper = mountFilters({ modelValue: true })
  await wrapper.get('[data-testid="preset-name"]').setValue('常用异常')
  await wrapper.get('[data-testid="preset-save"]').trigger('click')
  expect(wrapper.emitted('save-preset')?.[0]?.[0]).toMatchObject({
    id: '3c5f5f80-c150-4f2c-bf2f-4aaf58211f2a',
    name: '常用异常'
  })
  expect(wrapper.emitted('save-preset')?.[0]?.[0]).not.toHaveProperty('query.page')
})
```

另覆盖重置不删除预设、应用预设克隆条件、保存中禁用按钮、长名称仍显示 tooltip。

- [ ] **步骤 2：运行测试确认组件不存在**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/frontend test -- AdminNodeFilters.test.ts
```

预期：FAIL，组件 `AdminNodeFilters.vue` 不存在。

- [ ] **步骤 3：实现功能完整的筛选抽屉**

组件 Props 和事件固定为：

```ts
const props = defineProps<{
  modelValue: boolean
  query: AdminNodeQuery
  nodes: NavigationNode[]
  tags: string[]
  presets: AdminNodeFilterPreset[]
  savingPresets: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [query: AdminNodeQuery]
  reset: []
  'apply-preset': [preset: AdminNodeFilterPreset]
  'save-preset': [preset: AdminNodeFilterPresetInput]
  'rename-preset': [payload: { id: string; name: string }]
  'delete-preset': [id: string]
}>()
```

实现以下控件并添加中文意图注释：目录 `el-tree-select` 与“包含子目录”开关、标签多选和 any/all 分段控件、可见性/启用状态/检测结论选择、两个日期范围、排序字段和方向、应用与重置命令、预设应用/另存/重命名/删除。目录数据复用 `buildFolderOptions()`；标签列表来自服务端当前树去重后的可用标签。

样式要求：抽屉桌面宽度不超过 `520px`，移动端为 `100vw`；表单标签不使用视口字号缩放；页脚固定高度；长目录和预设名称省略并提供 tooltip；加载按钮保持固定宽度。

- [ ] **步骤 4：运行组件测试和移动端静态检查**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/frontend test -- AdminNodeFilters.test.ts node-editor-model.test.ts
npx --yes bun@1.4.0 --filter @cancanworld/frontend typecheck
```

预期：新组件测试和既有目录选项测试全部 PASS，类型检查退出码为 `0`。

- [ ] **步骤 5：提交筛选抽屉**

```powershell
git add frontend/src/components/AdminNodeFilters.vue frontend/tests/AdminNodeFilters.test.ts frontend/src/styles.css
git commit -m "feat: 增加后台高级筛选抽屉"
```

## 任务 7：集成后台表格、筛选预设和目录定位

**文件：**

- 创建：`frontend/tests/AdminPanel.test.ts`
- 修改：`frontend/src/components/AdminPanel.vue`
- 修改：`frontend/src/App.vue`
- 修改：`frontend/src/styles.css`

- [ ] **步骤 1：编写失败的 AdminPanel 集成测试**

测试通过注入/桩化 `apiRequest` 的 fetch 返回，覆盖：

```ts
it('节点页只渲染服务端当前页并使用服务端总数', async () => {
  const wrapper = mountAdminPanel({ nodes: [treeNodeNotInResult] }, {
    queryResult: { items: [bookmarkResult], total: 321, page: 1, pageSize: 50 }
  })
  await wrapper.get('[data-testid="admin-nodes-tab"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('[data-row-id="8"]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain(treeNodeNotInResult.title)
  expect(wrapper.getComponent({ name: 'ElPagination' }).props('total')).toBe(321)
})

it('点击路径定位书签父目录', async () => {
  const wrapper = mountAdminPanel({}, { queryResult: resultWith(bookmarkResult) })
  await openNodesTab(wrapper)
  await wrapper.get('[data-testid="locate-node-8"]').trigger('click')
  expect(wrapper.emitted('locate-folder')).toEqual([[bookmarkResult.parentId]])
})

it('节点树引用变化时只刷新一次当前服务端查询', async () => {
  const wrapper = mountAdminPanel({ nodes: [initialTree] }, { queryResult: resultWith(bookmarkResult) })
  await openNodesTab(wrapper)
  await wrapper.setProps({ nodes: [updatedTree] })
  await flushPromises()
  expect(queryRequestCount()).toBe(2)
})
```

另覆盖查询失败保留旧行、筛选按钮计数、保存预设 PUT 成功后替换列表、保存失败保留草稿和预设。

- [ ] **步骤 2：运行测试确认当前组件仍使用本地树分页**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/frontend test -- AdminPanel.test.ts
```

预期：FAIL，组件没有 `locate-folder` 事件，也不会使用查询响应的 `total`。

- [ ] **步骤 3：将 AdminPanel 切换到服务端查询**

完成以下改动：

- 删除 `FlatNode`、`flattenNodes()`、`filteredNodes` 和本地 `pagedNodes`。
- 节点页首次激活时调用 `useAdminNodeQuery().refresh()`，返回后台后保留已应用条件。
- 关键词使用 300ms 防抖后更新查询，卸载时清理 timer。
- 表格数据改为 `queryState.items.value`，分页总数改为 `queryState.total.value`。
- 查询失败用内联 `el-alert` 显示，保留当前表格并提供仅刷新查询的重试按钮。
- 工具栏增加 `SlidersHorizontal` 图标筛选按钮和固定尺寸计数徽标，挂载 `AdminNodeFilters`。
- 预设在进入节点页时通过 `GET /api/v1/settings/admin-node-filters` 加载；保存、改名、删除都在本地生成完整集合后执行一次 PUT，并以服务端响应替换。
- 路径列使用 `displayNodePath(node)`，定位按钮用 `LocateFixed` 图标、tooltip 和 `data-testid`，发出 `locate-folder`。
- 刷新后台按钮在节点页只刷新节点查询和概览；不重新压平目录树。

更新事件契约：

```ts
const emit = defineEmits<{
  // 保留现有事件。
  'locate-folder': [folderId: number]
}>()
```

- [ ] **步骤 4：在 App.vue 处理目录定位和写后刷新**

新增：

```ts
/** 后台路径定位复用导航 Store，先关闭后台再进入目标目录。 */
function locateAdminFolder(folderId: number): void {
  adminOpen.value = false
  navigation.selectFolder(folderId)
}
```

模板绑定 `@locate-folder="locateAdminFolder"`。节点写入完成后，现有目录树刷新保持不变；`AdminPanel` 使用非 immediate 的 `watch(() => props.nodes)`，仅在节点页激活且树引用变化时刷新一次当前服务端查询。不要暴露第二套刷新入口，也不要让写成功后的查询失败重新打开编辑器或允许重复写入。

- [ ] **步骤 5：完成后台响应式样式**

在 `styles.css` 增加：

- 工具栏搜索框、类型分段、筛选图标、新建按钮的稳定 flex 约束。
- 筛选计数徽标固定最小宽高，`0` 时不渲染。
- 路径文字与定位图标同一行，文字溢出省略，图标不收缩。
- 内联错误条不覆盖分页和表格。
- `760px` 以下搜索框独占一行，其他控制换行；抽屉宽度 `100vw`；分页允许横向滚动但不遮挡表格。
- 加载状态使用 overlay，不替换表格内容，避免高度跳动。

- [ ] **步骤 6：运行前端定向测试、类型检查和构建**

运行：

```powershell
npx --yes bun@1.4.0 --filter @cancanworld/frontend test -- AdminPanel.test.ts AdminNodeFilters.test.ts use-admin-node-query.test.ts admin-node-model.test.ts
npx --yes bun@1.4.0 --filter @cancanworld/frontend typecheck
npx --yes bun@1.4.0 --filter @cancanworld/frontend build
```

预期：所有新增前端测试 PASS，类型检查和 Vite 生产构建退出码均为 `0`。

- [ ] **步骤 7：提交页面集成**

```powershell
git add frontend/src/components/AdminPanel.vue frontend/src/App.vue frontend/src/styles.css frontend/tests/AdminPanel.test.ts
git commit -m "feat: 接入后台组合筛选与目录定位"
```

## 任务 8：综合验证、真实 SQL 和浏览器验收

**文件：**

- 修改：仅在验证发现规格内缺陷时修改对应生产代码或测试；每个修复单独提交。

- [ ] **步骤 1：运行完整质量门禁**

运行：

```powershell
npx --yes bun@1.4.0 run check
git diff --check
git status --short
```

预期：共享契约、前后端类型检查、全部测试和生产构建通过；`git diff --check` 无输出；工作树只允许存在已知浏览器验收产物，验收结束后应为干净状态。

- [ ] **步骤 2：在真实 MySQL 数据副本验证查询与执行计划**

使用现有 `.env` 和管理员会话，仅执行只读查询：

```text
默认树顺序第一页
指定深层目录且包含后代
指定深层目录且仅直属节点
标签 any 与 all
私有 + 未响应 + 创建时间组合
关键词命中路径但不命中节点自身字段
```

对默认、目录范围、标签组合和关键词查询执行 `EXPLAIN FORMAT=JSON`。若真实执行计划显示现有索引已足够，本阶段不增加迁移；若扫描量相对筛选范围明显失控，只增加经执行计划证明有效的组合索引，并同时修改 `backend/src/db/schema.ts`、新增下一序号 migration，所有 DDL 与字段使用中文 `COMMENT`，再重新执行完整门禁。

- [ ] **步骤 3：启动开发服务器并完成真实浏览器验收**

运行：

```powershell
npx --yes bun@1.4.0 run dev
```

使用未占用端口时记录实际 URL。登录管理后台后验证：

```text
关键词防抖只显示最后一次输入结果
目录范围和包含子目录切换
标签 any/all、可见性、启用状态、检测结论和时间范围组合
翻页、修改 pageSize、刷新页面
保存、应用、重命名、删除筛选预设
另一个浏览器会话读取相同预设
路径定位书签父目录和目录自身
会话过期、查询网络失败、预设保存失败
```

分别在 `1440x900`、`1024x768`、`390x844` 视口截图检查。确认表格、筛选抽屉、长目录名、长预设名、加载状态、错误条和分页不重叠，所有命令可触达。

- [ ] **步骤 4：检查浏览器控制台和请求边界**

确认：

```text
控制台无 Vue 警告和未处理 Promise
查询请求只发送规范化 JSON
过期响应不会覆盖新结果
预设接口未记录完整敏感查询内容
匿名请求返回 401 且没有私有节点数据
现有公开搜索和前台目录树行为未改变
```

- [ ] **步骤 5：修复验收缺陷后重跑门禁并提交**

每个缺陷先增加能失败的自动化测试，再实现最小修复。最后运行：

```powershell
npx --yes bun@1.4.0 run check
git diff --check
git log --oneline --decorate -10
```

预期：完整门禁通过，差异检查无输出，提交历史按任务保持可审查。

- [ ] **步骤 6：准备分支收尾**

使用 `finishing-a-development-branch` 技能审查分支差异、合并方式和发布步骤。合并到 `main` 后必须在合并结果上再次运行 `npx --yes bun@1.4.0 run check`，随后推送 GitHub，并确认“发布 Linux 包和容器镜像”工作流成功以及 `ghcr.io/ifwlzs/cancanworld:latest` 清单更新到合并提交。
