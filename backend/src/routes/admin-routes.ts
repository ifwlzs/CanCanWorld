import { Hono } from 'hono'
import type { RowDataPacket } from 'mysql2/promise'
import { requireAdmin } from '../middleware/auth.js'
import type { AppDependencies, AppVariables } from '../types.js'

interface AdminCountRow extends RowDataPacket {
  folders: string | number | null
  bookmarks: string | number | null
  private_bookmarks: string | number | null
  missing_icons: string | number | null
  unavailable: string | number | null
}

/** 后台概览只返回聚合信息，完整节点管理继续复用统一节点 API。 */
export function createAdminRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  routes.get('/summary', requireAdmin(), async (context) => {
    const [nodeRows] = await dependencies.pool.query<AdminCountRow[]>(`
      SELECT
        SUM(node_type = 'folder') AS folders,
        SUM(node_type = 'bookmark') AS bookmarks,
        SUM(node_type = 'bookmark' AND visibility = 'private') AS private_bookmarks,
        SUM(node_type = 'bookmark' AND (icon_url IS NULL OR icon_url = '')) AS missing_icons,
        SUM(node_type = 'bookmark' AND last_check_status IS NOT NULL AND last_http_status IS NULL) AS unavailable
      FROM navigation_node WHERE node_type <> 'root'
    `)
    const [iconRows] = await dependencies.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS icons FROM bookmark_icon')
    const [checkJobs] = await dependencies.pool.query<RowDataPacket[]>('SELECT id, status, total, processed, succeeded, failed, created_at FROM bookmark_check_job ORDER BY created_at DESC LIMIT 5')
    const [faviconJobs] = await dependencies.pool.query<RowDataPacket[]>('SELECT id, status, total, processed, succeeded, failed, created_at FROM favicon_job ORDER BY created_at DESC LIMIT 5')
    const counts = nodeRows[0]
    return context.json({
      code: 0,
      message: 'success',
      data: {
        counts: {
          folders: Number(counts?.folders ?? 0), bookmarks: Number(counts?.bookmarks ?? 0),
          privateBookmarks: Number(counts?.private_bookmarks ?? 0), missingIcons: Number(counts?.missing_icons ?? 0),
          unavailable: Number(counts?.unavailable ?? 0), icons: Number(iconRows[0]?.icons ?? 0)
        },
        // 调度配置只读展示给管理员，实际配置仍由部署环境变量统一管理。
        linkCheckSchedule: {
          enabled: true,
          intervalSeconds: dependencies.env.LINK_CHECK_INTERVAL_SECONDS,
          concurrency: dependencies.env.LINK_CHECK_CONCURRENCY,
          perHostConcurrency: dependencies.env.LINK_CHECK_PER_HOST_CONCURRENCY,
          timeoutMs: dependencies.env.LINK_CHECK_TIMEOUT_MS,
          allowedPorts: dependencies.env.LINK_CHECK_ALLOWED_PORTS,
          historyRetentionDays: dependencies.env.LINK_CHECK_HISTORY_RETENTION_DAYS
        },
        checkJobs: checkJobs.map(mapJob),
        faviconJobs: faviconJobs.map(mapJob)
      }
    })
  })
  return routes
}

/** 将数据库任务时间统一转换为前端可直接格式化的 ISO 字符串。 */
function mapJob(row: RowDataPacket): Record<string, unknown> {
  return {
    id: String(row.id), status: String(row.status), total: Number(row.total), processed: Number(row.processed),
    succeeded: Number(row.succeeded), failed: Number(row.failed), createdAt: (row.created_at as Date).toISOString()
  }
}
