import type { CreateNodeInput, NavigationNode } from '@cancanworld/contracts'

/** 目录树选择器使用稳定数字主键和展示名称，不携带书签的敏感 URL。 */
export interface FolderOption {
  id: number
  label: string
  children: FolderOption[]
}

/** 字段错误与表单字段同名，便于 Element Plus 在对应控件旁显示恢复提示。 */
export type NodeDraftErrors = Partial<Record<'parentId' | 'title' | 'url', string>>

/** 将完整导航树递归裁剪为目录树，并补充系统根目录供后台直接选择。 */
export function buildFolderOptions(nodes: NavigationNode[]): FolderOption[] {
  const folders = nodes
    .filter((node) => node.nodeType === 'folder')
    .map((node) => ({ id: node.id, label: node.title, children: buildFolderChildren(node.children ?? []) }))
  return [{ id: 1, label: '全部书签', children: folders }]
}

/** 返回新建草稿的可恢复字段错误；最终数据完整性仍由后端契约校验。 */
export function validateNodeDraft(input: CreateNodeInput): NodeDraftErrors {
  const errors: NodeDraftErrors = {}
  if (!Number.isInteger(input.parentId) || input.parentId <= 0) errors.parentId = '请选择保存目录'
  if (!input.title.trim()) errors.title = '请输入名称'
  if (input.nodeType === 'bookmark' && !input.url?.trim()) errors.url = '请输入书签地址'
  return errors
}

/** 递归实现与根节点包装分离，避免每一层重复插入虚拟根目录。 */
function buildFolderChildren(nodes: NavigationNode[]): FolderOption[] {
  return nodes
    .filter((node) => node.nodeType === 'folder')
    .map((node) => ({ id: node.id, label: node.title, children: buildFolderChildren(node.children ?? []) }))
}
