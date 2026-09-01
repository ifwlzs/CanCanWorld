import { adminNodeBatchTagSchema, adminNodeQuerySchema } from '@cancanworld/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { AdminNodeRepository } from '../repositories/admin-node-repository.js'
import type { AdminNodeBatchTagInput, AdminNodeBatchTagResult, AdminNodeQuery, AdminNodeQueryResult } from '@cancanworld/contracts'
import type { AppDependencies, AppVariables } from '../types.js'
import { NodeRepository } from '../repositories/node-repository.js'

/** Route 只依赖查询读接口，便于测试替换实现且不暴露 SQL 细节。 */
export interface AdminNodeQueryReader {
  query(input: AdminNodeQuery): Promise<AdminNodeQueryResult>
}

/** 批量标签写接口独立注入，路由不依赖具体事务实现。 */
export interface AdminNodeBatchTagWriter {
  batchUpdateTags(input: AdminNodeBatchTagInput): Promise<AdminNodeBatchTagResult>
}

/** 创建管理员节点查询路由，默认使用注入连接池构造生产 Repository。 */
export function createAdminNodeRoutes(
  dependencies: AppDependencies,
  reader: AdminNodeQueryReader = new AdminNodeRepository(dependencies.pool),
  batchWriter: AdminNodeBatchTagWriter = new NodeRepository(dependencies.pool)
) {
  const routes = new Hono<{ Variables: AppVariables }>()

  /** 将 Zod 失败转换为统一 422 错误，成功结果由中间件写入 valid('json')。 */
  const validatorHook = (result: { success: boolean; error?: unknown }) => {
    if (!result.success) throw validationError(result.error)
  }

  // 先完成管理员与 CSRF 校验，再解析 JSON；处理器只转发规范化输入和结果。
  routes.post(
    '/query',
    requireAdmin(),
    zValidator('json', adminNodeQuerySchema, validatorHook),
    async (context) => context.json({
      code: 0,
      message: 'success',
      data: await reader.query(context.req.valid('json'))
    })
  )

  routes.post(
    '/batch-tags',
    requireAdmin(),
    zValidator('json', adminNodeBatchTagSchema, validatorHook),
    async (context) => context.json({
      code: 0,
      message: 'success',
      data: await batchWriter.batchUpdateTags(context.req.valid('json'))
    })
  )

  return routes
}
