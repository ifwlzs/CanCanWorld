import { Hono } from 'hono'
import { requireAdmin } from '../middleware/auth.js'
import { CheckRepository } from '../repositories/check-repository.js'
import type { AppDependencies, AppVariables } from '../types.js'

/** 检测 API 创建持久化任务后立即返回 202，进度通过独立接口查询。 */
export function createCheckRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  const repository = new CheckRepository(dependencies.pool)

  routes.post('/bookmarks/check', requireAdmin(), async (context) => {
    const jobId = await repository.createJob()
    return context.json({ code: 0, message: 'accepted', data: { jobId } }, 202)
  })
  routes.post('/bookmarks/:id/check', requireAdmin(), async (context) => {
    const id = Number(context.req.param('id'))
    const jobId = await repository.createJob(id)
    return context.json({ code: 0, message: 'accepted', data: { jobId } }, 202)
  })
  routes.get('/check-jobs/:id', requireAdmin(), async (context) => context.json({ code: 0, message: 'success', data: await repository.getJob(context.req.param('id')) }))
  routes.post('/check-jobs/:id/cancel', requireAdmin(), async (context) => {
    await repository.cancel(context.req.param('id'))
    return context.json({ code: 0, message: 'success', data: null })
  })
  return routes
}
