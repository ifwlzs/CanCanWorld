import { adminNodeBatchTagSchema } from '@cancanworld/contracts'
import { describe, expect, it, vi } from 'vitest'
import { NodeRepository } from '../src/repositories/node-repository.js'
import type { Pool, PoolConnection } from 'mysql2/promise'

describe('后台批量标签契约', () => {
  it('接受追加、移除和覆盖三种模式', () => {
    for (const mode of ['add', 'remove', 'replace'] as const) {
      expect(adminNodeBatchTagSchema.parse({ nodeIds: [1, 2], mode, tags: ['工具'] })).toMatchObject({ mode, tags: ['工具'] })
    }
  })

  it('拒绝重复节点、重复标签和过量输入', () => {
    expect(adminNodeBatchTagSchema.safeParse({ nodeIds: [1, 1], mode: 'add', tags: ['工具'] }).success).toBe(false)
    expect(adminNodeBatchTagSchema.safeParse({ nodeIds: [1], mode: 'add', tags: ['工具', '工具'] }).success).toBe(false)
    expect(adminNodeBatchTagSchema.safeParse({ nodeIds: Array.from({ length: 201 }, (_, id) => id + 1), mode: 'replace', tags: [] }).success).toBe(false)
  })

  it('空标签只允许覆盖模式并统一去除首尾空格', () => {
    expect(adminNodeBatchTagSchema.parse({ nodeIds: [1], mode: 'replace', tags: ['  工具  '] }).tags).toEqual(['工具'])
    expect(adminNodeBatchTagSchema.safeParse({ nodeIds: [1], mode: 'add', tags: [] }).success).toBe(false)
    expect(adminNodeBatchTagSchema.safeParse({ nodeIds: [1], mode: 'remove', tags: ['   '] }).success).toBe(false)
  })
})

/** 批量标签夹具按节点类型和现有标签建模，避免测试依赖脆弱的调用序号。 */
interface BatchFixture {
  nodes?: Array<{ id: number; nodeType: 'bookmark' | 'folder' }>
  tags?: Array<{ nodeId: number; name: string }>
  rejectInsert?: boolean
}

/** 标签 ID 按规范化名称稳定派生，夹具与断言共享同一映射以还原关联写入。 */
const tagIds = new Map<string, number>()
function tagIdFor(normalized: string): number {
  if (!tagIds.has(normalized)) tagIds.set(normalized, tagIds.size + 100)
  return tagIds.get(normalized) as number
}

/** 构造批量事务所需的最小数据库替身，并记录标签写入语句供断言使用。 */
function batchRepository(fixture: BatchFixture = {}) {
  const normalizeSql = (sql: unknown) => String(sql).replace(/\s+/g, ' ').trim()
  const nodes = fixture.nodes ?? [{ id: 8, nodeType: 'bookmark' as const }]
  const tagRows = fixture.tags ?? []

  const query = vi.fn(async (sql: unknown, params?: unknown) => {
    const statement = normalizeSql(sql)
    if (statement.startsWith('SELECT nt.node_id, t.name FROM node_tag')) {
      const ids = (params as number[]) ?? []
      return [tagRows.filter((row) => ids.includes(row.nodeId)).map((row) => ({ node_id: row.nodeId, name: row.name })), []]
    }
    if (fixture.rejectInsert && statement.startsWith('INSERT INTO node_tag')) {
      throw new Error('模拟标签写入失败')
    }
    if (statement.startsWith('SELECT id, normalized_name FROM tag')) {
      const names = ((params as unknown[]) ?? []).map((value) => String(value))
      return [names.map((normalized) => ({ id: tagIdFor(normalized), normalized_name: normalized })), []]
    }
    return [[], []]
  })

  const execute = vi.fn(async (sql: unknown, params?: unknown) => {
    const statement = normalizeSql(sql)
    if (statement.startsWith('SELECT id, node_type FROM navigation_node')) {
      const ids = (params as number[]) ?? []
      return [nodes.filter((row) => ids.includes(row.id)).map((row) => ({ id: row.id, node_type: row.nodeType })), []]
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
  const pool = { getConnection: vi.fn(async () => connection) } as unknown as Pool

  return { repository: new NodeRepository(pool), connection }
}

/**
 * 汇总每个节点最终写入的标签名，等价于事务提交后的持久化结果。
 * 批量实现用一条多值 INSERT 写入关联，因此需要先建立 tag_id 到展示名的映射再还原每个节点的标签。
 */
function writtenTags(connection: PoolConnection): Map<number, string[]> {
  const calls = vi.mocked(connection.query).mock.calls
  const normalize = (sql: unknown) => String(sql).replace(/\s+/g, ' ').trim()
  const nameByNormalized = new Map<string, string>()
  const cleared: number[] = []

  for (const [sql, params] of calls) {
    const statement = normalize(sql)
    const values = (params as unknown[]) ?? []
    if (statement.startsWith('DELETE FROM node_tag WHERE node_id IN')) {
      cleared.push(...values.map((value) => Number(value)))
    }
    if (statement.startsWith('INSERT INTO tag (name')) {
      for (let index = 0; index + 1 < values.length; index += 3) {
        nameByNormalized.set(String(values[index + 1]), String(values[index]))
      }
    }
  }

  const result = new Map<number, string[]>(cleared.map((id) => [id, []]))
  const idToNormalized = new Map<number, string>()
  for (const [sql, params] of calls) {
    if (!normalize(sql).startsWith('SELECT id, normalized_name FROM tag')) continue
    // 夹具按查询顺序分配自增 ID，这里复刻同样的映射以还原关联写入。
    for (const normalized of ((params as unknown[]) ?? []).map((value) => String(value))) {
      idToNormalized.set(tagIdFor(normalized), normalized)
    }
  }
  for (const [sql, params] of calls) {
    if (!normalize(sql).startsWith('INSERT INTO node_tag (node_id, tag_id) VALUES')) continue
    const values = (params as unknown[]) ?? []
    for (let index = 0; index + 1 < values.length; index += 2) {
      const nodeId = Number(values[index])
      const normalized = idToNormalized.get(Number(values[index + 1]))
      const name = normalized ? nameByNormalized.get(normalized) : undefined
      if (name) result.set(nodeId, [...(result.get(nodeId) ?? []), name])
    }
  }
  return result
}

describe('批量标签事务', () => {
  it('追加模式保留原标签并合并输入值', async () => {
    const { repository, connection } = batchRepository({
      nodes: [{ id: 8, nodeType: 'bookmark' }],
      tags: [{ nodeId: 8, name: '文档' }]
    })

    const result = await repository.batchUpdateTags({ nodeIds: [8], mode: 'add', tags: ['工具'] })

    expect(writtenTags(connection).get(8)).toEqual(['文档', '工具'])
    expect(result).toEqual({ updated: 1, skippedFolders: 0, missing: 0 })
    expect(connection.commit).toHaveBeenCalledOnce()
  })

  it('移除模式按大小写无关删除匹配标签并保留其余标签', async () => {
    const { repository, connection } = batchRepository({
      nodes: [{ id: 8, nodeType: 'bookmark' }],
      tags: [{ nodeId: 8, name: 'AI' }, { nodeId: 8, name: '文档' }]
    })

    const result = await repository.batchUpdateTags({ nodeIds: [8], mode: 'remove', tags: ['ai'] })

    expect(writtenTags(connection).get(8)).toEqual(['文档'])
    expect(result.updated).toBe(1)
  })

  it('覆盖模式丢弃原标签，空标签集合清空全部关联', async () => {
    const { repository, connection } = batchRepository({
      nodes: [{ id: 8, nodeType: 'bookmark' }],
      tags: [{ nodeId: 8, name: '文档' }]
    })

    await repository.batchUpdateTags({ nodeIds: [8], mode: 'replace', tags: [] })

    expect(writtenTags(connection).get(8)).toEqual([])
    expect(vi.mocked(connection.query).mock.calls.some(([sql]) => String(sql).trim().startsWith('INSERT INTO node_tag'))).toBe(false)
  })

  it('标签写入语句数量与节点和标签规模无关，避免长事务放大往返', async () => {
    const nodes = Array.from({ length: 50 }, (_, index) => ({ id: index + 1, nodeType: 'bookmark' as const }))
    const { repository, connection } = batchRepository({ nodes })

    await repository.batchUpdateTags({
      nodeIds: nodes.map((row) => row.id),
      mode: 'replace',
      tags: ['工具', '文档', '效率']
    })

    const statements = vi.mocked(connection.query).mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' ').trim())
    expect(statements.filter((sql) => sql.startsWith('DELETE FROM node_tag'))).toHaveLength(1)
    expect(statements.filter((sql) => sql.startsWith('INSERT INTO tag (name'))).toHaveLength(1)
    expect(statements.filter((sql) => sql.startsWith('INSERT INTO node_tag'))).toHaveLength(1)
    expect(writtenTags(connection).get(1)).toEqual(['工具', '文档', '效率'])
    expect(writtenTags(connection).get(50)).toEqual(['工具', '文档', '效率'])
  })

  it('既有标签的展示名不会被本次写入改写', async () => {
    const { repository, connection } = batchRepository({ nodes: [{ id: 8, nodeType: 'bookmark' }] })

    await repository.batchUpdateTags({ nodeIds: [8], mode: 'replace', tags: ['工具'] })

    const upsert = vi.mocked(connection.query).mock.calls.find(([sql]) => String(sql).replace(/\s+/g, ' ').trim().startsWith('INSERT INTO tag (name'))
    expect(String(upsert?.[0]).replace(/\s+/g, ' ')).toContain('ON DUPLICATE KEY UPDATE normalized_name = normalized_name')
  })

  it('目录与不存在节点只计入结果且不写入标签', async () => {
    const { repository, connection } = batchRepository({
      nodes: [{ id: 8, nodeType: 'bookmark' }, { id: 9, nodeType: 'folder' }]
    })

    const result = await repository.batchUpdateTags({ nodeIds: [8, 9, 10], mode: 'add', tags: ['工具'] })

    expect(result).toEqual({ updated: 1, skippedFolders: 1, missing: 1 })
    const written = writtenTags(connection)
    expect(written.has(9)).toBe(false)
    expect(written.has(10)).toBe(false)
  })

  it('多个节点的标签差异各自独立写入', async () => {
    const { repository, connection } = batchRepository({
      nodes: [{ id: 8, nodeType: 'bookmark' }, { id: 9, nodeType: 'bookmark' }],
      tags: [{ nodeId: 8, name: '文档' }, { nodeId: 9, name: '效率' }]
    })

    await repository.batchUpdateTags({ nodeIds: [8, 9], mode: 'add', tags: ['工具'] })

    const written = writtenTags(connection)
    expect(written.get(8)).toEqual(['文档', '工具'])
    expect(written.get(9)).toEqual(['效率', '工具'])
  })

  it('按稳定顺序锁定节点行并只读取书签的现有标签', async () => {
    const { repository, connection } = batchRepository({
      nodes: [{ id: 8, nodeType: 'bookmark' }, { id: 9, nodeType: 'folder' }]
    })

    await repository.batchUpdateTags({ nodeIds: [8, 9], mode: 'add', tags: ['工具'] })

    const lock = vi.mocked(connection.execute).mock.calls.find(([sql]) => String(sql).includes('SELECT id, node_type FROM navigation_node'))
    expect(String(lock?.[0])).toContain('WHERE id IN (?,?) FOR UPDATE')
    expect(lock?.[1]).toEqual([8, 9])
    const load = vi.mocked(connection.query).mock.calls.find(([sql]) => String(sql).includes('SELECT nt.node_id, t.name FROM node_tag'))
    expect(load?.[1]).toEqual([8])
  })

  it('标签写入失败时回滚事务且始终释放连接', async () => {
    const { repository, connection } = batchRepository({ rejectInsert: true })

    await expect(repository.batchUpdateTags({ nodeIds: [8], mode: 'add', tags: ['工具'] })).rejects.toThrow('模拟标签写入失败')

    expect(connection.rollback).toHaveBeenCalledOnce()
    expect(connection.commit).not.toHaveBeenCalled()
    expect(connection.release).toHaveBeenCalledOnce()
  })
})
