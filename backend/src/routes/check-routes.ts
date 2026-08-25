import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { CheckRepository } from '../repositories/check-repository.js'
import type { AppDependencies, AppVariables } from '../types.js'

const folderScopeSchema = z.object({ folderId: z.coerce.number().int().positive().optional() })
const bookmarkIdSchema = z.object({ id: z.coerce.number().int().positive() })

/** 检测 API 创建持久化任务后立即返回 202，进度通过独立接口查询。 */
export function createCheckRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  const repository = new CheckRepository(dependencies.pool)
  const validatorHook = (result: { success: boolean; error?: unknown }) => {
    if (!result.success) throw validationError(result.error)
  }

  // folderId 缺省时保持原有全库检测；提供时由 Repository 递归限定目录范围。
  routes.post('/bookmarks/check', requireAdmin(), zValidator('query', folderScopeSchema, validatorHook), async (context) => {
    const { folderId } = context.req.valid('query')
    const jobId = await repository.createJob(folderId === undefined ? {} : { folderId })
    return context.json({ code: 0, message: 'accepted', data: { jobId } }, 202)
  })
  routes.post('/bookmarks/:id/check', requireAdmin(), zValidator('param', bookmarkIdSchema, validatorHook), async (context) => {
    const jobId = await repository.createJob({ bookmarkId: context.req.valid('param').id })
    return context.json({ code: 0, message: 'accepted', data: { jobId } }, 202)
  })
  routes.get('/check-jobs/:id', requireAdmin(), async (context) => context.json({ code: 0, message: 'success', data: await repository.getJob(context.req.param('id')) }))
  routes.post('/check-jobs/:id/cancel', requireAdmin(), async (context) => {
    await repository.cancel(context.req.param('id'))
    return context.json({ code: 0, message: 'success', data: null })
  })
  return routes
}
