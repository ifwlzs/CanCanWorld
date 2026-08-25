import { createHash } from 'node:crypto'

/** JavaScript 书签必须逐字保留，因此只对普通 URL 做可逆的基础规范化。 */
export function normalizeUrl(value: string): string {
  if (value.trimStart().toLowerCase().startsWith('javascript:')) return value
  try {
    const parsed = new URL(value.trim())
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) parsed.port = ''
    return parsed.toString()
  } catch {
    return value.trim()
  }
}

/** URL 哈希允许索引 LONGTEXT，同时不把重复 URL 设为禁止性约束。 */
export function hashUrl(value: string): string {
  return createHash('sha256').update(normalizeUrl(value)).digest('hex')
}

/** 只有明确的 JavaScript 协议才属于 JavaScript 书签。 */
export function getBookmarkType(value: string): 'url' | 'javascript' {
  return value.trimStart().toLowerCase().startsWith('javascript:') ? 'javascript' : 'url'
}
