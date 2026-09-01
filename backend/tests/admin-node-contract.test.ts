import {
  adminNodeFilterPresetInputSchema,
  adminNodeFilterPresetListInputSchema,
  adminNodeFilterPresetSchema,
  adminNodeQuerySchema
} from '../../packages/contracts/src/index.js'
import type {
  AdminNodeFilterPreset,
  AdminNodeFilterPresetInput,
  AdminNodeQuery,
  AdminNodeQueryResult,
  NavigationNode
} from '../../packages/contracts/src/index.js'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

/** 预设测试数据显式描述浏览器提交结构，避免夹具无意携带服务端字段。 */
interface PresetInputFixture {
  id: string
  name: string
  query: {
    nodeTypes: Array<'folder' | 'bookmark'>
    visibility: 'public' | 'private'
    health: Array<'unchecked' | 'responded' | 'unreachable'>
    page?: number
  }
}

/** 有效预设夹具包含显式页码，用于证明保存契约会剥离分页状态。 */
const presetInputFixture: PresetInputFixture = {
  id: '3c5f5f80-c150-4f2c-bf2f-4aaf58211f2a',
  name: '  异常私有书签  ',
  query: {
    nodeTypes: ['bookmark'],
    visibility: 'private',
    health: ['unreachable'],
    page: 7
  }
}

describe('管理员节点查询契约', () => {
  /** 空请求必须产生可直接交给仓储执行的完整、稳定查询。 */
  it('为空输入填充全部稳定默认值', () => {
    const query: AdminNodeQuery = adminNodeQuerySchema.parse({})

    expect(query).toEqual({
      keyword: '',
      folderId: 1,
      includeDescendants: true,
      nodeTypes: ['folder', 'bookmark'],
      tags: [],
      tagMode: 'any',
      health: [],
      sortBy: 'tree',
      sortDirection: 'asc',
      page: 1,
      pageSize: 50
    })
  })

  /** 排序方向只在缺省时推导，调用方显式选择必须原样保留。 */
  it('按排序字段推导方向并保留显式方向', () => {
    expect(adminNodeQuerySchema.parse({ sortBy: 'createdAt' }).sortDirection).toBe('desc')
    expect(adminNodeQuerySchema.parse({ sortBy: 'title' }).sortDirection).toBe('desc')
    expect(adminNodeQuerySchema.parse({ sortBy: 'tree', sortDirection: 'desc' }).sortDirection).toBe('desc')
    expect(adminNodeQuerySchema.safeParse({ sortBy: 'updatedAt' }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ sortDirection: 'sideways' }).success).toBe(false)
  })

  /** 基础标量字段应在规范化字符串后执行长度、类型和取值范围校验。 */
  it('规范化关键词并校验目录、开关和枚举字段', () => {
    expect(adminNodeQuerySchema.parse({
      keyword: '  数据库  ',
      folderId: 9,
      includeDescendants: false,
      visibility: 'private',
      enabled: false,
      tagMode: 'all'
    })).toMatchObject({
      keyword: '数据库',
      folderId: 9,
      includeDescendants: false,
      visibility: 'private',
      enabled: false,
      tagMode: 'all'
    })
    expect(adminNodeQuerySchema.safeParse({ keyword: '字'.repeat(201) }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ folderId: 0 }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ visibility: 'hidden' }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ enabled: 'yes' }).success).toBe(false)
  })

  /** 节点类型、标签和健康状态均是有上限的集合，不能借重复项绕过语义。 */
  it('校验查询集合的内容、上限和唯一性', () => {
    expect(adminNodeQuerySchema.safeParse({ nodeTypes: [] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ nodeTypes: ['bookmark', 'bookmark'] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ nodeTypes: ['root'] }).success).toBe(false)
    expect(adminNodeQuerySchema.parse({ tags: ['  TypeScript  '] }).tags).toEqual(['TypeScript'])
    expect(adminNodeQuerySchema.safeParse({ tags: ['TypeScript', 'typescript'] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ tags: ['   '] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ tags: ['字'.repeat(65)] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ tags: Array.from({ length: 21 }, (_, index) => `标签${index}`) }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ health: ['unchecked', 'unchecked'] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ health: ['unchecked', 'responded', 'unreachable', 'unchecked'] }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ health: ['unknown'] }).success).toBe(false)
  })

  /**
   * 共享契约不能依赖浏览器或服务端的默认区域设置。
   * 这里模拟土耳其语默认小写规则，仍应保持 JavaScript locale-neutral 的标签语义。
   */
  it('使用不依赖运行时 locale 的标签去重规则', () => {
    const originalLocaleLowerCase = String.prototype.toLocaleLowerCase
    const localeLowerCase = vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (this: string) {
      return originalLocaleLowerCase.call(this, 'tr-TR')
    })

    try {
      expect(adminNodeQuerySchema.safeParse({ tags: ['I', 'i'] }).success).toBe(false)
      expect(adminNodeQuerySchema.safeParse({ tags: ['I', 'ı'] }).success).toBe(true)
    } finally {
      localeLowerCase.mockRestore()
    }
  })

  /** 创建和检测日期各自形成闭区间，结束时间不能早于对应开始时间。 */
  it('校验 ISO 日期和两组时间区间', () => {
    expect(adminNodeQuerySchema.safeParse({ createdFrom: '2026-09-01' }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({
      createdFrom: '2026-09-02T00:00:00.000Z',
      createdTo: '2026-09-01T00:00:00.000Z'
    }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({
      checkedFrom: '2026-09-02T00:00:00.000Z',
      checkedTo: '2026-09-01T00:00:00.000Z'
    }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-01T00:00:00.000Z',
      checkedFrom: '2026-09-01T00:00:00.000Z',
      checkedTo: '2026-09-02T00:00:00.000Z'
    }).success).toBe(true)
  })

  /** 页码必须为正整数，页容量只接受 API 明确公布的四个档位。 */
  it('校验分页边界和离散页容量', () => {
    expect(adminNodeQuerySchema.safeParse({ page: 0 }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ page: 1.5 }).success).toBe(false)
    expect(adminNodeQuerySchema.safeParse({ pageSize: 20 }).success).toBe(true)
    expect(adminNodeQuerySchema.safeParse({ pageSize: 100 }).success).toBe(true)
    expect(adminNodeQuerySchema.safeParse({ pageSize: 200 }).success).toBe(true)
    expect(adminNodeQuerySchema.safeParse({ pageSize: 201 }).success).toBe(false)
  })

  /** 保存查询复用分页查询的规范化与交叉校验，但不会持久化当前页码。 */
  it('规范化预设查询并省略页码', () => {
    const preset: AdminNodeFilterPresetInput = adminNodeFilterPresetInputSchema.parse({
      ...presetInputFixture,
      query: {
        ...presetInputFixture.query,
        sortBy: 'createdAt',
        tags: ['  后端  ']
      }
    })

    expect(preset.name).toBe('异常私有书签')
    expect(preset.query).not.toHaveProperty('page')
    expect(preset.query).toMatchObject({
      tags: ['后端'],
      sortBy: 'createdAt',
      sortDirection: 'desc',
      pageSize: 50
    })
    expect(adminNodeFilterPresetInputSchema.safeParse({
      ...presetInputFixture,
      query: { tags: ['后端', '后端'] }
    }).success).toBe(false)
    expect(adminNodeFilterPresetInputSchema.safeParse({
      ...presetInputFixture,
      query: {
        createdFrom: '2026-09-02T00:00:00.000Z',
        createdTo: '2026-09-01T00:00:00.000Z'
      }
    }).success).toBe(false)
  })

  /** 预设标识、显示名、更新时间和列表数量都由共享契约统一约束。 */
  it('校验预设输入、输出和最多二十项限制', () => {
    expect(adminNodeFilterPresetInputSchema.safeParse({ ...presetInputFixture, id: 'not-a-uuid' }).success).toBe(false)
    expect(adminNodeFilterPresetInputSchema.safeParse({ ...presetInputFixture, name: '   ' }).success).toBe(false)
    expect(adminNodeFilterPresetInputSchema.safeParse({ ...presetInputFixture, name: '字'.repeat(41) }).success).toBe(false)
    expect(adminNodeFilterPresetListInputSchema.safeParse(Array.from({ length: 20 }, (_, index) => ({
      ...presetInputFixture,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    }))).success).toBe(true)
    expect(adminNodeFilterPresetListInputSchema.safeParse(Array.from({ length: 21 }, (_, index) => ({
      ...presetInputFixture,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    }))).success).toBe(false)
    expect(adminNodeFilterPresetSchema.safeParse({
      ...presetInputFixture,
      updatedAt: '2026-09-01'
    }).success).toBe(false)

    const storedPreset: AdminNodeFilterPreset = adminNodeFilterPresetSchema.parse({
      ...presetInputFixture,
      updatedAt: '2026-09-01T12:00:00.000Z'
    })
    expect(storedPreset.updatedAt).toBe('2026-09-01T12:00:00.000Z')
  })

  /** 编译期断言锁定分页结果和保存查询的公共类型，防止运行时契约与导出类型漂移。 */
  it('导出与 Schema 输出一致的查询和结果类型', () => {
    type SavedQuery = AdminNodeFilterPresetInput['query']
    type SavedQueryHasNoPage = 'page' extends keyof SavedQuery ? false : true

    expectTypeOf<SavedQueryHasNoPage>().toEqualTypeOf<true>()
    expectTypeOf<SavedQuery['sortDirection']>().toEqualTypeOf<'asc' | 'desc'>()
    expectTypeOf<SavedQuery['pageSize']>().toEqualTypeOf<AdminNodeQuery['pageSize']>()
    expectTypeOf<AdminNodeQueryResult['items']>().toEqualTypeOf<NavigationNode[]>()
    expectTypeOf<AdminNodeQueryResult['pageSize']>().toEqualTypeOf<20 | 50 | 100 | 200>()
  })
})
