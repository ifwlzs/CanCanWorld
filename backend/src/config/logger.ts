import pino from 'pino'

/** 创建结构化日志实例，请求日志通过 child 绑定 requestId。 */
export function createLogger(level: pino.Level = 'info') {
  return pino({
    level,
    base: { service: 'cancanworld' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['password', 'token', 'cookie', 'req.headers.cookie', 'req.headers.authorization'],
      censor: '[REDACTED]'
    }
  })
}

export type AppLogger = ReturnType<typeof createLogger>
