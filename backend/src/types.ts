import type { Pool } from 'mysql2/promise'
import type { AppEnv } from './config/env.js'
import type { AppLogger } from './config/logger.js'

/** 认证上下文只暴露后续授权所需的最小字段。 */
export interface AuthUser {
  id: number
  username: string
  csrfHash: string
}

/** Hono Context 变量由中间件注入，避免 Route 自行创建连接或日志实例。 */
export interface AppVariables {
  requestId: string
  logger: AppLogger
  user: AuthUser | null
}

/** 应用依赖在启动时构造并注入，测试可以替换为独立数据库或桩。 */
export interface AppDependencies {
  env: AppEnv
  pool: Pool
  logger: AppLogger
}
