import { config as loadDotEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// Node 测试和迁移命令需要显式加载根目录环境文件；Bun 下重复加载不会覆盖现有变量。
loadDotEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const envSchema = z.object({
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3080),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).default(604800),
  IMPORT_MAX_FILE_BYTES: z.coerce.number().int().min(1024).default(10 * 1024 * 1024),
  IMPORT_MAX_NODES: z.coerce.number().int().min(1).default(100000),
  IMPORT_MAX_DEPTH: z.coerce.number().int().min(1).max(1024).default(256),
  IMPORT_JOB_TTL_SECONDS: z.coerce.number().int().min(300).default(86400),
  LINK_CHECK_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(10),
  LINK_CHECK_PER_HOST_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  LINK_CHECK_TIMEOUT_MS: z.coerce.number().int().min(100).max(120000).default(10000),
  LINK_CHECK_MAX_REDIRECTS: z.coerce.number().int().min(0).max(20).default(5),
  LINK_CHECK_MAX_RESPONSE_BYTES: z.coerce.number().int().min(0).default(65536),
  LINK_CHECK_ALLOWED_PORTS: z.string().default('80,443'),
  LINK_CHECK_ALLOWED_CIDRS: z.string().default(''),
  LINK_CHECK_HISTORY_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
})

export type AppEnv = z.infer<typeof envSchema>

/** 在服务启动边界一次性校验配置，避免请求到达后才暴露缺失密钥。 */
export function readEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`环境变量校验失败：${details}`)
  }
  if (result.data.SESSION_SECRET === result.data.CSRF_SECRET) {
    throw new Error('SESSION_SECRET 与 CSRF_SECRET 必须使用不同的随机值')
  }
  return result.data
}
