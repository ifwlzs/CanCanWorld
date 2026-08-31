# Node Create and Delete Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让前台和管理后台能够明确选择目标目录并可靠创建节点，同时让有关联数据的书签删除具备可验证、低往返的事务行为。

**Architecture:** 前端新增一个无 UI 依赖的节点编辑模型模块，集中生成目录候选项和校验草稿；`NodeEditor.vue` 负责表单、树选择器及可访问反馈，`App.vue` 负责前后台默认目录和异步请求状态。后端保留现有单事务删除边界，只把逐任务总数重算替换为每种任务一条批量更新语句。

**Tech Stack:** Vue 3 Composition API、Pinia、Element Plus、TypeScript、Vitest、Vue Test Utils、Playwright、Bun、Hono、MySQL 8。

## Global Constraints

- 所有新增或修改的代码单元必须添加说明意图、参数含义及注意事项的中文注释，不能只复述代码。
- 不增加新的运行时依赖或表单验证依赖；只允许增加前端测试所需的开发依赖。
- 不修改节点数据模型、HTTP 路径、数据库表结构和编辑节点的移动行为。
- 前台新建默认使用当前目录，管理后台新建默认使用根目录 ID `1`。
- 仅新建模式显示目标目录选择器；编辑模式继续使用原父目录且不提供移动控件。
- 保存期间禁止重复提交并阻止关闭弹窗；失败时保留输入，成功时关闭弹窗并刷新树。
- 删除节点必须继续在单一事务中完成，任何步骤失败均回滚。
- 管理工具保持现有紧凑、工作导向的视觉体系，不引入新配色、营销式版面或嵌套卡片。

---

## File Map

- Create `frontend/src/components/node-editor-model.ts`: 生成只含目录的树选择数据，并集中返回字段校验错误。
- Create `frontend/tests/node-editor-model.test.ts`: 覆盖根目录、无限层级过滤和目录/书签字段校验。
- Create `frontend/tests/NodeEditor.test.ts`: 覆盖目标目录提交、加载状态、错误保留和关闭防护。
- Create `frontend/vitest.config.ts`: 为 Vue 组件测试配置 `happy-dom` 和 Vue 插件。
- Modify `frontend/package.json`: 增加前端测试脚本及 `vitest`、`@vue/test-utils`、`happy-dom` 开发依赖。
- Modify `package.json`: 根测试脚本依次运行前端和后端测试。
- Modify `bun.lock`: 由 Bun 安装命令机械更新测试依赖锁定信息。
- Modify `frontend/src/components/NodeEditor.vue`: 增加目录树选择器、表单校验、提交状态和内联错误。
- Modify `frontend/src/App.vue`: 区分前后台默认父目录，保留表单 `parentId`，统一保存及删除反馈。
- Create `scripts/node-management-e2e.ts`: 使用拦截 API 的浏览器场景验证前后台创建、失败反馈和移动端布局。
- Existing `tsconfig.scripts.json`: 已包含 `scripts/**/*.ts`，无需修改即可检查新的浏览器验证脚本。
- Modify `backend/tests/node-repository.test.ts`: 增加删除事务和批量任务更新回归测试。
- Modify `backend/src/repositories/node-repository.ts`: 批量重算受影响的检测任务和图标任务总数。

---

### Task 1: Frontend Test Foundation and Editor Model

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/components/node-editor-model.ts`
- Create: `frontend/tests/node-editor-model.test.ts`
- Modify: `frontend/package.json`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:**
- Consumes: `NavigationNode` and `CreateNodeInput` from `@cancanworld/contracts`.
- Produces: `FolderOption`, `NodeDraftErrors`, `buildFolderOptions(nodes)`, and `validateNodeDraft(input)` for `NodeEditor.vue` and its component tests.

- [ ] **Step 1: Add the frontend test runner dependencies and scripts**

Run from the repository root:

```powershell
bun add --cwd frontend --dev vitest@^3.2.4 @vue/test-utils@^2.4.6 happy-dom@^18.0.1
```

Set `frontend/package.json` scripts to include:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Change the root test script to:

```json
{
  "test": "bun --filter @cancanworld/frontend test && bun --filter @cancanworld/backend test"
}
```

- [ ] **Step 2: Configure Vitest for Vue component tests**

Create `frontend/vitest.config.ts`:

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/** 前端测试使用轻量 DOM 和真实 Vue 编译插件，避免测试结果偏离生产模板行为。 */
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts']
  }
})
```

Add `vitest.config.ts` and `tests/**/*.ts` to the `include` array in `frontend/tsconfig.json` so production type checking also validates tests.

- [ ] **Step 3: Write failing editor-model tests**

Create `frontend/tests/node-editor-model.test.ts` with fixtures containing a top-level directory, a nested directory, and bookmarks at both levels:

```ts
import type { CreateNodeInput, NavigationNode } from '@cancanworld/contracts'
import { describe, expect, it } from 'vitest'
import { buildFolderOptions, validateNodeDraft } from '../src/components/node-editor-model'

/** 测试节点只保留目录模型所需差异，公共字段使用稳定默认值。 */
function node(overrides: Partial<NavigationNode>): NavigationNode {
  return {
    id: 2,
    parentId: 1,
    nodeType: 'folder',
    title: '软件',
    url: null,
    description: null,
    remark: null,
    iconUrl: null,
    sortKey: '1024',
    enabled: true,
    visibility: 'public',
    tags: [],
    clickCount: 0,
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
    ...overrides
  }
}

describe('节点编辑模型', () => {
  it('目录候选包含虚拟根和全部深层目录但排除书签', () => {
    const nodes = [node({ children: [
      node({ id: 3, parentId: 2, title: '更新', children: [] }),
      node({ id: 4, parentId: 2, nodeType: 'bookmark', title: '官网', url: 'https://example.com', children: undefined })
    ] })]

    expect(buildFolderOptions(nodes)).toEqual([{ id: 1, label: '全部书签', children: [
      { id: 2, label: '软件', children: [{ id: 3, label: '更新', children: [] }] }
    ] }])
  })

  it('目录名称为空时返回名称错误且不要求地址', () => {
    const input = { parentId: 1, nodeType: 'folder', title: '  ', url: null, description: null, remark: null, iconUrl: null, visibility: 'public', tags: [] } satisfies CreateNodeInput
    expect(validateNodeDraft(input)).toEqual({ title: '请输入名称' })
  })

  it('书签地址为空时返回地址错误', () => {
    const input = { parentId: 2, nodeType: 'bookmark', title: '软件更新', url: '  ', description: null, remark: null, iconUrl: null, visibility: 'public', tags: [] } satisfies CreateNodeInput
    expect(validateNodeDraft(input)).toEqual({ url: '请输入书签地址' })
  })
})
```

- [ ] **Step 4: Run the model test and verify RED**

Run:

```powershell
bun --cwd frontend run test -- tests/node-editor-model.test.ts
```

Expected: FAIL because `node-editor-model.ts` does not exist.

- [ ] **Step 5: Implement the minimal editor model**

Create `frontend/src/components/node-editor-model.ts`:

```ts
import type { CreateNodeInput, NavigationNode } from '@cancanworld/contracts'

/** 目录树选择器使用稳定数字主键和展示名称，不携带书签的敏感 URL。 */
export interface FolderOption {
  id: number
  label: string
  children: FolderOption[]
}

/** 字段错误与表单字段同名，便于 Element Plus 在对应控件旁显示恢复提示。 */
export type NodeDraftErrors = Partial<Record<'parentId' | 'title' | 'url', string>>

/** 将完整导航树递归裁剪为目录树，并补充系统根目录供后台直接选择。 */
export function buildFolderOptions(nodes: NavigationNode[]): FolderOption[] {
  const folders = nodes
    .filter((node) => node.nodeType === 'folder')
    .map((node) => ({ id: node.id, label: node.title, children: buildFolderChildren(node.children ?? []) }))
  return [{ id: 1, label: '全部书签', children: folders }]
}

/** 返回新建草稿的可恢复字段错误；最终数据完整性仍由后端契约校验。 */
export function validateNodeDraft(input: CreateNodeInput): NodeDraftErrors {
  const errors: NodeDraftErrors = {}
  if (!Number.isInteger(input.parentId) || input.parentId <= 0) errors.parentId = '请选择保存目录'
  if (!input.title.trim()) errors.title = '请输入名称'
  if (input.nodeType === 'bookmark' && !input.url?.trim()) errors.url = '请输入书签地址'
  return errors
}

/** 递归实现与根节点包装分离，避免每一层重复插入虚拟根目录。 */
function buildFolderChildren(nodes: NavigationNode[]): FolderOption[] {
  return nodes
    .filter((node) => node.nodeType === 'folder')
    .map((node) => ({ id: node.id, label: node.title, children: buildFolderChildren(node.children ?? []) }))
}
```

- [ ] **Step 6: Run tests and type checking to verify GREEN**

Run:

```powershell
bun --cwd frontend run test -- tests/node-editor-model.test.ts
bun --cwd frontend run typecheck
```

Expected: all three model tests pass and Vue TypeScript reports no errors.

- [ ] **Step 7: Commit the test foundation and model**

```powershell
git add package.json frontend/package.json frontend/vitest.config.ts frontend/tsconfig.json frontend/src/components/node-editor-model.ts frontend/tests/node-editor-model.test.ts bun.lock
git commit -m "test: 增加节点编辑前端测试基础"
```

---

### Task 2: Node Editor Directory Selection and Submission Feedback

**Files:**
- Create: `frontend/tests/NodeEditor.test.ts`
- Modify: `frontend/src/components/NodeEditor.vue`

**Interfaces:**
- Consumes: `FolderOption`, `buildFolderOptions`, and `validateNodeDraft` from Task 1.
- Produces: `NodeEditor` props `nodes: NavigationNode[]`, `saving: boolean`, `errorMessage: string | null`; existing `submit(CreateNodeInput)` remains unchanged.

- [ ] **Step 1: Write failing component tests with semantic stubs**

Create `frontend/tests/NodeEditor.test.ts`. Use these semantic stubs so the tests exercise Vue bindings without depending on Element Plus popper geometry:

```ts
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

/** 对话框测试桩保留默认槽和页脚槽，并按 modelValue 控制可见内容。 */
const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>'
})

/** 输入框测试桩保留 v-model 和透传属性，便于按语义定位并填写。 */
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number] },
  emits: ['update:modelValue'],
  template: '<input v-bind="$attrs" :value="modelValue ?? \'\'" @input="$emit(\'update:modelValue\', $event.target.value)" />'
})

/** 目录选择测试桩把 DOM 字符串转换成数字，保持与真实树选择器契约一致。 */
const TreeSelectStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Number },
  emits: ['update:modelValue'],
  template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option value="1">全部书签</option><option value="9">深层目录</option></select>'
})

/** 按钮测试桩暴露禁用和加载状态，同时保留真实 click 事件。 */
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, loading: Boolean },
  template: '<button v-bind="$attrs" :disabled="disabled" :data-loading="String(loading)"><slot /></button>'
})

const global = {
  stubs: {
    ElDialog: DialogStub,
    ElForm: { template: '<form><slot /></form>' },
    ElFormItem: { template: '<label><slot /></label>' },
    ElInput: InputStub,
    ElTreeSelect: TreeSelectStub,
    ElSegmented: true,
    ElSelect: true,
    ElAlert: { props: ['title'], template: '<div role="alert">{{ title }}</div>' },
    ElButton: ButtonStub
  }
}
```

The tests must assert these concrete behaviors:

```ts
it('新建目录提交用户选择的深层父目录', async () => {
  const wrapper = mountEditor({ parentId: 1, initialType: 'folder' })
  await wrapper.get('[data-testid="node-title"]').setValue('软件更新')
  await wrapper.get('[data-testid="node-parent"]').setValue('9')
  await wrapper.get('[data-testid="node-save"]').trigger('click')

  expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
    parentId: 9,
    nodeType: 'folder',
    title: '软件更新',
    url: null
  })
})

it('保存期间禁止重复提交和关闭弹窗', async () => {
  const wrapper = mountEditor({ saving: true })
  expect(wrapper.get('[data-testid="node-save"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="node-cancel"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="node-save"]').trigger('click')
  expect(wrapper.emitted('submit')).toBeUndefined()
})

it('服务端失败时保留表单并展示可感知错误', async () => {
  const wrapper = mountEditor({ errorMessage: '服务器内部错误', initialType: 'folder' })
  await wrapper.get('[data-testid="node-title"]').setValue('软件更新')
  expect(wrapper.get('[role="alert"]').text()).toContain('服务器内部错误')
  expect((wrapper.get('[data-testid="node-title"]').element as HTMLInputElement).value).toBe('软件更新')
})
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
bun --cwd frontend run test -- tests/NodeEditor.test.ts
```

Expected: FAIL because the current component has no `nodes`, `saving`, `errorMessage`, directory selector, or test selectors.

- [ ] **Step 3: Add editor props and state reset behavior**

Extend `NodeEditor.vue` props:

```ts
const props = withDefaults(defineProps<{
  modelValue: boolean
  parentId: number
  nodes: NavigationNode[]
  node?: NavigationNode | null
  initialType?: 'folder' | 'bookmark'
  saving?: boolean
  errorMessage?: string | null
}>(), {
  node: null,
  initialType: 'bookmark',
  saving: false,
  errorMessage: null
})
```

Add computed folder options from `buildFolderOptions(props.nodes)`. Keep the existing open watcher, and ensure each new opening resets `form.parentId` from `props.parentId`, title, URL, descriptions, visibility, and tags exactly once.

- [ ] **Step 4: Add the directory selector, validation, and guarded submit**

Add an `el-tree-select` before the type field only when `!props.node`:

```vue
<el-form-item v-if="!props.node" label="保存到" :error="fieldErrors.parentId">
  <el-tree-select
    v-model="form.parentId"
    data-testid="node-parent"
    :data="folderOptions"
    node-key="id"
    :props="{ value: 'id', label: 'label', children: 'children' }"
    check-strictly
    filterable
    :render-after-expand="true"
    placeholder="选择目标目录"
  />
</el-form-item>
```

Implement guarded submission:

```ts
/** 本地校验先给出可恢复提示，保存锁则阻止同一草稿产生重复请求。 */
function submit(): void {
  if (props.saving) return
  if (form.nodeType === 'folder') form.url = null
  Object.assign(fieldErrors, { parentId: undefined, title: undefined, url: undefined }, validateNodeDraft(form))
  if (Object.values(fieldErrors).some(Boolean)) return
  emit('submit', { ...form, title: form.title.trim(), url: form.url?.trim() || null, tags: [...form.tags] })
}
```

Use `data-testid="node-title"`, `node-save`, and `node-cancel` on the tested controls. Disable both footer buttons while saving, put loading on Save, set dialog `close-on-click-modal`, `close-on-press-escape`, and `show-close` from `!props.saving`, and render the server error through an `el-alert` with `role="alert"`.

- [ ] **Step 5: Run the component and model tests to verify GREEN**

Run:

```powershell
bun --cwd frontend run test -- tests/NodeEditor.test.ts tests/node-editor-model.test.ts
bun --cwd frontend run typecheck
```

Expected: all frontend tests pass and the component has no TypeScript errors.

- [ ] **Step 6: Commit the editor behavior**

```powershell
git add frontend/src/components/NodeEditor.vue frontend/tests/NodeEditor.test.ts
git commit -m "feat: 支持选择节点保存目录"
```

---

### Task 3: App-Level Create Context and User Feedback

**Files:**
- Create: `scripts/node-management-e2e.ts`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: Task 2 `NodeEditor` props and existing `navigation.createNode`, `navigation.updateNode`, and `navigation.deleteNode` methods.
- Produces: `openEditor(type, node, parentId)`, save-state refs, and consistent delete success/error feedback.

- [ ] **Step 1: Write a failing Playwright workflow against intercepted APIs**

Create `scripts/node-management-e2e.ts` using `chromium` from the existing `playwright` dependency. The script must intercept these requests before `page.goto()`:

```ts
await page.route('**/api/v1/**', async (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === '/api/v1/auth/status') return route.fulfill({ json: { code: 0, message: 'success', data: { initialized: true, authenticated: true, username: 'admin', csrfToken: 'test-csrf' } } })
  if (path === '/api/v1/settings/theme') return route.fulfill({ json: { code: 0, message: 'success', data: { theme: 'default', accentColor: '#19715f', layoutStyle: 'style1' } } })
  if (path === '/api/v1/nodes/tree' && route.request().method() === 'GET') return route.fulfill({ json: { code: 0, message: 'success', data: navigationTree } })
  if (path === '/api/v1/admin/summary') return route.fulfill({ json: { code: 0, message: 'success', data: emptySummary } })
  if (path === '/api/v1/nodes' && route.request().method() === 'POST') {
    createRequests.push(route.request().postDataJSON())
    return failNextCreate
      ? route.fulfill({ status: 500, json: { code: 50000, message: '服务器内部错误', data: null } })
      : route.fulfill({ status: 201, json: { code: 0, message: 'success', data: { id: 99 } } })
  }
  return route.fulfill({ status: 404, json: { code: 40400, message: '接口不存在', data: null } })
})
```

The workflow must:

1. Open a deep directory in the frontend, create `软件更新`, and assert the captured `parentId` is that directory ID.
2. Open Admin, create a directory without changing the target, and assert the target defaults to ID `1`.
3. Reopen the form, select a different directory, force a `500`, and assert `服务器内部错误` is visible while `软件更新` remains in the title input.
4. Set the viewport to `390x844`, reopen the form, and assert `scrollWidth <= clientWidth` and the dialog footer buttons do not overlap.
5. Record page console errors and fail on any error other than the deliberately intercepted `500` network response.

- [ ] **Step 2: Start only Vite and verify the browser workflow is RED**

Run Vite in one terminal:

```powershell
bun --cwd frontend run dev -- --host 127.0.0.1 --port 5173
```

Run the test in another terminal:

```powershell
bun scripts/node-management-e2e.ts
```

Expected: FAIL because the admin form inherits the frontend directory, there is no selector, and API errors are not rendered inside the dialog.

- [ ] **Step 3: Track explicit editor context and save state in App.vue**

Add refs:

```ts
const editorParentId = ref(1)
const editorSaving = ref(false)
const editorError = ref<string | null>(null)
```

Replace `openEditor` with:

```ts
/** 打开编辑器时固定来源目录；后台显式传入根目录，避免继承隐藏的前台上下文。 */
function openEditor(type: 'folder' | 'bookmark', node: NavigationNode | null = null, parentId = navigation.selectedFolderId): void {
  initialType.value = type
  editingNode.value = node
  editorParentId.value = node?.parentId ?? parentId
  editorError.value = null
  editorOpen.value = true
}
```

Change Admin create binding to `@create="openEditor($event, null, 1)"`. Keep frontend calls unchanged so they use `navigation.selectedFolderId`.

- [ ] **Step 4: Make save failures visible and preserve submitted parentId**

Replace `saveNode` with a guarded `try/catch/finally` implementation:

```ts
/** 保存期间锁定编辑器；失败保留草稿和服务端原因，成功后才关闭并提示。 */
async function saveNode(input: CreateNodeInput): Promise<void> {
  if (editorSaving.value) return
  editorSaving.value = true
  editorError.value = null
  try {
    if (editingNode.value) {
      await navigation.updateNode(editingNode.value.id, { ...input, updatedAt: editingNode.value.updatedAt })
    } else {
      await navigation.createNode(input)
    }
    editorOpen.value = false
    ElMessage.success('已保存')
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : '保存失败'
    ElMessage.error(editorError.value)
  } finally {
    editorSaving.value = false
  }
}
```

Pass `:parent-id="editorParentId"`, `:nodes="navigation.tree"`, `:saving="editorSaving"`, and `:error-message="editorError"` to `NodeEditor`.

- [ ] **Step 5: Normalize delete success and cascade error feedback**

Keep the existing initial and non-empty-directory confirmations. Add `ElMessage.success('已删除')` after both successful deletion paths. Wrap cascade deletion in `try/catch` and route both simple and cascade failures through one Chinese-commented `showDeleteError(error)` function that preserves `ApiError` messages.

- [ ] **Step 6: Run browser workflow, type checking, and frontend tests to verify GREEN**

Run:

```powershell
bun scripts/node-management-e2e.ts
bun --cwd frontend run test
bun run typecheck
```

Expected: browser workflow passes all four scenarios, frontend tests pass, and TypeScript reports no errors.

- [ ] **Step 7: Commit app integration and browser regression coverage**

```powershell
git add frontend/src/App.vue scripts/node-management-e2e.ts
git commit -m "fix: 恢复节点创建与删除反馈"
```

---

### Task 4: Batched Bookmark Deletion Cleanup

**Files:**
- Modify: `backend/tests/node-repository.test.ts`
- Modify: `backend/src/repositories/node-repository.ts`

**Interfaces:**
- Consumes: existing `NodeRepository.delete(id, strategy?)` API.
- Produces: unchanged public API; internal relation cleanup performs at most one total update for check jobs and one for favicon jobs.

- [ ] **Step 1: Write a failing repository test for related bookmark deletion**

Extend `backend/tests/node-repository.test.ts` with a connection mock that returns a bookmark, zero children, two check-job IDs, and two favicon-job IDs. Assert:

```ts
it('删除有关联数据的书签时按任务类型各批量重算一次总数', async () => {
  const { repository, connection } = deletionRepository({
    checkJobIds: ['check-1', 'check-2'],
    faviconJobIds: ['favicon-1', 'favicon-2']
  })

  await repository.delete(8)

  const statements = [...connection.query.mock.calls, ...connection.execute.mock.calls]
    .map((call) => String(call[0]).replace(/\s+/g, ' '))
  expect(statements.filter((sql) => sql.includes('UPDATE bookmark_check_job '))).toHaveLength(1)
  expect(statements.filter((sql) => sql.includes('UPDATE favicon_job '))).toHaveLength(1)
  expect(connection.commit).toHaveBeenCalledOnce()
  expect(connection.rollback).not.toHaveBeenCalled()
})
```

The helper `deletionRepository` must route SQL by normalized statement contents rather than fragile call indexes. Add a second test that makes relation cleanup reject and asserts `rollback` once, `commit` never, and `release` once.

- [ ] **Step 2: Run the targeted backend test and verify RED**

Run:

```powershell
bun --cwd backend run test -- tests/node-repository.test.ts
```

Expected: FAIL because the current code executes one update per affected task ID.

- [ ] **Step 3: Replace per-job loops with bounded batch updates**

In `deleteNodeRelations`, collect `job_id` values as strings. When the list is non-empty, execute one statement per task type:

```ts
/** 一条语句重算全部受影响检测任务，减少远程数据库往返和事务持锁时间。 */
async function updateCheckJobTotals(connection: PoolConnection, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return
  const placeholders = jobIds.map(() => '?').join(',')
  await connection.query(`
    UPDATE bookmark_check_job AS job
    SET total = (
      SELECT COUNT(*) FROM bookmark_check_job_item AS item WHERE item.job_id = job.id
    ), updated_at = ?
    WHERE id IN (${placeholders})
  `, [new Date(), ...jobIds])
}
```

Add the favicon helper with its own fixed table names:

```ts
/** 一条语句重算全部受影响图标任务，任务历史与剩余项目数保持一致。 */
async function updateFaviconJobTotals(connection: PoolConnection, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return
  const placeholders = jobIds.map(() => '?').join(',')
  await connection.query(`
    UPDATE favicon_job AS job
    SET total = (
      SELECT COUNT(*) FROM favicon_job_item AS item WHERE item.job_id = job.id
    ), updated_at = ?
    WHERE id IN (${placeholders})
  `, [new Date(), ...jobIds])
}
```

Call both helpers after deleting their item rows. Do not change relation deletion order, orphan-tag cleanup, transaction ownership, or the public repository method.

- [ ] **Step 4: Run targeted and full backend tests to verify GREEN**

Run:

```powershell
bun --cwd backend run test -- tests/node-repository.test.ts
bun --cwd backend run test
bun --cwd backend run typecheck
```

Expected: targeted deletion tests pass, all backend tests pass, and TypeScript reports no errors.

- [ ] **Step 5: Verify the batch SQL against the configured MySQL in a rollback transaction**

Use a temporary diagnostic script passed to `node --input-type=module -e` from `backend/`. Select the bookmark with the most related task rows, begin a transaction, execute the production deletion statements including both batch updates, delete the node, and always roll back in `finally`. Assert output includes `sqlPath: "ok"` and `rolledBack: true`; do not commit or retain test data.

- [ ] **Step 6: Commit the repository fix and tests**

```powershell
git add backend/src/repositories/node-repository.ts backend/tests/node-repository.test.ts
git commit -m "fix: 批量清理书签任务关联"
```

---

### Task 5: Full Verification and Visual QA

**Files:**
- Modify only when verification exposes a scoped defect in a file already listed above.

**Interfaces:**
- Consumes: all behavior from Tasks 1-4.
- Produces: verification evidence for automated tests, production builds, API behavior, and desktop/mobile layout.

- [ ] **Step 1: Run the complete repository verification**

Run:

```powershell
bun run check
git diff --check
```

Expected: frontend tests, backend tests, type checking, script type checking, and all workspace builds pass with no whitespace errors.

- [ ] **Step 2: Start backend and frontend development servers**

Run in separate terminals after confirming ports `3080` and `5173` are free:

```powershell
bun run dev:backend
bun run dev:frontend
```

Wait for `/api/v1/health` to return HTTP `200` and Vite to serve `http://localhost:5173`.

- [ ] **Step 3: Verify real authenticated creation and deletion through the browser**

Using the existing administrator session or a test administrator created only in the configured development database:

1. In the frontend, enter a deep directory and create a folder named `软件更新`; verify it appears under that directory.
2. In Admin, create a temporary bookmark under the new folder by selecting it in “保存到”; verify the path column shows the selected hierarchy.
3. Submit an invalid bookmark without an address; verify the field error appears and no request is sent.
4. Delete the temporary bookmark and then the empty `软件更新` directory; verify success messages and tree refresh.
5. Confirm the browser console has no unhandled Promise or Vue errors.

- [ ] **Step 4: Verify visual layout at required viewports**

Use Playwright screenshots at `1440x900`, `768x1024`, and `390x844`. At each viewport verify:

- the directory tree selector fits inside the dialog;
- long directory names wrap or truncate without covering controls;
- the error alert does not overlap form fields or footer buttons;
- loading buttons keep stable dimensions;
- keyboard focus is visible;
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.

- [ ] **Step 5: Inspect the final diff and commit any verification-only scoped corrections**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD~4..HEAD
git log -5 --oneline --decorate
```

If Task 5 required a scoped correction, rerun the affected targeted test followed by `bun run check`, then commit only that correction with a precise `fix:` message. Otherwise leave the verified task commits unchanged.

---

## Completion Evidence

Record these exact results in the final handoff:

- frontend Vitest file and test counts;
- backend Vitest file and test counts, including skipped tests;
- type-check and production-build status;
- rollback deletion diagnostic result and elapsed time;
- intercepted API browser workflow status;
- real browser creation/deletion result;
- desktop, tablet, and mobile viewport layout result;
- final commit IDs and whether the branch is ahead of `origin/main`.
