import { adminNodeQuerySchema, type AdminNodeQuery, type NavigationNode } from '@cancanworld/contracts'

/** 通过共享 Schema 补齐默认值，确保每次调用都得到独立数组实例。 */
export function createDefaultAdminNodeQuery(): AdminNodeQuery {
  return adminNodeQuerySchema.parse({})
}

/** 仅统计会改变筛选语义的高级条件，不把搜索、排序和分页计入徽标。 */
export function countAdvancedFilters(query: AdminNodeQuery): number {
  let count = 0
  if (query.folderId !== 1) count += 1
  if (!query.includeDescendants) count += 1
  if (query.visibility !== undefined) count += 1
  if (query.enabled !== undefined) count += 1
  if (query.tags.length > 0) count += 1
  if (query.health.length > 0) count += 1
  if (query.createdFrom !== undefined || query.createdTo !== undefined) count += 1
  if (query.checkedFrom !== undefined || query.checkedTo !== undefined) count += 1
  return count
}

/** 拼接后端返回的祖先路径与当前标题；缺少路径时仍返回可读标题。 */
export function displayNodePath(node: NavigationNode): string {
  const path = node.fullPath ?? []
  return [...path, node.title].filter((part) => part.length > 0).join(' / ') || node.title
}

/** 目录自身保存到自身 ID，书签则回退到父目录或虚拟根目录。 */
export function locateFolderId(node: NavigationNode): number {
  return node.nodeType === 'folder' ? node.id : (node.parentId ?? 1)
}

/** 复制所有数组字段，避免编辑草稿或请求快照的修改相互串联。 */
export function cloneAdminNodeQuery(query: AdminNodeQuery): AdminNodeQuery {
  return {
    ...query,
    nodeTypes: [...query.nodeTypes],
    tags: [...query.tags],
    health: [...query.health]
  }
}
