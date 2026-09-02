import type { BrokenBookmarkResult, DuplicateGroupResult } from '@cancanworld/contracts'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminGovernance from '../src/components/AdminGovernance.vue'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('../src/api/client', () => ({ apiRequest }))

const { messages, confirmResult } = vi.hoisted(() => ({
  messages: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  confirmResult: { accept: true }
}))
vi.mock('element-plus', () => ({
  ElMessage: messages,
  ElMessageBox: { confirm: vi.fn(() => confirmResult.accept ? Promise.resolve('confirm') : Promise.reject(new Error('cancel'))) }
}))

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { attrs, slots }) {
    return () => h('button', { ...attrs, disabled: props.disabled, 'data-loading': String(props.loading) }, slots.default?.())
  }
})

const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()) } })

/** 单选组替身用按钮切换 v-model，避免依赖 Element Plus 内部 DOM。 */
const RadioGroupStub = defineComponent({
  props: { modelValue: { type: null, default: null } },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => h('div', { 'data-selected': String(props.modelValue) }, slots.default?.({ select: (value: unknown) => emit('update:modelValue', value) }))
  }
})

function duplicateResult(overrides: Partial<DuplicateGroupResult> = {}): DuplicateGroupResult {
  return {
    total: 1, page: 1, pageSize: 20,
    items: [{
      urlHash: 'a'.repeat(64),
      memberCount: 2,
      members: [
        { id: 8, title: '文档 A', url: 'https://example.com/', fullPath: ['全部书签', '开发'], tags: ['文档'], remark: null, visibility: 'public', clickCount: 5, lastCheckStatus: 'UP', lastCheckedAt: '2026-08-31T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 9, title: '文档 B', url: 'https://example.com/', fullPath: ['全部书签', '备份'], tags: [], remark: '旧副本', visibility: 'public', clickCount: 0, lastCheckStatus: 'UP', lastCheckedAt: '2026-08-31T00:00:00.000Z', createdAt: '2026-08-02T00:00:00.000Z' }
      ]
    }],
    ...overrides
  }
}

function brokenResult(overrides: Partial<BrokenBookmarkResult> = {}): BrokenBookmarkResult {
  return {
    total: 2, page: 1, pageSize: 20,
    items: [
      { id: 12, title: '失效文档', url: 'https://example.com/gone', fullPath: ['全部书签', '开发'], reason: 'deterministic', lastCheckStatus: 'NOT_FOUND', lastHttpStatus: 404, lastCheckedAt: '2026-08-31T00:00:00.000Z', consecutiveFailures: 4 },
      { id: 13, title: '超时站点', url: 'https://slow.example.com/', fullPath: ['全部书签'], reason: 'consecutive_failures', lastCheckStatus: 'TIMEOUT', lastHttpStatus: null, lastCheckedAt: '2026-08-30T00:00:00.000Z', consecutiveFailures: 6 }
    ],
    ...overrides
  }
}

interface Fixture {
  duplicates?: DuplicateGroupResult
  broken?: BrokenBookmarkResult
  mergeError?: Error
  cleanupError?: Error
  duplicatesError?: Error
}

function mountGovernance(fixture: Fixture = {}): VueWrapper {
  apiRequest.mockReset()
  apiRequest.mockImplementation(async (path: string) => {
    if (path === '/api/v1/admin/governance/duplicates') {
      if (fixture.duplicatesError) throw fixture.duplicatesError
      return fixture.duplicates ?? duplicateResult()
    }
    if (path === '/api/v1/admin/governance/broken') return fixture.broken ?? brokenResult()
    if (path === '/api/v1/admin/governance/duplicates/merge') {
      if (fixture.mergeError) throw fixture.mergeError
      return { removed: 1 }
    }
    if (path === '/api/v1/admin/governance/broken/cleanup') {
      if (fixture.cleanupError) throw fixture.cleanupError
      return { removed: 2, skipped: 0 }
    }
    throw new Error(`unexpected request: ${path}`)
  })
  return mount(AdminGovernance, {
    global: { stubs: {
      ElButton: ButtonStub, ElTag: SlotStub, ElTooltip: SlotStub, ElPagination: true,
      ElRadioGroup: RadioGroupStub, ElRadio: SlotStub, ElCheckbox: true, ElEmpty: SlotStub,
      ElSegmented: RadioGroupStub, ElAlert: SlotStub
    } }
  })
}

/** 等待首屏重复分组加载完成。 */
async function ready(wrapper: VueWrapper) {
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/v1/admin/governance/duplicates', expect.anything()))
  await wrapper.vm.$nextTick()
  await wrapper.vm.$nextTick()
  return wrapper
}

beforeEach(() => {
  confirmResult.accept = true
  messages.success.mockClear()
  messages.warning.mockClear()
  messages.error.mockClear()
})

describe('治理视图重复分组', () => {
  it('首屏加载重复分组并展示成员信息', async () => {
    const wrapper = await ready(mountGovernance())

    expect(wrapper.text()).toContain('文档 A')
    expect(wrapper.text()).toContain('文档 B')
    expect(wrapper.text()).toContain('全部书签 / 开发')
  })

  it('默认保留最早创建的成员，其余为待删除', async () => {
    const wrapper = await ready(mountGovernance())

    // 成员按创建时间升序，默认保留第一条以保住最早的记录。
    expect(wrapper.get('[data-testid="duplicate-keep-8"]').attributes('data-selected')).toBe('8')
    expect(wrapper.text()).toContain('将删除 1 项')
  })

  it('切换保留项后待删除集合随之变化', async () => {
    const wrapper = await ready(mountGovernance())

    await wrapper.get('[data-testid="keep-option-9"]').trigger('click')

    expect(wrapper.get('[data-testid="duplicate-keep-8"]').attributes('data-selected')).toBe('9')
  })

  it('确认后提交保留项与待删除集合', async () => {
    const wrapper = await ready(mountGovernance())

    await wrapper.get('[data-testid="duplicate-merge-8"]').trigger('click')
    await vi.waitFor(() => expect(messages.success).toHaveBeenCalled())

    const call = apiRequest.mock.calls.find(([path]) => path === '/api/v1/admin/governance/duplicates/merge')
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ keepId: 8, removeIds: [9] })
  })

  it('取消确认时不发起合并请求', async () => {
    confirmResult.accept = false
    const wrapper = await ready(mountGovernance())

    await wrapper.get('[data-testid="duplicate-merge-8"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(apiRequest.mock.calls.some(([path]) => path === '/api/v1/admin/governance/duplicates/merge')).toBe(false)
  })

  it('合并失败时展示服务端原因', async () => {
    const wrapper = await ready(mountGovernance({ mergeError: new Error('待删除书签与保留项不属于同一重复分组') }))

    await wrapper.get('[data-testid="duplicate-merge-8"]').trigger('click')
    await vi.waitFor(() => expect(messages.error).toHaveBeenCalledWith('待删除书签与保留项不属于同一重复分组'))
  })

  it('逐条展示成员原始地址，使同哈希的不同页面可辨认', async () => {
    const wrapper = await ready(mountGovernance())

    expect(wrapper.get('[data-testid="member-url-8"]').text()).toBe('https://example.com/')
    expect(wrapper.get('[data-testid="member-url-9"]').text()).toBe('https://example.com/')
  })

  it('组内原始地址不同时给出警示', async () => {
    // url_hash 剥掉 hash 片段，SPA 的 hash 路由会落进同一组但其实是不同页面。
    const divergent = duplicateResult()
    divergent.items[0]!.members[1]!.url = 'https://example.com/#/search?q=b'
    const wrapper = await ready(mountGovernance({ duplicates: divergent }))

    expect(wrapper.find('[data-testid="divergent-8"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('组内地址不完全相同')
  })

  it('地址完全相同时不显示警示', async () => {
    const wrapper = await ready(mountGovernance())

    expect(wrapper.find('[data-testid="divergent-8"]').exists()).toBe(false)
  })

  it('地址不同的分组在确认文案中点明风险', async () => {
    const { ElMessageBox } = await import('element-plus')
    const divergent = duplicateResult()
    divergent.items[0]!.members[1]!.url = 'https://example.com/#/other'
    const wrapper = await ready(mountGovernance({ duplicates: divergent }))

    await wrapper.get('[data-testid="duplicate-merge-8"]').trigger('click')
    await vi.waitFor(() => expect(messages.success).toHaveBeenCalled())

    expect(vi.mocked(ElMessageBox.confirm).mock.calls.at(-1)?.[0]).toContain('原始地址并不完全相同')
  })

  it('没有重复组时展示明确说明', async () => {
    const wrapper = await ready(mountGovernance({ duplicates: { items: [], total: 0, page: 1, pageSize: 20 } }))

    expect(wrapper.text()).toContain('没有重复链接')
  })

  it('加载失败时展示错误并提供重试', async () => {
    const wrapper = await ready(mountGovernance({ duplicatesError: new Error('服务器内部错误') }))

    expect(wrapper.text()).toContain('服务器内部错误')
    expect(wrapper.find('[data-testid="governance-retry"]').exists()).toBe(true)
  })
})

describe('治理视图失效书签', () => {
  /** 切到失效视图并等待数据到位。 */
  async function openBroken(wrapper: VueWrapper) {
    await wrapper.get('[data-testid="governance-view-broken"]').trigger('click')
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/v1/admin/governance/broken', expect.anything()))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('展示判定原因、状态与连续失败次数', async () => {
    const wrapper = await openBroken(await ready(mountGovernance()))

    expect(wrapper.text()).toContain('失效文档')
    expect(wrapper.text()).toContain('NOT_FOUND')
    expect(wrapper.text()).toContain('链接确定失效')
    expect(wrapper.text()).toContain('连续失败 6 次')
  })

  it('选择后批量清理提交选中 ID', async () => {
    const wrapper = await openBroken(await ready(mountGovernance()))

    await wrapper.get('[data-testid="broken-select-all"]').trigger('click')
    await wrapper.get('[data-testid="broken-cleanup"]').trigger('click')
    await vi.waitFor(() => expect(messages.success).toHaveBeenCalled())

    const call = apiRequest.mock.calls.find(([path]) => path === '/api/v1/admin/governance/broken/cleanup')
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ nodeIds: [12, 13] })
  })

  it('未选择时清理按钮禁用', async () => {
    const wrapper = await openBroken(await ready(mountGovernance()))

    expect(wrapper.get('[data-testid="broken-cleanup"]').attributes('disabled')).toBeDefined()
  })

  it('超过 200 条上限时本地拦截并提示', async () => {
    const items = Array.from({ length: 201 }, (_, index) => ({
      id: index + 100, title: `失效 ${index}`, url: 'https://example.com/x', fullPath: ['全部书签'],
      reason: 'deterministic' as const, lastCheckStatus: 'NOT_FOUND', lastHttpStatus: 404,
      lastCheckedAt: '2026-08-31T00:00:00.000Z', consecutiveFailures: 3
    }))
    const wrapper = await openBroken(await ready(mountGovernance({ broken: { items, total: 201, page: 1, pageSize: 100 } })))

    await wrapper.get('[data-testid="broken-select-all"]').trigger('click')
    await wrapper.get('[data-testid="broken-cleanup"]').trigger('click')

    expect(messages.warning).toHaveBeenCalledWith(expect.stringContaining('200'))
    expect(apiRequest.mock.calls.some(([path]) => path === '/api/v1/admin/governance/broken/cleanup')).toBe(false)
  })

  it('清理失败时保留选择', async () => {
    const wrapper = await openBroken(await ready(mountGovernance({ cleanupError: new Error('服务器内部错误') })))
    await wrapper.get('[data-testid="broken-select-all"]').trigger('click')

    await wrapper.get('[data-testid="broken-cleanup"]').trigger('click')
    await vi.waitFor(() => expect(messages.error).toHaveBeenCalledWith('服务器内部错误'))

    expect(wrapper.get('[data-testid="broken-cleanup"]').attributes('disabled')).toBeUndefined()
  })

  it('没有失效书签时展示明确说明', async () => {
    const wrapper = await openBroken(await ready(mountGovernance({ broken: { items: [], total: 0, page: 1, pageSize: 20 } })))

    expect(wrapper.text()).toContain('没有满足条件的失效书签')
  })
})
