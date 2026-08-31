import type { NavigationNode } from '@cancanworld/contracts'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, type Component } from 'vue'
import { describe, expect, it } from 'vitest'
import NodeEditor from '../src/components/NodeEditor.vue'

/** 对话框测试桩保留默认槽和页脚槽，并按 modelValue 控制可见内容。 */
const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) {
    return () => props.modelValue ? h('div', [slots.default?.(), slots.footer?.()]) : null
  }
})

/** 输入框测试桩保留 v-model 和透传属性，便于按语义定位并填写。 */
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

/** 目录选择测试桩把 DOM 字符串转换成数字，保持与真实树选择器契约一致。 */
const TreeSelectStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Number },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('select', {
      ...attrs,
      value: props.modelValue,
      onChange: (event: Event) => emit('update:modelValue', Number((event.target as HTMLSelectElement).value))
    }, [h('option', { value: 1 }, '全部书签'), h('option', { value: 9 }, '深层目录')])
  }
})

/** 按钮测试桩暴露禁用和加载状态，同时保留真实 click 事件。 */
const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { attrs, slots }) {
    return () => h('button', { ...attrs, disabled: props.disabled, 'data-loading': String(props.loading) }, slots.default?.())
  }
})

/** 通用表单容器只负责渲染槽位，字段校验由独立模型测试覆盖。 */
const SlotStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  }
})

/** 错误测试桩保留 alert 语义，使断言不依赖 Element Plus 内部 DOM。 */
const AlertStub = defineComponent({
  props: { title: String },
  setup(props) {
    return () => h('div', { role: 'alert' }, props.title)
  }
})

const directory = node({ id: 9, title: '深层目录', children: [] })

/** 测试树节点使用完整共享契约，避免组件测试绕开类型约束。 */
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

/** 统一装配组件和语义测试桩，单个用例只表达业务差异。 */
function mountEditor(overrides: Record<string, unknown> = {}): VueWrapper {
  return mount(NodeEditor, {
    props: {
      modelValue: true,
      parentId: 1,
      nodes: [directory],
      initialType: 'folder',
      ...overrides
    },
    global: {
      stubs: {
        ElDialog: DialogStub,
        ElForm: SlotStub,
        ElFormItem: SlotStub,
        ElInput: InputStub,
        ElTreeSelect: TreeSelectStub,
        ElSegmented: true,
        ElSelect: true,
        ElAlert: AlertStub,
        ElButton: ButtonStub
      } satisfies Record<string, Component | boolean>
    }
  })
}

describe('节点编辑器', () => {
  it('新建目录提交用户选择的深层父目录', async () => {
    const wrapper = mountEditor()
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
    const wrapper = mountEditor({ errorMessage: '服务器内部错误' })
    await wrapper.get('[data-testid="node-title"]').setValue('软件更新')
    expect(wrapper.get('[role="alert"]').text()).toContain('服务器内部错误')
    expect((wrapper.get('[data-testid="node-title"]').element as HTMLInputElement).value).toBe('软件更新')
  })
})
