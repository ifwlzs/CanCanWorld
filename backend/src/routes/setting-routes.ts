import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { RowDataPacket } from 'mysql2/promise'
import { z } from 'zod'
import { adminNodeFilterPresetListInputSchema } from '@cancanworld/contracts'
import { zValidator } from '@hono/zod-validator'
import { validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { readAdminNodeFilters, writeAdminNodeFilters } from '../services/admin-node-filter-settings.js'
import { readLinkCheckSchedule, writeLinkCheckSchedule } from '../services/link-check-settings.js'
import type { AppDependencies, AppVariables } from '../types.js'

const themeSchema = z.object({
  theme: z.enum(['default', 'compact', 'bookmark']),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#19715f'),
  layoutStyle: z.enum(['style1', 'style2']).default('style1')
})

const linkCheckScheduleSchema = z.object({
  enabled: z.boolean(),
  intervalSeconds: z.coerce.number().int().min(60).max(7 * 24 * 60 * 60)
})

/** 主题设置只保存受控令牌，不接受脚本、模板或远程组件地址。 */
export function createSettingRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  /** 将 JSON 和 Schema 失败转换为统一 422 错误，避免畸形请求落入 500。 */
  const validatorHook = (result: { success: boolean; error?: unknown }) => {
    if (!result.success) throw validationError(result.error)
  }
  /** 预读请求体以将 Hono 的 JSON 解析异常转换为统一 422 envelope，后续 zValidator 复用缓存内容。 */
  const malformedJsonGuard: MiddlewareHandler<{ Variables: AppVariables }> = async (context, next) => {
    try {
      await context.req.json()
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && error.name === 'SyntaxError')) {
        throw validationError(null)
      }
      throw error
    }
    await next()
  }

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
  routes.get('/admin-node-filters', requireAdmin(), async (context) => {
    const data = await readAdminNodeFilters(dependencies.pool, context.get('logger'))
    return context.json({ code: 0, message: 'success', data })
  })
  routes.put('/admin-node-filters', requireAdmin(), malformedJsonGuard, zValidator('json', adminNodeFilterPresetListInputSchema, validatorHook), async (context) => {
    const data = await writeAdminNodeFilters(dependencies.pool, context.req.valid('json'))
    return context.json({ code: 0, message: 'success', data })
  })
  routes.get('/link-check', requireAdmin(), async (context) => {
    return context.json({ code: 0, message: 'success', data: await readLinkCheckSchedule(dependencies.pool) })
  })
  routes.put('/link-check', requireAdmin(), async (context) => {
    const parsed = linkCheckScheduleSchema.safeParse(await context.req.json())
    if (!parsed.success) throw validationError(parsed.error)
    const saved = await writeLinkCheckSchedule(dependencies.pool, parsed.data)
    return context.json({ code: 0, message: 'success', data: saved })
  })
  return routes
}
