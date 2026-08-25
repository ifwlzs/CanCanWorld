import type { AppEnv } from '../config/env.js'
import type { AppLogger } from '../config/logger.js'
import { FaviconRepository } from '../repositories/favicon-repository.js'
import { FaviconFetcher } from '../services/favicon-fetcher.js'

/** favicon Worker 以持久化租约串行消费任务，并限制总体并发避免集中访问站点。 */
export class FaviconWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private readonly owner = `${process.pid}-${crypto.randomUUID()}`
  private readonly fetcher: FaviconFetcher

  constructor(private readonly repository: FaviconRepository, private readonly env: AppEnv, private readonly logger: AppLogger) {
    this.fetcher = new FaviconFetcher(env)
  }

  /** 启动固定间隔轮询；重复调用不会创建多份定时器。 */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), 2000)
    void this.poll()
  }

  /** 停止后续轮询，当前正在执行的请求由进程关闭流程自然收尾。 */
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** 单进程同一时间只执行一次轮询，数据库租约继续协调多个进程。 */
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const leaseMs = Math.max(this.env.LINK_CHECK_TIMEOUT_MS * 4, 60000)
      const jobId = await this.repository.claimNextJob(this.owner, leaseMs)
      if (jobId) await this.process(jobId, leaseMs)
    } catch (error) {
      this.logger.error({ error }, 'favicon 任务轮询失败')
    } finally {
      this.polling = false
    }
  }

  /** 按受控并发消费任务快照，单项失败只写入该项目并继续处理。 */
  private async process(jobId: string, leaseMs: number): Promise<void> {
    const items = await this.repository.loadPendingItems(jobId)
    const heartbeat = setInterval(() => void this.repository.renewLease(jobId, this.owner, leaseMs), Math.max(leaseMs / 3, 5000))
    let cursor = 0
    const runSlot = async (): Promise<void> => {
      while (cursor < items.length) {
        const item = items[cursor++]
        if (!item || await this.repository.isCancelled(jobId)) return
        if (!(await this.repository.markItemRunning(jobId, item.bookmarkId))) continue
        try {
          await this.repository.saveSuccess(jobId, item.bookmarkId, await this.fetcher.fetch(item.url))
        } catch (error) {
          await this.repository.saveFailure(jobId, item.bookmarkId, error)
        }
      }
    }
    try {
      const concurrency = Math.min(5, this.env.LINK_CHECK_CONCURRENCY, items.length || 1)
      await Promise.all(Array.from({ length: concurrency }, () => runSlot()))
      await this.repository.finishJob(jobId)
      this.logger.info({ jobId, itemCount: items.length }, 'favicon 任务完成')
    } finally {
      clearInterval(heartbeat)
    }
  }
}
