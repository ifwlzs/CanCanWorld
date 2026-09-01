import http from 'node:http'
import https from 'node:https'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import type { PageMetadataResult } from '@cancanworld/contracts'
import type { AppEnv } from '../config/env.js'
import { AppError } from '../errors.js'
import { createPinnedLookup } from './link-checker.js'
import { UrlPolicy, type ResolvedTarget } from './url-policy.js'

type ElementNode = DefaultTreeAdapterMap['element']
type ChildNode = DefaultTreeAdapterMap['childNode']
type ParentNode = DefaultTreeAdapterMap['parentNode']

/** 与 createNodeSchema 的字段上限保持一致，抓取结果不应超出可保存范围。 */
const MAX_TITLE_LENGTH = 512
const MAX_DESCRIPTION_LENGTH = 10_000

/** 标题与描述的候选来源按优先级排列，社交媒体标签通常比原始标签更准确。 */
const TITLE_SOURCES = ['og:title', 'twitter:title'] as const
const DESCRIPTION_SOURCES = ['og:description', 'twitter:description', 'description'] as const

export interface PageMetadata {
  title: string | null
  description: string | null
}

/**
 * 页面元数据抓取器复用链接检测的地址策略与固定 DNS 回调，不新开网络出口。
 * 抓取地址来自用户输入，因此每次请求和每次重定向都必须重新经过策略校验。
 */
export class PageMetadataFetcher {
  private readonly policy: UrlPolicy

  constructor(private readonly env: AppEnv) {
    this.policy = new UrlPolicy(env)
  }

  /** 抓取目标页面并提取标题与描述；远端内容只作为文本使用，不参与渲染。 */
  async fetch(rawUrl: string): Promise<PageMetadataResult> {
    const response = await this.requestWithRedirects(rawUrl, 0)
    const charset = resolveCharset(response.contentType, response.content)
    const metadata = extractPageMetadata(decodeHtml(response.content, charset))
    return { ...metadata, finalUrl: response.finalUrl }
  }

  /** 每次重定向都重新解析并校验目标，避免重定向绕过地址策略。 */
  private async requestWithRedirects(rawUrl: string, depth: number): Promise<FetchedPage> {
    if (depth > this.env.LINK_CHECK_MAX_REDIRECTS) throw new AppError(422, 42214, '页面重定向次数超过限制')
    const target = await this.policy.resolve(rawUrl)
    const response = await requestPage(target, this.env.LINK_CHECK_TIMEOUT_MS, this.env.PAGE_METADATA_MAX_RESPONSE_BYTES)
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      return this.requestWithRedirects(new URL(response.location, target.url).toString(), depth + 1)
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new AppError(422, 42215, `目标页面返回 HTTP ${response.statusCode}`)
    }
    // 只解析 HTML 类响应；图片或下载附件不含可用元数据，继续解析只会浪费资源。
    if (!isHtmlContentType(response.contentType)) throw new AppError(422, 42216, '目标地址不是 HTML 页面')
    if (response.content.length === 0) throw new AppError(422, 42217, '目标页面响应为空')
    return { content: response.content, contentType: response.contentType, finalUrl: target.url.toString() }
  }
}

interface FetchedPage {
  content: Buffer
  contentType: string | undefined
  finalUrl: string
}

/**
 * 从 HTML 提取标题与描述，容忍截断文档。
 * 响应体达到上限会被截断，而 head 位于文档开头，因此元数据通常已经完整。
 */
export function extractPageMetadata(source: string): PageMetadata {
  const document = parse(source)
  const head = findFirstElement(document, 'head')
  const scope = head ?? document
  const meta = collectMetaContent(scope)

  const ogTitle = firstAvailable(meta, TITLE_SOURCES)
  // title 元素只在 head 内查找，避免读到 body 中 svg 等元素的同名标签。
  const documentTitle = normalizeText(textContent(findFirstElement(scope, 'title')))
  return {
    title: truncate(ogTitle ?? documentTitle, MAX_TITLE_LENGTH),
    description: truncate(firstAvailable(meta, DESCRIPTION_SOURCES), MAX_DESCRIPTION_LENGTH)
  }
}

/** 判定页面编码：响应头 charset 优先，其次 HTML 声明，最后默认 utf-8。 */
export function resolveCharset(contentType: string | undefined, content: Buffer): string {
  const fromHeader = contentType?.match(/charset\s*=\s*"?([\w-]+)"?/i)?.[1]
  if (fromHeader) return fromHeader.toLowerCase()
  // 编码声明必须出现在文档开头，只扫描前若干字节即可，且此时尚不知编码故按 latin1 读取字节。
  const prefix = content.subarray(0, 2048).toString('latin1')
  const fromMeta = prefix.match(/<meta[^>]+charset\s*=\s*"?([\w-]+)"?/i)?.[1]
  return fromMeta ? fromMeta.toLowerCase() : 'utf-8'
}

/** 按判定编码解码；未知编码回退 utf-8，抓取失败不应因编码名称而抛错。 */
export function decodeHtml(content: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(content)
  } catch {
    return new TextDecoder('utf-8').decode(content)
  }
}

/** 解码 HTML 实体，使写入表单的文本与页面展示一致。 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return safeCodePoint(Number.parseInt(entity.slice(2), 16)) ?? match
    }
    if (entity.startsWith('#')) {
      return safeCodePoint(Number.parseInt(entity.slice(1), 10)) ?? match
    }
    const named: Record<string, string> = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·',
      hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™'
    }
    return named[entity.toLowerCase()] ?? match
  })
}

/** 拒绝非法码位，避免把无效字符写入表单。 */
function safeCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null
  try {
    return String.fromCodePoint(code)
  } catch {
    return null
  }
}

/** 汇总 head 内的 meta 内容；同名标签保留首次出现的值。 */
function collectMetaContent(scope: ParentNode): Map<string, string> {
  const result = new Map<string, string>()
  for (const element of collectElements(scope, 'meta')) {
    const attributes = new Map(element.attrs.map((attribute) => [attribute.name.toLowerCase(), attribute.value]))
    // property 用于 Open Graph，name 用于 twitter 与标准 description。
    const key = (attributes.get('property') ?? attributes.get('name'))?.trim().toLowerCase()
    const content = attributes.get('content')
    if (!key || content === undefined) continue
    if (!result.has(key)) result.set(key, content)
  }
  return result
}

/** 按优先级返回首个有实际内容的候选值。 */
function firstAvailable(meta: Map<string, string>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = normalizeText(meta.get(key))
    if (value) return value
  }
  return null
}

/** 折叠空白并解码实体；纯空白视为缺失，避免把空串写进表单。 */
function normalizeText(value: string | undefined): string | null {
  if (value === undefined) return null
  const decoded = decodeEntities(value).replace(/\s+/g, ' ').trim()
  return decoded.length > 0 ? decoded : null
}

/** 按契约上限截断，保证抓取结果可直接保存。 */
function truncate(value: string | null, limit: number): string | null {
  if (value === null) return null
  return value.length > limit ? value.slice(0, limit) : value
}

/** 只接受 HTML 类响应；缺少 Content-Type 时按 HTML 尝试解析。 */
function isHtmlContentType(contentType: string | undefined): boolean {
  if (!contentType) return true
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return mime === '' || mime === 'text/html' || mime === 'application/xhtml+xml'
}

function isElement(node: ChildNode, tagName: string): node is ElementNode {
  return 'tagName' in node && node.tagName === tagName
}

/** 只有具备 childNodes 的节点可以继续下探，注释与文本节点没有子树。 */
function asParent(node: ChildNode): ParentNode | null {
  return 'childNodes' in node ? (node as ParentNode) : null
}

/** 深度优先查找首个匹配元素。 */
function findFirstElement(node: ParentNode, tagName: string): ElementNode | null {
  for (const child of node.childNodes) {
    if (isElement(child, tagName)) return child
    const parent = asParent(child)
    if (parent) {
      const found = findFirstElement(parent, tagName)
      if (found) return found
    }
  }
  return null
}

/** 收集作用域内全部匹配元素，保持文档顺序。 */
function collectElements(node: ParentNode, tagName: string): ElementNode[] {
  const result: ElementNode[] = []
  for (const child of node.childNodes) {
    if (isElement(child, tagName)) result.push(child)
    const parent = asParent(child)
    if (parent) result.push(...collectElements(parent, tagName))
  }
  return result
}

/** 拼接元素下的全部文本节点。 */
function textContent(node: ElementNode | null): string | undefined {
  if (!node) return undefined
  let text = ''
  for (const child of node.childNodes) {
    if (child.nodeName === '#text' && 'value' in child) {
      text += child.value
      continue
    }
    const parent = asParent(child)
    if (parent) text += collectText(parent)
  }
  return text
}

/** 递归拼接子树文本，供 title 等元素内嵌其他节点时使用。 */
function collectText(node: ParentNode): string {
  let text = ''
  for (const child of node.childNodes) {
    if (child.nodeName === '#text' && 'value' in child) {
      text += child.value
      continue
    }
    const parent = asParent(child)
    if (parent) text += collectText(parent)
  }
  return text
}

/** 单次页面请求限制响应体大小，并固定连接到策略已验证的地址。 */
function requestPage(target: ResolvedTarget, timeoutMs: number, maxBytes: number): Promise<{ statusCode: number; location?: string; contentType?: string; content: Buffer }> {
  const transport = target.url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = transport.request(target.url, {
      method: 'GET',
      headers: {
        'user-agent': 'CanCanWorld-PageMetadataFetcher/0.1',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        connection: 'close'
      },
      timeout: timeoutMs,
      lookup: createPinnedLookup(target)
    }, (response) => {
      const chunks: Buffer[] = []
      let bytes = 0
      let settled = false
      const contentType = typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : undefined
      const finish = (): void => {
        if (settled) return
        settled = true
        resolve({
          statusCode: response.statusCode ?? 0,
          ...(response.headers.location ? { location: response.headers.location } : {}),
          ...(contentType ? { contentType } : {}),
          content: Buffer.concat(chunks)
        })
      }
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > maxBytes) {
          // 达到上限即截断并使用已收到的内容，head 通常已完整，无需读完整页。
          chunks.push(chunk)
          response.destroy()
          finish()
          return
        }
        chunks.push(chunk)
      })
      response.on('error', () => finish())
      response.on('close', finish)
      response.on('end', finish)
    })
    request.on('timeout', () => request.destroy(new AppError(422, 42218, '目标页面请求超时')))
    request.on('error', reject)
    request.end()
  })
}
