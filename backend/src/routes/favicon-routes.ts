import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { AppError, validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { FaviconRepository } from '../repositories/favicon-repository.js'
import type { AppDependencies, AppVariables } from '../types.js'

const createJobSchema = z.object({
  folderId: z.number().int().positive().optional(),
  refresh: z.boolean().default(false)
})
const idSchema = z.object({ id: z.string().uuid() })
const bookmarkSchema = z.object({ bookmarkId: z.coerce.number().int().positive() })

/** favicon API 提供持久化任务控制和同源图片读取。 */
export function createFaviconRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  const repository = new FaviconRepository(dependencies.pool)
  const validatorHook = (result: { success: boolean; error?: unknown }) => {
    if (!result.success) throw validationError(result.error)
  }

  routes.post('/favicon-jobs', requireAdmin(), zValidator('json', createJobSchema, validatorHook), async (context) => {
    const { folderId, refresh } = context.req.valid('json')
    const jobId = await repository.createJob(folderId === undefined ? { refresh } : { folderId, refresh })
    return context.json({ code: 0, message: 'accepted', data: { jobId } }, 202)
  })
  routes.get('/favicon-jobs/:id', requireAdmin(), zValidator('param', idSchema, validatorHook), async (context) => {
    return context.json({ code: 0, message: 'success', data: await repository.getJob(context.req.valid('param').id) })
  })
  routes.post('/favicon-jobs/:id/cancel', requireAdmin(), zValidator('param', idSchema, validatorHook), async (context) => {
    await repository.cancel(context.req.valid('param').id)
    return context.json({ code: 0, message: 'success', data: null })
  })

  // 私有书签图标只对管理员返回，公开图标可以长期缓存且不暴露第三方来源地址。
  routes.get('/favicons/:bookmarkId', zValidator('param', bookmarkSchema, validatorHook), async (context) => {
    const [rows] = await dependencies.pool.execute<RowDataPacket[]>(`
      SELECT icon.mime_type, icon.content, icon.content_hash, node.visibility
      FROM bookmark_icon icon INNER JOIN navigation_node node ON node.id = icon.bookmark_id
      WHERE icon.bookmark_id = ? LIMIT 1
    `, [context.req.valid('param').bookmarkId])
    const row = rows[0]
    if (!row || (row.visibility === 'private' && context.get('user') === null)) throw new AppError(404, 40410, '书签图标不存在')
    context.header('Content-Type', String(row.mime_type))
    context.header('Cache-Control', row.visibility === 'public' ? 'public, max-age=86400' : 'private, max-age=3600')
    context.header('ETag', `"${String(row.content_hash)}"`)
    context.header('X-Content-Type-Options', 'nosniff')
    return context.body(Uint8Array.from(row.content as Buffer).buffer)
  })
  return routes
}
