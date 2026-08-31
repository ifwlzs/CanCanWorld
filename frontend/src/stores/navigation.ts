import type { CreateNodeInput, NavigationNode, UpdateNodeInput } from '@cancanworld/contracts'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiRequest } from '../api/client'

/** 写请求已提交但列表刷新失败时携带操作类型，页面据此禁止重复写入。 */
export class NodeMutationRefreshError extends Error {
  readonly mutationCommitted = true

  constructor(readonly operation: 'create' | 'update' | 'delete' | 'move', cause: unknown) {
    super(cause instanceof Error ? cause.message : '列表刷新失败')
    this.name = 'NodeMutationRefreshError'
    this.cause = cause
  }
}

/** 导航 Store 统一管理树、当前目录和搜索结果，避免视图分别维护冲突副本。 */
export const useNavigationStore = defineStore('navigation', () => {
  const tree = ref<NavigationNode[]>([])
  const selectedFolderId = ref(1)
  const query = ref('')
  const loading = ref(false)
  const searchResults = ref<NavigationNode[] | null>(null)

  const currentFolder = computed(() => findNode(tree.value, selectedFolderId.value))
  const currentFolderPath = computed(() => selectedFolderId.value === 1 ? [] : findNodePath(tree.value, selectedFolderId.value)?.map((node) => node.title) ?? [])
  const visibleNodes = computed(() => searchResults.value ?? currentFolder.value?.children ?? tree.value)

  /** 递归查找仅用于已加载的展示树，后端仍是目录权限和完整性的事实来源。 */
  function findNode(nodes: NavigationNode[], id: number): NavigationNode | undefined {
    for (const node of nodes) {
      if (node.id === id) return node
      const nested = node.children ? findNode(node.children, id) : undefined
      if (nested) return nested
    }
    return undefined
  }

  /** 递归返回当前目录的完整节点链，用于区分导入后出现的同名嵌套目录。 */
  function findNodePath(nodes: NavigationNode[], id: number, ancestors: NavigationNode[] = []): NavigationNode[] | undefined {
    for (const node of nodes) {
      const path = [...ancestors, node]
      if (node.id === id) return path
      const nested = node.children ? findNodePath(node.children, id, path) : undefined
      if (nested) return nested
    }
    return undefined
  }

  /** 获取管理员可见的完整树。 */
  async function loadTree(): Promise<void> {
    loading.value = true
    try {
      tree.value = await apiRequest<NavigationNode[]>('/api/v1/nodes/tree')
    } finally {
      loading.value = false
    }
  }

  /** 选择目录并退出搜索结果模式。 */
  function selectFolder(id: number): void {
    selectedFolderId.value = id
    searchResults.value = null
  }

  /** 在当前目录及后代范围执行服务端搜索。 */
  async function search(): Promise<void> {
    const keyword = query.value.trim()
    if (!keyword) {
      searchResults.value = null
      return
    }
    searchResults.value = await apiRequest<NavigationNode[]>(`/api/v1/search?q=${encodeURIComponent(keyword)}&folderId=${selectedFolderId.value}`)
  }

  /** 新建后重载树，确保排序和服务端规范化结果一致。 */
  async function createNode(input: CreateNodeInput): Promise<void> {
    await apiRequest('/api/v1/nodes', { method: 'POST', body: JSON.stringify(input) })
    try {
      await loadTree()
    } catch (error) {
      throw new NodeMutationRefreshError('create', error)
    }
  }

  /** 更新后重载树，避免本地乐观更新遗漏后端派生字段。 */
  async function updateNode(id: number, input: UpdateNodeInput): Promise<void> {
    await apiRequest(`/api/v1/nodes/${id}`, { method: 'PUT', body: JSON.stringify(input) })
    try {
      await loadTree()
    } catch (error) {
      throw new NodeMutationRefreshError('update', error)
    }
  }

  /** 删除空节点；非空目录由页面在拿到冲突统计后再选择明确策略。 */
  async function deleteNode(id: number, strategy?: 'cascade' | 'move_to_parent'): Promise<void> {
    const suffix = strategy ? `?strategy=${strategy}` : ''
    await apiRequest(`/api/v1/nodes/${id}${suffix}`, { method: 'DELETE' })
    if (selectedFolderId.value === id) selectedFolderId.value = 1
    try {
      await loadTree()
    } catch (error) {
      throw new NodeMutationRefreshError('delete', error)
    }
  }

  /** 移动请求携带节点版本；后端负责循环检测和最终排序。 */
  async function moveNode(node: NavigationNode, parentId: number, sortKey: string): Promise<void> {
    await apiRequest(`/api/v1/nodes/${node.id}/move`, {
      method: 'POST',
      body: JSON.stringify({ parentId, sortKey, updatedAt: node.updatedAt })
    })
    try {
      await loadTree()
    } catch (error) {
      throw new NodeMutationRefreshError('move', error)
    }
  }

  /** 在当前树中查找拖拽源节点，避免把完整敏感 URL 写入 DataTransfer。 */
  function getNode(id: number): NavigationNode | undefined {
    return findNode(tree.value, id)
  }

  return {
    tree,
    selectedFolderId,
    query,
    loading,
    searchResults,
    currentFolder,
    currentFolderPath,
    visibleNodes,
    loadTree,
    selectFolder,
    search,
    createNode,
    updateNode,
    deleteNode,
    moveNode,
    getNode
  }
})
