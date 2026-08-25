import { Hono } from 'hono'
import { z } from 'zod'
import { validationError } from '../errors.js'
import { NodeRepository } from '../repositories/node-repository.js'
import type { AppDependencies, AppVariables } from '../types.js'

const searchSchema = z.object({
  q: z.string().trim().min(1).max(256),
  folderId: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100)
})

/** 搜索路由支持目录范围和稳定结果上限，避免空关键词扫全表。 */
export function createSearchRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  const repository = new NodeRepository(dependencies.pool)
  routes.get('/', async (context) => {
    const parsed = searchSchema.safeParse(context.req.query())
    if (!parsed.success) throw validationError(parsed.error)
    const data = await repository.search(parsed.data.q, parsed.data.folderId, context.get('user') !== null, parsed.data.limit)
    return context.json({ code: 0, message: 'success', data })
  })
  return routes
}
