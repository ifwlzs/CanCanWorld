import type { AdminNodeQueryResult, NavigationNode } from '@cancanworld/contracts'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useAdminNodeQuery } from '../src/composables/use-admin-node-query'

/** 返回带有稳定主键的查询结果，便于断言旧响应是否污染当前状态。 */
function result(id: number, total = 1): AdminNodeQueryResult {
  const node: NavigationNode = {
    id, parentId: 1, nodeType: 'bookmark', title: `节点${id}`, url: 'https://example.com',
    description: null, remark: null, iconUrl: null, sortKey: '1', enabled: true,
    visibility: 'public', tags: [], clickCount: 0, createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  }
  return { items: [node], total, page: 1, pageSize: 50 }
}

/** 创建可手动控制完成顺序的 Promise，专门验证竞态抑制。 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

describe('useAdminNodeQuery', () => {
  it('posts applied snapshot and suppresses stale response/finally state', async () => {
    const first = deferred<AdminNodeQueryResult>()
    const second = deferred<AdminNodeQueryResult>()
    const requester = vi.fn<(path: string, init: RequestInit) => Promise<AdminNodeQueryResult>>()
      .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const state = useAdminNodeQuery(requester)
    const firstRefresh = state.refresh()
    const secondRefresh = state.refresh()
    expect(state.loading.value).toBe(true)
    second.resolve(result(2, 2)); await secondRefresh
    expect(state.items.value[0]?.id).toBe(2)
    expect(state.total.value).toBe(2)
    expect(state.loading.value).toBe(false)
    first.resolve(result(1, 1)); await firstRefresh
    expect(state.items.value[0]?.id).toBe(2)
    expect(state.total.value).toBe(2)
    expect(requester).toHaveBeenCalledWith('/api/v1/admin/nodes/query', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(String(requester.mock.calls[0]?.[1].body)) as { page: number }
    expect(body.page).toBe(1)
  })

  it('keeps old result on failure and allows retry', async () => {
    const requester = vi.fn<(path: string, init: RequestInit) => Promise<AdminNodeQueryResult>>()
      .mockResolvedValueOnce(result(1, 1)).mockRejectedValueOnce(new Error('网络错误')).mockResolvedValueOnce(result(3, 3))
    const state = useAdminNodeQuery(requester)
    await state.refresh()
    await state.refresh()
    expect(state.items.value[0]?.id).toBe(1)
    expect(state.total.value).toBe(1)
    expect(state.errorMessage.value).toContain('网络错误')
    await state.refresh()
    expect(state.items.value[0]?.id).toBe(3)
    expect(state.errorMessage.value).toBe('')
  })

  it('applies, resets and changes page with contract boundaries', async () => {
    const requester = vi.fn<(path: string, init: RequestInit) => Promise<AdminNodeQueryResult>>().mockResolvedValue(result(1))
    const state = useAdminNodeQuery(requester)
    state.draft.page = 7
    state.draft.pageSize = 100
    state.draft.keyword = 'test'
    await state.applyDraft()
    expect(state.applied.value.page).toBe(1)
    expect(state.applied.value.keyword).toBe('test')
    expect(state.applied.value.pageSize).toBe(100)
    await state.changePage(0)
    expect(state.applied.value.page).toBe(1)
    await state.changePage(3)
    expect(state.applied.value.page).toBe(3)
    await state.changePageSize(20)
    expect(state.applied.value.page).toBe(1)
    expect(state.applied.value.pageSize).toBe(20)
    await state.reset()
    expect(state.draft.keyword).toBe('')
  })

  it('rejects invalid draft without requesting and reports a clear error', async () => {
    const requester = vi.fn<(path: string, init: RequestInit) => Promise<AdminNodeQueryResult>>().mockResolvedValue(result(1))
    const state = useAdminNodeQuery(requester)
    state.draft.tags = ['dup', 'DUP']
    await state.applyDraft()
    await nextTick()
    expect(requester).not.toHaveBeenCalled()
    expect(state.errorMessage.value).toContain('标签不能重复')
  })
})
