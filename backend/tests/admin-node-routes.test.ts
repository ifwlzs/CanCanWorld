import type { AdminNodeQuery, AdminNodeQueryResult, NavigationNode } from '@cancanworld/contracts'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { createLogger } from '../src/config/logger.js'
import { AppError } from '../src/errors.js'
import { requestContext } from '../src/middleware/request-context.js'
import { createAdminNodeRoutes } from '../src/routes/admin-node-routes.js'
import type { AdminNodeBatchTagWriter, AdminNodeQueryReader } from '../src/routes/admin-node-routes.js'
import type { AppDependencies, AppVariables, AuthUser } from '../src/types.js'
import { tokenHash } from '../src/utils/crypto.js'

const REQUEST_ID = 'admin-node-route-test-request'
const RAW_CSRF_TOKEN = 'admin-node-route-test-csrf'
const BATCH_PATH = '/api/v1/admin/nodes/batch-tags'

/** 创建无需数据库的应用依赖，确保路由测试只在读取器边界隔离 SQL。 */
function createDependencies(): AppDependencies {
  return {
    env: {
      DATABASE_HOST: '127.0.0.1',
      DATABASE_PORT: 3306,
      DATABASE_NAME: 'cancanworld_test',
      DATABASE_USER: 'test',
      DATABASE_PASSWORD: 'test-password',
      DATABASE_POOL_SIZE: 1,
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: 3080,
      FRONTEND_ORIGIN: 'http://localhost:5173',
      SESSION_SECRET: 'session-secret-for-route-tests-0001',
      CSRF_SECRET: 'csrf-secret-for-route-tests-0000001',
      SESSION_TTL_SECONDS: 604800,
      IMPORT_MAX_FILE_BYTES: 10485760,
      IMPORT_MAX_NODES: 100000,
      IMPORT_MAX_DEPTH: 256,
      IMPORT_JOB_TTL_SECONDS: 86400,
      LINK_CHECK_CONCURRENCY: 10,
      LINK_CHECK_PER_HOST_CONCURRENCY: 2,
      LINK_CHECK_TIMEOUT_MS: 10000,
      LINK_CHECK_MAX_REDIRECTS: 5,
      LINK_CHECK_MAX_RESPONSE_BYTES: 65536,
      LINK_CHECK_ALLOWED_PORTS: '80,443',
      LINK_CHECK_ALLOWED_CIDRS: '',
      LINK_CHECK_HISTORY_RETENTION_DAYS: 30,
      PAGE_METADATA_MAX_RESPONSE_BYTES: 524288,
      LOG_LEVEL: 'fatal',
      NODE_ENV: 'test'
    },
    pool: { execute: vi.fn(), query: vi.fn() } as unknown as Pool,
    logger: createLogger('fatal')
  }
}

/** 管理员夹具使用真实 CSRF 摘要，避免测试绕过固定时间令牌校验。 */
function adminUser(): AuthUser {
  return { id: 7, username: 'admin', csrfHash: tokenHash(RAW_CSRF_TOKEN) }
}

/** 测试应用复刻生产请求上下文与 AppError 映射，同时允许显式注入认证身份。 */
function createRouteApp(reader: AdminNodeQueryReader, user: AuthUser | null, batchWriter?: AdminNodeBatchTagWriter) {
  const dependencies = createDependencies()
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('*', requestContext(dependencies))
  // 测试身份注入模拟 optionalAuth 的最终变量，不替换 requireAdmin 本身。
  app.use('*', async (context, next) => {
    context.set('user', user)
    await next()
  })
  app.route('/api/v1/admin/nodes', createAdminNodeRoutes(dependencies, reader, batchWriter))
  // 测试应用复刻生产 AppError envelope，保留 requestId 便于追踪断言。
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
function queryRequest(body: unknown, csrfToken?: string, path = '/api/v1/admin/nodes/query'): Request {
  const headers = new Headers({ 'content-type': 'application/json', 'x-request-id': REQUEST_ID })
  if (csrfToken) headers.set('x-csrf-token', csrfToken)
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
}

/** 书签结果夹具覆盖公开契约字段，以证明路由不会裁剪或改写 Repository 结果。 */
function bookmarkFixture(): NavigationNode {
  return {
    id: 9,
    parentId: 2,
    nodeType: 'bookmark',
    title: 'TypeScript 手册',
    url: 'https://www.typescriptlang.org/docs/',
    bookmarkType: 'url',
    description: '语言文档',
    remark: null,
    iconUrl: null,
    sortKey: '2048',
    enabled: true,
    visibility: 'public',
    tags: ['文档'],
    lastCheckedAt: null,
    lastCheckStatus: null,
    lastHttpStatus: null,
    lastResponseTime: null,
    clickCount: 3,
    createdAt: '2026-08-30T01:02:03.000Z',
    fullPath: ['全部书签', '开发'],
    updatedAt: '2026-08-31T03:04:05.000Z'
  }
}

/** 创建可观察的窄读取器桩；调用记录只用于验证路由与 Repository 的输入边界。 */
function readerReturning(result: AdminNodeQueryResult) {
  const query = vi.fn<AdminNodeQueryReader['query']>().mockResolvedValue(result)
  return { reader: { query } satisfies AdminNodeQueryReader, query }
}

/** 批量标签失败路径共用的空分页结果，避免每个用例重复构造读取器夹具。 */
function emptyResult(): AdminNodeQueryResult {
  return { items: [], total: 0, page: 1, pageSize: 50 }
}

/** 创建可观察的批量写入桩；未被调用即证明鉴权或校验已在事务前短路。 */
function batchWriterStub() {
  const batchUpdateTags = vi.fn<AdminNodeBatchTagWriter['batchUpdateTags']>().mockResolvedValue({ updated: 0, skippedFolders: 0, missing: 0 })
  return { writer: { batchUpdateTags } satisfies AdminNodeBatchTagWriter, batchUpdateTags }
}

describe('管理员节点查询路由', () => {
  // 成功用例锁定 Zod 默认值、排序规范化和结果原样转发。
  it('校验并规范化查询后原样返回读取器的分页结果', async () => {
    const result: AdminNodeQueryResult = {
      items: [bookmarkFixture()],
      total: 73,
      page: 1,
      pageSize: 50
    }
    const { reader, query } = readerReturning(result)

    const response = await createRouteApp(reader, adminUser()).request(
      queryRequest({ nodeTypes: ['bookmark'], page: 1 }, RAW_CSRF_TOKEN)
    )

    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toEqual({ code: 0, message: 'success', data: result })
    expect(query).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith({
      keyword: '',
      folderId: 1,
      includeDescendants: true,
      nodeTypes: ['bookmark'],
      tags: [],
      tagMode: 'any',
      health: [],
      sortBy: 'tree',
      sortDirection: 'asc',
      page: 1,
      pageSize: 50
    } satisfies AdminNodeQuery)
  })

  // 未认证请求必须在校验和读取器之前被 requireAdmin 拒绝。
  it('未登录时返回 40102 且不读取节点', async () => {
    const { reader, query } = readerReturning({ items: [], total: 0, page: 1, pageSize: 50 })

    const response = await createRouteApp(reader, null).request(queryRequest({}, RAW_CSRF_TOKEN))

    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40102,
      message: '需要管理员登录',
      data: null,
      requestId: REQUEST_ID
    })
    expect(query).not.toHaveBeenCalled()
  })

  // POST 修改语义要求有效 CSRF，缺少和错误令牌都应短路。
  it.each([
    ['缺少', undefined],
    ['错误', 'wrong-csrf-token']
  ])('已登录但%s CSRF Token 时返回 40301 且不读取节点', async (_caseName, csrfToken) => {
    const { reader, query } = readerReturning({ items: [], total: 0, page: 1, pageSize: 50 })

    const response = await createRouteApp(reader, adminUser()).request(queryRequest({}, csrfToken))

    expect(response.status).toBe(403)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40301,
      message: 'CSRF Token 无效或已过期',
      data: null,
      requestId: REQUEST_ID
    })
    expect(query).not.toHaveBeenCalled()
  })

  // schema 失败统一转换为 42201，并且不会触发读取器。
  it.each([
    ['空节点类型', { nodeTypes: [] }],
    ['非法分页大小', { pageSize: 25 }]
  ])('%s返回 42201 且不读取节点', async (_caseName, body) => {
    const { reader, query } = readerReturning({ items: [], total: 0, page: 1, pageSize: 50 })

    const response = await createRouteApp(reader, adminUser()).request(queryRequest(body, RAW_CSRF_TOKEN))
    const responseBody = JSON.parse(await response.text()) as unknown

    expect(response.status).toBe(422)
    expect(responseBody).toMatchObject({
      code: 42201,
      message: '请求参数校验失败',
      requestId: REQUEST_ID
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('查询接口对畸形 JSON 返回 42201 且不读取节点', async () => {
    const { reader, query } = readerReturning(emptyResult())

    const response = await createRouteApp(reader, adminUser()).request(new Request('http://localhost/api/v1/admin/nodes/query', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json', 'x-request-id': REQUEST_ID, 'x-csrf-token': RAW_CSRF_TOKEN }),
      body: '{malformed-json'
    }))

    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 42201, message: '请求参数校验失败', requestId: REQUEST_ID })
    expect(query).not.toHaveBeenCalled()
  })

  // 读取器抛出的领域错误应交由全局错误处理器统一序列化。
  it('读取器业务错误由全局映射保留状态、错误码和请求 ID', async () => {
    const query = vi.fn<AdminNodeQueryReader['query']>().mockRejectedValue(
      new AppError(404, 40401, '节点不存在')
    )
    const reader = { query } satisfies AdminNodeQueryReader

    const response = await createRouteApp(reader, adminUser()).request(queryRequest({}, RAW_CSRF_TOKEN))

    expect(response.status).toBe(404)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40401,
      message: '节点不存在',
      data: null,
      requestId: REQUEST_ID
    })
    expect(query).toHaveBeenCalledOnce()
  })

  // 完整应用路径测试防止只挂载相对 /query 而遗漏 app 注册。
  it('生产应用在完整路径注册管理员节点查询端点', async () => {
    const response = await createApp(createDependencies()).request(queryRequest({}, RAW_CSRF_TOKEN))

    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40102,
      message: '需要管理员登录',
      data: null,
      requestId: REQUEST_ID
    })
  })

  it('管理员批量标签接口校验 CSRF 并转发规范化输入', async () => {
    const writer: AdminNodeBatchTagWriter = {
      batchUpdateTags: vi.fn().mockResolvedValue({ updated: 2, skippedFolders: 1, missing: 0 })
    }
    const response = await createRouteApp(readerReturning({ items: [], total: 0, page: 1, pageSize: 50 }).reader, adminUser(), writer).request(
      queryRequest({ nodeIds: [8, 9], mode: 'add', tags: [' 工具 '] }, RAW_CSRF_TOKEN, '/api/v1/admin/nodes/batch-tags')
    )
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text())).toEqual({ code: 0, message: 'success', data: { updated: 2, skippedFolders: 1, missing: 0 } })
    expect(writer.batchUpdateTags).toHaveBeenCalledWith({ nodeIds: [8, 9], mode: 'add', tags: ['工具'] })
  })

  it('未登录访问批量标签接口返回 40102 且不写入标签', async () => {
    const writer = batchWriterStub()

    const response = await createRouteApp(readerReturning(emptyResult()).reader, null, writer.writer).request(
      queryRequest({ nodeIds: [8], mode: 'add', tags: ['工具'] }, RAW_CSRF_TOKEN, BATCH_PATH)
    )

    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40102,
      message: '需要管理员登录',
      data: null,
      requestId: REQUEST_ID
    })
    expect(writer.batchUpdateTags).not.toHaveBeenCalled()
  })

  // 批量写入同样属于修改语义，缺少和错误 CSRF 都必须在写入前短路。
  it.each([
    ['缺少', undefined],
    ['错误', 'wrong-csrf-token']
  ])('批量标签接口在%s CSRF Token 时返回 40301 且不写入标签', async (_caseName, csrfToken) => {
    const writer = batchWriterStub()

    const response = await createRouteApp(readerReturning(emptyResult()).reader, adminUser(), writer.writer).request(
      queryRequest({ nodeIds: [8], mode: 'add', tags: ['工具'] }, csrfToken, BATCH_PATH)
    )

    expect(response.status).toBe(403)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40301,
      message: 'CSRF Token 无效或已过期',
      data: null,
      requestId: REQUEST_ID
    })
    expect(writer.batchUpdateTags).not.toHaveBeenCalled()
  })

  // 契约边界失败统一映射为 42201，确保非法批量输入不会进入事务。
  it.each([
    ['空节点集合', { nodeIds: [], mode: 'add', tags: ['工具'] }],
    ['重复节点', { nodeIds: [8, 8], mode: 'add', tags: ['工具'] }],
    ['未知模式', { nodeIds: [8], mode: 'clear', tags: ['工具'] }],
    ['追加模式缺少标签', { nodeIds: [8], mode: 'add', tags: [] }],
    ['超出节点上限', { nodeIds: Array.from({ length: 201 }, (_, index) => index + 1), mode: 'replace', tags: [] }]
  ])('批量标签接口对%s返回 42201 且不写入标签', async (_caseName, body) => {
    const writer = batchWriterStub()

    const response = await createRouteApp(readerReturning(emptyResult()).reader, adminUser(), writer.writer).request(
      queryRequest(body, RAW_CSRF_TOKEN, BATCH_PATH)
    )

    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({
      code: 42201,
      message: '请求参数校验失败',
      requestId: REQUEST_ID
    })
    expect(writer.batchUpdateTags).not.toHaveBeenCalled()
  })

  it('批量标签接口对畸形 JSON 返回 42201 且不写入标签', async () => {
    const writer = batchWriterStub()
    const app = createRouteApp(readerReturning(emptyResult()).reader, adminUser(), writer.writer)

    const response = await app.request(new Request(`http://localhost${BATCH_PATH}`, {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json', 'x-request-id': REQUEST_ID, 'x-csrf-token': RAW_CSRF_TOKEN }),
      body: '{"nodeIds":[8],'
    }))

    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 42201, requestId: REQUEST_ID })
    expect(writer.batchUpdateTags).not.toHaveBeenCalled()
  })

  it('批量标签写入的业务错误由全局映射保留状态、错误码和请求 ID', async () => {
    const batchUpdateTags = vi.fn<AdminNodeBatchTagWriter['batchUpdateTags']>().mockRejectedValue(
      new AppError(409, 40902, '节点已经被其他操作修改，请刷新后重试')
    )

    const response = await createRouteApp(readerReturning(emptyResult()).reader, adminUser(), { batchUpdateTags }).request(
      queryRequest({ nodeIds: [8], mode: 'replace', tags: [] }, RAW_CSRF_TOKEN, BATCH_PATH)
    )

    expect(response.status).toBe(409)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40902,
      message: '节点已经被其他操作修改，请刷新后重试',
      data: null,
      requestId: REQUEST_ID
    })
    expect(batchUpdateTags).toHaveBeenCalledOnce()
  })

  it('生产应用在完整路径注册批量标签端点', async () => {
    const response = await createApp(createDependencies()).request(
      queryRequest({ nodeIds: [8], mode: 'add', tags: ['工具'] }, RAW_CSRF_TOKEN, BATCH_PATH)
    )

    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40102,
      message: '需要管理员登录',
      data: null,
      requestId: REQUEST_ID
    })
  })
})
