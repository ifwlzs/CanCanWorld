import { adminNodeQuerySchema } from '@cancanworld/contracts'
import type { FieldPacket, Pool, RowDataPacket } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { AdminNodeRepository } from '../src/repositories/admin-node-repository.js'

/** 测试节点行完整覆盖 Repository 映射所需字段，避免缺失字段掩盖映射错误。 */
interface NodeRowValues {
  id: string | number
  parent_id: string | number | null
  node_type: 'folder' | 'bookmark'
  title: string
  url: string | null
  description: string | null
  remark: string | null
  icon_url: string | null
  sort_key: string | number | bigint
  enabled: number | boolean
  visibility: 'public' | 'private'
  last_checked_at: Date | null
  last_check_status: string | null
  last_http_status: number | null
  last_response_time: number | null
  click_count: string | number
  created_at: Date
  updated_at: Date
}

/** mysql2 行标记与业务字段分离，局部覆盖时不要求伪造驱动构造器元数据。 */
type NodeRowFixture = NodeRowValues & RowDataPacket

/** 创建字段完整且可局部覆盖的节点记录，测试只突出与当前行为相关的差异。 */
function nodeRow(overrides: Partial<NodeRowValues> = {}): NodeRowFixture {
  return {
    id: 9,
    parent_id: 4,
    node_type: 'bookmark',
    title: 'TypeScript 手册',
    url: 'javascript:alert(1)',
    description: '语言文档',
    remark: '每周查看',
    icon_url: 'https://example.com/icon.png',
    sort_key: '2048',
    enabled: 1,
    visibility: 'private',
    last_checked_at: new Date('2026-08-31T02:03:04.000Z'),
    last_check_status: 'unreachable',
    last_http_status: null,
    last_response_time: null,
    click_count: '12',
    created_at: new Date('2026-08-30T01:02:03.000Z'),
    updated_at: new Date('2026-08-31T03:04:05.000Z'),
    ...overrides
  } as NodeRowFixture
}

/** 将多行空字段元组固定为 mysql2 的合法返回形状。 */
function rowsResult(rows: RowDataPacket[]): [RowDataPacket[], FieldPacket[]] {
  return [rows, []]
}

/** 压缩 SQL 空白，令断言关注语义而不是模板字符串排版。 */
function normalizeSql(value: unknown): string {
  return String(value).replace(/\s+/g, ' ').trim()
}

/** 可配置的数据库返回值用于精确验证每类查询是否发生，且始终返回 mysql2 元组。 */
interface RepositoryRows {
  validation?: RowDataPacket[]
  count?: RowDataPacket[]
  page?: RowDataPacket[]
  tags?: RowDataPacket[]
  paths?: RowDataPacket[]
}

/**
 * 根据 SQL 语义分派验证、计数、分页、标签和路径结果。
 * 夹具记录 execute/query 调用，便于断言短路行为与参数顺序。
 */
function repositoryWithRows(rows: RepositoryRows = {}) {
  const execute = vi.fn(async (sqlValue: unknown, _values?: unknown[]) => {
    const sql = normalizeSql(sqlValue)
    if (sql.startsWith('SELECT id FROM navigation_node')) {
      return rowsResult(rows.validation ?? [{ id: 1 } as RowDataPacket])
    }
    if (sql.includes('SELECT COUNT(*) AS count')) {
      return rowsResult(rows.count ?? [{ count: 0 } as RowDataPacket])
    }
    return rowsResult(rows.page ?? [])
  })
  const query = vi.fn(async (sqlValue: unknown, _values?: unknown[]) => {
    const sql = normalizeSql(sqlValue)
    if (sql.includes('FROM node_tag AS nt')) return rowsResult(rows.tags ?? [])
    return rowsResult(rows.paths ?? [])
  })
  const pool = { execute, query } as unknown as Pool
  return { repository: new AdminNodeRepository(pool), execute, query }
}

describe('管理员节点分页查询', () => {
  it('组合后代范围、全标签、不可达状态和创建时间分页，并映射标签及完整路径', async () => {
    const execute = vi.fn(async (sqlValue: unknown, _values?: unknown[]) => {
      const sql = normalizeSql(sqlValue)
      if (sql.startsWith('SELECT id FROM navigation_node')) return rowsResult([{ id: 2 } as RowDataPacket])
      if (sql.includes('SELECT COUNT(*) AS count')) return rowsResult([{ count: 2 } as RowDataPacket])
      return rowsResult([nodeRow()])
    })
    const query = vi.fn(async (sqlValue: unknown, _values?: unknown[]) => {
      const sql = normalizeSql(sqlValue)
      if (sql.includes('FROM node_tag')) return rowsResult([{ node_id: 9, name: 'TypeScript' } as RowDataPacket])
      return rowsResult([
        { node_id: 9, title: '全部书签', depth: 2 } as RowDataPacket,
        { node_id: 9, title: '软件', depth: 1 } as RowDataPacket
      ])
    })
    const pool = { execute, query } as unknown as Pool
    const input = adminNodeQuerySchema.parse({
      folderId: 2,
      includeDescendants: true,
      nodeTypes: ['bookmark'],
      tags: [' TypeScript '],
      tagMode: 'all',
      health: ['unreachable'],
      createdFrom: '2026-08-01T00:00:00.000Z',
      sortBy: 'createdAt',
      sortDirection: 'desc',
      page: 2,
      pageSize: 20
    })

    const result = await new AdminNodeRepository(pool).query(input)

    expect(result).toMatchObject({ total: 2, page: 2, pageSize: 20 })
    expect(result.items).toEqual([expect.objectContaining({
      id: 9,
      nodeType: 'bookmark',
      bookmarkType: 'javascript',
      enabled: true,
      tags: ['TypeScript'],
      fullPath: ['全部书签', '软件'],
      clickCount: 12,
      createdAt: '2026-08-30T01:02:03.000Z'
    })])
    expect(result.items[0]?.children).toBeUndefined()

    const executeCalls = execute.mock.calls
    const countSql = normalizeSql(executeCalls[1]?.[0])
    const pageSql = normalizeSql(executeCalls[2]?.[0])
    expect(countSql).toContain('WITH RECURSIVE scope')
    expect(countSql).toContain('COUNT(DISTINCT matched_tag.normalized_name)')
    expect(countSql).toContain('n.last_checked_at IS NOT NULL AND n.last_http_status IS NULL')
    expect(pageSql).toContain('ORDER BY n.created_at DESC, n.id DESC')
    expect(pageSql).toContain('LIMIT ? OFFSET ?')
    expect(executeCalls[2]?.[1]).toEqual([
      2,
      'bookmark',
      'typescript',
      1,
      new Date('2026-08-01T00:00:00.000Z'),
      20,
      20
    ])
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('范围起点不存在或不是目录时返回 404，且只执行验证查询', async () => {
    const { repository, execute, query } = repositoryWithRows({ validation: [] })

    await expect(repository.query(adminNodeQuerySchema.parse({ folderId: 999 }))).rejects.toMatchObject({
      status: 404,
      code: 40401,
      message: '节点不存在'
    })

    expect(execute).toHaveBeenCalledOnce()
    expect(execute.mock.calls[0]?.[1]).toEqual([999])
    expect(query).not.toHaveBeenCalled()
  })

  it('关闭后代查询时只用 parent_id 限定直属子节点', async () => {
    const { repository, execute } = repositoryWithRows()

    await repository.query(adminNodeQuerySchema.parse({ folderId: 7, includeDescendants: false }))

    const countSql = normalizeSql(execute.mock.calls[1]?.[0])
    expect(countSql).toContain('n.parent_id = ?')
    expect(countSql).not.toContain('WITH RECURSIVE scope')
    expect(execute.mock.calls[1]?.[1]).toEqual([7, 'folder', 'bookmark'])
  })

  it('any 标签模式使用 normalized_name 的 EXISTS 任一匹配', async () => {
    const { repository, execute } = repositoryWithRows()

    await repository.query(adminNodeQuerySchema.parse({ tags: [' React ', 'VUE'], tagMode: 'any' }))

    const countSql = normalizeSql(execute.mock.calls[1]?.[0])
    expect(countSql).toContain('EXISTS ( SELECT 1 FROM node_tag AS matched_node_tag')
    expect(countSql).toContain('matched_tag.normalized_name IN (?,?)')
    expect(countSql).not.toContain('COUNT(DISTINCT matched_tag.normalized_name)')
    expect(execute.mock.calls[1]?.[1]).toEqual([1, 'folder', 'bookmark', 'react', 'vue'])
  })

  it('单选健康状态在默认混合节点类型下只匹配书签', async () => {
    const { repository, execute } = repositoryWithRows()

    await repository.query(adminNodeQuerySchema.parse({ health: ['unchecked'] }))

    const countSql = normalizeSql(execute.mock.calls[1]?.[0])
    expect(countSql).toContain("n.node_type IN (?,?) AND (n.node_type = 'bookmark' AND ((n.last_checked_at IS NULL)))")
  })

  it('多选健康状态限定书签并在同一括号内 OR，不会放宽其他 AND 条件', async () => {
    const { repository, execute } = repositoryWithRows()

    await repository.query(adminNodeQuerySchema.parse({
      visibility: 'private',
      health: ['unchecked', 'responded', 'unreachable']
    }))

    const countSql = normalizeSql(execute.mock.calls[1]?.[0])
    expect(countSql).toContain("n.visibility = ? AND (n.node_type = 'bookmark' AND ((n.last_checked_at IS NULL) OR (n.last_checked_at IS NOT NULL AND n.last_http_status IS NOT NULL) OR (n.last_checked_at IS NOT NULL AND n.last_http_status IS NULL)))")
  })

  it('可见性、启用状态、创建时间和检测时间均使用参数化闭区间', async () => {
    const { repository, execute } = repositoryWithRows()
    const input = adminNodeQuerySchema.parse({
      visibility: 'private',
      enabled: false,
      createdFrom: '2026-08-01T00:00:00.000Z',
      createdTo: '2026-08-31T23:59:59.999Z',
      checkedFrom: '2026-07-01T00:00:00.000Z',
      checkedTo: '2026-07-31T23:59:59.999Z'
    })

    await repository.query(input)

    const countSql = normalizeSql(execute.mock.calls[1]?.[0])
    expect(countSql).toContain('n.visibility = ?')
    expect(countSql).toContain('n.enabled = ?')
    expect(countSql).toContain('n.created_at >= ? AND n.created_at <= ?')
    expect(countSql).toContain('n.last_checked_at >= ? AND n.last_checked_at <= ?')
    expect(execute.mock.calls[1]?.[1]).toEqual([
      1,
      'folder',
      'bookmark',
      'private',
      false,
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.999Z'),
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-31T23:59:59.999Z')
    ])
  })

  it('关键词匹配名称、URL、备注、描述、标签和祖先路径，并转义 LIKE 通配符', async () => {
    const { repository, execute } = repositoryWithRows()
    const keyword = '秘密%_\\'

    await repository.query(adminNodeQuerySchema.parse({ keyword }))

    const countSql = normalizeSql(execute.mock.calls[1]?.[0])
    expect(countSql).toContain("n.title LIKE ? ESCAPE '\\\\'")
    expect(countSql).toContain("n.url LIKE ? ESCAPE '\\\\'")
    expect(countSql).toContain("n.remark LIKE ? ESCAPE '\\\\'")
    expect(countSql).toContain("n.description LIKE ? ESCAPE '\\\\'")
    expect(countSql).toContain("keyword_tag.name LIKE ? ESCAPE '\\\\'")
    expect(countSql).toContain("path_ancestor.title LIKE ? ESCAPE '\\\\'")
    expect(countSql).toContain('WITH RECURSIVE scope')
    expect(countSql).toContain('keyword_ancestors')
    expect(countSql).not.toContain(keyword)
    const params = execute.mock.calls[1]?.[1]
    expect(Array.isArray(params) ? params.slice(-6) : []).toEqual(Array(6).fill('%秘密\\%\\_\\\\%'))
  })

  it('tree、title 和 lastCheckedAt 使用白名单稳定排序，空检测时间固定末尾', async () => {
    const cases: Array<{
      sortBy: 'tree' | 'title' | 'lastCheckedAt'
      sortDirection: 'asc' | 'desc'
      expected: string
    }> = [
      { sortBy: 'tree', sortDirection: 'desc', expected: 'ORDER BY selected_scope.sort_path DESC, n.id ASC' },
      { sortBy: 'title', sortDirection: 'asc', expected: 'ORDER BY n.title ASC, n.id ASC' },
      { sortBy: 'lastCheckedAt', sortDirection: 'desc', expected: 'ORDER BY n.last_checked_at IS NULL ASC, n.last_checked_at DESC, n.id DESC' }
    ]

    for (const testCase of cases) {
      const { repository, execute } = repositoryWithRows({
        count: [{ count: 1 } as RowDataPacket],
        page: [nodeRow()]
      })
      await repository.query(adminNodeQuerySchema.parse(testCase))
      expect(normalizeSql(execute.mock.calls[2]?.[0])).toContain(testCase.expected)
    }
  })

  it('计数为零时不执行分页、标签和路径查询', async () => {
    const { repository, execute, query } = repositoryWithRows({ count: [{ count: 0 } as RowDataPacket] })

    await expect(repository.query(adminNodeQuerySchema.parse({ page: 3, pageSize: 100 }))).resolves.toEqual({
      items: [],
      total: 0,
      page: 3,
      pageSize: 100
    })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(query).not.toHaveBeenCalled()
  })

  it('超出末页得到空 ID 时不生成 IN()，也不查询标签和路径', async () => {
    const { repository, execute, query } = repositoryWithRows({
      count: [{ count: 1 } as RowDataPacket],
      page: []
    })

    await expect(repository.query(adminNodeQuerySchema.parse({ page: 2 }))).resolves.toMatchObject({
      items: [],
      total: 1,
      page: 2
    })

    expect(execute).toHaveBeenCalledTimes(3)
    expect(query).not.toHaveBeenCalled()
  })

  it('混合目录和书签映射完整节点形状，并按当前页 ID 加载标签与祖先路径', async () => {
    const folder = nodeRow({
      id: 3,
      parent_id: 1,
      node_type: 'folder',
      title: '开发',
      url: null,
      last_checked_at: null,
      last_check_status: null
    })
    const bookmark = nodeRow({ id: 4, parent_id: 3, url: 'https://example.com/docs' })
    const { repository, query } = repositoryWithRows({
      count: [{ count: 2 } as RowDataPacket],
      page: [folder, bookmark],
      tags: [{ node_id: 4, name: '文档' } as RowDataPacket],
      paths: [
        { node_id: 3, ancestor_id: 1, title: '全部书签', depth: 1 } as RowDataPacket,
        { node_id: 4, ancestor_id: 1, title: '全部书签', depth: 2 } as RowDataPacket,
        { node_id: 4, ancestor_id: 3, title: '开发', depth: 1 } as RowDataPacket
      ]
    })

    const result = await repository.query(adminNodeQuerySchema.parse({}))

    expect(result.items[0]).toMatchObject({
      id: 3,
      nodeType: 'folder',
      url: null,
      tags: [],
      children: [],
      fullPath: ['全部书签']
    })
    expect(result.items[0]).not.toHaveProperty('bookmarkType')
    expect(result.items[1]).toMatchObject({
      id: 4,
      nodeType: 'bookmark',
      bookmarkType: 'url',
      tags: ['文档'],
      fullPath: ['全部书签', '开发']
    })
    expect(result.items[1]).not.toHaveProperty('children')
    const pathCall = query.mock.calls.find((call) => normalizeSql(call[0]).includes('WITH RECURSIVE ancestors'))
    expect(pathCall?.[1]).toEqual([3, 4])
    expect(normalizeSql(pathCall?.[0])).toContain('WHERE n.id IN (?,?)')
  })
})
