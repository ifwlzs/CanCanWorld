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
  apiRequest.mockClear()
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
      ElTable: defineComponent({ props: { data: Array }, setup(props) { return () => h('div', (props.data ?? []).map((item) => { const row = item as { node: NavigationNode; path: string }; return h('div', [h('strong', row.node.title), h('button', { 'data-testid': `locate-node-${row.node.id}`, onClick: () => undefined }, row.path)]) })) } }),
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
    expect(wrapper.get('[data-testid="locate-node-12"]').text()).toContain('全部书签 / 目录')
  })

  it('关键词输入经过 300ms 防抖后自动查询', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.admin-nav button:nth-child(2)').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('文档'))
    vi.useFakeTimers()
    const before = apiRequest.mock.calls.filter(([path]) => path === '/api/v1/admin/nodes/query').length
    await wrapper.get('.admin-search input').setValue('文')
    await vi.advanceTimersByTimeAsync(299)
    expect(apiRequest.mock.calls.filter(([path]) => path === '/api/v1/admin/nodes/query').length).toBe(before)
    await vi.advanceTimersByTimeAsync(1)
    expect(apiRequest.mock.calls.filter(([path]) => path === '/api/v1/admin/nodes/query').length).toBe(before + 1)
    vi.useRealTimers()
  })

  it('节点页顶部刷新只重试节点查询，失败时显示重试按钮', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.admin-nav button:nth-child(2)').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('文档'))
    const before = apiRequest.mock.calls.filter(([path]) => path === '/api/v1/admin/nodes/query').length
    apiRequest.mockRejectedValueOnce(new Error('网络错误'))
    await wrapper.get('[aria-label="刷新后台数据"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('[data-testid="node-query-retry"]').text()).toContain('重试'))
    apiRequest.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 50 })
    await wrapper.get('[data-testid="node-query-retry"]').trigger('click')
    await vi.waitFor(() => expect(apiRequest.mock.calls.filter(([path]) => path === '/api/v1/admin/nodes/query').length).toBe(before + 2))
  })

  it('卸载后清理关键词防抖，不再发起查询', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.admin-nav button:nth-child(2)').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('文档'))
    const before = apiRequest.mock.calls.filter(([path]) => path === '/api/v1/admin/nodes/query').length
    vi.useFakeTimers()
    await wrapper.get('.admin-search input').setValue('暂存')
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(300)
    expect(apiRequest.mock.calls.filter(([path]) => path === '/api/v1/admin/nodes/query').length).toBe(before)
    vi.useRealTimers()
  })
})
