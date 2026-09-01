import {
  duplicateGroupQuerySchema,
  duplicateMergeSchema,
  brokenBookmarkQuerySchema,
  brokenCleanupSchema
} from '@cancanworld/contracts'
import { describe, expect, it } from 'vitest'

describe('重复分组查询契约', () => {
  it('提供分页默认值', () => {
    expect(duplicateGroupQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
  })

  it('只接受受控分页档位并拒绝非法页码', () => {
    expect(duplicateGroupQuerySchema.parse({ page: 3, pageSize: 50 })).toMatchObject({ page: 3, pageSize: 50 })
    expect(duplicateGroupQuerySchema.safeParse({ pageSize: 25 }).success).toBe(false)
    expect(duplicateGroupQuerySchema.safeParse({ page: 0 }).success).toBe(false)
    expect(duplicateGroupQuerySchema.safeParse({ page: -1 }).success).toBe(false)
  })
})

describe('重复合并契约', () => {
  it('接受保留 ID 与待删除集合', () => {
    expect(duplicateMergeSchema.parse({ keepId: 8, removeIds: [9, 10] })).toEqual({ keepId: 8, removeIds: [9, 10] })
  })

  it('拒绝保留 ID 出现在待删除集合中，避免误删保留项', () => {
    expect(duplicateMergeSchema.safeParse({ keepId: 8, removeIds: [8] }).success).toBe(false)
    expect(duplicateMergeSchema.safeParse({ keepId: 8, removeIds: [9, 8] }).success).toBe(false)
  })

  it('拒绝空集合、重复 ID、非正整数和超出上限', () => {
    expect(duplicateMergeSchema.safeParse({ keepId: 8, removeIds: [] }).success).toBe(false)
    expect(duplicateMergeSchema.safeParse({ keepId: 8, removeIds: [9, 9] }).success).toBe(false)
    expect(duplicateMergeSchema.safeParse({ keepId: 0, removeIds: [9] }).success).toBe(false)
    expect(duplicateMergeSchema.safeParse({ keepId: 8, removeIds: [-1] }).success).toBe(false)
    expect(duplicateMergeSchema.safeParse({ keepId: 8, removeIds: Array.from({ length: 201 }, (_, i) => i + 100) }).success).toBe(false)
  })
})

describe('失效书签查询契约', () => {
  it('提供分页与判定参数默认值', () => {
    // 默认要求最近检测在 30 天内，且连续失败达到 3 次。
    expect(brokenBookmarkQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, minConsecutiveFailures: 3, freshnessDays: 30 })
  })

  it('允许调整判定阈值但限定合理范围', () => {
    expect(brokenBookmarkQuerySchema.parse({ minConsecutiveFailures: 5, freshnessDays: 7 })).toMatchObject({ minConsecutiveFailures: 5, freshnessDays: 7 })
    expect(brokenBookmarkQuerySchema.safeParse({ minConsecutiveFailures: 0 }).success).toBe(false)
    expect(brokenBookmarkQuerySchema.safeParse({ minConsecutiveFailures: 51 }).success).toBe(false)
    expect(brokenBookmarkQuerySchema.safeParse({ freshnessDays: 0 }).success).toBe(false)
    expect(brokenBookmarkQuerySchema.safeParse({ freshnessDays: 4000 }).success).toBe(false)
  })
})

describe('失效批量清理契约', () => {
  it('接受书签 ID 集合并去重校验', () => {
    expect(brokenCleanupSchema.parse({ nodeIds: [8, 9] })).toEqual({ nodeIds: [8, 9] })
    expect(brokenCleanupSchema.safeParse({ nodeIds: [8, 8] }).success).toBe(false)
  })

  it('拒绝空集合和超出 200 条上限', () => {
    expect(brokenCleanupSchema.safeParse({ nodeIds: [] }).success).toBe(false)
    expect(brokenCleanupSchema.safeParse({ nodeIds: Array.from({ length: 201 }, (_, i) => i + 1) }).success).toBe(false)
  })
})
