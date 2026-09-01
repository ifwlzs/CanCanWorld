import type { NavigationNode } from '@cancanworld/contracts'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, type Component } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NodeEditor from '../src/components/NodeEditor.vue'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('../src/api/client', () => ({ apiRequest }))

const { messages, confirmResult } = vi.hoisted(() => ({
  messages: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  confirmResult: { accept: true }
}))
vi.mock('element-plus', () => ({
  ElMessage: messages,
  // 覆盖确认框按用例预设结果解析或拒绝，复刻 ElMessageBox 的 Promise 语义。
  ElMessageBox: { confirm: vi.fn(() => confirmResult.accept ? Promise.resolve('confirm') : Promise.reject(new Error('cancel'))) }
}))

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) {
    return () => props.modelValue ? h('div', [slots.default?.(), slots.footer?.()]) : null
  }
})

const InputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number] },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue ?? '',
      onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value)
    })
  }
})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { attrs, slots }) {
    return () => h('button', { ...attrs, disabled: props.disabled, 'data-loading': String(props.loading) }, slots.default?.())
  }
})

const SlotStub = defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()) } })

function node(overrides: Partial<NavigationNode>): NavigationNode {
  return {
    id: 2, parentId: 1, nodeType: 'bookmark', title: '', url: null, description: null, remark: null,
    iconUrl: null, sortKey: '1024', enabled: true, visibility: 'public', tags: [], clickCount: 0,
    createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z', ...overrides
  }
}

/** 装配书签类型编辑器，元数据抓取只在书签下可用。 */
function mountEditor(overrides: Record<string, unknown> = {}): VueWrapper {
  return mount(NodeEditor, {
    props: { modelValue: true, parentId: 1, nodes: [], initialType: 'bookmark', ...overrides },
    global: {
      stubs: {
        ElDialog: DialogStub, ElForm: SlotStub, ElFormItem: SlotStub, ElInput: InputStub,
        ElTreeSelect: true, ElSegmented: true, ElSelect: true, ElAlert: true, ElButton: ButtonStub,
        ElTooltip: SlotStub
      } satisfies Record<string, Component | boolean>
    }
  })
}

/** 填写地址并触发抓取，返回等待抓取完成后的包装器。 */
async function fetchMetadata(wrapper: VueWrapper, url = 'https://example.com') {
  await wrapper.get('[data-testid="node-url"]').setValue(url)
  await wrapper.get('[data-testid="node-fetch-metadata"]').trigger('click')
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalled())
  await wrapper.vm.$nextTick()
  return wrapper
}

const titleOf = (wrapper: VueWrapper) => (wrapper.get('[data-testid="node-title"]').element as HTMLInputElement).value
const descriptionOf = (wrapper: VueWrapper) => (wrapper.get('[data-testid="node-description"]').element as HTMLInputElement).value

beforeEach(() => {
  confirmResult.accept = true
  apiRequest.mockReset()
  apiRequest.mockResolvedValue({ title: '抓取标题', description: '抓取描述', finalUrl: 'https://example.com/' })
  messages.success.mockClear()
  messages.warning.mockClear()
  messages.error.mockClear()
})

describe('节点编辑器元数据抓取', () => {
  it('地址为空时禁用抓取按钮', async () => {
    const wrapper = mountEditor()

    expect(wrapper.get('[data-testid="node-fetch-metadata"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="node-url"]').setValue('https://example.com')
    expect(wrapper.get('[data-testid="node-fetch-metadata"]').attributes('disabled')).toBeUndefined()
  })

  it('目录类型不显示抓取按钮', () => {
    const wrapper = mountEditor({ initialType: 'folder' })

    expect(wrapper.find('[data-testid="node-fetch-metadata"]').exists()).toBe(false)
  })

  it('名称与注释为空时直接填入抓取结果', async () => {
    const wrapper = await fetchMetadata(mountEditor())

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/admin/page-metadata', expect.objectContaining({ method: 'POST' }))
    expect(titleOf(wrapper)).toBe('抓取标题')
    expect(descriptionOf(wrapper)).toBe('抓取描述')
    expect(messages.success).toHaveBeenCalled()
  })

  it('提交地址为当前表单填写的值', async () => {
    await fetchMetadata(mountEditor(), 'https://www.typescriptlang.org/docs/')

    const body = JSON.parse(String((apiRequest.mock.calls[0]?.[1] as RequestInit).body))
    expect(body).toEqual({ url: 'https://www.typescriptlang.org/docs/' })
  })

  it('仅名称已填写时确认后覆盖名称并填入空注释', async () => {
    const wrapper = mountEditor()
    await wrapper.get('[data-testid="node-title"]').setValue('我的标题')

    await fetchMetadata(wrapper)

    expect(titleOf(wrapper)).toBe('抓取标题')
    expect(descriptionOf(wrapper)).toBe('抓取描述')
  })

  it('已有内容时取消覆盖则完整保留原值', async () => {
    confirmResult.accept = false
    const wrapper = mountEditor()
    await wrapper.get('[data-testid="node-title"]').setValue('我的标题')
    await wrapper.get('[data-testid="node-description"]').setValue('我的注释')

    await fetchMetadata(wrapper)

    expect(titleOf(wrapper)).toBe('我的标题')
    expect(descriptionOf(wrapper)).toBe('我的注释')
  })

  it('已有内容时确认覆盖则写入抓取结果', async () => {
    const wrapper = mountEditor()
    await wrapper.get('[data-testid="node-title"]').setValue('我的标题')
    await wrapper.get('[data-testid="node-description"]').setValue('我的注释')

    await fetchMetadata(wrapper)

    expect(titleOf(wrapper)).toBe('抓取标题')
    expect(descriptionOf(wrapper)).toBe('抓取描述')
  })

  it('抓取结果为空时不清空已有内容', async () => {
    apiRequest.mockResolvedValue({ title: null, description: null, finalUrl: 'https://example.com/' })
    const wrapper = mountEditor()
    await wrapper.get('[data-testid="node-title"]').setValue('我的标题')

    await fetchMetadata(wrapper)

    expect(titleOf(wrapper)).toBe('我的标题')
    expect(messages.warning).toHaveBeenCalled()
  })

  it('抓取期间锁定按钮，重复点击只发起一次请求', async () => {
    const pending: Array<() => void> = []
    apiRequest.mockImplementation(() => new Promise((resolve) => {
      pending.push(() => resolve({ title: '抓取标题', description: '抓取描述', finalUrl: 'https://example.com/' }))
    }))
    const wrapper = mountEditor()
    await wrapper.get('[data-testid="node-url"]').setValue('https://example.com')

    await wrapper.get('[data-testid="node-fetch-metadata"]').trigger('click')
    await wrapper.get('[data-testid="node-fetch-metadata"]').trigger('click')
    await wrapper.get('[data-testid="node-fetch-metadata"]').trigger('click')

    expect(apiRequest.mock.calls).toHaveLength(1)
    expect(wrapper.get('[data-testid="node-fetch-metadata"]').attributes('data-loading')).toBe('true')
    for (const resolve of pending) resolve()
  })

  it('抓取失败时展示服务端原因且表单不变', async () => {
    apiRequest.mockRejectedValue(new Error('目标解析到受限地址：127.0.0.1'))
    const wrapper = mountEditor()
    await wrapper.get('[data-testid="node-title"]').setValue('我的标题')

    await fetchMetadata(wrapper)

    expect(messages.error).toHaveBeenCalledWith('目标解析到受限地址：127.0.0.1')
    expect(titleOf(wrapper)).toBe('我的标题')
    expect(wrapper.get('[data-testid="node-fetch-metadata"]').attributes('data-loading')).toBe('false')
  })

  it('保存进行中不允许触发抓取', async () => {
    const wrapper = mountEditor({ saving: true })
    await wrapper.get('[data-testid="node-url"]').setValue('https://example.com')

    await wrapper.get('[data-testid="node-fetch-metadata"]').trigger('click')

    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('编辑已有书签时同样可以抓取并覆盖', async () => {
    const wrapper = mountEditor({ node: node({ title: '旧标题', url: 'https://example.com', description: '旧注释' }) })

    await fetchMetadata(wrapper)

    expect(titleOf(wrapper)).toBe('抓取标题')
    expect(descriptionOf(wrapper)).toBe('抓取描述')
  })
})
