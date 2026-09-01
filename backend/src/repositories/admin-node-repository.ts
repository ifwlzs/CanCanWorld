import type { AdminNodeQuery, AdminNodeQueryResult, NavigationNode } from '@cancanworld/contracts'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { AppError } from '../errors.js'
import { loadNodePaths, loadNodeTags, ROOT_DISPLAY_TITLE, throwFolderCycleError } from './node-metadata-loaders.js'
import { getBookmarkType } from '../utils/url.js'

/** 管理员列表节点行只接受可编辑的目录和书签，不暴露系统根或旧分隔线。 */
interface AdminNodeRow extends RowDataPacket {
  id: string | number
  parent_id: string | number | null
  node_type: 'folder' | 'bookmark'
  title: string
  url: string | null
  description: string | null
  remark: string | null
  icon_url: string | null
  sort_key: string | number | bigint
  enabled: number | boolean
  visibility: 'public' | 'private'
  last_checked_at: Date | null
  last_check_status: string | null
  last_http_status: number | null
  last_response_time: number | null
  click_count: string | number
  created_at: Date
  updated_at: Date
}

/** 计数查询只读取当前筛选命中的节点总量。 */
interface CountRow extends RowDataPacket {
  count: string | number
  cycle_detected: string | number
}

/** 查询片段同时保存 SQL 与占位符参数，避免 count 和 page 的筛选语义漂移。 */
interface FilterParts {
  cteSql: string
  fromSql: string
  whereSql: string
  params: SqlParameter[]
  hasTreePath: boolean
  cycleSql: string
}

/** 管理员筛选只需要 mysql2 可执行参数中的这四类标量。 */
type SqlParameter = string | number | boolean | Date
type QueryNodeType = AdminNodeQuery['nodeTypes'][number]
type QueryHealth = AdminNodeQuery['health'][number]
type QuerySort = AdminNodeQuery['sortBy']
type QueryDirection = AdminNodeQuery['sortDirection']

/** 节点类型白名单只映射到参数值，不允许调用方提供 SQL 片段。 */
const NODE_TYPE_VALUES: Record<QueryNodeType, QueryNodeType> = {
  folder: 'folder',
  bookmark: 'bookmark'
}

/** 健康状态白名单映射为固定谓词，多选时由构造器统一加括号。 */
const HEALTH_SQL: Record<QueryHealth, string> = {
  unchecked: 'n.last_checked_at IS NULL',
  responded: 'n.last_checked_at IS NOT NULL AND n.last_http_status IS NOT NULL',
  unreachable: 'n.last_checked_at IS NOT NULL AND n.last_http_status IS NULL'
}

/** 排序方向严格来自共享契约枚举对应的固定 SQL 关键字。 */
const DIRECTION_SQL: Record<QueryDirection, 'ASC' | 'DESC'> = {
  asc: 'ASC',
  desc: 'DESC'
}

/** 管理员节点 Repository 负责验证范围、执行分页并集中完成数据库字段映射。 */
export class AdminNodeRepository {
  /** 连接池由应用数据库层注入，Repository 不持有独占连接。 */
  constructor(private readonly pool: Pool) {}

  /**
   * 查询范围起点下的可编辑节点。
   * 注意：folderId 仅作为范围锚点，结果永远不包含锚点自身。
   */
  async query(input: AdminNodeQuery): Promise<AdminNodeQueryResult> {
    await this.requireFolder(input.folderId)
    const filter = buildFilterParts(input)

    // 计数与分页复用完全相同的 CTE、FROM 和 WHERE，防止筛选结果不一致。
    const [countRows] = await this.pool.execute<CountRow[]>(`
      ${filter.cteSql}
      SELECT COUNT(*) AS count, ${filter.cycleSql} AS cycle_detected
      ${filter.fromSql}
      WHERE ${filter.whereSql}
    `, [...filter.params])
    const countRow = countRows[0]
    if (Number(countRow?.cycle_detected ?? 0) > 0) throwFolderCycleError()
    const total = Number(countRow?.count ?? 0)
    if (total === 0) return { items: [], total, page: input.page, pageSize: input.pageSize }

    const offset = (input.page - 1) * input.pageSize
    const orderBySql = buildOrderBy(input.sortBy, input.sortDirection, filter.hasTreePath)
    // 分页只读取 NavigationNode 所需列，LIMIT/OFFSET 也作为参数交给驱动。
    const [rows] = await this.pool.execute<AdminNodeRow[]>(`
      ${filter.cteSql}
      SELECT n.id, n.parent_id, n.node_type, n.title, n.url, n.description, n.remark, n.icon_url,
             n.sort_key, n.enabled, n.visibility, n.last_checked_at, n.last_check_status,
             n.last_http_status, n.last_response_time, n.click_count, n.created_at, n.updated_at
      ${filter.fromSql}
      WHERE ${filter.whereSql}
      ${orderBySql}
      LIMIT ? OFFSET ?
    `, [...filter.params, input.pageSize, offset])

    const ids = rows.map((row) => Number(row.id))
    const [tags, paths] = await Promise.all([loadNodeTags(this.pool, ids), loadNodePaths(this.pool, ids)])
    const items = rows.map((row) => mapNode(
      row,
      tags.get(Number(row.id)) ?? [],
      paths.get(Number(row.id)) ?? []
    ))
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  /** 验证范围起点确实是系统根或目录；失败后不得继续执行计数和分页。 */
  private async requireFolder(folderId: number): Promise<void> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`
      SELECT id FROM navigation_node
      WHERE id = ? AND node_type IN ('root', 'folder')
      LIMIT 1
    `, [folderId])
    if (rows.length === 0) throw new AppError(404, 40401, '节点不存在')
  }

}

/**
 * 构造递归范围和全部筛选谓词；只有受控白名单产生 SQL，业务值全部进入 params。
 * 关键词存在时额外构造向上递归 CTE，以匹配真正的祖先目录路径。
 */
function buildFilterParts(input: AdminNodeQuery): FilterParts {
  const ctes: string[] = []
  const conditions: string[] = []
  const cteParams: SqlParameter[] = []
  const whereParams: SqlParameter[] = []
  const cycleSources: string[] = []
  let fromSql = 'FROM navigation_node AS n'
  let hasTreePath = false

  if (input.includeDescendants) {
    // 每层路径最多增加 42 字符；CHAR(65535) 可覆盖 MySQL 默认 1000 层递归上限约 41999 字符。
    ctes.push(`
      scope (id, sort_path, visited_ids, cycle_detected) AS (
        SELECT child.id,
               CAST(CONCAT(LPAD(child.sort_key, 20, '0'), ':', LPAD(child.id, 20, '0')) AS CHAR(65535)) AS sort_path,
               CAST(CONCAT(',', child.id, ',') AS CHAR(65535)) AS visited_ids,
               0 AS cycle_detected
        FROM navigation_node AS child
        WHERE child.parent_id = ?
        UNION ALL
        SELECT child.id,
               CONCAT(scope.sort_path, '/', LPAD(child.sort_key, 20, '0'), ':', LPAD(child.id, 20, '0')),
               CONCAT(scope.visited_ids, child.id, ','),
               LOCATE(CONCAT(',', child.id, ','), scope.visited_ids) > 0
        FROM navigation_node AS child
        INNER JOIN scope ON child.parent_id = scope.id
        WHERE scope.cycle_detected = 0
      )
    `)
    cteParams.push(input.folderId)
    cycleSources.push('(SELECT COALESCE(MAX(cycle_detected), 0) FROM scope)')
    fromSql += ' INNER JOIN scope AS selected_scope ON selected_scope.id = n.id AND selected_scope.cycle_detected = 0'
    hasTreePath = true
  } else {
    conditions.push('n.parent_id = ?')
    whereParams.push(input.folderId)
  }

  if (input.keyword.length > 0) {
    ctes.push('query_settings AS (SELECT ? AS root_display_title)')
    cteParams.push(ROOT_DISPLAY_TITLE)
    const candidateScopeSql = input.includeDescendants
      ? 'INNER JOIN scope AS keyword_scope ON keyword_scope.id = candidate.id AND keyword_scope.cycle_detected = 0'
      : ''
    const candidateWhereSql = input.includeDescendants ? '' : 'candidate.parent_id = ? AND '
    if (!input.includeDescendants) cteParams.push(input.folderId)
    // 只从当前范围候选节点向上递归；visited 使用逗号边界，避免 1 与 11 互相误判。
    ctes.push(`
      keyword_ancestors (node_id, parent_id, title, visited_ids, cycle_detected) AS (
        SELECT candidate.id, parent.parent_id,
               CASE WHEN parent.node_type = 'root' THEN settings.root_display_title ELSE parent.title END,
               CAST(CONCAT(',', candidate.id, ',', parent.id, ',') AS CHAR(65535)),
               candidate.id = parent.id
        FROM navigation_node AS candidate
        ${candidateScopeSql}
        INNER JOIN navigation_node AS parent ON parent.id = candidate.parent_id
        CROSS JOIN query_settings AS settings
        WHERE ${candidateWhereSql}parent.node_type IN ('root', 'folder')
        UNION ALL
        SELECT keyword_ancestors.node_id, parent.parent_id,
               CASE WHEN parent.node_type = 'root' THEN settings.root_display_title ELSE parent.title END,
               CONCAT(keyword_ancestors.visited_ids, parent.id, ','),
               LOCATE(CONCAT(',', parent.id, ','), keyword_ancestors.visited_ids) > 0
        FROM keyword_ancestors
        INNER JOIN navigation_node AS parent ON parent.id = keyword_ancestors.parent_id
        CROSS JOIN query_settings AS settings
        WHERE keyword_ancestors.cycle_detected = 0 AND parent.node_type IN ('root', 'folder')
      )
    `)
    cycleSources.push('(SELECT COALESCE(MAX(cycle_detected), 0) FROM keyword_ancestors)')
  }

  const nodeTypes = input.nodeTypes.map((nodeType) => NODE_TYPE_VALUES[nodeType])
  conditions.push(`n.node_type IN (${nodeTypes.map(() => '?').join(',')})`)
  whereParams.push(...nodeTypes)

  if (input.visibility !== undefined) {
    conditions.push('n.visibility = ?')
    whereParams.push(input.visibility)
  }
  if (input.enabled !== undefined) {
    conditions.push('n.enabled = ?')
    whereParams.push(input.enabled)
  }

  const normalizedTags = input.tags.map((tag) => tag.trim().toLowerCase())
  const requiresBookmark = normalizedTags.length > 0
    || input.health.length > 0
    || input.checkedFrom !== undefined
    || input.checkedTo !== undefined
  if (requiresBookmark) conditions.push("n.node_type = 'bookmark'")

  if (normalizedTags.length > 0 && input.tagMode === 'any') {
    conditions.push(`EXISTS (
      SELECT 1
      FROM node_tag AS matched_node_tag
      INNER JOIN tag AS matched_tag ON matched_tag.id = matched_node_tag.tag_id
      WHERE matched_node_tag.node_id = n.id
        AND matched_tag.normalized_name IN (${normalizedTags.map(() => '?').join(',')})
    )`)
    whereParams.push(...normalizedTags)
  } else if (normalizedTags.length > 0) {
    conditions.push(`(
      SELECT COUNT(DISTINCT matched_tag.normalized_name)
      FROM node_tag AS matched_node_tag
      INNER JOIN tag AS matched_tag ON matched_tag.id = matched_node_tag.tag_id
      WHERE matched_node_tag.node_id = n.id
        AND matched_tag.normalized_name IN (${normalizedTags.map(() => '?').join(',')})
    ) = ?`)
    whereParams.push(...normalizedTags, normalizedTags.length)
  }

  const healthCondition = buildHealthCondition(input.health)
  if (healthCondition !== undefined) conditions.push(healthCondition)

  addRangeCondition(conditions, whereParams, 'n.created_at', input.createdFrom, input.createdTo)
  addRangeCondition(conditions, whereParams, 'n.last_checked_at', input.checkedFrom, input.checkedTo)

  if (input.keyword.length > 0) {
    const pattern = `%${escapeLikePattern(input.keyword)}%`
    conditions.push(`(
      n.title LIKE ? ESCAPE '!'
      OR n.url LIKE ? ESCAPE '!'
      OR n.remark LIKE ? ESCAPE '!'
      OR n.description LIKE ? ESCAPE '!'
      OR EXISTS (
        SELECT 1 FROM node_tag AS keyword_node_tag
        INNER JOIN tag AS keyword_tag ON keyword_tag.id = keyword_node_tag.tag_id
        WHERE keyword_node_tag.node_id = n.id AND keyword_tag.name LIKE ? ESCAPE '!'
      )
      OR EXISTS (
        SELECT 1 FROM keyword_ancestors AS path_ancestor
        WHERE path_ancestor.node_id = n.id AND path_ancestor.cycle_detected = 0
          AND path_ancestor.title LIKE ? ESCAPE '!'
      )
    )`)
    whereParams.push(pattern, pattern, pattern, pattern, pattern, pattern)
  }

  return {
    cteSql: ctes.length > 0 ? `WITH RECURSIVE ${ctes.join(',')}` : '',
    fromSql,
    whereSql: conditions.join(' AND '),
    params: [...cteParams, ...whereParams],
    hasTreePath,
    cycleSql: buildCycleSql(cycleSources)
  }
}

/** MySQL 的 GREATEST 至少需要两个参数，单一递归来源直接使用其标量子查询。 */
function buildCycleSql(cycleSources: string[]): string {
  if (cycleSources.length === 0) return '0'
  if (cycleSources.length === 1) return cycleSources[0] ?? '0'
  return `GREATEST(${cycleSources.join(', ')})`
}

/** 健康筛选只组合固定状态谓词，书签类型限定由统一 requiresBookmark 条件负责。 */
function buildHealthCondition(health: AdminNodeQuery['health']): string | undefined {
  if (health.length === 0) return undefined
  return `(${health.map((value) => `(${HEALTH_SQL[value]})`).join(' OR ')})`
}

/** 为可选闭区间追加参数化边界，日期交给 UTC mysql2 连接序列化。 */
function addRangeCondition(
  conditions: string[],
  params: SqlParameter[],
  columnSql: 'n.created_at' | 'n.last_checked_at',
  from: string | undefined,
  to: string | undefined
): void {
  if (from !== undefined) {
    conditions.push(`${columnSql} >= ?`)
    params.push(new Date(from))
  }
  if (to !== undefined) {
    conditions.push(`${columnSql} <= ?`)
    params.push(new Date(to))
  }
}

/** LIKE 使用感叹号转义自身、百分号和下划线，不受 NO_BACKSLASH_ESCAPES 会话模式影响。 */
function escapeLikePattern(value: string): string {
  return value.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')
}

/** 根据固定字段与方向映射生成稳定排序；检测时间为空的记录始终置于末尾。 */
function buildOrderBy(sortBy: QuerySort, sortDirection: QueryDirection, hasTreePath: boolean): string {
  const direction = DIRECTION_SQL[sortDirection]
  if (sortBy === 'tree') {
    return hasTreePath
      ? `ORDER BY selected_scope.sort_path ${direction}, n.id ASC`
      : `ORDER BY n.sort_key ${direction}, n.id ASC`
  }
  const columns: Record<Exclude<QuerySort, 'tree' | 'lastCheckedAt'>, string> = {
    title: 'n.title',
    createdAt: 'n.created_at',
    clickCount: 'n.click_count'
  }
  if (sortBy === 'lastCheckedAt') {
    return `ORDER BY n.last_checked_at IS NULL ASC, n.last_checked_at ${direction}, n.id ${direction}`
  }
  return `ORDER BY ${columns[sortBy]} ${direction}, n.id ${direction}`
}

/** 将数据库 snake_case 行映射为完整 NavigationNode，并附加当前页批量加载的标签与路径。 */
function mapNode(row: AdminNodeRow, tags: string[], fullPath: string[]): NavigationNode {
  const bookmarkType = row.node_type === 'bookmark' && row.url ? getBookmarkType(row.url) : undefined
  return {
    id: Number(row.id),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    nodeType: row.node_type,
    title: row.title,
    url: row.url,
    ...(bookmarkType === undefined ? {} : { bookmarkType }),
    description: row.description,
    remark: row.remark,
    iconUrl: row.icon_url,
    sortKey: String(row.sort_key),
    enabled: Boolean(row.enabled),
    visibility: row.visibility,
    tags,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    lastCheckStatus: row.last_check_status,
    lastHttpStatus: row.last_http_status,
    lastResponseTime: row.last_response_time,
    clickCount: Number(row.click_count),
    createdAt: row.created_at.toISOString(),
    ...(row.node_type === 'folder' ? { children: [] } : {}),
    fullPath,
    updatedAt: row.updated_at.toISOString()
  }
}
