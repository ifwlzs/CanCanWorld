import type { FieldPacket, Pool, RowDataPacket } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import type { AdminNodeFilterPresetInput } from '@cancanworld/contracts'
import { readAdminNodeFilters, writeAdminNodeFilters } from '../src/services/admin-node-filter-settings.js'

/** 创建设置行夹具，保持数据库读取结果符合 mysql2 的 RowDataPacket 结构。 */
function settingRow(settingValue: string): RowDataPacket {
  return { setting_value: settingValue } as RowDataPacket
}

/** 构造严格二元组返回值的 Pool 替身，测试只观察 SQL 边界而不连接真实数据库。 */
function createPool(rows: RowDataPacket[] = []): { pool: Pool; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(async (..._args: Parameters<Pool['execute']>): Promise<[RowDataPacket[], FieldPacket[]]> => [rows, []])
  return { pool: { execute } as unknown as Pool, execute }
}

/** 生成符合共享契约的最小预设输入，便于各测试只覆盖一个行为差异。 */
function presetInput(overrides: Partial<AdminNodeFilterPresetInput> = {}): AdminNodeFilterPresetInput {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: '  开发书签  ',
    query: {
      nodeTypes: ['bookmark'],
      tags: [' TypeScript '],
      health: [],
      sortBy: 'title',
      pageSize: 50
    },
    ...overrides
  } as AdminNodeFilterPresetInput
}

/** 日志替身只暴露 warn，确保损坏配置日志不会意外泄露原始内容。 */
function createLogger() {
  return { warn: vi.fn() }
}

describe('管理员节点筛选预设设置服务', () => {
  it('没有数据库记录时返回空集合', async () => {
    const { pool } = createPool()
    await expect(readAdminNodeFilters(pool, createLogger())).resolves.toEqual([])
  })

  it('读取合法 JSON 后返回共享输出 schema 允许的预设', async () => {
    const stored = [{
      id: '00000000-0000-4000-8000-000000000001',
      name: '开发书签',
      query: {
        keyword: '', folderId: 1, includeDescendants: true, nodeTypes: ['bookmark'], tags: [], tagMode: 'any', health: [],
        sortBy: 'title', sortDirection: 'desc', createdFrom: undefined, createdTo: undefined, checkedFrom: undefined, checkedTo: undefined,
        pageSize: 50
      },
      updatedAt: '2026-08-31T03:04:05.000Z'
    }]
    const { pool } = createPool([settingRow(JSON.stringify(stored))])
    await expect(readAdminNodeFilters(pool, createLogger())).resolves.toEqual(stored)
  })

  it('非法 JSON 回退为空集合并写入脱敏警告', async () => {
    const raw = '{"secret":"do-not-log"'
    const { pool } = createPool([settingRow(raw)])
    const logger = createLogger()
    await expect(readAdminNodeFilters(pool, logger)).resolves.toEqual([])
    expect(logger.warn).toHaveBeenCalledWith({ settingKey: 'admin_node_filters' }, '后台筛选预设损坏，已使用空集合')
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(raw)
  })

  it.each([
    ['非法 query', [{ id: '00000000-0000-4000-8000-000000000001', name: '坏', query: { sortBy: 'invalid' }, updatedAt: '2026-08-31T03:04:05.000Z' }]],
    ['超过二十项', Array.from({ length: 21 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: '重复测试', query: { nodeTypes: ['bookmark'], tags: [], health: [], sortBy: 'tree', pageSize: 50 }, updatedAt: '2026-08-31T03:04:05.000Z' }))]
  ])('%s schema 损坏时回退为空集合并写入脱敏警告', async (_caseName, value) => {
    const { pool } = createPool([settingRow(JSON.stringify(value))])
    const logger = createLogger()
    await expect(readAdminNodeFilters(pool, logger)).resolves.toEqual([])
    expect(logger.warn).toHaveBeenCalledWith({ settingKey: 'admin_node_filters' }, '后台筛选预设损坏，已使用空集合')
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('page')
  })

  it('保存时由服务端统一生成更新时间并规范化默认值且不含 page', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-09-01T10:20:30.000Z')
    vi.setSystemTime(now)
    try {
      const { pool, execute } = createPool()
      const result = await writeAdminNodeFilters(pool, [presetInput()])
      expect(result).toEqual([{
        id: '00000000-0000-4000-8000-000000000001',
        name: '开发书签',
        query: {
          keyword: '', folderId: 1, includeDescendants: true, nodeTypes: ['bookmark'], tags: ['TypeScript'], tagMode: 'any', health: [],
          sortBy: 'title', sortDirection: 'desc', pageSize: 50
        },
        updatedAt: now.toISOString()
      }])
      const params = execute.mock.calls[0]?.[1]
      expect(params).toEqual([JSON.stringify(result), now])
      expect(JSON.stringify(result)).not.toContain('"page":')
      expect(result[0]?.updatedAt).toBe(now.toISOString())
    } finally {
      vi.useRealTimers()
    }
  })

  it('使用 admin_node_filters 参数化 upsert SQL，JSON 不拼接进 SQL', async () => {
    const { pool, execute } = createPool()
    await writeAdminNodeFilters(pool, [])
    const sql = String(execute.mock.calls[0]?.[0])
    expect(sql).toContain("VALUES ('admin_node_filters', ?, ?)")
    expect(sql).toContain('ON DUPLICATE KEY UPDATE')
    expect(sql).not.toContain('00000000-0000')
    expect(execute.mock.calls[0]?.[1]).toEqual([JSON.stringify([]), expect.any(Date)])
  })

  it('输入不合法时直接 reject 且不执行数据库写入', async () => {
    const { pool, execute } = createPool()
    await expect(writeAdminNodeFilters(pool, [{ ...presetInput(), name: '' }])).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })

  it('数据库错误向调用方透传', async () => {
    const execute = vi.fn(async (..._args: Parameters<Pool['execute']>): Promise<[RowDataPacket[], FieldPacket[]]> => {
      throw new Error('db unavailable')
    })
    const pool = { execute } as unknown as Pool
    await expect(readAdminNodeFilters(pool, createLogger())).rejects.toThrow('db unavailable')
    await expect(writeAdminNodeFilters(pool, [])).rejects.toThrow('db unavailable')
  })
})
