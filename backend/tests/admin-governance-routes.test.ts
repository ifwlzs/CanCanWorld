import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { createLogger } from '../src/config/logger.js'
import { AppError } from '../src/errors.js'
import { requestContext } from '../src/middleware/request-context.js'
import { createAdminGovernanceRoutes, type LinkGovernanceGateway } from '../src/routes/admin-governance-routes.js'
import type { AppDependencies, AppVariables, AuthUser } from '../src/types.js'
import { tokenHash } from '../src/utils/crypto.js'

const REQUEST_ID = 'admin-governance-route-test'
const RAW_CSRF_TOKEN = 'admin-governance-route-test-csrf'
const DUPLICATES_PATH = '/api/v1/admin/governance/duplicates'
const MERGE_PATH = '/api/v1/admin/governance/duplicates/merge'
const BROKEN_PATH = '/api/v1/admin/governance/broken'
const CLEANUP_PATH = '/api/v1/admin/governance/broken/cleanup'

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

function adminUser(): AuthUser {
  return { id: 7, username: 'admin', csrfHash: tokenHash(RAW_CSRF_TOKEN) }
}

/** 创建可观察的治理网关桩；未被调用即证明鉴权或校验已在写入前短路。 */
function gatewayStub() {
  const findDuplicateGroups = vi.fn<LinkGovernanceGateway['findDuplicateGroups']>()
    .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
  const mergeDuplicates = vi.fn<LinkGovernanceGateway['mergeDuplicates']>().mockResolvedValue({ removed: 2 })
  const findBrokenBookmarks = vi.fn<LinkGovernanceGateway['findBrokenBookmarks']>()
    .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
  const cleanupBroken = vi.fn<LinkGovernanceGateway['cleanupBroken']>().mockResolvedValue({ removed: 3, skipped: 1 })
  return {
    gateway: { findDuplicateGroups, mergeDuplicates, findBrokenBookmarks, cleanupBroken } satisfies LinkGovernanceGateway,
    findDuplicateGroups, mergeDuplicates, findBrokenBookmarks, cleanupBroken
  }
}

function createRouteApp(gateway: LinkGovernanceGateway, user: AuthUser | null) {
  const dependencies = createDependencies()
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('*', requestContext(dependencies))
  app.use('*', async (context, next) => {
    context.set('user', user)
    await next()
  })
  app.route('/api/v1/admin/governance', createAdminGovernanceRoutes(dependencies, gateway))
  app.onError((error, context) => {
    const requestId = context.get('requestId')
    if (error instanceof AppError) {
      return context.json({ code: error.code, message: error.message, data: error.details, requestId }, error.status as 400)
    }
    return context.json({ code: 50000, message: '服务器内部错误', data: null, requestId }, 500)
  })
  return app
}

function post(path: string, body: unknown, csrfToken?: string, rawBody?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json', 'x-request-id': REQUEST_ID })
  if (csrfToken) headers.set('x-csrf-token', csrfToken)
  return new Request(`http://localhost${path}`, { method: 'POST', headers, body: rawBody ?? JSON.stringify(body) })
}

describe('治理查询接口', () => {
  it('重复分组接口应用契约默认值并原样返回结果', async () => {
    const { gateway, findDuplicateGroups } = gatewayStub()

    const response = await createRouteApp(gateway, adminUser()).request(post(DUPLICATES_PATH, {}, RAW_CSRF_TOKEN))

    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 0, message: 'success', data: { items: [], total: 0, page: 1, pageSize: 20 }
    })
    expect(findDuplicateGroups).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
  })

  it('失效查询接口透传阈值与新鲜度参数', async () => {
    const { gateway, findBrokenBookmarks } = gatewayStub()

    const response = await createRouteApp(gateway, adminUser()).request(
      post(BROKEN_PATH, { page: 2, pageSize: 50, minConsecutiveFailures: 5, freshnessDays: 7 }, RAW_CSRF_TOKEN)
    )

    expect(response.status).toBe(200)
    expect(findBrokenBookmarks).toHaveBeenCalledWith({ page: 2, pageSize: 50, minConsecutiveFailures: 5, freshnessDays: 7 })
  })
})

describe('治理写入接口', () => {
  it('合并接口转发保留项与待删除集合', async () => {
    const { gateway, mergeDuplicates } = gatewayStub()

    const response = await createRouteApp(gateway, adminUser()).request(
      post(MERGE_PATH, { keepId: 8, removeIds: [9, 10] }, RAW_CSRF_TOKEN)
    )

    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 0, data: { removed: 2 } })
    expect(mergeDuplicates).toHaveBeenCalledWith({ keepId: 8, removeIds: [9, 10] })
  })

  it('清理接口返回删除与跳过数量', async () => {
    const { gateway, cleanupBroken } = gatewayStub()

    const response = await createRouteApp(gateway, adminUser()).request(post(CLEANUP_PATH, { nodeIds: [8, 9, 10] }, RAW_CSRF_TOKEN))

    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 0, data: { removed: 3, skipped: 1 } })
    expect(cleanupBroken).toHaveBeenCalledWith({ nodeIds: [8, 9, 10] })
  })
})

describe('治理接口鉴权与校验', () => {
  // 四个接口都属于管理员专用，未登录一律短路且不触达仓储。
  it.each([
    ['重复分组', DUPLICATES_PATH, {}],
    ['重复合并', MERGE_PATH, { keepId: 8, removeIds: [9] }],
    ['失效查询', BROKEN_PATH, {}],
    ['失效清理', CLEANUP_PATH, { nodeIds: [8] }]
  ])('%s接口未登录返回 40102 且不触达仓储', async (_name, path, body) => {
    const stub = gatewayStub()

    const response = await createRouteApp(stub.gateway, null).request(post(path, body, RAW_CSRF_TOKEN))

    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40102, message: '需要管理员登录', data: null, requestId: REQUEST_ID
    })
    expect(stub.findDuplicateGroups).not.toHaveBeenCalled()
    expect(stub.mergeDuplicates).not.toHaveBeenCalled()
    expect(stub.findBrokenBookmarks).not.toHaveBeenCalled()
    expect(stub.cleanupBroken).not.toHaveBeenCalled()
  })

  it.each([
    ['重复分组', DUPLICATES_PATH, {}],
    ['重复合并', MERGE_PATH, { keepId: 8, removeIds: [9] }],
    ['失效查询', BROKEN_PATH, {}],
    ['失效清理', CLEANUP_PATH, { nodeIds: [8] }]
  ])('%s接口缺少 CSRF 返回 40301', async (_name, path, body) => {
    const stub = gatewayStub()

    const response = await createRouteApp(stub.gateway, adminUser()).request(post(path, body))

    expect(response.status).toBe(403)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 40301 })
  })

  it.each([
    ['非法分页档位', DUPLICATES_PATH, { pageSize: 25 }],
    ['保留项在待删除集合中', MERGE_PATH, { keepId: 8, removeIds: [8] }],
    ['空待删除集合', MERGE_PATH, { keepId: 8, removeIds: [] }],
    ['超出待删除上限', MERGE_PATH, { keepId: 8, removeIds: Array.from({ length: 201 }, (_, i) => i + 100) }],
    ['非法阈值', BROKEN_PATH, { minConsecutiveFailures: 0 }],
    ['重复清理 ID', CLEANUP_PATH, { nodeIds: [8, 8] }],
    ['空清理集合', CLEANUP_PATH, { nodeIds: [] }]
  ])('%s返回 42201', async (_name, path, body) => {
    const stub = gatewayStub()

    const response = await createRouteApp(stub.gateway, adminUser()).request(post(path, body, RAW_CSRF_TOKEN))

    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 42201, requestId: REQUEST_ID })
    expect(stub.mergeDuplicates).not.toHaveBeenCalled()
    expect(stub.cleanupBroken).not.toHaveBeenCalled()
  })

  it.each([
    ['重复分组', DUPLICATES_PATH],
    ['重复合并', MERGE_PATH],
    ['失效查询', BROKEN_PATH],
    ['失效清理', CLEANUP_PATH]
  ])('%s接口对畸形 JSON 返回 42201 而不是 500', async (_name, path) => {
    const stub = gatewayStub()

    const response = await createRouteApp(stub.gateway, adminUser()).request(post(path, null, RAW_CSRF_TOKEN, '{"keepId":'))

    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toMatchObject({ code: 42201 })
  })

  it('合并的领域错误由全局映射保留状态、错误码和请求 ID', async () => {
    const stub = gatewayStub()
    stub.mergeDuplicates.mockRejectedValue(new AppError(422, 42223, '待删除书签与保留项不属于同一重复分组'))

    const response = await createRouteApp(stub.gateway, adminUser()).request(
      post(MERGE_PATH, { keepId: 8, removeIds: [9] }, RAW_CSRF_TOKEN)
    )

    expect(response.status).toBe(422)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 42223, message: '待删除书签与保留项不属于同一重复分组', data: null, requestId: REQUEST_ID
    })
  })

  it('生产应用在完整路径注册治理端点', async () => {
    const response = await createApp(createDependencies()).request(post(DUPLICATES_PATH, {}, RAW_CSRF_TOKEN))

    expect(response.status).toBe(401)
    expect(JSON.parse(await response.text()) as unknown).toEqual({
      code: 40102, message: '需要管理员登录', data: null, requestId: REQUEST_ID
    })
  })
})
