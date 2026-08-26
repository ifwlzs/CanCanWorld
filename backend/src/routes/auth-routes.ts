import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { AppDependencies, AppVariables } from '../types.js'
import { AuthService } from '../services/auth-service.js'
import { requireAdmin } from '../middleware/auth.js'

const credentialsSchema = z.object({ username: z.string(), password: z.string() })

/** 认证路由只处理 Cookie 和响应，密码及会话逻辑由 AuthService 完成。 */
export function createAuthRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  const service = new AuthService(dependencies.pool, dependencies.env)

  routes.get('/status', async (context) => {
    const user = context.get('user')
    const csrfToken = getCookie(context, 'cw_csrf') ?? null
    return context.json({ code: 0, message: 'success', data: {
      initialized: await service.isInitialized(),
      authenticated: user !== null,
      username: user?.username ?? null,
      csrfToken: user ? csrfToken : null
    } })
  })

  routes.post('/initialize', zValidator('json', credentialsSchema), async (context) => {
    const input = context.req.valid('json')
    const session = await service.initialize(input.username, input.password)
    setSessionCookies(context, session, isSecureRequest(context))
    return context.json({ code: 0, message: 'success', data: { csrfToken: session.csrfToken } }, 201)
  })

  routes.post('/login', zValidator('json', credentialsSchema), async (context) => {
    const input = context.req.valid('json')
    const session = await service.login(input.username, input.password)
    setSessionCookies(context, session, isSecureRequest(context))
    return context.json({ code: 0, message: 'success', data: { csrfToken: session.csrfToken } })
  })

  routes.post('/logout', requireAdmin(), async (context) => {
    await service.logout(getCookie(context, 'cw_session'))
    deleteCookie(context, 'cw_session', { path: '/' })
    deleteCookie(context, 'cw_csrf', { path: '/' })
    return context.json({ code: 0, message: 'success', data: null })
  })
  return routes
}

/** 会话 Cookie 禁止脚本读取，CSRF Cookie允许页面刷新后恢复 Token。 */
function setSessionCookies(context: Parameters<typeof setCookie>[0], session: { sessionToken: string; csrfToken: string; expiresAt: Date }, secure: boolean): void {
  const common = { path: '/', secure, sameSite: 'Strict' as const, expires: session.expiresAt }
  setCookie(context, 'cw_session', session.sessionToken, { ...common, httpOnly: true })
  setCookie(context, 'cw_csrf', session.csrfToken, { ...common, httpOnly: false })
}

/** 仅在实际 HTTPS 请求上启用 Secure，兼容 HTTP NAS 访问和 HTTPS 反向代理。 */
function isSecureRequest(context: Parameters<typeof setCookie>[0]): boolean {
  const forwardedProto = context.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (forwardedProto) return forwardedProto === 'https'
  try {
    return new URL(context.req.url).protocol === 'https:'
  } catch {
    return false
  }
}
