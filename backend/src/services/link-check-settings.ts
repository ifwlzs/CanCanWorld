import type { Pool, RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'

/** 链接检测定时设置的数据库持久化结构，避免部署环境变量控制业务开关。 */
export interface LinkCheckScheduleSettings {
  enabled: boolean
  intervalSeconds: number
}

/** 默认每 30 分钟执行一次全库检测，首次读取时自动使用该默认值。 */
export const defaultLinkCheckSchedule: LinkCheckScheduleSettings = {
  enabled: true,
  intervalSeconds: 1800
}

const linkCheckScheduleSchema = z.object({
  enabled: z.boolean().default(true),
  intervalSeconds: z.coerce.number().int().min(60).max(7 * 24 * 60 * 60).default(1800)
})

interface SettingRow extends RowDataPacket {
  setting_value: string
}

/** 从通用设置表读取并校验调度配置；损坏配置回退为安全默认值。 */
export async function readLinkCheckSchedule(pool: Pool): Promise<LinkCheckScheduleSettings> {
  const [rows] = await pool.execute<SettingRow[]>("SELECT setting_value FROM app_setting WHERE setting_key = 'link_check_schedule' LIMIT 1")
  if (!rows[0]) return { ...defaultLinkCheckSchedule }
  try {
    return linkCheckScheduleSchema.parse(JSON.parse(String(rows[0].setting_value)))
  } catch {
    return { ...defaultLinkCheckSchedule }
  }
}

/** 管理员保存调度配置时使用同一套校验和幂等 upsert。 */
export async function writeLinkCheckSchedule(pool: Pool, input: unknown): Promise<LinkCheckScheduleSettings> {
  const settings = linkCheckScheduleSchema.parse(input)
  await pool.execute(`
    INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES ('link_check_schedule', ?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)
  `, [JSON.stringify(settings), new Date()])
  return settings
}
