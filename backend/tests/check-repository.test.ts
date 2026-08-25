import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { CheckRepository } from '../src/repositories/check-repository.js'

/** 构造最小数据库连接替身，测试只关注任务范围快照和事务行为。 */
function createConnectionMock(responses: RowDataPacket[][]): {
  connection: PoolConnection
  execute: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  rollback: ReturnType<typeof vi.fn>
} {
  const execute = vi.fn(async () => [responses.shift() ?? [], []])
  const commit = vi.fn(async () => undefined)
  const rollback = vi.fn(async () => undefined)
  const connection = {
    beginTransaction: vi.fn(async () => undefined),
    execute,
    commit,
    rollback,
    release: vi.fn()
  } as unknown as PoolConnection
  return { connection, execute, commit, rollback }
}

/** 从模拟调用中提取 SQL 文本，忽略格式空白以便断言查询语义。 */
function sqlCalls(execute: ReturnType<typeof vi.fn>): string[] {
  return execute.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim())
}

describe('链接检测任务范围', () => {
  it('递归快照当前目录及后代目录中的 HTTP(S) 书签', async () => {
    const mock = createConnectionMock([
      [{ id: 8 } as RowDataPacket],
      [{ id: 21 } as RowDataPacket, { id: 34 } as RowDataPacket],
      [],
      [],
      []
    ])
    const pool = { getConnection: vi.fn(async () => mock.connection) } as unknown as Pool

    await new CheckRepository(pool).createJob({ folderId: 8 })

    const calls = sqlCalls(mock.execute)
    expect(calls[1]).toContain('WITH RECURSIVE scope AS')
    expect(calls[1]).toContain("WHERE node.node_type = 'folder'")
    expect(calls[1]).toContain('parent_id IN (SELECT id FROM scope)')
    expect(calls[1]).toContain("url LIKE 'http://%'")
    expect(mock.execute.mock.calls[1]?.[1]).toEqual([8])
    expect(calls.filter((sql) => sql.includes('INSERT INTO bookmark_check_job_item'))).toHaveLength(2)
    expect(mock.commit).toHaveBeenCalledOnce()
  })

  it('目录不存在时返回稳定的 404 错误并回滚', async () => {
    const mock = createConnectionMock([[]])
    const pool = { getConnection: vi.fn(async () => mock.connection) } as unknown as Pool

    await expect(new CheckRepository(pool).createJob({ folderId: 999 })).rejects.toMatchObject({
      status: 404,
      code: 40408,
      message: '检测目录不存在'
    })
    expect(mock.rollback).toHaveBeenCalledOnce()
    expect(mock.commit).not.toHaveBeenCalled()
  })

  it('拒绝同时指定目录和书签，且不会获取数据库连接', async () => {
    const getConnection = vi.fn()
    const pool = { getConnection } as unknown as Pool

    await expect(new CheckRepository(pool).createJob({ folderId: 8, bookmarkId: 21 })).rejects.toMatchObject({
      status: 422,
      code: 42212,
      message: '检测范围参数冲突'
    })
    expect(getConnection).not.toHaveBeenCalled()
  })
})
