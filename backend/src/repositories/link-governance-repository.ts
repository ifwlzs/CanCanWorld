import { AppError } from '../errors.js'
import { deleteNodeRelations } from './node-repository.js'
import { loadNodePaths, loadNodeTags } from './node-metadata-loaders.js'
import type {
  DuplicateGroup,
  DuplicateGroupMember,
  DuplicateGroupQuery,
  DuplicateGroupResult,
  DuplicateMergeInput,
  DuplicateMergeResult,
  Visibility
} from '@cancanworld/contracts'
import type { Pool, RowDataPacket } from 'mysql2/promise'

/** 分组聚合只返回 url_hash 与成员数量，成员明细单独分页加载。 */
interface DuplicateGroupRow extends RowDataPacket {
  url_hash: string
  member_count: string | number
}

/** 成员行携带用户判断保留项所需的全部字段。 */
interface DuplicateMemberRow extends RowDataPacket {
  id: string | number
  url_hash: string
  title: string
  url: string
  remark: string | null
  visibility: Visibility
  click_count: string | number
  last_check_status: string | null
  last_checked_at: Date | null
  created_at: Date
}

/** 合并前校验用的最小节点信息。 */
interface GroupNodeRow extends RowDataPacket {
  id: string | number
  url_hash: string | null
  node_type: 'root' | 'folder' | 'bookmark'
}

/** 治理 Repository 负责重复分组、失效判定与合并事务，SQL 细节不外泄到路由。 */
export class LinkGovernanceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * 按 url_hash 分组返回重复书签。
   * 聚合与分页都在数据库内完成，避免把全部书签装载进内存。
   */
  async findDuplicateGroups(input: DuplicateGroupQuery): Promise<DuplicateGroupResult> {
    const [countRows] = await this.pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS total FROM (
        SELECT url_hash
        FROM navigation_node
        WHERE node_type = 'bookmark' AND url_hash IS NOT NULL
        GROUP BY url_hash
        HAVING COUNT(*) > 1
      ) AS duplicate_groups
    `)
    const total = Number(countRows[0]?.total ?? 0)

    // 成员数倒序让问题最集中的分组优先出现；url_hash 升序保证同数量组分页稳定。
    const [groupRows] = await this.pool.query<DuplicateGroupRow[]>(`
      SELECT url_hash, COUNT(*) AS member_count
      FROM navigation_node
      WHERE node_type = 'bookmark' AND url_hash IS NOT NULL
      GROUP BY url_hash
      HAVING COUNT(*) > 1
      ORDER BY member_count DESC, url_hash ASC
      LIMIT ? OFFSET ?
    `, [input.pageSize, (input.page - 1) * input.pageSize])

    if (groupRows.length === 0) return { items: [], total, page: input.page, pageSize: input.pageSize }

    const hashes = groupRows.map((row) => String(row.url_hash))
    const [memberRows] = await this.pool.query<DuplicateMemberRow[]>(`
      SELECT n.id, n.url_hash, n.title, n.url, n.remark, n.visibility, n.click_count,
             n.last_check_status, n.last_checked_at, n.created_at
      FROM navigation_node AS n
      WHERE n.node_type = 'bookmark' AND n.url_hash IN (${hashes.map(() => '?').join(',')})
      ORDER BY n.url_hash ASC, n.created_at ASC, n.id ASC
    `, hashes)

    const ids = memberRows.map((row) => Number(row.id))
    const [tags, paths] = await Promise.all([loadNodeTags(this.pool, ids), loadNodePaths(this.pool, ids)])
    const membersByHash = new Map<string, DuplicateGroupMember[]>()
    for (const row of memberRows) {
      const id = Number(row.id)
      const hash = String(row.url_hash)
      const member: DuplicateGroupMember = {
        id,
        title: row.title,
        url: row.url,
        fullPath: paths.get(id) ?? [],
        tags: tags.get(id) ?? [],
        remark: row.remark,
        visibility: row.visibility,
        clickCount: Number(row.click_count),
        lastCheckStatus: row.last_check_status,
        lastCheckedAt: row.last_checked_at ? row.last_checked_at.toISOString() : null,
        createdAt: row.created_at.toISOString()
      }
      membersByHash.set(hash, [...(membersByHash.get(hash) ?? []), member])
    }

    const items: DuplicateGroup[] = groupRows.map((row) => ({
      urlHash: String(row.url_hash),
      memberCount: Number(row.member_count),
      members: membersByHash.get(String(row.url_hash)) ?? []
    }))
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  /**
   * 删除同组内除保留项以外的书签。
   * 保留项必须存在且与全部待删除节点同属一个 url_hash，避免跨组误删或整组丢失。
   */
  async mergeDuplicates(input: DuplicateMergeInput): Promise<DuplicateMergeResult> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const ids = [input.keepId, ...input.removeIds]
      const [rows] = await connection.query<GroupNodeRow[]>(
        `SELECT id, url_hash, node_type FROM navigation_node WHERE id IN (${ids.map(() => '?').join(',')}) FOR UPDATE`,
        ids
      )
      const byId = new Map(rows.map((row) => [Number(row.id), row]))

      const keep = byId.get(input.keepId)
      if (!keep) throw new AppError(404, 40401, '保留的书签不存在')
      if (keep.node_type !== 'bookmark') throw new AppError(422, 42220, '保留项必须是书签')
      if (!keep.url_hash) throw new AppError(422, 42221, '保留项缺少可比较的链接摘要')

      for (const removeId of input.removeIds) {
        const target = byId.get(removeId)
        if (!target) throw new AppError(404, 40401, `待删除书签 ${removeId} 不存在`)
        if (target.node_type !== 'bookmark') throw new AppError(422, 42222, '只能删除书签，不能删除目录')
        // 逐条比较链接摘要，防止请求把不同分组的节点混进同一次合并。
        if (target.url_hash !== keep.url_hash) throw new AppError(422, 42223, '待删除书签与保留项不属于同一重复分组')
      }

      await deleteNodeRelations(connection, input.removeIds)
      await connection.query(
        `DELETE FROM navigation_node WHERE id IN (${input.removeIds.map(() => '?').join(',')})`,
        input.removeIds
      )
      await connection.commit()
      return { removed: input.removeIds.length }
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }
}
