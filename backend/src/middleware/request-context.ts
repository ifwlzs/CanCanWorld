import type { MiddlewareHandler } from 'hono'
import type { AppDependencies, AppVariables } from '../types.js'

/** 为每个请求创建可追踪日志上下文，并把请求 ID 返回给客户端。 */
export function requestContext(dependencies: AppDependencies): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (context, next) => {
    const requestId = context.req.header('x-request-id') ?? crypto.randomUUID()
    const logger = dependencies.logger.child({ requestId, method: context.req.method, path: context.req.path })
    context.set('requestId', requestId)
    context.set('logger', logger)
    context.header('x-request-id', requestId)
    const startedAt = performance.now()
    await next()
    logger.info({ status: context.res.status, durationMs: Math.round(performance.now() - startedAt) }, '请求完成')
  }
}
