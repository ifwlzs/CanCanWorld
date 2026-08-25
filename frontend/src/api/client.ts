import type { ApiEnvelope } from '@cancanworld/contracts'

/** API 错误保留 HTTP 状态和业务码，页面可据此处理登录、冲突和校验错误。 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number,
    readonly details: unknown
  ) {
    super(message)
  }
}

let csrfToken = ''

/** 登录态刷新后同步更新内存中的 CSRF Token。 */
export function setCsrfToken(token: string): void {
  csrfToken = token
}

/** 封装统一响应结构，并为修改请求自动附带 CSRF Token。 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-csrf-token', csrfToken)
  const response = await fetch(path, { ...init, headers, credentials: 'include' })
  const payload = await response.json() as ApiEnvelope<T>
  if (!response.ok || payload.code !== 0) throw new ApiError(payload.message, response.status, payload.code, payload.data)
  return payload.data
}
