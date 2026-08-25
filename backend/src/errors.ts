/** 业务错误同时携带 HTTP 状态和稳定错误码，由全局中间件统一序列化。 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string,
    readonly details: unknown = null
  ) {
    super(message)
  }
}

/** 将 Zod 等外部校验错误转换为统一的 422 业务错误。 */
export function validationError(details: unknown): AppError {
  return new AppError(422, 42201, '请求参数校验失败', details)
}
