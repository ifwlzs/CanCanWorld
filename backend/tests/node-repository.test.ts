import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { NodeRepository } from '../src/repositories/node-repository.js'

/** 删除仓储测试夹具可组合关联任务和清理异常，分别覆盖提交与回滚路径。 */
interface DeletionFixture {
  checkJobIds?: string[]
  faviconJobIds?: string[]
  rejectCleanup?: boolean
}

/**
 * 构造删除事务所需的最小数据库替身，并按 SQL 语义返回结果。
 * 参数用于指定关联任务及是否模拟关系清理失败，避免测试依赖脆弱的调用序号。
 */
function deletionRepository(fixture: DeletionFixture = {}) {
  const normalizeSql = (sql: unknown) => String(sql).replace(/\s+/g, ' ').trim()
  const query = vi.fn(async (sql: unknown) => {
    const statement = normalizeSql(sql)
    if (statement.includes('SELECT DISTINCT job_id FROM bookmark_check_job_item')) {
      return [(fixture.checkJobIds ?? []).map((jobId) => ({ job_id: jobId })), []]
    }
    if (statement.includes('SELECT DISTINCT job_id FROM favicon_job_item')) {
      return [(fixture.faviconJobIds ?? []).map((jobId) => ({ job_id: jobId })), []]
    }
    if (fixture.rejectCleanup && statement.startsWith('DELETE FROM bookmark_check_log')) {
      throw new Error('模拟关系清理失败')
    }
    return [[], []]
  })
  const execute = vi.fn(async (sql: unknown) => {
    const statement = normalizeSql(sql)
    if (statement.startsWith('SELECT * FROM navigation_node')) {
      return [[{
        id: 8,
        parent_id: 1,
        node_type: 'bookmark',
        title: '待删除书签',
        url: 'https://example.com',
        description: null,
        remark: null,
        icon_url: null,
        sort_key: '1024',
        enabled: 1,
        visibility: 'private',
        last_checked_at: null,
        last_check_status: null,
        last_http_status: null,
        last_response_time: null,
        click_count: '0',
        created_at: new Date('2026-08-31T00:00:00Z'),
        updated_at: new Date('2026-08-31T00:00:00Z')
      }], []]
    }
    if (statement.startsWith('SELECT COUNT(*) AS count FROM navigation_node')) {
      return [[{ count: 0 }], []]
    }
    return [[], []]
  })
  const connection = {
    beginTransaction: vi.fn(async () => undefined),
    query,
    execute,
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn()
  } as unknown as PoolConnection
  const pool = {
    getConnection: vi.fn(async () => connection)
  } as unknown as Pool

  return { repository: new NodeRepository(pool), connection }
}

describe('节点搜索与点击统计', () => {
  it('搜索同时模糊匹配名称、链接、个人备注、网站注释和标签', async () => {
    const execute = vi.fn(async () => [[], []])
    const query = vi.fn(async () => [[], []])
    const pool = { execute, query } as unknown as Pool

    await new NodeRepository(pool).search('开发', 1, false)

    const calls = execute.mock.calls as unknown as Array<[string, unknown[]]>
    const sql = String(calls[0]?.[0]).replace(/\s+/g, ' ')
    expect(sql).toContain("n.title LIKE ?")
    expect(sql).toContain("n.url LIKE ?")
    expect(sql).toContain("n.remark LIKE ?")
    expect(sql).toContain("n.description LIKE ?")
    expect(sql).toContain("t.name LIKE ?")
    expect(calls[0]?.[1]).toEqual([1, '%开发%', '%开发%', '%开发%', '%开发%', '%开发%', 100])
  })

  it('匿名点击只累计公开且启用的书签并返回最新次数', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([[{ click_count: '12' } as RowDataPacket], []])
    const pool = { execute } as unknown as Pool

    await expect(new NodeRepository(pool).recordClick(8, false)).resolves.toBe(12)

    const sql = String(execute.mock.calls[0]?.[0]).replace(/\s+/g, ' ')
    expect(sql).toContain("node_type = 'bookmark'")
    expect(sql).toContain('enabled = 1')
    expect(sql).toContain("visibility = 'public'")
    expect(execute.mock.calls[0]?.[1]).toEqual([8])
  })

  it('不可访问书签不会产生点击记录', async () => {
    const execute = vi.fn(async () => [{ affectedRows: 0 }, []])
    const pool = { execute } as unknown as Pool

    await expect(new NodeRepository(pool).recordClick(999, false)).rejects.toMatchObject({
      status: 404,
      code: 40411,
      message: '可访问书签不存在'
    })
    expect(execute).toHaveBeenCalledOnce()
  })
})

describe('节点删除事务', () => {
  it('删除有关联数据的书签时按任务类型各批量重算一次总数', async () => {
    const { repository, connection } = deletionRepository({
      checkJobIds: ['check-1', 'check-2'],
      faviconJobIds: ['favicon-1', 'favicon-2']
    })

    await repository.delete(8)

    const statements = [...vi.mocked(connection.query).mock.calls, ...vi.mocked(connection.execute).mock.calls]
      .map((call) => String(call[0]).replace(/\s+/g, ' '))
    expect(statements.filter((sql) => sql.includes('UPDATE bookmark_check_job '))).toHaveLength(1)
    expect(statements.filter((sql) => sql.includes('UPDATE favicon_job '))).toHaveLength(1)
    const checkUpdate = vi.mocked(connection.query).mock.calls.find((call) => String(call[0]).includes('UPDATE bookmark_check_job AS job'))
    const faviconUpdate = vi.mocked(connection.query).mock.calls.find((call) => String(call[0]).includes('UPDATE favicon_job AS job'))
    expect(String(checkUpdate?.[0]).replace(/\s+/g, ' ')).toContain('WHERE id IN (?,?)')
    expect(Array.isArray(checkUpdate?.[1]) ? checkUpdate[1].slice(1) : []).toEqual(['check-1', 'check-2'])
    expect(String(faviconUpdate?.[0]).replace(/\s+/g, ' ')).toContain('WHERE id IN (?,?)')
    expect(Array.isArray(faviconUpdate?.[1]) ? faviconUpdate[1].slice(1) : []).toEqual(['favicon-1', 'favicon-2'])
    expect(connection.commit).toHaveBeenCalledOnce()
    expect(connection.rollback).not.toHaveBeenCalled()
  })

  it('关系清理失败时回滚事务且始终释放连接', async () => {
    const { repository, connection } = deletionRepository({ rejectCleanup: true })

    await expect(repository.delete(8)).rejects.toThrow('模拟关系清理失败')

    expect(connection.rollback).toHaveBeenCalledOnce()
    expect(connection.commit).not.toHaveBeenCalled()
    expect(connection.release).toHaveBeenCalledOnce()
  })
})
