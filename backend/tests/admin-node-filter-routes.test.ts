import type { FieldPacket, Pool, RowDataPacket } from 'mysql2/promise'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../src/config/logger.js'
import { AppError } from '../src/errors.js'
import { createSettingRoutes } from '../src/routes/setting-routes.js'
import type { AppDependencies, AppVariables, AuthUser } from '../src/types.js'
import { tokenHash } from '../src/utils/crypto.js'

const RAW_CSRF_TOKEN = 'admin-filter-route-csrf'
const REQUEST_ID = 'admin-filter-route-request'

/** 构造设置路由所需的最小依赖，避免测试连接真实数据库或启动完整应用。 */
function createDependencies(rows: RowDataPacket[] = []): AppDependencies & { execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(async (..._args: Parameters<Pool['execute']>): Promise<[RowDataPacket[], FieldPacket[]]> => [rows, []])
  return {
    env: {
      DATABASE_HOST: '127.0.0.1', DATABASE_PORT: 3306, DATABASE_NAME: 'cancanworld_test', DATABASE_USER: 'test', DATABASE_PASSWORD: 'test-password', DATABASE_POOL_SIZE: 1,
      SERVER_HOST: '127.0.0.1', SERVER_PORT: 3080, FRONTEND_ORIGIN: 'http://localhost:5173', SESSION_SECRET: 'session-secret-for-route-tests-0001', CSRF_SECRET: 'csrf-secret-for-route-tests-0000001', SESSION_TTL_SECONDS: 604800,
      IMPORT_MAX_FILE_BYTES: 10485760, IMPORT_MAX_NODES: 100000, IMPORT_MAX_DEPTH: 256, IMPORT_JOB_TTL_SECONDS: 86400, LINK_CHECK_CONCURRENCY: 10, LINK_CHECK_PER_HOST_CONCURRENCY: 2, LINK_CHECK_TIMEOUT_MS: 10000, LINK_CHECK_MAX_REDIRECTS: 5, LINK_CHECK_MAX_RESPONSE_BYTES: 65536, LINK_CHECK_ALLOWED_PORTS: '80,443', LINK_CHECK_ALLOWED_CIDRS: '', LINK_CHECK_HISTORY_RETENTION_DAYS: 30, LOG_LEVEL: 'fatal', NODE_ENV: 'test'
    },
    pool: { execute } as unknown as Pool,
    logger: createLogger('fatal'),
    execute
  }
}

/** 管理员身份使用真实摘要，确保 requireAdmin 的固定时间 CSRF 比较实际执行。 */
function adminUser(): AuthUser {
  return { id: 7, username: 'admin', csrfHash: tokenHash(RAW_CSRF_TOKEN) }
}

/** 构造统一错误 envelope，并注入认证上下文与日志变量供真实中间件使用。 */
function createRouteApp(dependencies: AppDependencies, user: AuthUser | null): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('*', async (context, next) => {
    context.set('requestId', REQUEST_ID)
    context.set('logger', dependencies.logger)
    context.set('user', user)
    await next()
  })
  app.route('/api/v1/settings', createSettingRoutes(dependencies))
  app.onError((error, context) => {
    const requestId = context.get('requestId')
    if (error instanceof AppError) return context.json({ code: error.code, message: error.message, data: error.details, requestId }, error.status as 400)
    return context.json({ code: 50000, message: '服务器内部错误', data: null, requestId }, 500)
  })
  return app
}

/** 构造筛选设置请求，只有修改方法按需附加 CSRF 请求头。 */
function filterRequest(method: 'GET' | 'PUT', body?: unknown, csrfToken?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json', 'x-request-id': REQUEST_ID })
  if (csrfToken) headers.set('x-csrf-token', csrfToken)
  const init: RequestInit = { method, headers }
  if (method === 'PUT') init.body = JSON.stringify(body)
  return new Request('http://localhost/api/v1/settings/admin-node-filters', init)
}

/** 合法存储夹具用于验证 GET 通过服务层输出契约后原样 envelope 返回。 */
function storedPreset(): RowDataPacket {
  return {
    setting_value: JSON.stringify([{
      id: '00000000-0000-4000-8000-000000000001', name: '开发',
      query: { nodeTypes: ['bookmark'], tags: [], health: [], sortBy: 'tree', pageSize: 50 },
      updatedAt: '2026-08-31T03:04:05.000Z'
    }])
  } as RowDataPacket
}

describe('管理员节点筛选预设路由', () => {
  it('管理员 GET 读取预设并返回成功 envelope', async () => {
    const dependencies = createDependencies([storedPreset()])
    const response = await createRouteApp(dependencies, adminUser()).request(filterRequest('GET'))
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 0, message: 'success', data: [{ name: '开发' }] })
  })

  it('匿名 GET 返回 40102', async () => {
    const dependencies = createDependencies()
    const response = await createRouteApp(dependencies, null).request(filterRequest('GET'))
    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({ code: 40102, message: '需要管理员登录', data: null, requestId: REQUEST_ID })
  })

  it.each([['缺失', undefined], ['错误', 'wrong-token']])('PUT %s CSRF 返回 40301 且不写入', async (_label, csrfToken) => {
    const dependencies = createDependencies()
    const response = await createRouteApp(dependencies, adminUser()).request(filterRequest('PUT', [], csrfToken))
    expect(response.status).toBe(403)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 40301, message: 'CSRF Token 无效或已过期' })
    expect(dependencies.execute).not.toHaveBeenCalled()
  })

  it('有效 CSRF PUT 空集合执行 upsert 并返回空集合', async () => {
    const dependencies = createDependencies()
    const response = await createRouteApp(dependencies, adminUser()).request(filterRequest('PUT', [], RAW_CSRF_TOKEN))
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toEqual({ code: 0, message: 'success', data: [] })
    expect(dependencies.execute).toHaveBeenCalledOnce()
    expect(String(dependencies.execute.mock.calls[0]?.[0])).toContain("VALUES ('admin_node_filters', ?, ?)")
    expect(dependencies.execute.mock.calls[0]?.[1]).toEqual([JSON.stringify([]), expect.any(Date)])
  })

  it.each([
    ['二十一项', Array.from({ length: 21 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: '预设', query: { nodeTypes: ['bookmark'] } }))],
    ['非法名称', [{ id: '00000000-0000-4000-8000-000000000001', name: '', query: { nodeTypes: ['bookmark'] } }]],
    ['非法 query', [{ id: '00000000-0000-4000-8000-000000000001', name: '预设', query: { sortBy: 'bad' } }]]
  ])('PUT %s 返回 42201 且不 upsert', async (_label, body) => {
    const dependencies = createDependencies()
    const response = await createRouteApp(dependencies, adminUser()).request(filterRequest('PUT', body, RAW_CSRF_TOKEN))
    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 42201, message: '请求参数校验失败' })
    expect(dependencies.execute).not.toHaveBeenCalled()
  })

  it('GET 损坏配置返回空集合并触发脱敏警告', async () => {
    const dependencies = createDependencies([{ setting_value: '{"secret":"do-not-log"' } as RowDataPacket])
    const warn = vi.spyOn(dependencies.logger, 'warn')
    const response = await createRouteApp(dependencies, adminUser()).request(filterRequest('GET'))
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toEqual({ code: 0, message: 'success', data: [] })
    expect(warn).toHaveBeenCalledWith({ settingKey: 'admin_node_filters' }, '后台筛选预设损坏，已使用空集合')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('do-not-log')
  })

  it('现有 theme GET 路由仍然可用', async () => {
    const dependencies = createDependencies([{ setting_value: JSON.stringify({ theme: 'default' }) } as RowDataPacket])
    const response = await createRouteApp(dependencies, null).request(new Request('http://localhost/api/v1/settings/theme'))
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 0, data: { theme: 'default' } })
  })

  it('现有 link-check GET 路由仍然要求管理员并返回默认设置', async () => {
    const dependencies = createDependencies()
    const response = await createRouteApp(dependencies, adminUser()).request(new Request('http://localhost/api/v1/settings/link-check'))
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toEqual({ code: 0, message: 'success', data: { enabled: true, intervalSeconds: 1800 } })
  })
})
