import type { CreateNodeInput } from '@cancanworld/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('../src/api/client', () => ({ apiRequest }))

import { NodeMutationRefreshError, useNavigationStore } from '../src/stores/navigation'
import { setActivePinia, createPinia } from 'pinia'

const draft: CreateNodeInput = {
  parentId: 1,
  nodeType: 'folder',
  title: '软件更新',
  url: null,
  description: null,
  remark: null,
  iconUrl: null,
  visibility: 'public',
  tags: []
}

describe('导航 Store 写入与刷新边界', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiRequest.mockReset()
  })

  it('创建接口成功但树刷新失败时标记变更已提交，避免重复创建', async () => {
    apiRequest.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('树刷新失败'))
    const store = useNavigationStore()

    await expect(store.createNode(draft)).rejects.toMatchObject({ mutationCommitted: true, operation: 'create' })
    expect(apiRequest).toHaveBeenCalledTimes(2)
    expect(apiRequest.mock.calls[0]?.[0]).toBe('/api/v1/nodes')
  })

  it('删除接口成功但树刷新失败时标记变更已提交，避免重复删除', async () => {
    apiRequest.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('树刷新失败'))
    const store = useNavigationStore()

    const deletion = store.deleteNode(8)
    await expect(deletion).rejects.toBeInstanceOf(NodeMutationRefreshError)
    await expect(deletion).rejects.toMatchObject({ mutationCommitted: true, operation: 'delete' })
    expect(apiRequest).toHaveBeenCalledTimes(2)
  })
})
