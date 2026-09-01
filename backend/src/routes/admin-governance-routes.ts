import {
  brokenBookmarkQuerySchema,
  brokenCleanupSchema,
  duplicateGroupQuerySchema,
  duplicateMergeSchema
} from '@cancanworld/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { malformedJsonGuard } from '../middleware/json.js'
import { LinkGovernanceRepository } from '../repositories/link-governance-repository.js'
import type {
  BrokenBookmarkQuery,
  BrokenBookmarkResult,
  BrokenCleanupInput,
  BrokenCleanupResult,
  DuplicateGroupQuery,
  DuplicateGroupResult,
  DuplicateMergeInput,
  DuplicateMergeResult
} from '@cancanworld/contracts'
import type { AppDependencies, AppVariables } from '../types.js'

/** Route 只依赖治理读写接口，便于测试替换实现且不暴露 SQL 细节。 */
export interface LinkGovernanceGateway {
  findDuplicateGroups(input: DuplicateGroupQuery): Promise<DuplicateGroupResult>
  mergeDuplicates(input: DuplicateMergeInput): Promise<DuplicateMergeResult>
  findBrokenBookmarks(input: BrokenBookmarkQuery): Promise<BrokenBookmarkResult>
  cleanupBroken(input: BrokenCleanupInput): Promise<BrokenCleanupResult>
}

/** 创建管理员治理路由，默认使用注入连接池构造生产 Repository。 */
export function createAdminGovernanceRoutes(
  dependencies: AppDependencies,
  gateway: LinkGovernanceGateway = new LinkGovernanceRepository(dependencies.pool)
) {
  const routes = new Hono<{ Variables: AppVariables }>()

  /** 将 Zod 失败转换为统一 422 错误，成功结果由中间件写入 valid('json')。 */
  const validatorHook = (result: { success: boolean; error?: unknown }) => {
    if (!result.success) throw validationError(result.error)
  }

  // 查询同样使用 POST 以承载结构化参数；四个接口统一先鉴权再解析请求体。
  routes.post(
    '/duplicates',
    requireAdmin(),
    malformedJsonGuard,
    zValidator('json', duplicateGroupQuerySchema, validatorHook),
    async (context) => context.json({
      code: 0,
      message: 'success',
      data: await gateway.findDuplicateGroups(context.req.valid('json'))
    })
  )

  routes.post(
    '/duplicates/merge',
    requireAdmin(),
    malformedJsonGuard,
    zValidator('json', duplicateMergeSchema, validatorHook),
    async (context) => context.json({
      code: 0,
      message: 'success',
      data: await gateway.mergeDuplicates(context.req.valid('json'))
    })
  )

  routes.post(
    '/broken',
    requireAdmin(),
    malformedJsonGuard,
    zValidator('json', brokenBookmarkQuerySchema, validatorHook),
    async (context) => context.json({
      code: 0,
      message: 'success',
      data: await gateway.findBrokenBookmarks(context.req.valid('json'))
    })
  )

  routes.post(
    '/broken/cleanup',
    requireAdmin(),
    malformedJsonGuard,
    zValidator('json', brokenCleanupSchema, validatorHook),
    async (context) => context.json({
      code: 0,
      message: 'success',
      data: await gateway.cleanupBroken(context.req.valid('json'))
    })
  )

  return routes
}
