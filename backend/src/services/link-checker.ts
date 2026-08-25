import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import type { AppEnv } from '../config/env.js'
import { AppError } from '../errors.js'
import { UrlPolicy, type ResolvedTarget } from './url-policy.js'

export type LinkStatus = 'UP' | 'REDIRECT' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'TIMEOUT' | 'DNS_ERROR' | 'CONNECTION_ERROR' | 'SSL_ERROR' | 'UNKNOWN_ERROR'

export interface LinkCheckResult {
  status: LinkStatus
  httpStatus: number | null
  responseTime: number
  errorMessage: string | null
  finalUrl: string
}

/** 链接检测器逐跳执行策略校验，并通过自定义 lookup 固定到已验证地址。 */
export class LinkChecker {
  private readonly policy: UrlPolicy

  constructor(private readonly env: AppEnv) {
    this.policy = new UrlPolicy(env)
  }

  async check(rawUrl: string): Promise<LinkCheckResult> {
    const startedAt = performance.now()
    try {
      const response = await this.requestWithRedirects(rawUrl, 'HEAD', 0, false)
      const finalResponse = (response.statusCode === 405 || response.statusCode === 501)
        ? await this.requestWithRedirects(rawUrl, 'GET', 0, false)
        : response
      return {
        status: classifyStatus(finalResponse.statusCode, finalResponse.redirected),
        httpStatus: finalResponse.statusCode,
        responseTime: Math.round(performance.now() - startedAt),
        errorMessage: null,
        finalUrl: finalResponse.finalUrl
      }
    } catch (error) {
      return {
        status: classifyError(error),
        httpStatus: null,
        responseTime: Math.round(performance.now() - startedAt),
        errorMessage: sanitizeError(error),
        finalUrl: rawUrl
      }
    }
  }

  private async requestWithRedirects(rawUrl: string, method: 'HEAD' | 'GET', depth: number, redirected: boolean): Promise<{ statusCode: number; finalUrl: string; redirected: boolean }> {
    if (depth > this.env.LINK_CHECK_MAX_REDIRECTS) throw new Error('REDIRECT_LIMIT: 重定向次数超过限制')
    const target = await this.policy.resolve(rawUrl)
    const response = await requestOnce(target, method, this.env.LINK_CHECK_TIMEOUT_MS, this.env.LINK_CHECK_MAX_RESPONSE_BYTES)
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      const nextUrl = new URL(response.location, target.url).toString()
      return this.requestWithRedirects(nextUrl, method, depth + 1, true)
    }
    return { statusCode: response.statusCode, finalUrl: target.url.toString(), redirected }
  }
}

/** 单次请求的 DNS lookup 忽略后续系统解析，始终连接策略已验证的地址。 */
function requestOnce(target: ResolvedTarget, method: 'HEAD' | 'GET', timeoutMs: number, maxBytes: number): Promise<{ statusCode: number; location?: string }> {
  const transport = target.url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.request(target.url, {
      method,
      headers: { 'user-agent': 'CanCanWorld-LinkChecker/0.1', accept: '*/*', connection: 'close' },
      timeout: timeoutMs,
      lookup: createPinnedLookup(target)
    }, (response) => {
      let bytes = 0
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        resolve({ statusCode: response.statusCode ?? 0, ...(response.headers.location ? { location: response.headers.location } : {}) })
      }
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > maxBytes) {
          finish()
          response.destroy()
        }
      })
      response.on('error', (error) => settled ? undefined : reject(error))
      response.on('end', finish)
      if (method === 'HEAD') response.resume()
    })
    request.on('timeout', () => request.destroy(new Error('TIMEOUT: 请求超时')))
    request.on('error', reject)
    request.end()
  })
}

/**
 * 将连接固定到安全策略已经验证的 IP，同时兼容 Node 24/Bun 请求的地址数组模式。
 * options.all 为 true 时必须返回 LookupAddress[]；返回单个字符串会被网络层解析成 undefined。
 */
export function createPinnedLookup(target: ResolvedTarget): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: target.address, family: target.family }])
      return
    }
    callback(null, target.address, target.family)
  }
}

/** HTTP 状态按产品展示语义归一化，发生跳转时保留 REDIRECT 状态。 */
function classifyStatus(statusCode: number, redirected: boolean): LinkStatus {
  if (redirected || (statusCode >= 300 && statusCode < 400)) return 'REDIRECT'
  if (statusCode >= 200 && statusCode < 300) return 'UP'
  if (statusCode === 401) return 'UNAUTHORIZED'
  if (statusCode === 403) return 'FORBIDDEN'
  if (statusCode === 404) return 'NOT_FOUND'
  return 'UNKNOWN_ERROR'
}

/** 网络错误只记录稳定分类和清理后的原因，不泄露请求凭据。 */
function classifyError(error: unknown): LinkStatus {
  if (error instanceof AppError && error.code === 42213) return 'DNS_ERROR'
  const code = error instanceof Error && 'code' in error ? String((error as Error & { code?: string }).code) : ''
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('TIMEOUT') || code === 'ETIMEDOUT') return 'TIMEOUT'
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DNS_ERROR'
  if (code.startsWith('ERR_TLS') || code.includes('CERT')) return 'SSL_ERROR'
  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return 'CONNECTION_ERROR'
  return 'UNKNOWN_ERROR'
}

/** 错误文本限制长度，并移除 URL 用户信息形式的潜在凭据。 */
function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\/\/[^/@\s]+@/g, '//[REDACTED]@').slice(0, 2048)
}
