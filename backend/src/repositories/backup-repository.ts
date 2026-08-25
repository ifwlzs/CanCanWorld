import { createHash } from 'node:crypto'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { AppError } from '../errors.js'

const SCHEMA_VERSION = 1

interface BackupRow extends RowDataPacket {
  id: string
  backup_type: 'manual' | 'before_restore'
  schema_version: number
  item_count: number
  payload: string
  checksum: string
  created_at: Date
}

interface BackupPayload {
  schemaVersion: number
  nodes: BackupNode[]
  tags: BackupTag[]
  nodeTags: BackupNodeTag[]
  settings: BackupSetting[]
}

interface BackupNode {
  id: string | number
  parent_id: string | number | null
  node_type: string
  title: string
  url: string | null
  url_hash: string | null
  description: string | null
  icon_url: string | null
  sort_key: string | number
  enabled: number
  visibility: string
  source_metadata: unknown
  last_checked_at: string | Date | null
  last_check_status: string | null
  last_http_status: number | null
  last_response_time: number | null
  created_at: string | Date
  updated_at: string | Date
}

interface BackupTag {
  id: string | number
  name: string
  normalized_name: string
  created_at: string | Date
}

interface BackupNodeTag {
  node_id: string | number
  tag_id: string | number
}

interface BackupSetting {
  setting_key: string
  setting_value: string
  updated_at: string | Date
}

/** 备份 Repository 生成、校验和恢复不含身份密钥的业务快照。 */
export class BackupRepository {
  constructor(private readonly pool: Pool) {}

  async create(type: 'manual' | 'before_restore' = 'manual'): Promise<Record<string, unknown>> {
    const [nodes] = await this.pool.query<RowDataPacket[]>("SELECT * FROM navigation_node WHERE id <> 1 AND node_type <> 'separator' ORDER BY id")
    const [tags] = await this.pool.query<RowDataPacket[]>('SELECT * FROM tag ORDER BY id')
    const [nodeTags] = await this.pool.query<RowDataPacket[]>('SELECT * FROM node_tag ORDER BY node_id, tag_id')
    const [settings] = await this.pool.query<RowDataPacket[]>('SELECT * FROM app_setting ORDER BY setting_key')
    const payload: BackupPayload = {
      schemaVersion: SCHEMA_VERSION,
      nodes: nodes as BackupNode[],
      tags: tags as BackupTag[],
      nodeTags: nodeTags as BackupNodeTag[],
      settings: settings as BackupSetting[]
    }
    const serialized = JSON.stringify(payload)
    const id = crypto.randomUUID()
    const checksum = sha256(serialized)
    const createdAt = new Date()
    await this.pool.execute(`
      INSERT INTO app_backup (id, backup_type, schema_version, item_count, payload, checksum, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, type, SCHEMA_VERSION, nodes.length, serialized, checksum, createdAt])
    return { id, backupType: type, schemaVersion: SCHEMA_VERSION, itemCount: nodes.length, checksum, createdAt: createdAt.toISOString() }
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    const [rows] = await this.pool.query<BackupRow[]>('SELECT id, backup_type, schema_version, item_count, checksum, created_at FROM app_backup ORDER BY created_at DESC LIMIT 100')
    return rows.map(mapBackup)
  }

  async get(id: string): Promise<Record<string, unknown>> {
    const row = await this.requireBackup(id, false)
    return mapBackup(row)
  }

  /** 恢复前先创建当前快照，再在一个事务中替换全部业务数据。 */
  async restore(id: string): Promise<{ safetyBackupId: string; restoredNodes: number }> {
    const source = await this.requireBackup(id, true)
    if (source.schema_version !== SCHEMA_VERSION) throw new AppError(409, 40908, `备份版本 ${source.schema_version} 与当前版本 ${SCHEMA_VERSION} 不兼容`)
    if (sha256(source.payload) !== source.checksum) throw new AppError(409, 40909, '备份完整性校验失败')
    const payload = JSON.parse(source.payload) as BackupPayload
    const safety = await this.create('before_restore')
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query('DELETE FROM favicon_job_item')
      await connection.query('DELETE FROM favicon_job')
      await connection.query('DELETE FROM bookmark_icon')
      await connection.query('DELETE FROM bookmark_check_log')
      await connection.query('DELETE FROM bookmark_check_job_item')
      await connection.query('DELETE FROM bookmark_check_job')
      await connection.query('DELETE FROM node_tag')
      await connection.query('DELETE FROM tag')
      const [existingNodes] = await connection.query<RowDataPacket[]>(`
        WITH RECURSIVE tree AS (
          SELECT id, 0 AS depth FROM navigation_node WHERE parent_id = 1
          UNION ALL
          SELECT n.id, tree.depth + 1 FROM navigation_node n INNER JOIN tree ON n.parent_id = tree.id
        ) SELECT id FROM tree ORDER BY depth DESC
      `)
      for (const node of existingNodes) await connection.execute('DELETE FROM navigation_node WHERE id = ?', [node.id])
      await connection.query('DELETE FROM app_setting')

      const restoredNodes = payload.nodes.filter((node) => node.node_type !== 'separator')
      const restoredNodeIds = new Set(restoredNodes.map((node) => String(node.id)))
      for (const node of restoredNodes) {
        await connection.execute(`
          INSERT INTO navigation_node (
            id, parent_id, node_type, title, url, url_hash, description, icon_url, sort_key,
            enabled, visibility, source_metadata, last_checked_at, last_check_status,
            last_http_status, last_response_time, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          node.id, node.parent_id, node.node_type, node.title, node.url, node.url_hash,
          node.description, node.icon_url, node.sort_key, node.enabled, node.visibility,
          jsonValue(node.source_metadata), dateValue(node.last_checked_at), node.last_check_status,
          node.last_http_status, node.last_response_time, dateValue(node.created_at), dateValue(node.updated_at)
        ])
      }
      for (const tag of payload.tags) await connection.execute('INSERT INTO tag (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)', [tag.id, tag.name, tag.normalized_name, dateValue(tag.created_at)])
      for (const relation of payload.nodeTags.filter((item) => restoredNodeIds.has(String(item.node_id)))) {
        await connection.execute('INSERT INTO node_tag (node_id, tag_id) VALUES (?, ?)', [relation.node_id, relation.tag_id])
      }
      for (const setting of payload.settings) await connection.execute('INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES (?, ?, ?)', [setting.setting_key, setting.setting_value, dateValue(setting.updated_at)])
      await connection.commit()
      return { safetyBackupId: String(safety.id), restoredNodes: restoredNodes.length }
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  private async requireBackup(id: string, withPayload: boolean): Promise<BackupRow> {
    const columns = withPayload ? '*' : 'id, backup_type, schema_version, item_count, checksum, created_at'
    const [rows] = await this.pool.execute<BackupRow[]>(`SELECT ${columns} FROM app_backup WHERE id = ? LIMIT 1`, [id])
    const row = rows[0]
    if (!row) throw new AppError(404, 40406, '备份不存在')
    return row
  }
}

/** 输出元数据时隐藏可能包含用户书签内容的 payload。 */
function mapBackup(row: BackupRow): Record<string, unknown> {
  return {
    id: row.id,
    backupType: row.backup_type,
    schemaVersion: row.schema_version,
    itemCount: row.item_count,
    checksum: row.checksum,
    createdAt: row.created_at.toISOString()
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** MySQL JSON 读取可能返回对象或字符串，写回时统一序列化对象。 */
function jsonValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** MySQL 日期驱动可能返回 Date 或 ISO 文本，恢复时统一转换。 */
function dateValue(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value : new Date(String(value))
}
