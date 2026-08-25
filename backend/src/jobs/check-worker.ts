import type { AppEnv } from '../config/env.js'
import type { AppLogger } from '../config/logger.js'
import { CheckRepository } from '../repositories/check-repository.js'
import { LinkChecker } from '../services/link-checker.js'

/** 单进程执行器以数据库租约协调任务；并发槽位通过共享索引分配。 */
export class CheckWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private readonly owner = `${process.pid}-${crypto.randomUUID()}`
  private readonly checker: LinkChecker
  private readonly hostSlots = new Map<string, { active: number; waiting: Array<() => void> }>()

  constructor(private readonly repository: CheckRepository, private readonly env: AppEnv, private readonly logger: AppLogger) {
    this.checker = new LinkChecker(env)
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), 2000)
    void this.poll()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** 同一进程仅允许一个轮询周期运行，数据库租约负责跨进程互斥。 */
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const jobId = await this.repository.claimNextJob(this.owner, Math.max(this.env.LINK_CHECK_TIMEOUT_MS * 4, 60000))
      if (jobId) await this.process(jobId)
    } catch (error) {
      this.logger.error({ error }, '检测任务轮询失败')
    } finally {
      this.polling = false
    }
  }

  private async process(jobId: string): Promise<void> {
    const items = await this.repository.loadPendingItems(jobId)
    const leaseMs = Math.max(this.env.LINK_CHECK_TIMEOUT_MS * 4, 60000)
    const heartbeat = setInterval(() => void this.repository.renewLease(jobId, this.owner, leaseMs), Math.max(leaseMs / 3, 5000))
    let cursor = 0
    const runSlot = async (): Promise<void> => {
      while (cursor < items.length) {
        const item = items[cursor++]
        if (!item || await this.repository.isCancelled(jobId)) return
        if (!(await this.repository.markItemRunning(jobId, item.bookmarkId))) continue
        const result = await this.withHostSlot(item.url, () => this.checker.check(item.url))
        await this.repository.saveResult(jobId, item.bookmarkId, result)
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(this.env.LINK_CHECK_CONCURRENCY, items.length || 1) }, () => runSlot()))
      await this.repository.finishJob(jobId)
      this.logger.info({ jobId, itemCount: items.length }, '检测任务完成')
    } finally {
      clearInterval(heartbeat)
    }
  }

  /** 每个主机使用独立信号量，避免全局并发槽同时打向同一网站。 */
  private async withHostSlot<T>(rawUrl: string, action: () => Promise<T>): Promise<T> {
    let host = rawUrl
    try {
      host = new URL(rawUrl).hostname.toLowerCase()
    } catch {
      // 无效 URL 仍进入独立键，实际错误由 LinkChecker 归类。
    }
    await this.acquireHost(host)
    try {
      return await action()
    } finally {
      this.releaseHost(host)
    }
  }

  private async acquireHost(host: string): Promise<void> {
    const state = this.hostSlots.get(host) ?? { active: 0, waiting: [] }
    this.hostSlots.set(host, state)
    if (state.active < this.env.LINK_CHECK_PER_HOST_CONCURRENCY) {
      state.active++
      return
    }
    await new Promise<void>((resolve) => state.waiting.push(resolve))
  }

  private releaseHost(host: string): void {
    const state = this.hostSlots.get(host)
    if (!state) return
    state.active--
    const next = state.waiting.shift()
    if (next) {
      state.active++
      next()
    }
    else if (state.active === 0) this.hostSlots.delete(host)
  }
}
