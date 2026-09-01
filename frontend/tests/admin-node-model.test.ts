import type { NavigationNode } from '@cancanworld/contracts'
import { describe, expect, it } from 'vitest'
import {
  cloneAdminNodeQuery,
  countAdvancedFilters,
  createDefaultAdminNodeQuery,
  displayNodePath,
  locateFolderId
} from '../src/components/admin-node-model'

/** 构造满足共享契约的最小节点，测试只覆盖模型需要读取的字段。 */
function makeNode(overrides: Partial<NavigationNode> = {}): NavigationNode {
  return {
    id: 2,
    parentId: 1,
    nodeType: 'bookmark',
    title: '书签',
    url: 'https://example.com',
    description: null,
    remark: null,
    iconUrl: null,
    sortKey: '1',
    enabled: true,
    visibility: 'public',
    tags: [],
    clickCount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('admin node query model', () => {
  it('creates a fresh schema-normalized default query', () => {
    const first = createDefaultAdminNodeQuery()
    const second = createDefaultAdminNodeQuery()
    expect(first).toEqual({
      keyword: '', folderId: 1, includeDescendants: true,
      nodeTypes: ['folder', 'bookmark'], visibility: undefined, enabled: undefined,
      tags: [], tagMode: 'any', health: [], createdFrom: undefined, createdTo: undefined,
      checkedFrom: undefined, checkedTo: undefined, sortBy: 'tree', sortDirection: 'asc',
      page: 1, pageSize: 50
    })
    first.tags.push('mutated')
    expect(second.tags).toEqual([])
  })

  it('counts only advanced filters and excludes keyword, node types, sort and paging', () => {
    const query = createDefaultAdminNodeQuery()
    expect(countAdvancedFilters(query)).toBe(0)
    query.keyword = 'x'
    query.nodeTypes = ['bookmark']
    query.sortBy = 'title'
    query.page = 4
    query.folderId = 9
    query.includeDescendants = false
    query.visibility = 'private'
    query.enabled = false
    query.tags = ['one']
    query.health = ['unreachable']
    query.createdFrom = '2025-01-01T00:00:00.000Z'
    expect(countAdvancedFilters(query)).toBe(7)
  })

  it('formats path and locates folder for folders and bookmarks', () => {
    const folder = makeNode({ id: 8, nodeType: 'folder', title: '目录', fullPath: ['全部书签', '父目录'] })
    const bookmark = makeNode({ id: 9, parentId: null, title: '链接', fullPath: ['父目录'] })
    const root = makeNode({ id: 1, nodeType: 'root', title: '全部书签', fullPath: [] })
    expect(displayNodePath(folder)).toBe('全部书签 / 父目录 / 目录')
    expect(displayNodePath(makeNode({ title: '单独' }))).toBe('单独')
    expect(displayNodePath(root)).toBe('全部书签')
    expect(locateFolderId(folder)).toBe(8)
    expect(locateFolderId(bookmark)).toBe(1)
  })

  it('deep clones array fields without changing scalar values', () => {
    const query = createDefaultAdminNodeQuery()
    query.tags = ['a']
    query.nodeTypes = ['bookmark']
    query.health = ['responded']
    const copy = cloneAdminNodeQuery(query)
    copy.tags.push('b')
    copy.nodeTypes.push('folder')
    copy.health.push('unchecked')
    expect(query.tags).toEqual(['a'])
    expect(query.nodeTypes).toEqual(['bookmark'])
    expect(query.health).toEqual(['responded'])
    expect(copy.pageSize).toBe(query.pageSize)
  })
})
