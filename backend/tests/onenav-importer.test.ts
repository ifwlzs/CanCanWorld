import { describe, expect, it } from 'vitest'
import { createOneNavImportPlan, parseOneNavUnixDate, type OneNavCategory, type OneNavLink, type OneNavSource } from '../src/services/onenav-importer.js'

/** 构造最小 OneNav 分类记录，测试只覆盖迁移规划而不依赖用户的私人 SQLite 文件。 */
function category(overrides: Partial<OneNavCategory> = {}): OneNavCategory {
  return {
    id: 1, fid: 0, name: '工具', add_time: '1692519163', up_time: null,
    weight: 0, property: 0, description: null, font_icon: null, ...overrides
  }
}

/** 构造最小 OneNav 书签记录，保留 OneNav 所有迁移相关字段。 */
function link(overrides: Partial<OneNavLink> = {}): OneNavLink {
  return {
    id: 1, fid: 1, title: '示例', url: 'https://example.com', description: null,
    add_time: '1692519163', up_time: null, weight: 0, property: 0, click: 0,
    topping: 0, url_standby: null, font_icon: null, check_status: 0, last_checked_time: null,
    ...overrides
  }
}

/** 组装不接触磁盘的规划测试源。 */
function source(categories: OneNavCategory[], links: OneNavLink[]): OneNavSource {
  return { sourcePath: 'fixture.db3', fingerprint: 'abc123', categories, links }
}

describe('OneNav SQLite 导入规划', () => {
  it('统计重复链接、私有分类和缺失分类的恢复节点', () => {
    const plan = createOneNavImportPlan(source(
      [category({ property: 1 })],
      [link(), link({ id: 2, url: ' https://example.com ' }), link({ id: 3, fid: 99, url: 'https://orphan.example' })]
    ))

    expect(plan).toMatchObject({
      categoryCount: 1,
      linkCount: 3,
      orphanLinkCount: 1,
      orphanCategoryIds: [99],
      duplicateUrlGroupCount: 1,
      privateCategoryCount: 1,
      expectedNodeCount: 7
    })
  })

  it('根级书签不视为孤儿数据', () => {
    const plan = createOneNavImportPlan(source([], [link({ fid: 0 })]))
    expect(plan.orphanLinkCount).toBe(0)
    expect(plan.orphanCategoryIds).toEqual([])
    expect(plan.expectedNodeCount).toBe(2)
  })

  it('分类循环引用时拒绝生成导入计划', () => {
    expect(() => createOneNavImportPlan(source([
      category({ id: 1, fid: 2 }),
      category({ id: 2, fid: 1 })
    ], []))).toThrow('循环引用')
  })

  it('空更新时间回退到创建时间而不是 Unix 纪元', () => {
    const createdAt = new Date('2023-08-20T00:00:00.000Z')
    expect(parseOneNavUnixDate(null, createdAt)).toBe(createdAt)
    expect(parseOneNavUnixDate('', createdAt)).toBe(createdAt)
  })
})
