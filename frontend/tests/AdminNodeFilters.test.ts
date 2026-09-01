import type { AdminNodeFilterPreset, AdminNodeQuery, NavigationNode } from '@cancanworld/contracts'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, type Component, type PropType } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AdminNodeFilters from '../src/components/AdminNodeFilters.vue'

/** 抽屉桩只保留可见性、槽位和关闭事件，避免依赖 Element Plus 内部实现。 */
const DrawerStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  setup(props, { attrs, slots }) {
    return () => props.modelValue ? h('aside', attrs, [slots.default?.(), slots.footer?.()]) : null
  }
})

/** 通用表单项桩保留标签文本和默认槽，保证测试关注业务语义。 */
const SlotStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) { return () => h('div', attrs, slots.default?.()) }
})

/** 输入桩支持字符串、数组和数字模型，暴露原生事件便于填写日期。 */
const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number, Boolean, Array] },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: Array.isArray(props.modelValue) ? props.modelValue.join(',') : (props.modelValue ?? ''),
      onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value)
    })
  }
})

/** 选择桩使用原生 select，测试通过 data-testid 映射用户选择。 */
const SelectStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number, Boolean, Array] },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit, slots }) {
    return () => h('select', {
      ...attrs,
      value: Array.isArray(props.modelValue) ? props.modelValue[0] : String(props.modelValue ?? ''),
      onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value)
    }, slots.default?.())
  }
})

/** 选项桩输出原生 option，确保 select.setValue 触发真实值映射。 */
const OptionStub = defineComponent({
  inheritAttrs: false,
  props: { label: String, value: [String, Number, Boolean] },
  setup(props, { attrs }) { return () => h('option', { ...attrs, value: String(props.value ?? '') }, props.label) }
})

/** 多选桩以按钮呈现选项，点击时向组件派发 Element 风格更新事件。 */
const SegmentedStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Boolean, Array], options: { type: Array as PropType<Array<{ label: string; value: string | boolean | undefined }>>, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('div', attrs, (props.options ?? []).map((option) => h('button', {
      type: 'button',
      onClick: () => emit('update:modelValue', option.value)
    }, option.label)))
  }
})

/** 树选择桩提供稳定目录值，验证 buildFolderOptions 的根节点映射。 */
const TreeSelectStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Number, data: { type: Array as PropType<FolderTestNode[]>, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    /** 将递归目录选项铺平，模拟树选择器可选父子节点。 */
    const flatten = (items: FolderTestNode[]): Array<{ id: number; label: string }> => items.flatMap((item) => [{ id: item.id, label: item.label }, ...flatten(item.children)])
    return () => h('select', {
      ...attrs,
      value: String(props.modelValue ?? ''),
      onChange: (event: Event) => emit('update:modelValue', Number((event.target as HTMLSelectElement).value))
    }, flatten(props.data ?? []).map((item) => h('option', { value: item.id }, item.label)))
  }
})

interface FolderTestNode { id: number; label: string; children: FolderTestNode[] }

/** 日期范围桩将两个输入收集成 Element Plus 的 [Date, Date] 事件。 */
const DatePickerStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Array },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue?.map((value) => String(value)).join(',') ?? '',
      onChange: () => emit('update:modelValue', [new Date('2026-09-01T00:00:00+08:00'), new Date('2026-09-02T00:00:00+08:00')])
    })
  }
})

/** 按钮桩透传 disabled，预设保存状态可以被直接断言。 */
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { attrs, slots }) { return () => h('button', { ...attrs, disabled: props.disabled, 'data-loading': String(props.loading) }, slots.default?.()) }
})

const IconStub = defineComponent({ setup: () => () => h('span') })

/** 统一构造满足共享契约的查询，测试只覆盖本组件负责的映射。 */
function query(overrides: Partial<AdminNodeQuery> = {}): AdminNodeQuery {
  return {
    keyword: '', folderId: 1, includeDescendants: true, nodeTypes: ['folder', 'bookmark'], visibility: undefined,
    enabled: undefined, tags: [], tagMode: 'any', health: [], createdFrom: undefined, createdTo: undefined,
    checkedFrom: undefined, checkedTo: undefined, sortBy: 'tree', sortDirection: 'asc', page: 3, pageSize: 50, ...overrides
  }
}

function node(overrides: Partial<NavigationNode> = {}): NavigationNode {
  return { id: 8, parentId: 1, nodeType: 'folder', title: '目录', url: null, description: null, remark: null, iconUrl: null,
    sortKey: '1', enabled: true, visibility: 'public', tags: ['工作'], clickCount: 0, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', children: [], ...overrides }
}

function preset(id: string, name: string, presetQuery = query()): AdminNodeFilterPreset {
  const { page: _page, ...savedQuery } = presetQuery
  return { id, name, query: savedQuery, updatedAt: '2026-08-01T00:00:00.000Z' }
}

function mountFilters(overrides: Record<string, unknown> = {}): VueWrapper {
  return mount(AdminNodeFilters, {
    props: { modelValue: true, query: query(), nodes: [node()], tags: ['工作', '学习', '工作'], presets: [], savingPresets: false, ...overrides },
    global: {
      stubs: {
        ElDrawer: DrawerStub, ElForm: SlotStub, ElFormItem: SlotStub, ElTreeSelect: TreeSelectStub, ElSelect: SelectStub,
        ElOption: OptionStub, ElSegmented: SegmentedStub, ElDatePicker: DatePickerStub, ElSwitch: InputStub, ElButton: ButtonStub,
        ElInput: InputStub, ElTag: SlotStub, ...Object.fromEntries(['SlidersHorizontal', 'Save', 'RotateCcw', 'Trash2', 'Pencil', 'Check', 'X'].map((name) => [name, IconStub]))
      } satisfies Record<string, Component | boolean>
    }
  })
}

describe('后台高级筛选抽屉', () => {
  it('应用提交副本并关闭抽屉', async () => {
    const wrapper = mountFilters()
    await wrapper.get('[data-testid="filter-apply"]').trigger('click')
    const emitted = wrapper.emitted('apply')?.[0]?.[0] as AdminNodeQuery
    expect(emitted).toEqual(expect.objectContaining({ page: 1 }))
    expect(emitted).not.toBe((wrapper.props() as { query: AdminNodeQuery }).query)
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(false)
  })

  it('重置只发出 reset 事件', async () => {
    const wrapper = mountFilters()
    await wrapper.get('[data-testid="filter-reset"]').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
    expect(wrapper.emitted('delete-preset')).toBeUndefined()
  })

  it('映射目录、标签、any-all、状态、时间和排序字段', async () => {
    const wrapper = mountFilters()
    await wrapper.get('[data-testid="filter-folder"]').setValue('8')
    await wrapper.get('[data-testid="filter-descendants"]').setValue('false')
    await wrapper.get('[data-testid="filter-tags"]').setValue('工作')
    await wrapper.get('[data-testid="filter-tag-mode"]').get('button:nth-child(2)').trigger('click')
    await wrapper.get('[data-testid="filter-visibility"]').get('button:nth-child(3)').trigger('click')
    await wrapper.get('[data-testid="filter-enabled"]').get('button:nth-child(2)').trigger('click')
    await wrapper.get('[data-testid="filter-health"]').setValue('responded')
    await wrapper.get('[data-testid="filter-created-range"]').setValue('2026-09-01T00:00:00')
    await wrapper.get('[data-testid="filter-checked-range"]').setValue('2026-09-03T00:00:00')
    await wrapper.get('[data-testid="filter-sort-by"]').setValue('title')
    await wrapper.get('[data-testid="filter-sort-direction"]').setValue('desc')
    await wrapper.get('[data-testid="filter-apply"]').trigger('click')
    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual(expect.objectContaining({ folderId: 8, includeDescendants: false, tags: ['工作'], tagMode: 'all', visibility: 'private', enabled: true, health: ['responded'], sortBy: 'title', sortDirection: 'desc' }))
    expect((wrapper.emitted('apply')?.[0]?.[0] as AdminNodeQuery).createdFrom).toBe('2026-08-31T16:00:00.000Z')
  })

  it('另存预设使用 UUID 且查询剥离 page', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    const wrapper = mountFilters()
    await wrapper.get('[data-testid="preset-name"]').setValue('我的筛选')
    await wrapper.get('[data-testid="preset-save"]').trigger('click')
    const input = wrapper.emitted('save-preset')?.[0]?.[0] as { id: string; name: string; query: Record<string, unknown> }
    expect(input.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(input.query.page).toBeUndefined()
    vi.restoreAllMocks()
  })

  it('应用预设克隆查询，支持重命名和删除', async () => {
    const first = preset('p1', '常用', query({ folderId: 8 }))
    const wrapper = mountFilters({ presets: [first] })
    await wrapper.get('[data-testid="preset-apply-p1"]').trigger('click')
    expect(wrapper.emitted('apply-preset')?.[0]?.[0]).not.toBe(first)
    await wrapper.get('[data-testid="preset-rename-p1"]').trigger('click')
    await wrapper.get('[data-testid="preset-name-p1"]').setValue('改名')
    await wrapper.get('[data-testid="preset-rename-confirm-p1"]').trigger('click')
    expect(wrapper.emitted('rename-preset')?.[0]?.[0]).toEqual({ id: 'p1', name: '改名' })
    await wrapper.get('[data-testid="preset-delete-p1"]').trigger('click')
    expect(wrapper.emitted('delete-preset')?.[0]?.[0]).toBe('p1')
  })

  it('保存期间禁用预设操作并为长名称提供 tooltip', () => {
    const name = '这是一个很长很长的预设名称用于验证省略和提示行为'
    const wrapper = mountFilters({ presets: [preset('p2', name)], savingPresets: true })
    expect(wrapper.get('[data-testid="preset-save"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="preset-apply-p2"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="preset-name-label-p2"]').attributes('title')).toBe(name)
  })

  it('标签按大小写无关去重且保留首次展示名', () => {
    const wrapper = mountFilters({ tags: ['Work', 'work', '学习'] })
    expect(wrapper.findAll('option').map((item) => item.text())).toContain('Work')
    expect(wrapper.findAll('option').map((item) => item.text())).not.toContain('work')
  })

  it('无节点时安全渲染目录选择器', () => {
    const wrapper = mountFilters({ nodes: [] })
    expect(wrapper.find('[data-testid="filter-folder"]').exists()).toBe(true)
  })
})
