import { AppError } from '../errors.js'
import type { Pool, RowDataPacket } from 'mysql2/promise'

/** 系统根在路径中展示为固定标题，避免暴露内部根节点命名。 */
export const ROOT_DISPLAY_TITLE = '全部书签'

/** 标签查询按节点分组，名称顺序由 SQL 固定。 */
interface TagRow extends RowDataPacket {
  node_id: string | number
  name: string
}

/** 路径查询保留深度，便于从系统根到直属父目录稳定组装。 */
interface PathRow extends RowDataPacket {
  node_id: string | number
  ancestor_id: string | number
  node_type: 'root' | 'folder'
  title: string
  depth: string | number
  cycle_detected: string | number
}

/** 所有目录递归检测到父子环时使用统一、可审计的数据完整性错误。 */
export function throwFolderCycleError(): never {
  throw new AppError(500, 50001, '目录数据存在循环，无法生成完整路径')
}

/** 只为当前页节点批量加载标签；空 ID 集合不会生成非法 IN ()。 */
export async function loadNodeTags(pool: Pool, ids: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>()
  if (ids.length === 0) return result
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await pool.query<TagRow[]>(`
    SELECT nt.node_id, t.name
    FROM node_tag AS nt
    INNER JOIN tag AS t ON t.id = nt.tag_id
    WHERE nt.node_id IN (${placeholders})
    ORDER BY t.name ASC, t.id ASC
  `, ids)
  for (const row of rows) {
    const nodeId = Number(row.node_id)
    const values = result.get(nodeId) ?? []
    values.push(row.name)
    result.set(nodeId, values)
  }
  return result
}

/**
 * 从给定节点向上递归加载祖先目录，包含系统根标题但不包含节点自身。
 * 深度倒序确保路径按“系统根 -> 直属父目录”输出，且不扫描整张目录表。
 * 递归携带已访问 ID 以在数据存在父子环时立即中止，而不是耗尽递归上限。
 */
export async function loadNodePaths(pool: Pool, ids: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>()
  if (ids.length === 0) return result
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await pool.query<PathRow[]>(`
    WITH RECURSIVE path_settings AS (
      SELECT ? AS root_display_title
    ), ancestors (node_id, ancestor_id, parent_id, node_type, title, depth, visited_ids, cycle_detected) AS (
      SELECT n.id AS node_id, parent.id AS ancestor_id, parent.parent_id, parent.node_type,
             CASE WHEN parent.node_type = 'root' THEN settings.root_display_title ELSE parent.title END,
             1 AS depth,
             CAST(CONCAT(',', n.id, ',', parent.id, ',') AS CHAR(65535)) AS visited_ids,
             n.id = parent.id AS cycle_detected
      FROM navigation_node AS n
      INNER JOIN navigation_node AS parent ON parent.id = n.parent_id
      CROSS JOIN path_settings AS settings
      WHERE n.id IN (${placeholders}) AND parent.node_type IN ('root', 'folder')
      UNION ALL
      SELECT ancestors.node_id, parent.id AS ancestor_id, parent.parent_id, parent.node_type,
             CASE WHEN parent.node_type = 'root' THEN settings.root_display_title ELSE parent.title END,
             ancestors.depth + 1,
             CONCAT(ancestors.visited_ids, parent.id, ','),
             LOCATE(CONCAT(',', parent.id, ','), ancestors.visited_ids) > 0
      FROM ancestors
      INNER JOIN navigation_node AS parent ON parent.id = ancestors.parent_id
      CROSS JOIN path_settings AS settings
      WHERE ancestors.cycle_detected = 0 AND parent.node_type IN ('root', 'folder')
    )
    SELECT node_id, ancestor_id, node_type, title, depth, cycle_detected
    FROM ancestors
    ORDER BY node_id ASC, depth DESC, ancestor_id ASC
  `, [ROOT_DISPLAY_TITLE, ...ids])
  if (rows.some((row) => Number(row.cycle_detected) > 0)) throwFolderCycleError()
  for (const row of rows) {
    const nodeId = Number(row.node_id)
    const values = result.get(nodeId) ?? []
    values.push(row.node_type === 'root' ? ROOT_DISPLAY_TITLE : row.title)
    result.set(nodeId, values)
  }
  return result
}
