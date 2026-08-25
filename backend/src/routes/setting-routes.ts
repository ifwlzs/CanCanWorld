import { Hono } from 'hono'
import type { RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import type { AppDependencies, AppVariables } from '../types.js'

const themeSchema = z.object({
  theme: z.enum(['default', 'compact', 'bookmark']),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#19715f'),
  layoutStyle: z.enum(['style1', 'style2']).default('style1')
})

/** 主题设置只保存受控令牌，不接受脚本、模板或远程组件地址。 */
export function createSettingRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  routes.get('/theme', async (context) => {
    const [rows] = await dependencies.pool.execute<RowDataPacket[]>("SELECT setting_value FROM app_setting WHERE setting_key = 'theme' LIMIT 1")
    const stored = rows[0] ? JSON.parse(String(rows[0].setting_value)) as unknown : {}
    const data = themeSchema.parse(stored)
    return context.json({ code: 0, message: 'success', data })
  })
  routes.put('/theme', requireAdmin(), async (context) => {
    const parsed = themeSchema.safeParse(await context.req.json())
    if (!parsed.success) throw validationError(parsed.error)
    await dependencies.pool.execute(`
      INSERT INTO app_setting (setting_key, setting_value, updated_at) VALUES ('theme', ?, ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)
    `, [JSON.stringify(parsed.data), new Date()])
    return context.json({ code: 0, message: 'success', data: parsed.data })
  })
  return routes
}
