import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { AppError } from '../errors.js'
import type { LinkCheckResult } from '../services/link-checker.js'

interface JobRow extends RowDataPacket {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  total: number
  processed: number
  succeeded: number
  failed: number
  lease_owner: string | null
  lease_expires_at: Date | null
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}

interface ItemRow extends RowDataPacket {
  bookmark_id: string | number
  url: string
}

/** 检测任务 Repository 管理任务快照、租约、进度和历史写入。 */
export class CheckRepository {
  constructor(private readonly pool: Pool) {}

  /** 创建任务时快照所有启用的 HTTP(S) 书签或指定单个书签。 */
  async createJob(bookmarkId?: number): Promise<string> {
    const connection = await this.pool.getConnection()
    const id = crypto.randomUUID()
    try {
      await connection.beginTransaction()
      const params: Array<string | number> = []
      let filter = "node_type = 'bookmark' AND enabled = 1 AND (url LIKE 'http://%' OR url LIKE 'https://%')"
      if (bookmarkId !== undefined) {
        filter += ' AND id = ?'
        params.push(bookmarkId)
      }
      const [bookmarks] = await connection.execute<RowDataPacket[]>(`SELECT id FROM navigation_node WHERE ${filter}`, params)
      if (bookmarkId !== undefined && bookmarks.length === 0) throw new AppError(404, 40404, '可检测书签不存在')
      const now = new Date()
      await connection.execute(`
        INSERT INTO bookmark_check_job (id, status, total, processed, succeeded, failed, lease_owner, lease_expires_at, created_at, updated_at, completed_at)
        VALUES (?, 'pending', ?, 0, 0, 0, NULL, NULL, ?, ?, NULL)
      `, [id, bookmarks.length, now, now])
      for (const bookmark of bookmarks) await connection.execute("INSERT INTO bookmark_check_job_item (job_id, bookmark_id, status) VALUES (?, ?, 'pending')", [id, bookmark.id])
      await connection.commit()
      return id
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 定时器只在不存在待执行或运行中任务时创建新任务，避免任务积压。 */
  async hasActiveJob(): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT id FROM bookmark_check_job WHERE status IN ('pending', 'running') LIMIT 1")
    return rows.length > 0
  }

  async getJob(id: string): Promise<Record<string, unknown>> {
    const [rows] = await this.pool.execute<JobRow[]>('SELECT * FROM bookmark_check_job WHERE id = ? LIMIT 1', [id])
    const row = rows[0]
    if (!row) throw new AppError(404, 40405, '检测任务不存在')
    return mapJob(row)
  }

  async cancel(id: string): Promise<void> {
    const [result] = await this.pool.execute<import('mysql2/promise').ResultSetHeader>(`
      UPDATE bookmark_check_job SET status = 'cancelled', updated_at = ?, completed_at = ?
      WHERE id = ? AND status IN ('pending', 'running')
    `, [new Date(), new Date(), id])
    if (result.affectedRows === 0) throw new AppError(409, 40907, '任务不存在或已经结束')
    await this.pool.execute("UPDATE bookmark_check_job_item SET status = 'cancelled' WHERE job_id = ? AND status IN ('pending', 'running')", [id])
  }

  /** 获取任务时在事务中抢占租约，保证一个任务只由一个执行器处理。 */
  async claimNextJob(owner: string, leaseMs: number): Promise<string | null> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.query<JobRow[]>(`
        SELECT * FROM bookmark_check_job
        WHERE status = 'pending' OR (status = 'running' AND lease_expires_at < UTC_TIMESTAMP(3))
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
      `)
      const job = rows[0]
      if (!job) {
        await connection.commit()
        return null
      }
      await connection.execute("UPDATE bookmark_check_job SET status = 'running', lease_owner = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?", [owner, new Date(Date.now() + leaseMs), new Date(), job.id])
      await connection.execute("UPDATE bookmark_check_job_item SET status = 'pending' WHERE job_id = ? AND status = 'running'", [job.id])
      await connection.commit()
      return job.id
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async loadPendingItems(jobId: string): Promise<Array<{ bookmarkId: number; url: string }>> {
    const [rows] = await this.pool.execute<ItemRow[]>(`
      SELECT i.bookmark_id, n.url
      FROM bookmark_check_job_item i
      INNER JOIN navigation_node n ON n.id = i.bookmark_id
      WHERE i.job_id = ? AND i.status = 'pending'
      ORDER BY i.bookmark_id
    `, [jobId])
    return rows.map((row) => ({ bookmarkId: Number(row.bookmark_id), url: row.url }))
  }

  /** 执行器定期续租，长任务不会在处理中途被其他进程重新抢占。 */
  async renewLease(jobId: string, owner: string, leaseMs: number): Promise<boolean> {
    const [result] = await this.pool.execute<import('mysql2/promise').ResultSetHeader>(`
      UPDATE bookmark_check_job SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND lease_owner = ?
    `, [new Date(Date.now() + leaseMs), new Date(), jobId, owner])
    return result.affectedRows === 1
  }

  async markItemRunning(jobId: string, bookmarkId: number): Promise<boolean> {
    const [result] = await this.pool.execute<import('mysql2/promise').ResultSetHeader>("UPDATE bookmark_check_job_item SET status = 'running' WHERE job_id = ? AND bookmark_id = ? AND status = 'pending'", [jobId, bookmarkId])
    return result.affectedRows === 1
  }

  /** 结果、书签当前状态、任务项目和任务计数在一个事务中同步更新。 */
  async saveResult(jobId: string, bookmarkId: number, result: LinkCheckResult): Promise<void> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const now = new Date()
      const succeeded = result.httpStatus !== null
      await connection.execute(`
        INSERT INTO bookmark_check_log (bookmark_id, job_id, status, http_status, response_time, error_message, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [bookmarkId, jobId, result.status, result.httpStatus, result.responseTime, result.errorMessage, now])
      await connection.execute(`
        UPDATE navigation_node SET last_checked_at = ?, last_check_status = ?, last_http_status = ?, last_response_time = ?, updated_at = ? WHERE id = ?
      `, [now, result.status, result.httpStatus, result.responseTime, now, bookmarkId])
      await connection.execute("UPDATE bookmark_check_job_item SET status = ? WHERE job_id = ? AND bookmark_id = ?", [succeeded ? 'completed' : 'failed', jobId, bookmarkId])
      await connection.execute(`
        UPDATE bookmark_check_job
        SET processed = processed + 1, succeeded = succeeded + ?, failed = failed + ?, updated_at = ?
        WHERE id = ?
      `, [succeeded ? 1 : 0, succeeded ? 0 : 1, now, jobId])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async finishJob(jobId: string): Promise<void> {
    await this.pool.execute(`
      UPDATE bookmark_check_job
      SET status = IF(status = 'cancelled', 'cancelled', 'completed'), lease_owner = NULL, lease_expires_at = NULL,
          completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE id = ?
    `, [new Date(), new Date(), jobId])
  }

  async isCancelled(jobId: string): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT status FROM bookmark_check_job WHERE id = ? LIMIT 1', [jobId])
    return rows[0]?.status === 'cancelled'
  }
}

/** 数据库字段统一映射为前端任务进度契约。 */
function mapJob(row: JobRow): Record<string, unknown> {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    processed: row.processed,
    succeeded: row.succeeded,
    failed: row.failed,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null
  }
}
