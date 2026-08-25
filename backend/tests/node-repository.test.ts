import type { Pool, RowDataPacket } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { NodeRepository } from '../src/repositories/node-repository.js'

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
