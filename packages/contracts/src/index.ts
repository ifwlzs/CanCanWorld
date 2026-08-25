import { z } from 'zod'

/** 导航节点类型同时覆盖系统根、目录、书签和纯视觉分割线。 */
export const nodeTypeSchema = z.enum(['root', 'folder', 'bookmark', 'separator'])
export type NodeType = z.infer<typeof nodeTypeSchema>

/** 可见性由后端查询边界强制执行，前端隐藏不构成权限控制。 */
export const visibilitySchema = z.enum(['public', 'private'])
export type Visibility = z.infer<typeof visibilitySchema>

/** HTTP API 使用 camelCase，长整型排序键通过字符串传输以避免精度丢失。 */
export interface NavigationNode {
  id: number
  parentId: number | null
  nodeType: NodeType
  title: string
  url: string | null
  bookmarkType?: 'url' | 'javascript' | undefined
  description: string | null
  iconUrl: string | null
  sortKey: string
  enabled: boolean
  visibility: Visibility
  tags: string[]
  lastCheckedAt?: string | null | undefined
  lastCheckStatus?: string | null | undefined
  lastHttpStatus?: number | null | undefined
  lastResponseTime?: number | null | undefined
  children?: NavigationNode[] | undefined
  fullPath?: string[] | undefined
  updatedAt: string
}

export const navigationNodeSchema: z.ZodType<NavigationNode> = z.object({
  id: z.number().int().positive(),
  parentId: z.number().int().positive().nullable(),
  nodeType: nodeTypeSchema,
  title: z.string(),
  url: z.string().nullable(),
  bookmarkType: z.enum(['url', 'javascript']).optional(),
  description: z.string().nullable(),
  iconUrl: z.string().nullable(),
  sortKey: z.string(),
  enabled: z.boolean(),
  visibility: visibilitySchema,
  tags: z.array(z.string()),
  lastCheckedAt: z.string().datetime().nullable().optional(),
  lastCheckStatus: z.string().nullable().optional(),
  lastHttpStatus: z.number().int().nullable().optional(),
  lastResponseTime: z.number().int().nullable().optional(),
  children: z.array(z.lazy(() => navigationNodeSchema)).optional(),
  fullPath: z.array(z.string()).optional(),
  updatedAt: z.string()
})

/** 新建节点的字段按节点类型进行后端交叉校验。 */
export const createNodeSchema = z.object({
  parentId: z.number().int().positive().default(1),
  nodeType: z.enum(['folder', 'bookmark']),
  title: z.string().trim().max(512).default(''),
  url: z.string().max(1_000_000).nullable().default(null),
  description: z.string().max(10_000).nullable().default(null),
  iconUrl: z.string().max(4096).nullable().default(null),
  visibility: visibilitySchema.default('public'),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).default([])
})
export type CreateNodeInput = z.infer<typeof createNodeSchema>

/** 更新使用乐观锁时间戳，防止两个页面静默覆盖彼此修改。 */
export const updateNodeSchema = createNodeSchema.partial().extend({
  updatedAt: z.string().datetime()
})
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>

/** 节点移动可同时指定新父节点和目标排序键。 */
export const moveNodeSchema = z.object({
  parentId: z.number().int().positive(),
  sortKey: z.string().regex(/^\d+$/),
  updatedAt: z.string().datetime()
})
export type MoveNodeInput = z.infer<typeof moveNodeSchema>

/** 非空目录删除必须显式选择级联或保留内容策略。 */
export const deleteStrategySchema = z.enum(['cascade', 'move_to_parent'])
export type DeleteStrategy = z.infer<typeof deleteStrategySchema>

/** 导入确认目前只支持保留全部或跳过相同规范化 URL。 */
export const duplicateStrategySchema = z.enum(['keep_all', 'skip_same_url'])
export type DuplicateStrategy = z.infer<typeof duplicateStrategySchema>

/** 所有成功和错误响应都使用同一外层结构。 */
export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  requestId?: string
}

/** 后台任务状态适用于导入确认和链接批量检测。 */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** 导入统计区分原始目录、生成分组目录和被忽略的纯横线来源节点。 */
export interface ImportStats {
  sourceFolders: number
  generatedFolders: number
  bookmarks: number
  javascriptBookmarks: number
  separators: number
  sourceSeparatorNodes: number
  failed: number
}

/** 导入问题携带源位置和完整路径，便于在大文件中定位。 */
export interface ImportIssue {
  nodeIndex: number
  line?: number
  title: string
  url?: string
  folderPath: string[]
  code: string
  reason: string
}

/** 导入预览只包含会实际落库的目录和书签，纯横线节点在解析时丢弃。 */
export interface ImportPreviewNode {
  type: 'folder' | 'bookmark'
  title: string
  url?: string
  bookmarkType?: 'url' | 'javascript'
  children?: ImportPreviewNode[]
  source: {
    nodeIndex: number
    line?: number
    folderPath: string[]
    originalTitle?: string
    originalUrl?: string
    generatedFromGroup?: boolean
  }
}

/** 导入预览响应供前端展示统计并在确认时引用任务。 */
export interface ImportPreview {
  jobId: string
  stats: ImportStats
  issues: ImportIssue[]
  nodes: ImportPreviewNode[]
}

/** 只有分组标记生成的目录允许在确认前重命名或转换，普通导入节点保持原样。 */
export const importGroupOverrideSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('folder'), title: z.string().trim().min(1).max(512) }),
  z.object({ type: z.literal('bookmark') })
])
export type ImportGroupOverride = z.infer<typeof importGroupOverrideSchema>
