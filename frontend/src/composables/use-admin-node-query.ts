import {
  adminNodeQuerySchema,
  type AdminNodeQuery,
  type AdminNodeQueryResult,
  type NavigationNode
} from '@cancanworld/contracts'
import { reactive, ref } from 'vue'
import { apiRequest } from '../api/client'
import { cloneAdminNodeQuery, createDefaultAdminNodeQuery } from '../components/admin-node-model'

/** 可注入的查询请求器，测试与页面均遵循 apiRequest 的 path/init 约定。 */
export type AdminNodeQueryRequester = (path: string, init: RequestInit) => Promise<AdminNodeQueryResult>

/** 管理后台查询状态及操作，内部以递增版本号抑制乱序响应。 */
export function useAdminNodeQuery(
  requester: AdminNodeQueryRequester = (path, init) => apiRequest<AdminNodeQueryResult>(path, init)
) {
  const draft = reactive<AdminNodeQuery>(createDefaultAdminNodeQuery())
  const applied = ref<AdminNodeQuery>(createDefaultAdminNodeQuery())
  const items = ref<NavigationNode[]>([])
  const total = ref(0)
  const loading = ref(false)
  const errorMessage = ref('')
  let requestVersion = 0

  /** 发起当前已应用查询；只有最新版本可以提交结果、错误和 loading 状态。 */
  async function refresh(): Promise<void> {
    const version = ++requestVersion
    loading.value = true
    errorMessage.value = ''
    const snapshot = cloneAdminNodeQuery(applied.value)
    try {
      const response = await requester('/api/v1/admin/nodes/query', {
        method: 'POST',
        body: JSON.stringify(snapshot)
      })
      if (version === requestVersion) {
        items.value = response.items
        total.value = response.total
      }
    } catch (error) {
      if (version === requestVersion) {
        errorMessage.value = error instanceof Error ? error.message : '查询失败'
      }
    } finally {
      if (version === requestVersion) loading.value = false
    }
  }

  /** 校验并应用草稿，统一将页码重置到第一页后再查询。 */
  async function applyDraft(): Promise<void> {
    try {
      const parsed = adminNodeQuerySchema.parse({ ...draft, page: 1 })
      const snapshot = cloneAdminNodeQuery(parsed)
      Object.assign(draft, snapshot)
      applied.value = cloneAdminNodeQuery(snapshot)
      await refresh()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '筛选条件无效'
    }
  }

  /** 恢复共享契约默认值并立即重新查询。 */
  async function reset(): Promise<void> {
    const defaults = createDefaultAdminNodeQuery()
    Object.assign(draft, defaults)
    applied.value = cloneAdminNodeQuery(defaults)
    await refresh()
  }

  /** 设置不小于一的页码；页码变化属于已应用条件并立即刷新。 */
  async function changePage(page: number): Promise<void> {
    const nextPage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1
    draft.page = nextPage
    applied.value = { ...cloneAdminNodeQuery(applied.value), page: nextPage }
    await refresh()
  }

  /** 仅接受契约允许的分页档位，成功变更时回到第一页。 */
  async function changePageSize(pageSize: number): Promise<void> {
    if (pageSize !== 20 && pageSize !== 50 && pageSize !== 100 && pageSize !== 200) return
    draft.pageSize = pageSize
    applied.value = { ...cloneAdminNodeQuery(applied.value), page: 1, pageSize }
    draft.page = 1
    await refresh()
  }

  return { draft, applied, items, total, loading, errorMessage, refresh, applyDraft, reset, changePage, changePageSize }
}
