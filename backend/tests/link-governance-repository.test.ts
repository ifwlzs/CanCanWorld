import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../src/errors.js'
import { LinkGovernanceRepository } from '../src/repositories/link-governance-repository.js'

const normalize = (sql: unknown) => String(sql).replace(/\s+/g, ' ').trim()

interface GovernanceFixture {
  /** 分组聚合返回的 url_hash 与成员数量。 */
  groups?: Array<{ urlHash: string; memberCount: number }>
  groupTotal?: number
  /** 成员明细，按 url_hash 归属。 */
  members?: Array<{ id: number; urlHash: string; title: string; url: string }>
  /** 合并时组内实际存在的节点，用于校验保留项归属。 */
  groupNodes?: Array<{ id: number; urlHash: string | null; nodeType: 'bookmark' | 'folder' }>
  brokenRows?: Array<Record<string, unknown>>
  brokenTotal?: number
  rejectDelete?: boolean
  /** 清理复核用的节点状态，覆盖健康、受限与未检测等情形。 */
  cleanupNodes?: Array<{ id: number; nodeType: 'bookmark' | 'folder'; url: string | null; lastCheckStatus: string | null }>
}

/** 构造治理仓储所需的最小数据库替身，按 SQL 语义而非调用序号返回结果。 */
function governanceRepository(fixture: GovernanceFixture = {}) {
  const handle = async (sql: unknown, params?: unknown): Promise<[unknown[], unknown[]]> => {
    const statement = normalize(sql)
    const values = (params as unknown[]) ?? []

    if (statement.includes('COUNT(*) AS total FROM (') && statement.includes('url_hash')) {
      return [[{ total: fixture.groupTotal ?? (fixture.groups ?? []).length }], []]
    }
    if (statement.includes('GROUP BY url_hash') && statement.includes('HAVING COUNT(*) > 1')) {
      return [(fixture.groups ?? []).map((group) => ({ url_hash: group.urlHash, member_count: group.memberCount })), []]
    }
    if (statement.startsWith('SELECT n.id, n.url_hash, n.title')) {
      const hashes = values.map((value) => String(value))
      return [(fixture.members ?? []).filter((member) => hashes.includes(member.urlHash)).map((member) => ({
        id: member.id, url_hash: member.urlHash, title: member.title, url: member.url,
        remark: null, visibility: 'public', click_count: '0',
        last_check_status: null, last_checked_at: null, created_at: new Date('2026-08-01T00:00:00Z')
      })), []]
    }
    if (statement.includes('FROM ancestors')) return [[], []]
    if (statement.startsWith('SELECT nt.node_id, t.name')) return [[], []]
    if (statement.includes('SELECT id, url_hash, node_type FROM navigation_node')) {
      const ids = values.map((value) => Number(value))
      return [(fixture.groupNodes ?? []).filter((node) => ids.includes(node.id)).map((node) => ({
        id: node.id, url_hash: node.urlHash, node_type: node.nodeType
      })), []]
    }
    if (statement.includes('SELECT id, node_type, url, last_check_status')) {
      const ids = values.map((value) => Number(value))
      // 未显式提供 cleanupNodes 时，把 groupNodes 视为已检测失败的普通书签。
      const nodes = fixture.cleanupNodes ?? (fixture.groupNodes ?? []).map((node) => ({
        id: node.id, nodeType: node.nodeType, url: 'https://example.com/', lastCheckStatus: 'NOT_FOUND'
      }))
      return [nodes.filter((node) => ids.includes(node.id)).map((node) => ({
        id: node.id, node_type: node.nodeType, url: node.url, last_check_status: node.lastCheckStatus
      })), []]
    }
    if (statement.includes('COUNT(*) AS total') && statement.includes('consecutive')) {
      return [[{ total: fixture.brokenTotal ?? (fixture.brokenRows ?? []).length }], []]
    }
    if (statement.includes('consecutive_failures')) return [(fixture.brokenRows ?? []), []]
    if (fixture.rejectDelete && statement.startsWith('DELETE FROM navigation_node')) {
      throw new Error('模拟删除失败')
    }
    if (statement.startsWith('SELECT DISTINCT job_id')) return [[], []]
    return [[], []]
  }

  const query = vi.fn(handle)
  const execute = vi.fn(handle)
  const connection = {
    beginTransaction: vi.fn(async () => undefined),
    query, execute,
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn()
  } as unknown as PoolConnection
  const pool = { query, execute, getConnection: vi.fn(async () => connection) } as unknown as Pool

  return { repository: new LinkGovernanceRepository(pool), connection, query, execute }
}

/** 汇总连接与连接池上的全部语句，便于按语义断言 SQL 形状。 */
function statementsOf(...spies: Array<ReturnType<typeof vi.fn>>): string[] {
  return spies.flatMap((spy) => spy.mock.calls.map(([sql]) => normalize(sql)))
}

describe('重复链接分组', () => {
  it('只统计 url_hash 非空的书签，并要求成员数大于一', async () => {
    const { repository, query } = governanceRepository({ groups: [{ urlHash: 'a'.repeat(64), memberCount: 2 }] })

    await repository.findDuplicateGroups({ page: 1, pageSize: 20 })

    const grouping = statementsOf(query).find((sql) => sql.includes('ORDER BY member_count'))
    expect(grouping).toContain("node_type = 'bookmark'")
    expect(grouping).toContain('url_hash IS NOT NULL')
    expect(grouping).toContain('HAVING COUNT(*) > 1')
  })

  it('按成员数倒序与 url_hash 升序稳定分页', async () => {
    const { repository, query } = governanceRepository({ groups: [{ urlHash: 'b'.repeat(64), memberCount: 3 }] })

    await repository.findDuplicateGroups({ page: 2, pageSize: 50 })

    // 计数查询同样包含 HAVING，用 ORDER BY 精确定位分页查询本身。
    const grouping = statementsOf(query).find((sql) => sql.includes('ORDER BY member_count')) ?? ''
    expect(grouping).toContain('ORDER BY member_count DESC, url_hash ASC')
    expect(grouping).toContain('LIMIT ? OFFSET ?')
    const call = query.mock.calls.find(([sql]) => normalize(sql).includes('ORDER BY member_count'))
    // 第二页按 pageSize 50 偏移 50 条。
    expect((call?.[1] as unknown[]).slice(-2)).toEqual([50, 50])
  })

  it('装配每组成员并保留总数与分页信息', async () => {
    const hash = 'c'.repeat(64)
    const { repository } = governanceRepository({
      groups: [{ urlHash: hash, memberCount: 2 }],
      groupTotal: 7,
      members: [
        { id: 8, urlHash: hash, title: '文档 A', url: 'https://example.com/' },
        { id: 9, urlHash: hash, title: '文档 B', url: 'https://example.com/' }
      ]
    })

    const result = await repository.findDuplicateGroups({ page: 1, pageSize: 20 })

    expect(result).toMatchObject({ total: 7, page: 1, pageSize: 20 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ urlHash: hash, memberCount: 2 })
    expect(result.items[0]?.members.map((member) => member.id)).toEqual([8, 9])
  })

  it('没有重复组时不再查询成员明细', async () => {
    const { repository, query } = governanceRepository({ groups: [] })

    const result = await repository.findDuplicateGroups({ page: 1, pageSize: 20 })

    expect(result.items).toEqual([])
    expect(statementsOf(query).some((sql) => sql.startsWith('SELECT n.id, n.url_hash, n.title'))).toBe(false)
  })
})

describe('重复链接合并', () => {
  const hash = 'd'.repeat(64)

  it('在单事务内删除待删除节点并清理关联数据', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [
        { id: 8, urlHash: hash, nodeType: 'bookmark' },
        { id: 9, urlHash: hash, nodeType: 'bookmark' },
        { id: 10, urlHash: hash, nodeType: 'bookmark' }
      ]
    })

    const result = await repository.mergeDuplicates({ keepId: 8, removeIds: [9, 10] })

    expect(result).toEqual({ removed: 2 })
    const statements = statementsOf(vi.mocked(connection.query), vi.mocked(connection.execute))
    expect(statements.some((sql) => sql.startsWith('DELETE FROM node_tag'))).toBe(true)
    expect(statements.some((sql) => sql.startsWith('DELETE FROM bookmark_check_log'))).toBe(true)
    expect(statements.some((sql) => sql.startsWith('DELETE FROM navigation_node'))).toBe(true)
    expect(connection.commit).toHaveBeenCalledOnce()
    expect(connection.rollback).not.toHaveBeenCalled()
  })

  it('保留项不存在时拒绝合并且不删除任何节点', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [{ id: 9, urlHash: hash, nodeType: 'bookmark' }]
    })

    await expect(repository.mergeDuplicates({ keepId: 8, removeIds: [9] })).rejects.toThrow(AppError)

    expect(statementsOf(vi.mocked(connection.query)).some((sql) => sql.startsWith('DELETE FROM navigation_node'))).toBe(false)
    expect(connection.rollback).toHaveBeenCalledOnce()
  })

  it('待删除节点与保留项 url_hash 不同时拒绝合并，避免跨组误删', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [
        { id: 8, urlHash: hash, nodeType: 'bookmark' },
        { id: 9, urlHash: 'e'.repeat(64), nodeType: 'bookmark' }
      ]
    })

    await expect(repository.mergeDuplicates({ keepId: 8, removeIds: [9] })).rejects.toThrow(AppError)

    expect(statementsOf(vi.mocked(connection.query)).some((sql) => sql.startsWith('DELETE FROM navigation_node'))).toBe(false)
    expect(connection.rollback).toHaveBeenCalledOnce()
  })

  it('目录出现在待删除集合中时拒绝合并', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [
        { id: 8, urlHash: hash, nodeType: 'bookmark' },
        { id: 9, urlHash: hash, nodeType: 'folder' }
      ]
    })

    await expect(repository.mergeDuplicates({ keepId: 8, removeIds: [9] })).rejects.toThrow(AppError)

    expect(connection.rollback).toHaveBeenCalledOnce()
  })

  it('合并只删除待删除集合，不触及保留项', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [
        { id: 8, urlHash: hash, nodeType: 'bookmark' },
        { id: 9, urlHash: hash, nodeType: 'bookmark' }
      ]
    })

    await repository.mergeDuplicates({ keepId: 8, removeIds: [9] })

    const deletion = vi.mocked(connection.query).mock.calls.find(([sql]) => normalize(sql).startsWith('DELETE FROM navigation_node'))
    expect(deletion?.[1]).toEqual([9])
  })

  it('删除失败时回滚事务且始终释放连接', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [
        { id: 8, urlHash: hash, nodeType: 'bookmark' },
        { id: 9, urlHash: hash, nodeType: 'bookmark' }
      ],
      rejectDelete: true
    })

    await expect(repository.mergeDuplicates({ keepId: 8, removeIds: [9] })).rejects.toThrow('模拟删除失败')

    expect(connection.rollback).toHaveBeenCalledOnce()
    expect(connection.commit).not.toHaveBeenCalled()
    expect(connection.release).toHaveBeenCalledOnce()
  })
})

describe('失效书签批量清理', () => {
  const hash = 'f'.repeat(64)

  it('删除全部书签并清理关联数据', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [
        { id: 8, urlHash: hash, nodeType: 'bookmark' },
        { id: 9, urlHash: hash, nodeType: 'bookmark' }
      ]
    })

    const result = await repository.cleanupBroken({ nodeIds: [8, 9] })

    expect(result).toEqual({ removed: 2, skipped: 0 })
    const statements = statementsOf(vi.mocked(connection.query))
    expect(statements.some((sql) => sql.startsWith('DELETE FROM node_tag'))).toBe(true)
    expect(statements.some((sql) => sql.startsWith('DELETE FROM bookmark_check_log'))).toBe(true)
    expect(connection.commit).toHaveBeenCalledOnce()
  })

  it('目录与不存在节点计入 skipped 且不被删除', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [
        { id: 8, urlHash: hash, nodeType: 'bookmark' },
        { id: 9, urlHash: null, nodeType: 'folder' }
      ]
    })

    const result = await repository.cleanupBroken({ nodeIds: [8, 9, 10] })

    // 单个非法 ID 不应让整批失败，只统计跳过数量。
    expect(result).toEqual({ removed: 1, skipped: 2 })
    const deletion = vi.mocked(connection.query).mock.calls.find(([sql]) => normalize(sql).startsWith('DELETE FROM navigation_node'))
    expect(deletion?.[1]).toEqual([8])
  })

  it('全部节点都不可删除时提交空事务且不执行删除语句', async () => {
    const { repository, connection } = governanceRepository({ groupNodes: [] })

    const result = await repository.cleanupBroken({ nodeIds: [8, 9] })

    expect(result).toEqual({ removed: 0, skipped: 2 })
    expect(statementsOf(vi.mocked(connection.query)).some((sql) => sql.startsWith('DELETE FROM navigation_node'))).toBe(false)
    expect(connection.commit).toHaveBeenCalledOnce()
  })

  // 接口按 ID 删除，服务端必须复核状态，否则错误请求能删掉健康书签。
  it.each([
    ['最近检测成功', 'UP'],
    ['重定向可达', 'REDIRECT'],
    ['需要登录', 'UNAUTHORIZED'],
    ['拒绝爬虫', 'FORBIDDEN'],
    ['从未检测', null]
  ])('%s的书签不会被清理删除', async (_name, status) => {
    const { repository, connection } = governanceRepository({
      cleanupNodes: [{ id: 8, nodeType: 'bookmark', url: 'https://example.com/', lastCheckStatus: status }]
    })

    const result = await repository.cleanupBroken({ nodeIds: [8] })

    expect(result).toEqual({ removed: 0, skipped: 1 })
    expect(statementsOf(vi.mocked(connection.query)).some((sql) => sql.startsWith('DELETE FROM navigation_node'))).toBe(false)
  })

  it('JavaScript 书签不会被清理删除', async () => {
    const { repository, connection } = governanceRepository({
      cleanupNodes: [{ id: 8, nodeType: 'bookmark', url: 'javascript:void(0)', lastCheckStatus: 'NOT_FOUND' }]
    })

    const result = await repository.cleanupBroken({ nodeIds: [8] })

    expect(result).toEqual({ removed: 0, skipped: 1 })
    expect(statementsOf(vi.mocked(connection.query)).some((sql) => sql.startsWith('DELETE FROM navigation_node'))).toBe(false)
  })

  it('混合请求只删除确实失效的书签', async () => {
    const { repository, connection } = governanceRepository({
      cleanupNodes: [
        { id: 8, nodeType: 'bookmark', url: 'https://a.example.com/', lastCheckStatus: 'NOT_FOUND' },
        { id: 9, nodeType: 'bookmark', url: 'https://b.example.com/', lastCheckStatus: 'UP' },
        { id: 10, nodeType: 'bookmark', url: 'https://c.example.com/', lastCheckStatus: 'TIMEOUT' }
      ]
    })

    const result = await repository.cleanupBroken({ nodeIds: [8, 9, 10] })

    expect(result).toEqual({ removed: 2, skipped: 1 })
    const deletion = vi.mocked(connection.query).mock.calls.find(([sql]) => normalize(sql).startsWith('DELETE FROM navigation_node'))
    expect(deletion?.[1]).toEqual([8, 10])
  })

  it('清理失败时回滚事务且始终释放连接', async () => {
    const { repository, connection } = governanceRepository({
      groupNodes: [{ id: 8, urlHash: hash, nodeType: 'bookmark' }],
      rejectDelete: true
    })

    await expect(repository.cleanupBroken({ nodeIds: [8] })).rejects.toThrow('模拟删除失败')

    expect(connection.rollback).toHaveBeenCalledOnce()
    expect(connection.commit).not.toHaveBeenCalled()
    expect(connection.release).toHaveBeenCalledOnce()
  })
})
