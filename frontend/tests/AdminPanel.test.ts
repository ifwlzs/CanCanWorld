import type { NavigationNode } from '@cancanworld/contracts'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AdminPanel from '../src/components/AdminPanel.vue'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('../src/api/client', () => ({ apiRequest }))

function node(overrides: Partial<NavigationNode> = {}): NavigationNode {
  return {
    id: 8, parentId: 1, nodeType: 'folder', title: '目录', url: null, description: null, remark: null,
    iconUrl: null, sortKey: '1024', enabled: true, visibility: 'public', tags: [], clickCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', children: [], ...overrides
  }
}

function mountPanel() {
  apiRequest.mockImplementation(async (path: string) => {
    if (path === '/api/v1/admin/summary') return {
      counts: { folders: 1, bookmarks: 1, privateBookmarks: 0, missingIcons: 0, unavailable: 0, icons: 1 },
      linkCheckSchedule: { enabled: true, intervalSeconds: 1800 }, checkJobs: [], faviconJobs: []
    }
    if (path === '/api/v1/settings/admin-node-filters') return []
    if (path === '/api/v1/admin/nodes/query') return {
      items: [node({ id: 12, parentId: 8, nodeType: 'bookmark', title: '文档', url: 'https://example.com', fullPath: ['全部书签', '目录'] })],
      total: 1, page: 1, pageSize: 50
    }
    throw new Error(`unexpected request: ${path}`)
  })
  return mount(AdminPanel, {
    props: { nodes: [node()], selectedFolderId: 1, layoutStyle: 'style1', theme: 'default', checkJob: null, faviconJob: null },
    global: { stubs: {
      BookmarkIcon: true,
      ElTable: defineComponent({ props: { data: Array }, setup(props) { return () => h('div', (props.data ?? []).map((item) => { const row = item as { node: NavigationNode; path: string }; return h('div', [h('strong', row.node.title), h('button', { 'data-testid': `node-path-folder-${row.node.parentId ?? 1}`, onClick: () => undefined }, row.path)]) })) } }),
      ElTableColumn: true,
      ElTag: defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()) } }),
      ElPagination: true,
      AdminNodeFilters: true
    } }
  })
}

describe('后台节点查询集成', () => {
  it('进入书签与目录页后使用服务端分页并显示路径', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.admin-nav button:nth-child(2)').trigger('click')
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/v1/admin/nodes/query', expect.objectContaining({ method: 'POST' })))
    expect(wrapper.text()).toContain('全部书签 / 目录')
    expect(wrapper.text()).toContain('文档')
  })

  it('返回节点路径包含可定位目录的稳定标识', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.admin-nav button:nth-child(2)').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('文档'))
    expect(wrapper.get('[data-testid="node-path-folder-8"]').text()).toContain('全部书签 / 目录')
  })
})
