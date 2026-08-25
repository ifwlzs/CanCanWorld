import { Hono } from 'hono'
import { requireAdmin } from '../middleware/auth.js'
import { BackupRepository } from '../repositories/backup-repository.js'
import { NodeRepository } from '../repositories/node-repository.js'
import { exportBookmarkHtml } from '../services/bookmark-exporter.js'
import type { AppDependencies, AppVariables } from '../types.js'

/** 导出和备份均为管理员操作，避免私有书签通过下载接口泄露。 */
export function createBackupRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  const backups = new BackupRepository(dependencies.pool)
  const nodes = new NodeRepository(dependencies.pool)

  routes.get('/export/html', requireAdmin(), async (context) => {
    const html = exportBookmarkHtml(await nodes.getTree(true))
    context.header('content-type', 'text/html; charset=utf-8')
    context.header('content-disposition', `attachment; filename="cancanworld-${new Date().toISOString().slice(0, 10)}.html"`)
    return context.body(html)
  })
  routes.get('/backups', requireAdmin(), async (context) => context.json({ code: 0, message: 'success', data: await backups.list() }))
  routes.post('/backups', requireAdmin(), async (context) => context.json({ code: 0, message: 'success', data: await backups.create('manual') }, 201))
  routes.get('/backups/:id', requireAdmin(), async (context) => context.json({ code: 0, message: 'success', data: await backups.get(context.req.param('id')) }))
  routes.post('/backups/:id/restore', requireAdmin(), async (context) => context.json({ code: 0, message: 'success', data: await backups.restore(context.req.param('id')) }))
  return routes
}
