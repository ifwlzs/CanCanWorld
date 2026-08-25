import type { CreateNodeInput, NavigationNode, UpdateNodeInput } from '@cancanworld/contracts'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { AppError } from '../errors.js'
import { getBookmarkType, hashUrl } from '../utils/url.js'

interface NodeRow extends RowDataPacket {
  id: string | number
  parent_id: string | number | null
  node_type: 'root' | 'folder' | 'bookmark' | 'separator'
  title: string
  url: string | null
  description: string | null
  icon_url: string | null
  sort_key: string | number | bigint
  enabled: number | boolean
  visibility: 'public' | 'private'
  last_checked_at: Date | null
  last_check_status: string | null
  last_http_status: number | null
  last_response_time: number | null
  updated_at: Date
}

interface TagRow extends RowDataPacket {
  node_id: string | number
  name: string
}

/** 节点 Repository 是 SQL 和树装配的唯一边界，Route 只处理 HTTP 契约。 */
export class NodeRepository {
  constructor(private readonly pool: Pool) {}

  /** 获取完整可见树；匿名查询不会返回私有节点及其孤立后代。 */
  async getTree(authenticated: boolean): Promise<NavigationNode[]> {
    const visibilitySql = authenticated ? '' : "WHERE visibility = 'public' OR node_type = 'root'"
    const [rows] = await this.pool.query<NodeRow[]>(`
      SELECT id, parent_id, node_type, title, url, description, icon_url, sort_key, enabled, visibility,
             last_checked_at, last_check_status, last_http_status, last_response_time, updated_at
      FROM navigation_node
      ${visibilitySql}
      ORDER BY parent_id, sort_key, id
    `)
    const ids = rows.filter((row) => row.node_type !== 'root').map((row) => Number(row.id))
    const tags = await this.loadTags(ids)
    return buildTree(rows, tags)
  }

  /** 创建节点时验证父目录、节点字段和同级排序键，并在同一事务写入标签。 */
  async create(input: CreateNodeInput): Promise<number> {
    validateNodeShape(input.nodeType, input.title, input.url)
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      await this.requireFolder(connection, input.parentId)
      const [sortRows] = await connection.execute<RowDataPacket[]>('SELECT COALESCE(MAX(sort_key), 0) AS max_sort FROM navigation_node WHERE parent_id = ? FOR UPDATE', [input.parentId])
      const maxSort = BigInt(String(sortRows[0]?.max_sort ?? 0))
      const now = new Date()
      const urlHash = input.nodeType === 'bookmark' && input.url ? hashUrl(input.url) : null
      const [result] = await connection.execute<ResultSetHeader>(`
        INSERT INTO navigation_node (
          parent_id, node_type, title, url, url_hash, description, icon_url, sort_key,
          enabled, visibility, source_metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?)
      `, [input.parentId, input.nodeType, input.title, input.url, urlHash, input.description, input.iconUrl, (maxSort + 1024n).toString(), input.visibility, now, now])
      const id = Number(result.insertId)
      if (input.nodeType === 'bookmark') await replaceTags(connection, id, input.tags)
      await connection.commit()
      return id
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 更新使用毫秒时间戳乐观锁；节点类型不可在编辑时改变。 */
  async update(id: number, input: UpdateNodeInput): Promise<void> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute<NodeRow[]>('SELECT * FROM navigation_node WHERE id = ? FOR UPDATE', [id])
      const current = rows[0]
      if (!current || current.node_type === 'root') throw new AppError(404, 40401, '节点不存在')
      if (current.updated_at.toISOString() !== new Date(input.updatedAt).toISOString()) throw new AppError(409, 40902, '节点已经被其他操作修改，请刷新后重试')
      if (input.nodeType && input.nodeType !== current.node_type) throw new AppError(422, 42204, '编辑时不允许改变节点类型')
      const title = input.title ?? current.title
      const url = input.url === undefined ? current.url : input.url
      validateNodeShape(current.node_type, title, url)
      const description = input.description === undefined ? current.description : input.description
      const iconUrl = input.iconUrl === undefined ? current.icon_url : input.iconUrl
      const visibility = input.visibility ?? current.visibility
      const urlHash = current.node_type === 'bookmark' && url ? hashUrl(url) : null
      const [result] = await connection.execute<ResultSetHeader>(`
        UPDATE navigation_node
        SET title = ?, url = ?, url_hash = ?, description = ?, icon_url = ?, visibility = ?, updated_at = ?
        WHERE id = ? AND updated_at = ?
      `, [title, url, urlHash, description, iconUrl, visibility, new Date(), id, current.updated_at])
      if (result.affectedRows !== 1) throw new AppError(409, 40902, '节点已经被其他操作修改，请刷新后重试')
      if (current.node_type === 'bookmark' && input.tags) await replaceTags(connection, id, input.tags)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 移动前通过递归 CTE 禁止把目录移到自身或任一后代。 */
  async move(id: number, parentId: number, sortKey: string, updatedAt: string): Promise<void> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      await this.requireFolder(connection, parentId)
      const [rows] = await connection.execute<NodeRow[]>('SELECT * FROM navigation_node WHERE id = ? FOR UPDATE', [id])
      const node = rows[0]
      if (!node || node.node_type === 'root') throw new AppError(404, 40401, '节点不存在')
      if (node.updated_at.toISOString() !== new Date(updatedAt).toISOString()) throw new AppError(409, 40902, '节点已经被其他操作修改，请刷新后重试')
      if (node.node_type === 'folder') {
        const [cycles] = await connection.execute<RowDataPacket[]>(`
          WITH RECURSIVE descendants AS (
            SELECT id FROM navigation_node WHERE id = ?
            UNION ALL
            SELECT n.id FROM navigation_node n INNER JOIN descendants d ON n.parent_id = d.id
          ) SELECT id FROM descendants WHERE id = ? LIMIT 1
        `, [id, parentId])
        if (cycles.length > 0) throw new AppError(409, 40903, '目标目录是当前目录或其后代，移动会产生循环')
      }
      await connection.execute('UPDATE navigation_node SET parent_id = ?, sort_key = ?, updated_at = ? WHERE id = ?', [parentId, sortKey, new Date(), id])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 非空目录必须显式选择删除策略；级联删除按深度从叶子到父节点执行。 */
  async delete(id: number, strategy?: 'cascade' | 'move_to_parent'): Promise<void> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.execute<NodeRow[]>('SELECT * FROM navigation_node WHERE id = ? FOR UPDATE', [id])
      const node = rows[0]
      if (!node || node.node_type === 'root') throw new AppError(404, 40401, '节点不存在')
      const [children] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) AS count FROM navigation_node WHERE parent_id = ?', [id])
      const childCount = Number(children[0]?.count ?? 0)
      if (childCount > 0 && !strategy) throw new AppError(409, 40904, '目录包含子节点，必须明确删除策略', { childCount })
      if (childCount > 0 && strategy === 'move_to_parent') {
        const parentId = Number(node.parent_id)
        const [sortRows] = await connection.execute<RowDataPacket[]>('SELECT COALESCE(MAX(sort_key), 0) AS max_sort FROM navigation_node WHERE parent_id = ? FOR UPDATE', [parentId])
        let sort = BigInt(String(sortRows[0]?.max_sort ?? 0))
        const [directChildren] = await connection.execute<NodeRow[]>('SELECT id FROM navigation_node WHERE parent_id = ? ORDER BY sort_key, id', [id])
        for (const child of directChildren) {
          sort += 1024n
          await connection.execute('UPDATE navigation_node SET parent_id = ?, sort_key = ?, updated_at = ? WHERE id = ?', [parentId, sort.toString(), new Date(), child.id])
        }
      } else if (childCount > 0 && strategy === 'cascade') {
        const [descendants] = await connection.execute<RowDataPacket[]>(`
          WITH RECURSIVE tree AS (
            SELECT id, 0 AS depth FROM navigation_node WHERE id = ?
            UNION ALL
            SELECT n.id, tree.depth + 1 FROM navigation_node n INNER JOIN tree ON n.parent_id = tree.id
          ) SELECT id, depth FROM tree ORDER BY depth DESC
        `, [id])
        await deleteNodeRelations(connection, descendants.map((descendant) => Number(descendant.id)))
        for (const descendant of descendants) await connection.execute('DELETE FROM navigation_node WHERE id = ?', [descendant.id])
        await connection.commit()
        return
      }
      await deleteNodeRelations(connection, [id])
      await connection.execute('DELETE FROM navigation_node WHERE id = ?', [id])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 搜索在指定目录及全部后代范围内执行，并隐藏匿名用户不可见路径。 */
  async search(query: string, folderId: number, authenticated: boolean, limit = 100): Promise<NavigationNode[]> {
    const keyword = `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    const visibility = authenticated ? '' : "AND n.visibility = 'public'"
    const scopeVisibility = authenticated ? '' : "AND n.visibility = 'public'"
    const [rows] = await this.pool.execute<NodeRow[]>(`
      WITH RECURSIVE scope AS (
        SELECT id FROM navigation_node WHERE id = ? AND node_type IN ('root', 'folder') ${authenticated ? '' : "AND (visibility = 'public' OR node_type = 'root')"}
        UNION ALL
        SELECT n.id FROM navigation_node n INNER JOIN scope s ON n.parent_id = s.id WHERE n.node_type = 'folder' ${scopeVisibility}
      )
      SELECT DISTINCT n.id, n.parent_id, n.node_type, n.title, n.url, n.description, n.icon_url,
             n.sort_key, n.enabled, n.visibility, n.last_checked_at, n.last_check_status,
             n.last_http_status, n.last_response_time, n.updated_at
      FROM navigation_node n
      LEFT JOIN node_tag nt ON nt.node_id = n.id
      LEFT JOIN tag t ON t.id = nt.tag_id
      WHERE n.parent_id IN (SELECT id FROM scope)
        AND n.node_type = 'bookmark'
        ${visibility}
        AND (n.title LIKE ? ESCAPE '\\\\' OR n.url LIKE ? ESCAPE '\\\\' OR n.description LIKE ? ESCAPE '\\\\' OR t.name LIKE ? ESCAPE '\\\\')
      ORDER BY n.title, n.id
      LIMIT ?
    `, [folderId, keyword, keyword, keyword, keyword, limit])
    const tags = await this.loadTags(rows.map((row) => Number(row.id)))
    const paths = await this.loadFolderPaths(rows.map((row) => Number(row.parent_id)), authenticated)
    return rows.map((row) => ({ ...mapNode(row, tags.get(Number(row.id)) ?? []), fullPath: paths.get(Number(row.parent_id)) ?? [] }))
  }

  private async requireFolder(connection: PoolConnection, id: number): Promise<void> {
    // 无外键模式下锁定父目录直到当前事务完成，防止并发删除产生孤立节点。
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id FROM navigation_node WHERE id = ? AND node_type IN (\'root\', \'folder\') LIMIT 1 FOR SHARE', [id])
    if (rows.length === 0) throw new AppError(404, 40402, '父目录不存在')
  }

  private async loadTags(ids: number[]): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>()
    if (ids.length === 0) return result
    const placeholders = ids.map(() => '?').join(',')
    const [rows] = await this.pool.query<TagRow[]>(`SELECT nt.node_id, t.name FROM node_tag nt INNER JOIN tag t ON t.id = nt.tag_id WHERE nt.node_id IN (${placeholders}) ORDER BY t.name`, ids)
    for (const row of rows) {
      const id = Number(row.node_id)
      const values = result.get(id) ?? []
      values.push(row.name)
      result.set(id, values)
    }
    return result
  }

  /** 一次加载目录集合并在内存回溯完整路径，避免为每条搜索结果执行递归查询。 */
  private async loadFolderPaths(folderIds: number[], authenticated: boolean): Promise<Map<number, string[]>> {
    const [rows] = await this.pool.query<NodeRow[]>(`
      SELECT id, parent_id, node_type, title, url, description, icon_url, sort_key, enabled, visibility,
             last_checked_at, last_check_status, last_http_status, last_response_time, updated_at
      FROM navigation_node WHERE node_type IN ('root', 'folder') ${authenticated ? '' : "AND (visibility = 'public' OR node_type = 'root')"}
    `)
    const byId = new Map(rows.map((row) => [Number(row.id), row]))
    const paths = new Map<number, string[]>()
    for (const folderId of new Set(folderIds)) {
      const labels: string[] = []
      const visited = new Set<number>()
      let current = byId.get(folderId)
      while (current && current.node_type !== 'root') {
        const id = Number(current.id)
        if (visited.has(id)) throw new AppError(500, 50001, '目录数据存在循环，无法生成完整路径')
        visited.add(id)
        labels.unshift(current.title)
        current = current.parent_id === null ? undefined : byId.get(Number(current.parent_id))
      }
      paths.set(folderId, labels)
    }
    return paths
  }
}

/** 无数据库外键时，节点删除事务必须先清理全部关联记录并重算仍保留的任务总数。 */
async function deleteNodeRelations(connection: PoolConnection, nodeIds: number[]): Promise<void> {
  if (nodeIds.length === 0) return
  const placeholders = nodeIds.map(() => '?').join(',')
  const [jobs] = await connection.query<RowDataPacket[]>(`SELECT DISTINCT job_id FROM bookmark_check_job_item WHERE bookmark_id IN (${placeholders})`, nodeIds)
  const [faviconJobs] = await connection.query<RowDataPacket[]>(`SELECT DISTINCT job_id FROM favicon_job_item WHERE bookmark_id IN (${placeholders})`, nodeIds)
  await connection.query(`DELETE FROM node_tag WHERE node_id IN (${placeholders})`, nodeIds)
  await connection.query(`DELETE FROM bookmark_check_log WHERE bookmark_id IN (${placeholders})`, nodeIds)
  await connection.query(`DELETE FROM bookmark_check_job_item WHERE bookmark_id IN (${placeholders})`, nodeIds)
  await connection.query(`DELETE FROM favicon_job_item WHERE bookmark_id IN (${placeholders})`, nodeIds)
  await connection.query(`DELETE FROM bookmark_icon WHERE bookmark_id IN (${placeholders})`, nodeIds)
  for (const job of jobs) {
    await connection.execute(`
      UPDATE bookmark_check_job
      SET total = (SELECT COUNT(*) FROM bookmark_check_job_item WHERE job_id = ?), updated_at = ?
      WHERE id = ?
    `, [job.job_id, new Date(), job.job_id])
  }
  for (const job of faviconJobs) {
    await connection.execute(`
      UPDATE favicon_job
      SET total = (SELECT COUNT(*) FROM favicon_job_item WHERE job_id = ?), updated_at = ?
      WHERE id = ?
    `, [job.job_id, new Date(), job.job_id])
  }
  await connection.query('DELETE FROM tag WHERE NOT EXISTS (SELECT 1 FROM node_tag WHERE node_tag.tag_id = tag.id)')
}

/** 统一节点形状约束在写入前执行，数据库 CHECK 作为第二道防线。 */
function validateNodeShape(type: string, title: string, url: string | null): void {
  if (!['folder', 'bookmark'].includes(type)) throw new AppError(422, 42211, '只允许创建目录或书签')
  if (title.trim().length === 0) throw new AppError(422, 42205, '目录和书签名称不能为空')
  if (type === 'bookmark' && !url) throw new AppError(422, 42206, '书签地址不能为空')
  if (type !== 'bookmark' && url !== null) throw new AppError(422, 42207, '目录不能包含 URL')
}

/** 标签在事务内规范化、插入并替换关联。 */
async function replaceTags(connection: PoolConnection, nodeId: number, values: string[]): Promise<void> {
  await connection.execute('DELETE FROM node_tag WHERE node_id = ?', [nodeId])
  const unique = [...new Map(values.map((value) => [value.trim().toLocaleLowerCase(), value.trim()])).entries()].filter(([normalized]) => normalized.length > 0)
  for (const [normalized, name] of unique) {
    await connection.execute('INSERT INTO tag (name, normalized_name, created_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)', [name, normalized, new Date()])
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT id FROM tag WHERE normalized_name = ? LIMIT 1', [normalized])
    await connection.execute('INSERT INTO node_tag (node_id, tag_id) VALUES (?, ?)', [nodeId, rows[0]?.id])
  }
}

/** 扁平记录按稳定排序装配为树，缺失可见父节点的匿名子树不会泄露。 */
function buildTree(rows: NodeRow[], tags: Map<number, string[]>): NavigationNode[] {
  const byId = new Map<number, NavigationNode>()
  const result: NavigationNode[] = []
  for (const row of rows) byId.set(Number(row.id), mapNode(row, tags.get(Number(row.id)) ?? []))
  for (const row of rows) {
    if (row.node_type === 'root') continue
    const node = byId.get(Number(row.id))
    if (!node) continue
    const parent = row.parent_id === null ? undefined : byId.get(Number(row.parent_id))
    if (Number(row.parent_id) === 1) result.push(node)
    else if (parent) {
      parent.children ??= []
      parent.children.push(node)
    }
  }
  return result
}

/** 数据库 snake_case 在 Repository 边界集中映射为 HTTP camelCase。 */
function mapNode(row: NodeRow, tagNames: string[]): NavigationNode {
  const bookmarkType = row.node_type === 'bookmark' && row.url ? getBookmarkType(row.url) : undefined
  return {
    id: Number(row.id),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    nodeType: row.node_type,
    title: row.title,
    url: row.url,
    bookmarkType,
    description: row.description,
    iconUrl: row.icon_url,
    sortKey: String(row.sort_key),
    enabled: Boolean(row.enabled),
    visibility: row.visibility,
    tags: tagNames,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    lastCheckStatus: row.last_check_status,
    lastHttpStatus: row.last_http_status,
    lastResponseTime: row.last_response_time,
    children: row.node_type === 'folder' ? [] : undefined,
    fullPath: undefined,
    updatedAt: row.updated_at.toISOString()
  }
}
