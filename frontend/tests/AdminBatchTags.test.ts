import type { NavigationNode } from '@cancanworld/contracts'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPanel from '../src/components/AdminPanel.vue'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('../src/api/client', () => ({ apiRequest }))

const { messages } = vi.hoisted(() => ({ messages: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('element-plus', () => ({ ElMessage: messages }))

function node(overrides: Partial<NavigationNode> = {}): NavigationNode {
  return {
    id: 8, parentId: 1, nodeType: 'bookmark', title: '书签', url: 'https://example.com', description: null, remark: null,
    iconUrl: null, sortKey: '1024', enabled: true, visibility: 'public', tags: [], clickCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', children: [], ...overrides
  }
}

/** 表格替身暴露选择、清空和保留选择行为，避免测试依赖 el-table 内部实现。 */
const tableStub = defineComponent({
  props: { data: Array },
  emits: ['selection-change'],
  setup(props, { emit, expose }) {
    let reserved: unknown[] = []
    expose({ clearSelection: () => { reserved = []; emit('selection-change', []) } })
    return () => h('div', [
      h('button', {
        'data-testid': 'select-all',
        onClick: () => { reserved = [...(props.data ?? [])]; emit('selection-change', reserved) }
      }, '全选'),
      h('button', {
        'data-testid': 'select-across-pages',
        onClick: () => { reserved = [...reserved, ...(props.data ?? [])]; emit('selection-change', reserved) }
      }, '跨页累积')
    ])
  }
})

/** 批量对话框的模式控件替身，暴露三个按钮直接切换 v-model。 */
const segmentedStub = defineComponent({
  props: { modelValue: { type: null, default: null }, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', (props.options as Array<{ label: string; value: string }>).map((option) => h('button', {
      'data-testid': `batch-mode-${option.value}`,
      onClick: () => emit('update:modelValue', option.value)
    }, option.label)))
  }
})

/** 标签控件替身把预置标签集合一次性写入 v-model，避免模拟下拉输入细节。 */
const tagSelectStub = defineComponent({
  props: { modelValue: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('button', {
      'data-testid': 'batch-tag-input',
      onClick: () => emit('update:modelValue', pendingTags)
    }, JSON.stringify(props.modelValue))
  }
})

/** 当前用例希望写入对话框的标签集合，由 submitBatch 在点击前设置。 */
let pendingTags: string[] = []

interface QueryFixture {
  items?: NavigationNode[]
  batchResult?: { updated: number; skippedFolders: number; missing: number }
  batchError?: Error
}

function mountPanel(fixture: QueryFixture = {}) {
  const items = fixture.items ?? [node({ id: 12, title: '文档' })]
  apiRequest.mockReset()
  apiRequest.mockImplementation(async (path: string) => {
    if (path === '/api/v1/admin/summary') return {
      counts: { folders: 1, bookmarks: 1, privateBookmarks: 0, missingIcons: 0, unavailable: 0, icons: 1 },
      linkCheckSchedule: { enabled: true, intervalSeconds: 1800 }, checkJobs: [], faviconJobs: []
    }
    if (path === '/api/v1/settings/admin-node-filters') return []
    if (path === '/api/v1/admin/nodes/query') return { items, total: items.length, page: 1, pageSize: 50 }
    if (path === '/api/v1/admin/nodes/batch-tags') {
      if (fixture.batchError) throw fixture.batchError
      return fixture.batchResult ?? { updated: items.length, skippedFolders: 0, missing: 0 }
    }
    throw new Error(`unexpected request: ${path}`)
  })
  return mount(AdminPanel, {
    props: { nodes: [node({ id: 1, nodeType: 'folder', title: '目录', url: null })], selectedFolderId: 1, layoutStyle: 'style1', theme: 'default', checkJob: null, faviconJob: null },
    global: { stubs: {
      BookmarkIcon: true,
      ElTable: tableStub,
      ElTableColumn: true,
      ElTag: true,
      ElPagination: true,
      ElDialog: defineComponent({ props: { modelValue: Boolean }, setup(props, { slots }) { return () => props.modelValue ? h('div', [slots.default?.(), slots.footer?.()]) : null } }),
      ElSegmented: segmentedStub,
      ElSelect: tagSelectStub,
      ElButton: defineComponent({ emits: ['click'], setup(_, { slots, emit }) { return () => h('button', { onClick: () => emit('click') }, slots.default?.()) } }),
      ElTooltip: defineComponent({ setup(_, { slots }) { return () => slots.default?.() } }),
      ElSwitch: true,
      ElInputNumber: true,
      AdminNodeFilters: true
    } }
  })
}

/** 进入书签与目录页并等待首次服务端查询完成。 */
async function openNodesTab(wrapper: ReturnType<typeof mountPanel>) {
  await wrapper.get('.admin-nav button:nth-child(2)').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[data-testid="select-all"]').exists()).toBe(true))
  return wrapper
}

/** 打开批量对话框并按需设置模式与标签，不触发提交。 */
async function openBatchDialog(wrapper: ReturnType<typeof mountPanel>, options: { mode?: 'add' | 'remove' | 'replace'; tags?: string[] } = {}) {
  await wrapper.get('[data-testid="batch-tags-open"]').trigger('click')
  if (options.mode) await wrapper.get(`[data-testid="batch-mode-${options.mode}"]`).trigger('click')
  if (options.tags) {
    pendingTags = options.tags
    await wrapper.get('[data-testid="batch-tag-input"]').trigger('click')
  }
  return wrapper
}

/** 读取批量接口最近一次请求体，用于断言模式与标签的规范化结果。 */
function lastBatchBody(): { nodeIds: number[]; mode: string; tags: string[] } {
  const call = [...apiRequest.mock.calls].reverse().find(([path]) => path === '/api/v1/admin/nodes/batch-tags')
  return JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))
}

beforeEach(() => {
  pendingTags = []
  messages.success.mockClear()
  messages.warning.mockClear()
  messages.error.mockClear()
})

describe('后台批量标签操作', () => {
  it('选择节点后显示批量入口和已选数量', async () => {
    const wrapper = await openNodesTab(mountPanel())

    await wrapper.get('[data-testid="select-all"]').trigger('click')

    expect(wrapper.text()).toContain('已选 1 项')
    expect(wrapper.find('[data-testid="batch-tags-open"]').exists()).toBe(true)
  })

  it('跨页选择累积后保留全部已选节点', async () => {
    const wrapper = await openNodesTab(mountPanel())

    await wrapper.get('[data-testid="select-across-pages"]').trigger('click')
    await wrapper.get('[data-testid="select-across-pages"]').trigger('click')

    expect(wrapper.text()).toContain('已选 2 项')
  })

  it('清空选择同时重置表格保留状态', async () => {
    const wrapper = await openNodesTab(mountPanel())
    await wrapper.get('[data-testid="select-all"]').trigger('click')

    await wrapper.get('[data-testid="batch-clear-selection"]').trigger('click')

    expect(wrapper.find('[data-testid="batch-clear-selection"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('已选')
  })

  it('只选择目录时提示没有可修改的书签且不发起请求', async () => {
    const wrapper = await openNodesTab(mountPanel({ items: [node({ id: 20, nodeType: 'folder', title: '目录', url: null })] }))
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { tags: ['工具'] })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')

    expect(messages.warning).toHaveBeenCalledWith('没有可修改的书签')
    expect(apiRequest).not.toHaveBeenCalledWith('/api/v1/admin/nodes/batch-tags', expect.anything())
  })

  it('超过契约节点上限时本地拦截并提示已选数量', async () => {
    const items = Array.from({ length: 201 }, (_, index) => node({ id: index + 100 }))
    const wrapper = await openNodesTab(mountPanel({ items }))
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { tags: ['工具'] })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')

    expect(messages.warning).toHaveBeenCalledWith('一次最多修改 200 个书签，当前已选 201 个')
    expect(apiRequest).not.toHaveBeenCalledWith('/api/v1/admin/nodes/batch-tags', expect.anything())
  })

  // 三种模式共用同一提交路径，逐一锁定模式值以防对话框状态串位。
  it.each([
    ['add' as const, 'add'],
    ['remove' as const, 'remove'],
    ['replace' as const, 'replace']
  ])('%s 模式只提交书签 ID 与规范化标签', async (mode, expected) => {
    const wrapper = await openNodesTab(mountPanel({
      items: [node({ id: 12 }), node({ id: 13, nodeType: 'folder', title: '目录', url: null })]
    }))
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { mode, tags: [' 工具 ', '工具', '文档'] })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')
    await vi.waitFor(() => expect(messages.success).toHaveBeenCalled())

    expect(lastBatchBody()).toEqual({ nodeIds: [12], mode: expected, tags: ['工具', '文档'] })
  })

  it('覆盖模式允许空标签集合以清空全部标签', async () => {
    const wrapper = await openNodesTab(mountPanel())
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { mode: 'replace' })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')
    await vi.waitFor(() => expect(messages.success).toHaveBeenCalled())

    expect(lastBatchBody()).toMatchObject({ mode: 'replace', tags: [] })
  })

  it('追加模式缺少标签时提示并拦截提交', async () => {
    const wrapper = await openNodesTab(mountPanel())
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { mode: 'add' })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')

    expect(messages.warning).toHaveBeenCalledWith('请至少输入一个标签')
    expect(apiRequest).not.toHaveBeenCalledWith('/api/v1/admin/nodes/batch-tags', expect.anything())
  })

  it('提交期间锁定按钮，重复点击不会重复发起请求', async () => {
    const wrapper = await openNodesTab(mountPanel())
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { tags: ['工具'] })
    const original = apiRequest.getMockImplementation()
    // 挂起批量请求以模拟真实网络延迟，期间的重复点击必须被提交锁拦截。
    const pending: Array<() => void> = []
    apiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path !== '/api/v1/admin/nodes/batch-tags') return original?.(path, init)
      await new Promise<void>((resolve) => pending.push(resolve))
      return { updated: 1, skippedFolders: 0, missing: 0 }
    })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')
    await wrapper.get('[data-testid="batch-submit"]').trigger('click')
    await wrapper.get('[data-testid="batch-submit"]').trigger('click')

    expect(apiRequest.mock.calls.filter(([path]) => path === '/api/v1/admin/nodes/batch-tags')).toHaveLength(1)
    for (const resolve of pending) resolve()
  })

  it('成功后清空选择、关闭对话框并请求宿主重载树', async () => {
    const wrapper = await openNodesTab(mountPanel({ batchResult: { updated: 1, skippedFolders: 0, missing: 0 } }))
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { tags: ['工具'] })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')
    await vi.waitFor(() => expect(messages.success).toHaveBeenCalledWith('已更新 1 个书签'))

    expect(wrapper.find('[data-testid="batch-submit"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('已选')
    expect(wrapper.emitted('tags-updated')).toHaveLength(1)
  })

  it('存在跳过项时提示汇总数量', async () => {
    const wrapper = await openNodesTab(mountPanel({
      items: [node({ id: 12 }), node({ id: 13, nodeType: 'folder', title: '目录', url: null })],
      batchResult: { updated: 1, skippedFolders: 1, missing: 2 }
    }))
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { tags: ['工具'] })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')

    await vi.waitFor(() => expect(messages.success).toHaveBeenCalledWith('已更新 1 个书签，跳过 3 项'))
  })

  it('提交失败时保留选择与对话框并展示服务端原因', async () => {
    const wrapper = await openNodesTab(mountPanel({ batchError: new Error('请求参数校验失败') }))
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    await openBatchDialog(wrapper, { tags: ['工具'] })

    await wrapper.get('[data-testid="batch-submit"]').trigger('click')
    await vi.waitFor(() => expect(messages.error).toHaveBeenCalledWith('请求参数校验失败'))

    expect(wrapper.find('[data-testid="batch-submit"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('已选 1 项')
    expect(wrapper.emitted('tags-updated')).toBeUndefined()
  })
})
