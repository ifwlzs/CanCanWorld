import type { Pool, RowDataPacket } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { LinkGovernanceRepository } from '../src/repositories/link-governance-repository.js'
import { classifyBrokenReason, isDeterministicFailure, isSuccessStatus } from '../src/repositories/link-governance-repository.js'

const normalize = (sql: unknown) => String(sql).replace(/\s+/g, ' ').trim()

/** 构造只回应失效查询的最小替身，用于断言 SQL 形状与参数顺序。 */
function brokenRepository(rows: Array<Record<string, unknown>> = [], total = rows.length) {
  const query = vi.fn(async (sql: unknown, _params?: unknown): Promise<[unknown[], unknown[]]> => {
    const statement = normalize(sql)
    if (statement.includes('COUNT(*) AS total')) return [[{ total }], []]
    if (statement.includes('consecutive_failures')) return [rows, []]
    return [[], []]
  })
  const pool = { query } as unknown as Pool
  return { repository: new LinkGovernanceRepository(pool), query }
}

describe('失效状态语义', () => {
  it('UP 与 REDIRECT 视为成功，重定向可达不算失效', () => {
    expect(isSuccessStatus('UP')).toBe(true)
    expect(isSuccessStatus('REDIRECT')).toBe(true)
    expect(isSuccessStatus('NOT_FOUND')).toBe(false)
    expect(isSuccessStatus('TIMEOUT')).toBe(false)
  })

  it('只有确定性失败可以单次判定失效', () => {
    for (const status of ['NOT_FOUND', 'DNS_ERROR', 'SSL_ERROR']) {
      expect(isDeterministicFailure(status)).toBe(true)
    }
    // 超时和连接错误可能是网络抖动，必须靠连续失败次数判定。
    for (const status of ['TIMEOUT', 'CONNECTION_ERROR', 'UNKNOWN_ERROR']) {
      expect(isDeterministicFailure(status)).toBe(false)
    }
    // 需要登录或拒绝爬虫的站点仍然可用，不属于失效。
    for (const status of ['UNAUTHORIZED', 'FORBIDDEN']) {
      expect(isDeterministicFailure(status)).toBe(false)
    }
  })

  it('确定性失败优先归因，其次才是连续失败', () => {
    expect(classifyBrokenReason('NOT_FOUND', 1)).toBe('deterministic')
    expect(classifyBrokenReason('DNS_ERROR', 9)).toBe('deterministic')
    expect(classifyBrokenReason('TIMEOUT', 3)).toBe('consecutive_failures')
    expect(classifyBrokenReason('CONNECTION_ERROR', 5)).toBe('consecutive_failures')
  })
})

describe('失效书签查询 SQL', () => {
  it('排除 JavaScript 书签，脚本书签不发起 HTTP 请求', async () => {
    const { repository, query } = brokenRepository()

    await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })

    const sql = query.mock.calls.map(([value]) => normalize(value)).find((value) => value.includes('consecutive_failures')) ?? ''
    expect(sql).toContain("LOWER(LEFT(TRIM(n.url), 11)) <> 'javascript:'")
  })

  it('排除从未检测的书签，缺少数据不等于失效', async () => {
    const { repository, query } = brokenRepository()

    await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })

    const sql = query.mock.calls.map(([value]) => normalize(value)).find((value) => value.includes('consecutive_failures')) ?? ''
    expect(sql).toContain('n.last_check_status IS NOT NULL')
    expect(sql).toContain('n.last_checked_at IS NOT NULL')
  })

  it('按新鲜度窗口限制最近检测时间，过期数据不参与判定', async () => {
    const { repository, query } = brokenRepository()

    await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 7 })

    const call = query.mock.calls.find(([value]) => normalize(value).includes('consecutive_failures'))
    expect(normalize(call?.[0])).toContain('n.last_checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)')
    expect(call?.[1]).toContain(7)
  })

  it('同时接受确定性失败与达到阈值的连续失败', async () => {
    const { repository, query } = brokenRepository()

    await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })

    // 计数与分页共用同一段 SQL，用 ORDER BY 精确定位分页查询本身。
    const call = query.mock.calls.find(([value]) => normalize(value).includes('ORDER BY consecutive_failures'))
    const sql = normalize(call?.[0])
    // 判定条件为“确定性失败 OR 连续失败达到阈值”，两者缺一都会漏判或误判。
    expect(sql).toContain("n.last_check_status IN ('NOT_FOUND', 'DNS_ERROR', 'SSL_ERROR') OR COALESCE(failure_stats.consecutive_failures, 0) >= ?")
    expect(call?.[1]).toContain(3)
  })

  it('排除需要登录和拒绝爬虫的状态', async () => {
    const { repository, query } = brokenRepository()

    await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })

    const sql = query.mock.calls.map(([value]) => normalize(value)).find((value) => value.includes('consecutive_failures')) ?? ''
    expect(sql).toContain("n.last_check_status NOT IN ('UNAUTHORIZED', 'FORBIDDEN')")
  })

  it('连续失败次数只统计最近一次成功之后的记录', async () => {
    const { repository, query } = brokenRepository()

    await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })

    const sql = query.mock.calls.map(([value]) => normalize(value)).find((value) => value.includes('consecutive_failures')) ?? ''
    // 计数窗口以最近成功时间为界，成功后失败计数必须重置。
    expect(sql).toContain('MAX(CASE WHEN')
    expect(sql).toContain('last_success_at')
    expect(sql).toContain('checked_at >')
  })

  it('按连续失败次数倒序并稳定分页', async () => {
    const { repository, query } = brokenRepository()

    await repository.findBrokenBookmarks({ page: 3, pageSize: 50, minConsecutiveFailures: 3, freshnessDays: 30 })

    const call = query.mock.calls.find(([value]) => normalize(value).includes('ORDER BY consecutive_failures'))
    const sql = normalize(call?.[0])
    expect(sql).toContain('ORDER BY consecutive_failures DESC, n.id ASC')
    expect((call?.[1] as unknown[]).slice(-2)).toEqual([50, 100])
  })
})

describe('失效书签结果装配', () => {
  /** 构造查询返回行，字段名与 SQL 输出保持一致。 */
  function row(overrides: Partial<Record<string, unknown>> = {}): RowDataPacket {
    return {
      id: 12, title: '失效文档', url: 'https://example.com/gone',
      last_check_status: 'NOT_FOUND', last_http_status: 404,
      last_checked_at: new Date('2026-08-31T02:00:00Z'), consecutive_failures: '4',
      ...overrides
    } as unknown as RowDataPacket
  }

  it('返回判定原因、连续失败次数与总数', async () => {
    const { repository } = brokenRepository([row()], 37)

    const result = await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })

    expect(result).toMatchObject({ total: 37, page: 1, pageSize: 20 })
    expect(result.items[0]).toMatchObject({
      id: 12,
      reason: 'deterministic',
      lastCheckStatus: 'NOT_FOUND',
      lastHttpStatus: 404,
      consecutiveFailures: 4
    })
    expect(result.items[0]?.lastCheckedAt).toBe('2026-08-31T02:00:00.000Z')
  })

  it('非确定性状态归因为连续失败', async () => {
    const { repository } = brokenRepository([row({ last_check_status: 'TIMEOUT', last_http_status: null, consecutive_failures: '3' })])

    const result = await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })

    expect(result.items[0]).toMatchObject({ reason: 'consecutive_failures', lastHttpStatus: null, consecutiveFailures: 3 })
  })

  it('空结果不再加载路径明细', async () => {
    const { repository, query } = brokenRepository([], 0)

    const result = await repository.findBrokenBookmarks({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })

    expect(result.items).toEqual([])
    expect(query.mock.calls.some(([sql]) => normalize(sql).includes('FROM ancestors'))).toBe(false)
  })
})
