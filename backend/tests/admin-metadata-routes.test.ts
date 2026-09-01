import type { PageMetadataResult } from '@cancanworld/contracts'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { createLogger } from '../src/config/logger.js'
import { AppError } from '../src/errors.js'
import { requestContext } from '../src/middleware/request-context.js'
import { createAdminMetadataRoutes, type PageMetadataReader } from '../src/routes/admin-metadata-routes.js'
import type { AppDependencies, AppVariables, AuthUser } from '../src/types.js'
import { tokenHash } from '../src/utils/crypto.js'

const REQUEST_ID = 'admin-metadata-route-test'
const RAW_CSRF_TOKEN = 'admin-metadata-route-test-csrf'
const METADATA_PATH = '/api/v1/admin/page-metadata'

/** 创建无需数据库和网络的应用依赖，路由测试只在抓取器边界隔离外部请求。 */
function createDependencies(): AppDependencies {
  return {
    env: {
      DATABASE_HOST: '127.0.0.1', DATABASE_PORT: 3306, DATABASE_NAME: 'cancanworld_test',
      DATABASE_USER: 'test', DATABASE_PASSWORD: 'test-password', DATABASE_POOL_SIZE: 1,
      SERVER_HOST: '127.0.0.1', SERVER_PORT: 3080, FRONTEND_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: 'session-secret-for-route-tests-0001', CSRF_SECRET: 'csrf-secret-for-route-tests-0000001',
      SESSION_TTL_SECONDS: 604800, IMPORT_MAX_FILE_BYTES: 10485760, IMPORT_MAX_NODES: 100000,
      IMPORT_MAX_DEPTH: 256, IMPORT_JOB_TTL_SECONDS: 86400, LINK_CHECK_CONCURRENCY: 10,
      LINK_CHECK_PER_HOST_CONCURRENCY: 2, LINK_CHECK_TIMEOUT_MS: 10000, LINK_CHECK_MAX_REDIRECTS: 5,
      LINK_CHECK_MAX_RESPONSE_BYTES: 65536, LINK_CHECK_ALLOWED_PORTS: '80,443', LINK_CHECK_ALLOWED_CIDRS: '',
      LINK_CHECK_HISTORY_RETENTION_DAYS: 30, PAGE_METADATA_MAX_RESPONSE_BYTES: 524288,
      LOG_LEVEL: 'fatal', NODE_ENV: 'test'
    },
    pool: {} as AppDependencies['pool'],
    logger: createLogger('fatal')
  }
}

/** 管理员夹具使用真实 CSRF 摘要，避免测试绕过固定时间令牌校验。 */
function adminUser(): AuthUser {
  return { id: 7, username: 'admin', csrfHash: tokenHash(RAW_CSRF_TOKEN) }
}

/** 测试应用复刻生产请求上下文与 AppError 映射，同时允许显式注入认证身份。 */
function createRouteApp(reader: PageMetadataReader, user: AuthUser | null) {
  const dependencies = createDependencies()
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('*', requestContext(dependencies))
  app.use('*', async (context, next) => {
    context.set('user', user)
    await next()
  })
  app.route('/api/v1/admin', createAdminMetadataRoutes(dependencies, reader))
  app.onError((error, context) => {
    const requestId = context.get('requestId')
    if (error instanceof AppError) {
      return context.json({ code: error.code, message: error.message, data: error.details, requestId }, error.status as 400)
    }
    return context.json({ code: 50000, message: '服务器内部错误', data: null, requestId }, 500)
  })
  return app
}

/** 构造 POST 请求并固定请求 ID，便于验证统一错误 envelope 的追踪字段。 */
function metadataRequest(body: unknown, csrfToken?: string, rawBody?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json', 'x-request-id': REQUEST_ID })
  if (csrfToken) headers.set('x-csrf-token', csrfToken)
  return new Request(`http://localhost${METADATA_PATH}`, {
    method: 'POST',
    headers,
    body: rawBody ?? JSON.stringify(body)
  })
}

/** 创建可观察的抓取器桩；未被调用即证明鉴权或校验已在发出请求前短路。 */
function readerStub(result?: PageMetadataResult) {
  const fetch = vi.fn<PageMetadataReader['fetch']>().mockResolvedValue(
    result ?? { title: '标题', description: '描述', finalUrl: 'https://example.com/' }
  )
  return { reader: { fetch } satisfies PageMetadataReader, fetch }
}

describe('管理员页面元数据路由', () => {
  it('校验后原样返回抓取结果并转发规范化地址', async () => {
    const { reader, fetch } = readerStub({ title: 'TypeScript', description: '语言文档', finalUrl: 'https://www.typescriptlang.org/docs/' })

    const response = await createRouteApp(reader, adminUser()).request(
      metadataRequest({ url: '  https://www.typescriptlang.org/docs/  ' }, RAW_CSRF_TOKEN)
    )

    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 0,
      message: 'success',
      data: { title: 'TypeScript', description: '语言文档', finalUrl: 'https://www.typescriptlang.org/docs/' }
    })
    expect(fetch).toHaveBeenCalledWith('https://www.typescriptlang.org/docs/')
  })

  it('允许标题与描述为空，表示目标页面没有提供元数据', async () => {
    const { reader } = readerStub({ title: null, description: null, finalUrl: 'https://example.com/' })

    const response = await createRouteApp(reader, adminUser()).request(metadataRequest({ url: 'https://example.com' }, RAW_CSRF_TOKEN))

    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 0, data: { title: null, description: null } })
  })

  it('未登录时返回 40102 且不发起抓取', async () => {
    const { reader, fetch } = readerStub()

    const response = await createRouteApp(reader, null).request(metadataRequest({ url: 'https://example.com' }, RAW_CSRF_TOKEN))

    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40102, message: '需要管理员登录', data: null, requestId: REQUEST_ID
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  // 抓取是对外发起请求的写语义操作，缺少和错误 CSRF 都必须在请求前短路。
  it.each([
    ['缺少', undefined],
    ['错误', 'wrong-csrf-token']
  ])('已登录但%s CSRF Token 时返回 40301 且不发起抓取', async (_caseName, csrfToken) => {
    const { reader, fetch } = readerStub()

    const response = await createRouteApp(reader, adminUser()).request(metadataRequest({ url: 'https://example.com' }, csrfToken))

    expect(response.status).toBe(403)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40301, message: 'CSRF Token 无效或已过期', data: null, requestId: REQUEST_ID
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  // 契约边界失败统一映射为 42201，非 HTTP 协议不得进入抓取器。
  it.each([
    ['空地址', { url: '' }],
    ['缺失字段', {}],
    ['file 协议', { url: 'file:///etc/passwd' }],
    ['javascript 协议', { url: 'javascript:alert(1)' }],
    ['data 协议', { url: 'data:text/html,<h1>x</h1>' }],
    ['非法格式', { url: 'not-a-url' }]
  ])('%s返回 42201 且不发起抓取', async (_caseName, body) => {
    const { reader, fetch } = readerStub()

    const response = await createRouteApp(reader, adminUser()).request(metadataRequest(body, RAW_CSRF_TOKEN))

    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({
      code: 42201, message: '请求参数校验失败', requestId: REQUEST_ID
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('畸形 JSON 返回 42201 而不是 500', async () => {
    const { reader, fetch } = readerStub()

    const response = await createRouteApp(reader, adminUser()).request(metadataRequest(null, RAW_CSRF_TOKEN, '{"url":'))

    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 42201, requestId: REQUEST_ID })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('抓取器的地址策略错误由全局映射保留状态、错误码和请求 ID', async () => {
    const fetch = vi.fn<PageMetadataReader['fetch']>().mockRejectedValue(
      new AppError(403, 40303, '目标解析到受限地址：127.0.0.1')
    )

    const response = await createRouteApp({ fetch }, adminUser()).request(metadataRequest({ url: 'http://127.0.0.1' }, RAW_CSRF_TOKEN))

    expect(response.status).toBe(403)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40303, message: '目标解析到受限地址：127.0.0.1', data: null, requestId: REQUEST_ID
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('抓取器的意外异常映射为 50000 且不泄露内部细节', async () => {
    const fetch = vi.fn<PageMetadataReader['fetch']>().mockRejectedValue(new Error('socket hang up at internal.host'))

    const response = await createRouteApp({ fetch }, adminUser()).request(metadataRequest({ url: 'https://example.com' }, RAW_CSRF_TOKEN))

    expect(response.status).toBe(500)
    const body = await response.text()
    expect(JSON.parse(body) as unknown).toEqual({ code: 50000, message: '服务器内部错误', data: null, requestId: REQUEST_ID })
    expect(body).not.toContain('internal.host')
  })

  it('生产应用在完整路径注册元数据端点', async () => {
    const response = await createApp(createDependencies()).request(metadataRequest({ url: 'https://example.com' }, RAW_CSRF_TOKEN))

    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40102, message: '需要管理员登录', data: null, requestId: REQUEST_ID
    })
  })
})
