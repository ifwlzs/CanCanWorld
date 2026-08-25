import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { RowDataPacket } from 'mysql2/promise'
import { AppError } from '../errors.js'
import type { AppDependencies, AppVariables } from '../types.js'
import { safeHashEqual, tokenHash } from '../utils/crypto.js'

interface SessionRow extends RowDataPacket {
  id: number
  username: string
  csrf_hash: string
}

/** 可选认证为公开查询附加管理员身份，但无会话时继续匿名执行。 */
export function optionalAuth(dependencies: AppDependencies): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (context, next) => {
    const rawToken = getCookie(context, 'cw_session')
    if (!rawToken) {
      context.set('user', null)
      await next()
      return
    }
    const [rows] = await dependencies.pool.execute<SessionRow[]>(`
      SELECT u.id, u.username, s.csrf_hash
      FROM app_session s
      INNER JOIN app_user u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)
      LIMIT 1
    `, [tokenHash(rawToken)])
    const row = rows[0]
    context.set('user', row ? { id: row.id, username: row.username, csrfHash: row.csrf_hash } : null)
    await next()
  }
}

/** 管理接口必须具备有效会话；修改请求还要校验与会话绑定的 CSRF Token。 */
export function requireAdmin(): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (context, next) => {
    const user = context.get('user')
    if (!user) throw new AppError(401, 40102, '需要管理员登录')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      const token = context.req.header('x-csrf-token')
      if (!token || !safeHashEqual(user.csrfHash, token)) throw new AppError(403, 40301, 'CSRF Token 无效或已过期')
    }
    await next()
  }
}
