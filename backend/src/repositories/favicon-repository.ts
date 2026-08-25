import type { Pool, RowDataPacket } from 'mysql2/promise'
import { AppError } from '../errors.js'
import type { FaviconResult } from '../services/favicon-fetcher.js'

interface FaviconJobRow extends RowDataPacket {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  total: number
  processed: number
  succeeded: number
  failed: number
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}

interface FaviconItemRow extends RowDataPacket {
  bookmark_id: string | number
  url: string
}

export interface CreateFaviconJobOptions {
  folderId?: number
  refresh?: boolean
}

/** favicon Repository 管理任务快照、租约、图标二进制和书签稳定图标地址。 */
export class FaviconRepository {
  constructor(private readonly pool: Pool) {}

  /** 创建全库或目录树任务；默认只处理尚无图标的 HTTP(S) 书签。 */
  async createJob(options: CreateFaviconJobOptions = {}): Promise<string> {
    const connection = await this.pool.getConnection()
    const id = crypto.randomUUID()
    try {
      await connection.beginTransaction()
      if (options.folderId !== undefined) {
        const [folders] = await connection.execute<RowDataPacket[]>("SELECT id FROM navigation_node WHERE id = ? AND node_type IN ('root', 'folder') LIMIT 1 FOR SHARE", [options.folderId])
        if (folders.length === 0) throw new AppError(404, 40408, '图标任务目录不存在')
      }
      const missingFilter = options.refresh ? '' : "AND (icon_url IS NULL OR icon_url = '')"
      const [bookmarks] = options.folderId === undefined
        ? await connection.query<RowDataPacket[]>(`
            SELECT id FROM navigation_node
            WHERE node_type = 'bookmark' AND enabled = 1
              AND (url LIKE 'http://%' OR url LIKE 'https://%') ${missingFilter}
            FOR SHARE
          `)
        : await connection.execute<RowDataPacket[]>(`
            WITH RECURSIVE scope AS (
              SELECT id FROM navigation_node WHERE id = ? AND node_type IN ('root', 'folder')
              UNION ALL
              SELECT node.id FROM navigation_node node INNER JOIN scope parent ON node.parent_id = parent.id
              WHERE node.node_type = 'folder'
            )
            SELECT id FROM navigation_node
            WHERE parent_id IN (SELECT id FROM scope)
              AND node_type = 'bookmark' AND enabled = 1
              AND (url LIKE 'http://%' OR url LIKE 'https://%') ${missingFilter}
            FOR SHARE
          `, [options.folderId])
      const now = new Date()
      await connection.execute(`
        INSERT INTO favicon_job (id, status, total, processed, succeeded, failed, lease_owner, lease_expires_at, created_at, updated_at, completed_at)
        VALUES (?, 'pending', ?, 0, 0, 0, NULL, NULL, ?, ?, NULL)
      `, [id, bookmarks.length, now, now])
      for (const bookmark of bookmarks) {
        await connection.execute("INSERT INTO favicon_job_item (job_id, bookmark_id, status, error_message) VALUES (?, ?, 'pending', NULL)", [id, bookmark.id])
      }
      await connection.commit()
      return id
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 抢占最早待执行任务，过期租约允许其他进程恢复。 */
  async claimNextJob(owner: string, leaseMs: number): Promise<string | null> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.query<FaviconJobRow[]>(`
        SELECT * FROM favicon_job
        WHERE status = 'pending' OR (status = 'running' AND lease_expires_at < UTC_TIMESTAMP(3))
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
      `)
      const job = rows[0]
      if (!job) {
        await connection.commit()
        return null
      }
      await connection.execute("UPDATE favicon_job SET status = 'running', lease_owner = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?", [owner, new Date(Date.now() + leaseMs), new Date(), job.id])
      await connection.execute("UPDATE favicon_job_item SET status = 'pending' WHERE job_id = ? AND status = 'running'", [job.id])
      await connection.commit()
      return job.id
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 只加载仍待处理且书签仍存在的任务项目，删除节点后的孤立快照不会进入网络请求。 */
  async loadPendingItems(jobId: string): Promise<Array<{ bookmarkId: number; url: string }>> {
    const [rows] = await this.pool.execute<FaviconItemRow[]>(`
      SELECT item.bookmark_id, node.url
      FROM favicon_job_item item INNER JOIN navigation_node node ON node.id = item.bookmark_id
      WHERE item.job_id = ? AND item.status = 'pending' ORDER BY item.bookmark_id
    `, [jobId])
    return rows.map((row) => ({ bookmarkId: Number(row.bookmark_id), url: row.url }))
  }

  /** 仅当前租约持有者可以续租，返回值用于执行器识别任务所有权是否仍有效。 */
  async renewLease(jobId: string, owner: string, leaseMs: number): Promise<boolean> {
    const [result] = await this.pool.execute<import('mysql2/promise').ResultSetHeader>(`
      UPDATE favicon_job SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND lease_owner = ?
    `, [new Date(Date.now() + leaseMs), new Date(), jobId, owner])
    return result.affectedRows === 1
  }

  /** 原子领取单个待处理项目，阻止同一任务项目被并发执行两次。 */
  async markItemRunning(jobId: string, bookmarkId: number): Promise<boolean> {
    const [result] = await this.pool.execute<import('mysql2/promise').ResultSetHeader>("UPDATE favicon_job_item SET status = 'running' WHERE job_id = ? AND bookmark_id = ? AND status = 'pending'", [jobId, bookmarkId])
    return result.affectedRows === 1
  }

  /** 图标、书签地址和任务计数在一个事务内提交，避免界面看到半成品。 */
  async saveSuccess(jobId: string, bookmarkId: number, result: FaviconResult): Promise<void> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      // 先锁定书签再锁定任务，和节点删除事务保持相同顺序，避免无外键模式下写入孤立缓存。
      const [nodes] = await connection.execute<RowDataPacket[]>('SELECT id FROM navigation_node WHERE id = ? AND node_type = \'bookmark\' LIMIT 1 FOR UPDATE', [bookmarkId])
      const [jobs] = await connection.execute<RowDataPacket[]>('SELECT status FROM favicon_job WHERE id = ? LIMIT 1 FOR UPDATE', [jobId])
      const [items] = await connection.execute<RowDataPacket[]>('SELECT status FROM favicon_job_item WHERE job_id = ? AND bookmark_id = ? LIMIT 1 FOR UPDATE', [jobId, bookmarkId])
      if (nodes.length === 0 || jobs[0]?.status !== 'running' || items[0]?.status !== 'running') {
        await connection.commit()
        return
      }
      const now = new Date()
      await connection.execute(`
        INSERT INTO bookmark_icon (bookmark_id, mime_type, content, content_hash, source_url, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), content = VALUES(content), content_hash = VALUES(content_hash), source_url = VALUES(source_url), fetched_at = VALUES(fetched_at)
      `, [bookmarkId, result.mimeType, result.content, result.contentHash, result.sourceUrl, now])
      await connection.execute('UPDATE navigation_node SET icon_url = ?, updated_at = ? WHERE id = ?', [`/api/v1/favicons/${bookmarkId}`, now, bookmarkId])
      await connection.execute("UPDATE favicon_job_item SET status = 'completed', error_message = NULL WHERE job_id = ? AND bookmark_id = ?", [jobId, bookmarkId])
      await connection.execute('UPDATE favicon_job SET processed = processed + 1, succeeded = succeeded + 1, updated_at = ? WHERE id = ?', [now, jobId])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 单个站点失败只记录清理后的原因，任务继续处理其他书签。 */
  async saveFailure(jobId: string, bookmarkId: number, error: unknown): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error)).replace(/\/\/[^/@\s]+@/g, '//[REDACTED]@').slice(0, 2048)
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [jobs] = await connection.execute<RowDataPacket[]>('SELECT status FROM favicon_job WHERE id = ? LIMIT 1 FOR UPDATE', [jobId])
      const [items] = await connection.execute<RowDataPacket[]>('SELECT status FROM favicon_job_item WHERE job_id = ? AND bookmark_id = ? LIMIT 1 FOR UPDATE', [jobId, bookmarkId])
      if (jobs[0]?.status !== 'running' || items[0]?.status !== 'running') {
        await connection.commit()
        return
      }
      const now = new Date()
      await connection.execute("UPDATE favicon_job_item SET status = 'failed', error_message = ? WHERE job_id = ? AND bookmark_id = ?", [message, jobId, bookmarkId])
      await connection.execute('UPDATE favicon_job SET processed = processed + 1, failed = failed + 1, updated_at = ? WHERE id = ?', [now, jobId])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 完成任务时保留已经写入的取消状态，并释放租约字段。 */
  async finishJob(jobId: string): Promise<void> {
    await this.pool.execute(`
      UPDATE favicon_job
      SET status = IF(status = 'cancelled', 'cancelled', 'completed'), lease_owner = NULL, lease_expires_at = NULL,
          completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE id = ?
    `, [new Date(), new Date(), jobId])
  }

  /** Worker 在领取下一项目之前检查取消状态，尽快停止后续网络访问。 */
  async isCancelled(jobId: string): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT status FROM favicon_job WHERE id = ? LIMIT 1', [jobId])
    return rows[0]?.status === 'cancelled'
  }

  /** 将数据库任务字段映射成稳定的 HTTP JSON 契约。 */
  async getJob(id: string): Promise<Record<string, unknown>> {
    const [rows] = await this.pool.execute<FaviconJobRow[]>('SELECT * FROM favicon_job WHERE id = ? LIMIT 1', [id])
    const row = rows[0]
    if (!row) throw new AppError(404, 40409, '图标任务不存在')
    return {
      id: row.id, status: row.status, total: row.total, processed: row.processed,
      succeeded: row.succeeded, failed: row.failed, createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null
    }
  }

  /** 取消待执行或执行中的任务，并同步终止所有尚未完成的项目。 */
  async cancel(id: string): Promise<void> {
    const [result] = await this.pool.execute<import('mysql2/promise').ResultSetHeader>(`
      UPDATE favicon_job SET status = 'cancelled', updated_at = ?, completed_at = ?
      WHERE id = ? AND status IN ('pending', 'running')
    `, [new Date(), new Date(), id])
    if (result.affectedRows === 0) throw new AppError(409, 40910, '图标任务不存在或已经结束')
    await this.pool.execute("UPDATE favicon_job_item SET status = 'cancelled' WHERE job_id = ? AND status IN ('pending', 'running')", [id])
  }
}
