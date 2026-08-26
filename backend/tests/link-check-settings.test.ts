import type { Pool, RowDataPacket } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { readLinkCheckSchedule, writeLinkCheckSchedule } from '../src/services/link-check-settings.js'

/** 构造只实现设置查询的数据库替身，测试不依赖真实 MySQL。 */
function createPool(rows: RowDataPacket[] = []): { pool: Pool; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(async () => [rows, []])
  return { pool: { execute } as unknown as Pool, execute }
}

describe('链接检测定时设置', () => {
  it('没有数据库设置时返回默认启用和 30 分钟周期', async () => {
    const { pool } = createPool()
    await expect(readLinkCheckSchedule(pool)).resolves.toEqual({ enabled: true, intervalSeconds: 1800 })
  })

  it('数据库中的损坏 JSON 回退为默认设置', async () => {
    const { pool } = createPool([{ setting_value: '{broken' } as RowDataPacket])
    await expect(readLinkCheckSchedule(pool)).resolves.toEqual({ enabled: true, intervalSeconds: 1800 })
  })

  it('保存时校验周期并使用 link_check_schedule 键幂等写入', async () => {
    const { pool, execute } = createPool()
    await expect(writeLinkCheckSchedule(pool, { enabled: false, intervalSeconds: 3600 })).resolves.toEqual({ enabled: false, intervalSeconds: 3600 })
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("'link_check_schedule'"), [JSON.stringify({ enabled: false, intervalSeconds: 3600 }), expect.any(Date)])
    await expect(writeLinkCheckSchedule(pool, { enabled: true, intervalSeconds: 30 })).rejects.toThrow()
  })
})
