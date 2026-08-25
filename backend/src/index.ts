import { readEnv } from './config/env.js'
import { createLogger } from './config/logger.js'
import { createDatabase } from './db/client.js'
import { createApp } from './app.js'
import { CheckRepository } from './repositories/check-repository.js'
import { CheckWorker } from './jobs/check-worker.js'
import { FaviconRepository } from './repositories/favicon-repository.js'
import { FaviconWorker } from './jobs/favicon-worker.js'

const env = readEnv()
const logger = createLogger(env.LOG_LEVEL)
const { pool } = createDatabase(env)
const app = createApp({ env, pool, logger })
const checkRepository = new CheckRepository(pool)
const checkWorker = new CheckWorker(checkRepository, env, logger)
const faviconWorker = new FaviconWorker(new FaviconRepository(pool), env, logger)

/** 先成功绑定服务端口再启动 Worker，避免重复开发进程在端口失败前抢占数据库任务。 */
const server = Bun.serve({
  hostname: env.SERVER_HOST,
  port: env.SERVER_PORT,
  fetch: app.fetch
})
checkWorker.start()
faviconWorker.start()

// 定时器只负责创建任务，实际执行仍由带数据库租约的统一 Worker 完成。
const scheduleTimer = setInterval(async () => {
  try {
    if (!(await checkRepository.hasActiveJob())) await checkRepository.createJob()
  } catch (error) {
    logger.error({ error }, '创建定时检测任务失败')
  }
}, env.LINK_CHECK_INTERVAL_SECONDS * 1000)

logger.info({ hostname: server.hostname, port: server.port }, 'CanCanWorld 后端已启动')

/** 收到终止信号时停止接收请求并关闭数据库连接池。 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, '开始关闭服务')
  clearInterval(scheduleTimer)
  checkWorker.stop()
  faviconWorker.stop()
  server.stop()
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
