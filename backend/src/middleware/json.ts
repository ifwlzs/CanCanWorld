import { validationError } from '../errors.js'
import type { MiddlewareHandler } from 'hono'
import type { AppVariables } from '../types.js'

/**
 * 预读请求体，将 Hono 的 JSON 解析异常转换为统一 422 envelope。
 * 畸形请求体属于客户端输入错误，不应落入 500；后续 zValidator 复用已缓存的解析结果。
 */
export const malformedJsonGuard: MiddlewareHandler<{ Variables: AppVariables }> = async (context, next) => {
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
