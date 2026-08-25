import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 生成 256 位随机令牌，适用于会话和 CSRF。 */
export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

/** 数据库只保存令牌摘要，原始令牌仅存在于客户端 Cookie。 */
export function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** 固定时间比较摘要，避免基于比较耗时推测令牌前缀。 */
export function safeHashEqual(expectedHash: string, rawValue: string): boolean {
  const actual = Buffer.from(tokenHash(rawValue), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
