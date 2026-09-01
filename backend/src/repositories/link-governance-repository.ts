import { AppError } from '../errors.js'
import { deleteNodeRelations } from './node-repository.js'
import { loadNodePaths, loadNodeTags } from './node-metadata-loaders.js'
import type {
  BrokenBookmark,
  BrokenBookmarkQuery,
  BrokenBookmarkResult,
  BrokenReason,
  DuplicateGroup,
  DuplicateGroupMember,
  DuplicateGroupQuery,
  DuplicateGroupResult,
  DuplicateMergeInput,
  DuplicateMergeResult,
  Visibility
} from '@cancanworld/contracts'
import type { Pool, RowDataPacket } from 'mysql2/promise'

/** 可达即视为成功；重定向到新地址的书签仍然能打开，不属于失效。 */
const SUCCESS_STATUSES = ['UP', 'REDIRECT'] as const

/**
 * 确定性失败可以单次判定：目标不存在、域名无法解析、证书错误都不会自行恢复。
 * 超时与连接错误可能是网络抖动，必须依赖连续失败次数。
 */
const DETERMINISTIC_FAILURES = ['NOT_FOUND', 'DNS_ERROR', 'SSL_ERROR'] as const

/** 需要登录或拒绝爬虫的站点对用户仍然可用，一律排除在失效之外。 */
const ACCESS_RESTRICTED_STATUSES = ['UNAUTHORIZED', 'FORBIDDEN'] as const

/** 成功状态判定供 SQL 与结果归因共用同一套语义。 */
export function isSuccessStatus(status: string): boolean {
  return (SUCCESS_STATUSES as readonly string[]).includes(status)
}

/** 确定性失败判定供 SQL 与结果归因共用同一套语义。 */
export function isDeterministicFailure(status: string): boolean {
  return (DETERMINISTIC_FAILURES as readonly string[]).includes(status)
}

/** 确定性失败优先归因，其余命中项归因为连续失败。 */
export function classifyBrokenReason(status: string, consecutiveFailures: number): BrokenReason {
  if (isDeterministicFailure(status)) return 'deterministic'
  void consecutiveFailures
  return 'consecutive_failures'
}

/** 把状态常量渲染为 SQL 字面量列表；全部来自内部白名单，不含外部输入。 */
function statusList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ')
}

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

/** 失效行携带判定依据，使前端可以解释结论。 */
interface BrokenRow extends RowDataPacket {
  id: string | number
  title: string
  url: string
  last_check_status: string
  last_http_status: string | number | null
  last_checked_at: Date
  consecutive_failures: string | number
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
   * 查询满足失效条件的书签。
   * 连续失败次数在数据库内用聚合计算，避免把十万级检测历史加载进内存。
   */
  async findBrokenBookmarks(input: BrokenBookmarkQuery): Promise<BrokenBookmarkResult> {
    const [countRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM (${this.brokenSelectSql()}) AS broken`,
      this.brokenParams(input)
    )
    const total = Number(countRows[0]?.total ?? 0)

    const [rows] = await this.pool.query<BrokenRow[]>(
      `${this.brokenSelectSql()} ORDER BY consecutive_failures DESC, n.id ASC LIMIT ? OFFSET ?`,
      [...this.brokenParams(input), input.pageSize, (input.page - 1) * input.pageSize]
    )
    if (rows.length === 0) return { items: [], total, page: input.page, pageSize: input.pageSize }

    const paths = await loadNodePaths(this.pool, rows.map((row) => Number(row.id)))
    const items: BrokenBookmark[] = rows.map((row) => {
      const consecutiveFailures = Number(row.consecutive_failures)
      return {
        id: Number(row.id),
        title: row.title,
        url: row.url,
        fullPath: paths.get(Number(row.id)) ?? [],
        reason: classifyBrokenReason(row.last_check_status, consecutiveFailures),
        lastCheckStatus: row.last_check_status,
        lastHttpStatus: row.last_http_status === null ? null : Number(row.last_http_status),
        lastCheckedAt: row.last_checked_at.toISOString(),
        consecutiveFailures
      }
    })
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  /**
   * 失效候选的公共 SELECT，计数与分页共用以保证语义一致。
   * 先按节点字段筛掉明显不参与判定的书签，再仅为候选集统计连续失败次数。
   */
  private brokenSelectSql(): string {
    return `
      WITH candidate_bookmarks AS (
        SELECT id
        FROM navigation_node
        WHERE node_type = 'bookmark'
          AND url IS NOT NULL
          AND LOWER(LEFT(TRIM(url), 11)) <> 'javascript:'
          AND last_check_status IS NOT NULL
          AND last_checked_at IS NOT NULL
          AND last_check_status NOT IN (${statusList(ACCESS_RESTRICTED_STATUSES)})
          AND last_check_status NOT IN (${statusList(SUCCESS_STATUSES)})
          AND last_checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)
      )
      SELECT n.id, n.title, n.url, n.last_check_status, n.last_http_status, n.last_checked_at,
             COALESCE(failure_stats.consecutive_failures, 0) AS consecutive_failures
      FROM navigation_node AS n
      LEFT JOIN (
        SELECT log.bookmark_id,
               COUNT(*) AS consecutive_failures
        FROM bookmark_check_log AS log
        INNER JOIN (
          SELECT bookmark_id,
                 MAX(CASE WHEN status IN (${statusList(SUCCESS_STATUSES)}) THEN checked_at END) AS last_success_at
          FROM bookmark_check_log
          -- 只为候选书签聚合历史，避免每次查询都扫描整张检测历史表。
          WHERE bookmark_id IN (SELECT id FROM candidate_bookmarks)
          GROUP BY bookmark_id
        ) AS success_marks ON success_marks.bookmark_id = log.bookmark_id
        WHERE log.status NOT IN (${statusList(SUCCESS_STATUSES)})
          AND log.bookmark_id IN (SELECT id FROM candidate_bookmarks)
          AND (success_marks.last_success_at IS NULL OR log.checked_at > success_marks.last_success_at)
        GROUP BY log.bookmark_id
      ) AS failure_stats ON failure_stats.bookmark_id = n.id
      INNER JOIN candidate_bookmarks AS candidates ON candidates.id = n.id
      WHERE n.node_type = 'bookmark'
        AND n.url IS NOT NULL
        AND LOWER(LEFT(TRIM(n.url), 11)) <> 'javascript:'
        AND n.last_check_status IS NOT NULL
        AND n.last_checked_at IS NOT NULL
        AND n.last_check_status NOT IN (${statusList(ACCESS_RESTRICTED_STATUSES)})
        AND n.last_check_status NOT IN (${statusList(SUCCESS_STATUSES)})
        AND n.last_checked_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)
        AND (
          n.last_check_status IN (${statusList(DETERMINISTIC_FAILURES)})
          OR COALESCE(failure_stats.consecutive_failures, 0) >= ?
        )
    `
  }

  /**
   * 参数顺序与 brokenSelectSql 中的占位符严格对应。
   * 新鲜度出现两次：候选 CTE 与外层 WHERE 各用一次。
   */
  private brokenParams(input: BrokenBookmarkQuery): number[] {
    return [input.freshnessDays, input.freshnessDays, input.minConsecutiveFailures]
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
