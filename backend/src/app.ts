import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { AppError } from './errors.js'
import { optionalAuth } from './middleware/auth.js'
import { requestContext } from './middleware/request-context.js'
import { createAuthRoutes } from './routes/auth-routes.js'
import { createImportRoutes } from './routes/import-routes.js'
import { createNodeRoutes } from './routes/node-routes.js'
import { createSearchRoutes } from './routes/search-routes.js'
import { createCheckRoutes } from './routes/check-routes.js'
import { createBackupRoutes } from './routes/backup-routes.js'
import { createSettingRoutes } from './routes/setting-routes.js'
import { createFaviconRoutes } from './routes/favicon-routes.js'
import { createAdminRoutes } from './routes/admin-routes.js'
import { createAdminGovernanceRoutes } from './routes/admin-governance-routes.js'
import { createAdminMetadataRoutes } from './routes/admin-metadata-routes.js'
import { createAdminNodeRoutes } from './routes/admin-node-routes.js'
import type { AppDependencies, AppVariables } from './types.js'

/** 创建 Hono 应用并集中注册跨域、安全头、认证和错误处理。 */
export function createApp(dependencies: AppDependencies) {
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('*', requestContext(dependencies))
  app.use('*', secureHeaders({
    crossOriginResourcePolicy: 'same-site',
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }))
  app.use('/api/*', cors({
    origin: dependencies.env.FRONTEND_ORIGIN,
    credentials: true,
    allowHeaders: ['content-type', 'x-csrf-token', 'x-request-id', 'idempotency-key'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }))
  app.use('/api/v1/*', optionalAuth(dependencies))

  app.get('/api/v1/health', async (context) => {
    await dependencies.pool.query('SELECT 1')
    return context.json({ code: 0, message: 'success', data: { status: 'UP', time: new Date().toISOString() } })
  })
  app.route('/api/v1/auth', createAuthRoutes(dependencies))
  app.route('/api/v1/nodes', createNodeRoutes(dependencies))
  app.route('/api/v1/import', createImportRoutes(dependencies))
  app.route('/api/v1/search', createSearchRoutes(dependencies))
  app.route('/api/v1', createCheckRoutes(dependencies))
  app.route('/api/v1', createBackupRoutes(dependencies))
  app.route('/api/v1/settings', createSettingRoutes(dependencies))
  app.route('/api/v1', createFaviconRoutes(dependencies))
  app.route('/api/v1/admin', createAdminRoutes(dependencies))
  app.route('/api/v1/admin', createAdminMetadataRoutes(dependencies))
  app.route('/api/v1/admin/governance', createAdminGovernanceRoutes(dependencies))
  app.route('/api/v1/admin/nodes', createAdminNodeRoutes(dependencies))

  app.notFound((context) => context.json({ code: 40400, message: '接口不存在', data: null, requestId: context.get('requestId') }, 404))
  app.onError((error, context) => {
    const requestId = context.get('requestId')
    if (error instanceof AppError) {
      context.get('logger').warn({ errorCode: error.code, details: error.details }, error.message)
      return context.json({ code: error.code, message: error.message, data: error.details, requestId }, error.status as 400)
    }
    context.get('logger').error({ error }, '未处理的请求异常')
    return context.json({ code: 50000, message: '服务器内部错误', data: null, requestId }, 500)
  })
  return app
}
