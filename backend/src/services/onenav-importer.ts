import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Database as BunDatabase } from 'bun:sqlite'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { hashUrl } from '../utils/url.js'

/** OneNav on_categorys 表的原始分类字段。 */
export interface OneNavCategory {
  id: number
  fid: number
  name: string
  add_time: string
  up_time: string | null
  weight: number
  property: number
  description: string | null
  font_icon: string | null
}

/** OneNav on_links 表的原始书签字段。 */
export interface OneNavLink {
  id: number
  fid: number
  title: string
  url: string
  description: string | null
  add_time: string
  up_time: string | null
  weight: number
  property: number
  click: number
  topping: number
  url_standby: string | null
  font_icon: string | null
  check_status: number
  last_checked_time: string | null
}

/** 只读解析后的源数据及文件内容指纹。 */
export interface OneNavSource {
  sourcePath: string
  fingerprint: string
  categories: OneNavCategory[]
  links: OneNavLink[]
}

/** 正式写库前可展示和核对的导入统计。 */
export interface OneNavImportPlan {
  sourcePath: string
  fingerprint: string
  importKey: string
  categoryCount: number
  linkCount: number
  orphanLinkCount: number
  orphanCategoryIds: number[]
  duplicateUrlGroupCount: number
  privateCategoryCount: number
  privateLinkCount: number
  expectedNodeCount: number
}

/** 正式导入完成后的根节点及写入数量。 */
export interface OneNavImportResult extends OneNavImportPlan {
  rootNodeId: number
  insertedNodes: number
}

/** MySQL 节点主键查询结果。 */
interface IdRow extends RowDataPacket {
  id: string | number
}

/** MySQL 同级节点最大排序值查询结果。 */
interface SortRow extends RowDataPacket {
  max_sort: string | number
}

const ROOT_SORT_STEP = 1024n

/** 以只读方式打开 OneNav SQLite，完整性异常时立即终止，避免把损坏数据写入正式库。 */
export async function readOneNavSource(sourcePath: string): Promise<OneNavSource> {
  // 使用运行时模块名避开 Vitest 对 Bun 内置模块的静态解析，纯规划测试无需加载 SQLite 驱动。
  const sqliteModuleName = 'bun:sqlite'
  const { Database } = await import(sqliteModuleName) as typeof import('bun:sqlite')
  const database = new Database(sourcePath, { readonly: true, strict: true })
  try {
    const integrity = database.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get()
    if (integrity?.integrity_check !== 'ok') throw new Error(`OneNav SQLite 完整性检查失败：${integrity?.integrity_check ?? '未知错误'}`)
    requireSourceTable(database, 'on_categorys')
    requireSourceTable(database, 'on_links')
    const categories = database.query<OneNavCategory, []>('SELECT * FROM on_categorys ORDER BY id').all()
    const links = database.query<OneNavLink, []>('SELECT * FROM on_links ORDER BY id').all()
    return {
      sourcePath,
      fingerprint: createHash('sha256').update(await readFile(sourcePath)).digest('hex'),
      categories,
      links
    }
  } finally {
    database.close()
  }
}

/** 预检分类树、孤儿引用和重复 URL；expectedNodeCount 包含导入根目录及孤儿恢复目录。 */
export function createOneNavImportPlan(source: OneNavSource): OneNavImportPlan {
  const categoryIds = new Set(source.categories.map((category) => category.id))
  const orphanCategoryIds = [...new Set(source.links.filter((link) => link.fid !== 0 && !categoryIds.has(link.fid)).map((link) => link.fid))].sort((left, right) => left - right)
  const orphanLinkCount = source.links.filter((link) => link.fid !== 0 && !categoryIds.has(link.fid)).length
  const urlCounts = new Map<string, number>()
  for (const link of source.links) {
    const normalizedUrl = link.url.trim()
    urlCounts.set(normalizedUrl, (urlCounts.get(normalizedUrl) ?? 0) + 1)
  }
  assertCategoryTree(source.categories)
  return {
    sourcePath: source.sourcePath,
    fingerprint: source.fingerprint,
    importKey: `onenav:${source.fingerprint}`,
    categoryCount: source.categories.length,
    linkCount: source.links.length,
    orphanLinkCount,
    orphanCategoryIds,
    duplicateUrlGroupCount: [...urlCounts.values()].filter((count) => count > 1).length,
    privateCategoryCount: source.categories.filter((category) => category.property === 1).length,
    privateLinkCount: source.links.filter((link) => link.property === 1).length,
    expectedNodeCount: 1 + source.categories.length + source.links.length + (orphanCategoryIds.length > 0 ? 1 + orphanCategoryIds.length : 0)
  }
}

/** 将 OneNav 数据追加到指定目录；源指纹唯一检查和所有节点写入共用一个事务。 */
export async function importOneNavSource(pool: Pool, source: OneNavSource, parentId: number, folderName: string): Promise<OneNavImportResult> {
  const plan = createOneNavImportPlan(source)
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [parents] = await connection.execute<IdRow[]>("SELECT id FROM navigation_node WHERE id = ? AND node_type IN ('root', 'folder') LIMIT 1 FOR UPDATE", [parentId])
    if (parents.length === 0) throw new Error(`目标目录 ${parentId} 不存在或不是目录`)
    const [existing] = await connection.execute<IdRow[]>("SELECT id FROM navigation_node WHERE JSON_UNQUOTE(JSON_EXTRACT(source_metadata, '$.importKey')) = ? LIMIT 1 FOR UPDATE", [plan.importKey])
    if (existing.length > 0) throw new Error(`该 OneNav 数据库已经导入，根目录节点 ID 为 ${existing[0]?.id}`)

    const rootNodeId = await insertNode(connection, {
      parentId,
      nodeType: 'folder',
      title: folderName,
      description: `从 OneNav SQLite 导入：${source.categories.length} 个分类，${source.links.length} 条书签`,
      visibility: 'public',
      createdAt: newestDate(source.categories.map((category) => category.add_time).concat(source.links.map((link) => link.add_time))),
      updatedAt: new Date(),
      sourceMetadata: { source: 'onenav', importKey: plan.importKey, fingerprint: source.fingerprint }
    })

    const categoriesByParent = groupBy(source.categories, (category) => category.fid)
    const linksByParent = groupBy(source.links, (link) => link.fid)
    await insertCategoryChildren(connection, 0, rootNodeId, categoriesByParent, linksByParent, plan.importKey, 'public')
    await insertLinks(connection, linksByParent.get(0) ?? [], rootNodeId, plan.importKey, 'public')

    if (plan.orphanCategoryIds.length > 0) {
      const recoveryId = await insertNode(connection, {
        parentId: rootNodeId,
        nodeType: 'folder',
        title: '已删除分类恢复',
        description: '源 OneNav 数据库中分类记录已删除，按原分类 ID 收纳关联书签',
        visibility: 'private',
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceMetadata: { source: 'onenav', importKey: plan.importKey, recoveredOrphans: true }
      })
      for (const originalCategoryId of plan.orphanCategoryIds) {
        const orphanFolderId = await insertNode(connection, {
          parentId: recoveryId,
          nodeType: 'folder',
          title: `原分类 ${originalCategoryId}`,
          description: 'OneNav 源库缺少该分类定义',
          visibility: 'private',
          createdAt: new Date(),
          updatedAt: new Date(),
          sourceMetadata: { source: 'onenav', importKey: plan.importKey, originalCategoryId, orphanCategory: true }
        })
        await insertLinks(connection, linksByParent.get(originalCategoryId) ?? [], orphanFolderId, plan.importKey, 'private')
      }
    }

    await connection.commit()
    return { ...plan, rootNodeId, insertedNodes: plan.expectedNodeCount }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/** 递归导入分类后再导入分类直属书签，确保父节点总在子节点之前创建。 */
async function insertCategoryChildren(
  connection: PoolConnection,
  sourceParentId: number,
  targetParentId: number,
  categoriesByParent: Map<number, OneNavCategory[]>,
  linksByParent: Map<number, OneNavLink[]>,
  importKey: string,
  inheritedVisibility: 'public' | 'private'
): Promise<void> {
  const categories = [...(categoriesByParent.get(sourceParentId) ?? [])].sort(compareWeighted)
  for (const category of categories) {
    const visibility = inheritedVisibility === 'private' || category.property === 1 ? 'private' : 'public'
    const targetCategoryId = await insertNode(connection, {
      parentId: targetParentId,
      nodeType: 'folder',
      title: category.name.trim() || `未命名分类 ${category.id}`,
      description: nullableText(category.description),
      visibility,
      createdAt: parseOneNavUnixDate(category.add_time),
      updatedAt: parseOneNavUnixDate(category.up_time, parseOneNavUnixDate(category.add_time)),
      sourceMetadata: {
        source: 'onenav', importKey, sourceTable: 'on_categorys', originalId: category.id,
        originalParentId: category.fid, weight: category.weight, property: category.property,
        fontIcon: nullableText(category.font_icon)
      }
    })
    await insertCategoryChildren(connection, category.id, targetCategoryId, categoriesByParent, linksByParent, importKey, visibility)
    await insertLinks(connection, linksByParent.get(category.id) ?? [], targetCategoryId, importKey, visibility)
  }
}

/** OneNav 的备用链接和字体图标没有对应核心字段，保存在 source_metadata 中以便后续恢复。 */
async function insertLinks(
  connection: PoolConnection,
  links: OneNavLink[],
  parentId: number,
  importKey: string,
  inheritedVisibility: 'public' | 'private'
): Promise<void> {
  for (const link of [...links].sort(compareLinks)) {
    const url = link.url.trim()
    const standbyUrl = nullableText(link.url_standby)
    await insertNode(connection, {
      parentId,
      nodeType: 'bookmark',
      title: link.title.trim() || url,
      url,
      description: nullableText(link.description),
      remark: standbyUrl ? `备用链接：${standbyUrl}` : null,
      iconUrl: httpUrl(link.font_icon),
      visibility: inheritedVisibility === 'private' || link.property === 1 ? 'private' : 'public',
      clickCount: Math.max(0, Number(link.click) || 0),
      createdAt: parseOneNavUnixDate(link.add_time),
      updatedAt: parseOneNavUnixDate(link.up_time, parseOneNavUnixDate(link.add_time)),
      sourceMetadata: {
        source: 'onenav', importKey, sourceTable: 'on_links', originalId: link.id,
        originalParentId: link.fid, originalUrl: link.url, standbyUrl,
        weight: link.weight, property: link.property, topping: link.topping,
        fontIcon: nullableText(link.font_icon), checkStatus: link.check_status,
        lastCheckedTime: nullableText(link.last_checked_time)
      }
    })
  }
}

/** 统一节点插入所需字段；OneNav 专属字段统一进入 sourceMetadata。 */
interface InsertNodeInput {
  parentId: number
  nodeType: 'folder' | 'bookmark'
  title: string
  url?: string
  description: string | null
  remark?: string | null
  iconUrl?: string | null
  visibility: 'public' | 'private'
  clickCount?: number
  createdAt: Date
  updatedAt: Date
  sourceMetadata: Record<string, unknown>
}

/** 获取目标目录末尾排序值并插入单个节点；调用方事务锁保证并发导入顺序稳定。 */
async function insertNode(connection: PoolConnection, input: InsertNodeInput): Promise<number> {
  const [sortRows] = await connection.execute<SortRow[]>('SELECT COALESCE(MAX(sort_key), 0) AS max_sort FROM navigation_node WHERE parent_id = ? FOR UPDATE', [input.parentId])
  const sortKey = BigInt(String(sortRows[0]?.max_sort ?? 0)) + ROOT_SORT_STEP
  const [result] = await connection.execute<ResultSetHeader>(`
    INSERT INTO navigation_node (
      parent_id, node_type, title, url, url_hash, description, remark, icon_url, sort_key,
      enabled, visibility, source_metadata, last_checked_at, last_check_status,
      last_http_status, last_response_time, click_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
  `, [
    input.parentId, input.nodeType, input.title.slice(0, 512), input.url ?? null,
    input.url ? hashUrl(input.url) : null, input.description, input.remark ?? null, input.iconUrl ?? null,
    sortKey.toString(), input.visibility,
    JSON.stringify(input.sourceMetadata), input.clickCount ?? 0, input.createdAt, input.updatedAt
  ])
  return Number(result.insertId)
}

/** 检查分类是否全部从 fid=0 可达，同时防止循环引用导致递归导入失控。 */
function assertCategoryTree(categories: OneNavCategory[]): void {
  const byId = new Map(categories.map((category) => [category.id, category]))
  for (const category of categories) {
    const visited = new Set<number>()
    let current: OneNavCategory | undefined = category
    while (current && current.fid !== 0) {
      if (visited.has(current.id)) throw new Error(`OneNav 分类存在循环引用，分类 ID：${current.id}`)
      visited.add(current.id)
      current = byId.get(current.fid)
      if (!current) throw new Error(`OneNav 分类 ${category.id} 引用了不存在的父分类 ${category.fid}`)
    }
  }
}

/** 校验导入依赖的 OneNav 核心表存在。 */
function requireSourceTable(database: BunDatabase, tableName: string): void {
  const row = database.query<{ count: number }, string>('SELECT COUNT(*) AS count FROM sqlite_master WHERE type = \'table\' AND name = ?').get(tableName)
  if (Number(row?.count ?? 0) !== 1) throw new Error(`OneNav SQLite 缺少数据表：${tableName}`)
}

/** 按数值父键分组，供分类树递归阶段使用。 */
function groupBy<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

/** 复现 OneNav 的权重优先、原始 ID 稳定排序规则。 */
function compareWeighted(left: { id: number; weight: number }, right: { id: number; weight: number }): number {
  return right.weight - left.weight || left.id - right.id
}

/** 置顶书签优先于普通权重，随后按原始 ID 保持稳定顺序。 */
function compareLinks(left: OneNavLink, right: OneNavLink): number {
  return right.topping - left.topping || compareWeighted(left, right)
}

/** 空白文本统一转 null，避免导入无意义的空字符串。 */
function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

/** 将 OneNav Unix 秒时间转为 Date，非法时间使用调用方回退值。 */
export function parseOneNavUnixDate(value: string | null | undefined, fallback = new Date()): Date {
  if (value === null || value === undefined || value.trim() === '') return fallback
  const seconds = Number(value)
  const date = new Date(seconds * 1000)
  return Number.isFinite(seconds) && !Number.isNaN(date.getTime()) ? date : fallback
}

/** 计算源数据中的最新创建时间，作为导入根目录创建时间。 */
function newestDate(values: Array<string | null>): Date {
  return values.reduce<Date>((latest, value) => {
    const candidate = parseOneNavUnixDate(value, latest)
    return candidate.getTime() > latest.getTime() ? candidate : latest
  }, new Date(0))
}

/** 仅将明确的 HTTP(S) 地址用于前端图标，其余 Font Awesome 类名继续保存在源元数据。 */
function httpUrl(value: string | null | undefined): string | null {
  const normalized = nullableText(value)
  if (!normalized) return null
  try {
    const parsed = new URL(normalized)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}
