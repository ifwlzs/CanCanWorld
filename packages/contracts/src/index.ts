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
  remark: string | null
  iconUrl: string | null
  sortKey: string
  enabled: boolean
  visibility: Visibility
  tags: string[]
  lastCheckedAt?: string | null | undefined
  lastCheckStatus?: string | null | undefined
  lastHttpStatus?: number | null | undefined
  lastResponseTime?: number | null | undefined
  clickCount: number
  createdAt: string
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
  remark: z.string().nullable(),
  iconUrl: z.string().nullable(),
  sortKey: z.string(),
  enabled: z.boolean(),
  visibility: visibilitySchema,
  tags: z.array(z.string()),
  lastCheckedAt: z.string().datetime().nullable().optional(),
  lastCheckStatus: z.string().nullable().optional(),
  lastHttpStatus: z.number().int().nullable().optional(),
  lastResponseTime: z.number().int().nullable().optional(),
  clickCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
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
  remark: z.string().max(10_000).nullable().default(null),
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

/** 管理员列表只查询可编辑节点；系统根和已废弃分割线不会进入结果。 */
const adminNodeQueryObjectSchema = z.object({
  keyword: z.string().trim().max(200).default(''),
  folderId: z.number().int().positive().default(1),
  includeDescendants: z.boolean().default(true),
  nodeTypes: z.array(z.enum(['folder', 'bookmark'])).min(1).max(2).default(['folder', 'bookmark']),
  visibility: visibilitySchema.optional(),
  enabled: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
  tagMode: z.enum(['any', 'all']).default('any'),
  health: z.array(z.enum(['unchecked', 'responded', 'unreachable'])).max(3).default([]),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  checkedFrom: z.string().datetime().optional(),
  checkedTo: z.string().datetime().optional(),
  sortBy: z.enum(['tree', 'title', 'createdAt', 'clickCount', 'lastCheckedAt']).default('tree'),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(20), z.literal(50), z.literal(100), z.literal(200)]).default(50)
})

/** 共享校验只依赖分页查询和保存查询共同拥有的字段。 */
type AdminNodeValidationFields = Pick<z.infer<typeof adminNodeQueryObjectSchema>,
  'nodeTypes' | 'tags' | 'health' | 'createdFrom' | 'createdTo' | 'checkedFrom' | 'checkedTo'>

/**
 * 查询集合和时间区间在分页查询与保存预设之间复用同一校验。
 * 标签按 locale-neutral 小写值去重，共享契约不能依赖浏览器或服务端的运行时区域设置。
 */
function validateAdminNodeQuery(value: AdminNodeValidationFields, context: z.RefinementCtx): void {
  if (new Set(value.nodeTypes).size !== value.nodeTypes.length) {
    context.addIssue({ code: 'custom', path: ['nodeTypes'], message: '节点类型不能重复' })
  }
  if (new Set(value.tags.map((tag) => tag.toLowerCase())).size !== value.tags.length) {
    context.addIssue({ code: 'custom', path: ['tags'], message: '标签不能重复' })
  }
  if (new Set(value.health).size !== value.health.length) {
    context.addIssue({ code: 'custom', path: ['health'], message: '检测结论不能重复' })
  }
  if (value.createdFrom && value.createdTo && Date.parse(value.createdFrom) > Date.parse(value.createdTo)) {
    context.addIssue({ code: 'custom', path: ['createdTo'], message: '创建结束时间不能早于开始时间' })
  }
  if (value.checkedFrom && value.checkedTo && Date.parse(value.checkedFrom) > Date.parse(value.checkedTo)) {
    context.addIssue({ code: 'custom', path: ['checkedTo'], message: '检测结束时间不能早于开始时间' })
  }
}

/** 树顺序默认升序，其他字段默认降序；调用方显式提供的方向始终优先。 */
function normalizeAdminNodeQuery<T extends {
  sortBy: 'tree' | 'title' | 'createdAt' | 'clickCount' | 'lastCheckedAt'
  sortDirection?: 'asc' | 'desc' | undefined
}>(value: T) {
  return { ...value, sortDirection: value.sortDirection ?? (value.sortBy === 'tree' ? 'asc' : 'desc') }
}

/** 管理员分页查询在完成集合与区间校验后补齐动态排序方向。 */
export const adminNodeQuerySchema = adminNodeQueryObjectSchema
  .superRefine(validateAdminNodeQuery)
  .transform(normalizeAdminNodeQuery)
export type AdminNodeQuery = z.infer<typeof adminNodeQuerySchema>

/** 管理员分页结果只返回当前页平铺节点，fullPath 不包含节点自身。 */
export interface AdminNodeQueryResult {
  items: NavigationNode[]
  total: number
  page: number
  pageSize: 20 | 50 | 100 | 200
}

/** 保存的筛选条件不携带瞬时页码，并在附加 effects 前从基础 object 派生。 */
const adminNodeSavedQueryObjectSchema = adminNodeQueryObjectSchema.omit({ page: true })

/** 保存查询复用分页查询的集合、时间区间校验和动态排序默认值。 */
const adminNodeSavedQuerySchema = adminNodeSavedQueryObjectSchema
  .superRefine(validateAdminNodeQuery)
  .transform(normalizeAdminNodeQuery)

/** 筛选预设输入由浏览器生成稳定 UUID，更新时间由服务端补充。 */
export const adminNodeFilterPresetInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  query: adminNodeSavedQuerySchema
})
export type AdminNodeFilterPresetInput = z.infer<typeof adminNodeFilterPresetInputSchema>

/** 单次保存最多接收二十个预设，避免设置项无限增长。 */
export const adminNodeFilterPresetListInputSchema = z.array(adminNodeFilterPresetInputSchema).max(20)

/** 服务端返回的预设包含规范化条件和统一更新时间。 */
export const adminNodeFilterPresetSchema = adminNodeFilterPresetInputSchema.extend({
  updatedAt: z.string().datetime()
})
export type AdminNodeFilterPreset = z.infer<typeof adminNodeFilterPresetSchema>

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
