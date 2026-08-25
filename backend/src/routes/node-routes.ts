import { createNodeSchema, deleteStrategySchema, moveNodeSchema, updateNodeSchema } from '@cancanworld/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { NodeRepository } from '../repositories/node-repository.js'
import type { AppDependencies, AppVariables } from '../types.js'

/** 节点路由负责协议校验，所有树和事务规则委托 Repository。 */
export function createNodeRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  const repository = new NodeRepository(dependencies.pool)
  const validatorHook = (result: { success: boolean; error?: unknown }) => {
    if (!result.success) throw validationError(result.error)
  }

  routes.get('/tree', async (context) => context.json({ code: 0, message: 'success', data: await repository.getTree(context.get('user') !== null) }))
  routes.post('/', requireAdmin(), zValidator('json', createNodeSchema, validatorHook), async (context) => {
    const id = await repository.create(context.req.valid('json'))
    return context.json({ code: 0, message: 'success', data: { id } }, 201)
  })
  routes.put('/:id', requireAdmin(), zValidator('param', z.object({ id: z.coerce.number().int().positive() }), validatorHook), zValidator('json', updateNodeSchema, validatorHook), async (context) => {
    await repository.update(context.req.valid('param').id, context.req.valid('json'))
    return context.json({ code: 0, message: 'success', data: null })
  })
  routes.post('/:id/move', requireAdmin(), zValidator('param', z.object({ id: z.coerce.number().int().positive() }), validatorHook), zValidator('json', moveNodeSchema, validatorHook), async (context) => {
    const input = context.req.valid('json')
    await repository.move(context.req.valid('param').id, input.parentId, input.sortKey, input.updatedAt)
    return context.json({ code: 0, message: 'success', data: null })
  })
  routes.delete('/:id', requireAdmin(), zValidator('param', z.object({ id: z.coerce.number().int().positive() }), validatorHook), async (context) => {
    const rawStrategy = context.req.query('strategy')
    const strategy = rawStrategy ? deleteStrategySchema.parse(rawStrategy) : undefined
    await repository.delete(context.req.valid('param').id, strategy)
    return context.json({ code: 0, message: 'success', data: null })
  })
  return routes
}
