import { createHash } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import type { AppEnv } from '../config/env.js'
import { createPinnedLookup } from './link-checker.js'
import { UrlPolicy, type ResolvedTarget } from './url-policy.js'

const MAX_ICON_BYTES = 256 * 1024

export interface FaviconResult {
  content: Buffer
  contentHash: string
  mimeType: string
  sourceUrl: string
}

/** favicon 获取器复用链接检测的 SSRF 策略，并只接受经过二进制特征确认的图片。 */
export class FaviconFetcher {
  private readonly policy: UrlPolicy

  constructor(private readonly env: AppEnv) {
    this.policy = new UrlPolicy(env)
  }

  /** 第一版使用同源标准 favicon 路径，失败只影响任务项目，不影响书签本身。 */
  async fetch(bookmarkUrl: string): Promise<FaviconResult> {
    const pageUrl = new URL(bookmarkUrl)
    const iconUrl = new URL('/favicon.ico', pageUrl).toString()
    const response = await this.requestWithRedirects(iconUrl, 0)
    const mimeType = detectImageType(response.content)
    if (!mimeType) throw new Error('响应内容不是支持的 favicon 图片')
    return {
      content: response.content,
      contentHash: createHash('sha256').update(response.content).digest('hex'),
      mimeType,
      sourceUrl: response.finalUrl
    }
  }

  /** 每次重定向都重新解析并校验目标，避免重定向绕过地址策略。 */
  private async requestWithRedirects(rawUrl: string, depth: number): Promise<{ content: Buffer; finalUrl: string }> {
    if (depth > this.env.LINK_CHECK_MAX_REDIRECTS) throw new Error('favicon 重定向次数超过限制')
    const target = await this.policy.resolve(rawUrl)
    const response = await requestIcon(target, this.env.LINK_CHECK_TIMEOUT_MS)
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      return this.requestWithRedirects(new URL(response.location, target.url).toString(), depth + 1)
    }
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`favicon HTTP ${response.statusCode}`)
    if (response.content.length === 0) throw new Error('favicon 响应为空')
    return { content: response.content, finalUrl: target.url.toString() }
  }
}

/** 单次图标请求限制响应体大小，并固定连接到策略已验证的地址。 */
function requestIcon(target: ResolvedTarget, timeoutMs: number): Promise<{ statusCode: number; location?: string; content: Buffer }> {
  const transport = target.url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.request(target.url, {
      method: 'GET',
      headers: { 'user-agent': 'CanCanWorld-FaviconFetcher/0.1', accept: 'image/*', connection: 'close' },
      timeout: timeoutMs,
      lookup: createPinnedLookup(target)
    }, (response) => {
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > MAX_ICON_BYTES) {
          response.destroy(new Error(`favicon 超过 ${MAX_ICON_BYTES} 字节限制`))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => resolve({
        statusCode: response.statusCode ?? 0,
        ...(response.headers.location ? { location: response.headers.location } : {}),
        content: Buffer.concat(chunks)
      }))
    })
    request.on('timeout', () => request.destroy(new Error('favicon 请求超时')))
    request.on('error', reject)
    request.end()
  })
}

/** 只按文件签名字节接受常见浏览器图标格式，不信任远端 Content-Type。 */
export function detectImageType(content: Buffer): string | null {
  if (content.length >= 4 && content[0] === 0x00 && content[1] === 0x00 && content[2] === 0x01 && content[3] === 0x00) return 'image/x-icon'
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (content.length >= 6 && ['GIF87a', 'GIF89a'].includes(content.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg'
  if (content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}
