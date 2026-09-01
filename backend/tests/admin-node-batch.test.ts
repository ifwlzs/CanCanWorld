import { adminNodeBatchTagSchema } from '@cancanworld/contracts'
import { describe, expect, it } from 'vitest'

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
