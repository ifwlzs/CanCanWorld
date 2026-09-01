import { pageMetadataInputSchema } from '@cancanworld/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { malformedJsonGuard } from '../middleware/json.js'
import { PageMetadataFetcher } from '../services/page-metadata-fetcher.js'
import type { PageMetadataResult } from '@cancanworld/contracts'
import type { AppDependencies, AppVariables } from '../types.js'

/** Route 只依赖抓取读接口，便于测试替换实现且不发起真实网络请求。 */
export interface PageMetadataReader {
  fetch(url: string): Promise<PageMetadataResult>
}

/** 创建管理员元数据抓取路由，默认使用注入环境构造生产抓取器。 */
export function createAdminMetadataRoutes(
  dependencies: AppDependencies,
  reader: PageMetadataReader = new PageMetadataFetcher(dependencies.env)
) {
  const routes = new Hono<{ Variables: AppVariables }>()

  /** 将 Zod 失败转换为统一 422 错误，成功结果由中间件写入 valid('json')。 */
  const validatorHook = (result: { success: boolean; error?: unknown }) => {
    if (!result.success) throw validationError(result.error)
  }

  // 抓取会让服务端对外发起请求，因此先完成管理员与 CSRF 校验，再解析并校验地址。
  routes.post(
    '/page-metadata',
    requireAdmin(),
    malformedJsonGuard,
    zValidator('json', pageMetadataInputSchema, validatorHook),
    async (context) => context.json({
      code: 0,
      message: 'success',
      data: await reader.fetch(context.req.valid('json').url)
    })
  )

  return routes
}
