import {
  adminNodeFilterPresetSchema,
  adminNodeFilterPresetListInputSchema,
  type AdminNodeFilterPreset,
  type AdminNodeFilterPresetInput
} from '@cancanworld/contracts'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { AppLogger } from '../config/logger.js'

const SETTING_KEY = 'admin_node_filters'

interface SettingRow extends RowDataPacket {
  setting_value: string
}

/**
 * 读取管理员筛选预设；数据库内容必须再次通过输出契约校验，损坏时仅记录固定脱敏信息。
 * @param pool MySQL 连接池，用于读取通用设置表。
 * @param logger 只需提供 warn 的日志接口，避免泄露原始配置或解析详情。
 */
export async function readAdminNodeFilters(
  pool: Pool,
  logger: Pick<AppLogger, 'warn'>
): Promise<AdminNodeFilterPreset[]> {
  const [rows] = await pool.execute<SettingRow[]>(
    'SELECT setting_value FROM app_setting WHERE setting_key = ? LIMIT 1',
    [SETTING_KEY]
  )
  const row = rows[0]
  if (!row) return []
  try {
    const parsed: unknown = JSON.parse(String(row.setting_value))
    return adminNodeFilterPresetSchema.array().max(20).parse(parsed)
  } catch {
    logger.warn({ settingKey: SETTING_KEY }, '后台筛选预设损坏，已使用空集合')
    return []
  }
}

/**
 * 校验并保存完整筛选预设集合；服务端统一生成更新时间并以一次 upsert 覆盖旧集合。
 * @param pool MySQL 连接池，用于参数化写入设置表。
 * @param input 客户端提交的预设数组，会再次按共享输入契约规范化。
 * @returns 实际写入的规范化预设数组。
 */
export async function writeAdminNodeFilters(
  pool: Pool,
  input: AdminNodeFilterPresetInput[]
): Promise<AdminNodeFilterPreset[]> {
  const normalized = adminNodeFilterPresetListInputSchema.parse(input)
  const now = new Date()
  const saved: AdminNodeFilterPreset[] = normalized.map((preset) => ({ ...preset, updatedAt: now.toISOString() }))
  await pool.execute(
    `
    INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES ('admin_node_filters', ?, ?)
    ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_at=VALUES(updated_at)
  `,
    [JSON.stringify(saved), now]
  )
  return saved
}
