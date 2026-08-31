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
