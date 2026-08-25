import type { DuplicateStrategy, ImportGroupOverride, ImportPreviewNode, ImportStats, ImportIssue } from '@cancanworld/contracts'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { AppError } from '../errors.js'
import { hashUrl } from '../utils/url.js'

interface ImportJobRow extends RowDataPacket {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  payload: string
  report: string
  expires_at: Date
  idempotency_key: string | null
}

interface StoredReport {
  stats: ImportStats
  issues: ImportIssue[]
}

/** 导入 Repository 持久化预览并在确认时原子写入统一节点树。 */
export class ImportRepository {
  constructor(private readonly pool: Pool) {}

  async createPreview(fileName: string, nodes: ImportPreviewNode[], stats: ImportStats, issues: ImportIssue[], ttlSeconds: number): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
    await this.pool.execute(`
      INSERT INTO import_job (id, status, file_name, payload, report, idempotency_key, created_at, expires_at, completed_at)
      VALUES (?, 'pending', ?, ?, ?, NULL, ?, ?, NULL)
    `, [id, fileName.slice(0, 512), JSON.stringify(nodes), JSON.stringify({ stats, issues } satisfies StoredReport), now, expiresAt])
    return id
  }

  async getPreview(id: string): Promise<{ nodes: ImportPreviewNode[]; stats: ImportStats; issues: ImportIssue[]; status: string }> {
    const job = await this.getJob(id)
    const report = JSON.parse(job.report) as StoredReport
    return { nodes: JSON.parse(job.payload) as ImportPreviewNode[], stats: report.stats, issues: report.issues, status: job.status }
  }

  /** 调整仅作用于分组标记生成的目录，并在事务中同步更新预览树和统计。 */
  async overrideGroup(id: string, nodeIndex: number, override: ImportGroupOverride): Promise<{ nodes: ImportPreviewNode[]; stats: ImportStats; issues: ImportIssue[]; status: string }> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [jobs] = await connection.execute<ImportJobRow[]>('SELECT * FROM import_job WHERE id = ? FOR UPDATE', [id])
      const job = jobs[0]
      if (!job || job.expires_at.getTime() <= Date.now()) throw new AppError(404, 40403, '导入预览不存在或已经过期')
      if (job.status !== 'pending') throw new AppError(409, 40906, `导入任务当前状态为 ${job.status}`)

      const currentNodes = JSON.parse(job.payload) as ImportPreviewNode[]
      const updated = replaceGeneratedGroup(currentNodes, nodeIndex, override)
      if (!updated.found) throw new AppError(404, 40407, '可调整的分组标记不存在')
      const report = JSON.parse(job.report) as StoredReport
      report.stats = recountPreviewStats(updated.nodes, report.stats)
      await connection.execute('UPDATE import_job SET payload = ?, report = ? WHERE id = ?', [JSON.stringify(updated.nodes), JSON.stringify(report), id])
      await connection.commit()
      return { nodes: updated.nodes, stats: report.stats, issues: report.issues, status: job.status }
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 确认锁定任务，幂等检查和全部节点写入共用一个事务。 */
  async confirm(id: string, parentId: number, strategy: DuplicateStrategy, idempotencyKey: string): Promise<{ inserted: number; skipped: number }> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [jobs] = await connection.execute<ImportJobRow[]>('SELECT * FROM import_job WHERE id = ? FOR UPDATE', [id])
      const job = jobs[0]
      if (!job || job.expires_at.getTime() <= Date.now()) throw new AppError(404, 40403, '导入预览不存在或已经过期')
      if (job.status === 'completed') {
        if (job.idempotency_key === idempotencyKey) return { inserted: 0, skipped: 0 }
        throw new AppError(409, 40905, '导入任务已经确认完成')
      }
      if (job.status !== 'pending') throw new AppError(409, 40906, `导入任务当前状态为 ${job.status}`)
      const [parents] = await connection.execute<RowDataPacket[]>('SELECT id FROM navigation_node WHERE id = ? AND node_type IN (\'root\', \'folder\') LIMIT 1 FOR UPDATE', [parentId])
      if (parents.length === 0) throw new AppError(404, 40402, '目标目录不存在')
      await connection.execute("UPDATE import_job SET status = 'running', idempotency_key = ? WHERE id = ?", [idempotencyKey, id])

      const knownHashes = new Set<string>()
      if (strategy === 'skip_same_url') {
        const [hashRows] = await connection.query<RowDataPacket[]>('SELECT url_hash FROM navigation_node WHERE url_hash IS NOT NULL')
        for (const row of hashRows) knownHashes.add(String(row.url_hash))
      }
      const counters = { inserted: 0, skipped: 0 }
      await insertChildren(connection, JSON.parse(job.payload) as ImportPreviewNode[], parentId, knownHashes, strategy, counters)
      await connection.execute("UPDATE import_job SET status = 'completed', completed_at = ? WHERE id = ?", [new Date(), id])
      await connection.commit()
      return counters
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  private async getJob(id: string): Promise<ImportJobRow> {
    const [rows] = await this.pool.execute<ImportJobRow[]>('SELECT * FROM import_job WHERE id = ? LIMIT 1', [id])
    const job = rows[0]
    if (!job || job.expires_at.getTime() <= Date.now()) throw new AppError(404, 40403, '导入预览不存在或已经过期')
    return job
  }
}

/** 深度优先定位源节点；转换后原目录的子节点提升到同级，保证任何书签都不会丢失。 */
function replaceGeneratedGroup(nodes: ImportPreviewNode[], nodeIndex: number, override: ImportGroupOverride): { nodes: ImportPreviewNode[]; found: boolean } {
  const result: ImportPreviewNode[] = []
  let found = false
  for (const node of nodes) {
    if (!found && node.source.nodeIndex === nodeIndex && node.type === 'folder' && node.source.generatedFromGroup) {
      found = true
      if (override.type === 'folder') {
        result.push({ ...node, title: override.title })
      } else {
        const promoted = node.children ?? []
        const url = node.source.originalUrl
        if (!url) throw new AppError(409, 40910, '原始分组标记缺少 URL，无法转换为书签')
        result.push({
          type: 'bookmark',
          title: node.source.originalTitle?.trim() || url,
          url,
          bookmarkType: 'url',
          source: { ...node.source, generatedFromGroup: false }
        })
        result.push(...promoted)
      }
      continue
    }

    if (!found && node.children?.length) {
      const nested = replaceGeneratedGroup(node.children, nodeIndex, override)
      if (nested.found) {
        result.push({ ...node, children: nested.nodes })
        found = true
        continue
      }
    }
    result.push(node)
  }
  return { nodes: result, found }
}

/** 覆盖操作后从最终树重新计算可变统计，原始目录和源分割线计数保持解析基线。 */
function recountPreviewStats(nodes: ImportPreviewNode[], baseline: ImportStats): ImportStats {
  const stats: ImportStats = { ...baseline, generatedFolders: 0, bookmarks: 0, javascriptBookmarks: 0 }
  const visit = (items: ImportPreviewNode[]): void => {
    for (const node of items) {
      if (node.type === 'folder') {
        if (node.source.generatedFromGroup) stats.generatedFolders++
        if (node.children?.length) visit(node.children)
      } else if (node.type === 'bookmark') {
        stats.bookmarks++
        if (node.bookmarkType === 'javascript') stats.javascriptBookmarks++
      }
    }
  }
  visit(nodes)
  return stats
}

/** 深度优先写入先创建父目录，再按原顺序写入直接子节点。 */
async function insertChildren(
  connection: PoolConnection,
  nodes: ImportPreviewNode[],
  parentId: number,
  knownHashes: Set<string>,
  strategy: DuplicateStrategy,
  counters: { inserted: number; skipped: number }
): Promise<void> {
  const [sortRows] = await connection.execute<RowDataPacket[]>('SELECT COALESCE(MAX(sort_key), 0) AS max_sort FROM navigation_node WHERE parent_id = ? FOR UPDATE', [parentId])
  let sort = BigInt(String(sortRows[0]?.max_sort ?? 0))
  for (const node of nodes) {
    const urlHash = node.type === 'bookmark' && node.url ? hashUrl(node.url) : null
    if (strategy === 'skip_same_url' && urlHash && knownHashes.has(urlHash)) {
      counters.skipped++
      continue
    }
    sort += 1024n
    const now = new Date()
    const [result] = await connection.execute<ResultSetHeader>(`
      INSERT INTO navigation_node (
        parent_id, node_type, title, url, url_hash, description, icon_url, sort_key,
        enabled, visibility, source_metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 1, 'public', ?, ?, ?)
    `, [parentId, node.type, node.title, node.url ?? null, urlHash, sort.toString(), JSON.stringify(node.source), now, now])
    const nodeId = Number(result.insertId)
    counters.inserted++
    if (urlHash) knownHashes.add(urlHash)
    if (node.type === 'folder' && node.children?.length) await insertChildren(connection, node.children, nodeId, knownHashes, strategy, counters)
  }
}
