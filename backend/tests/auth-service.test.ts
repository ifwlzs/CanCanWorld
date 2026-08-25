import { describe, expect, it } from 'vitest'
import { hashPassword, validateCredentials, verifyPassword } from '../src/services/auth-service.js'

describe('管理员凭据策略', () => {
  it('接受恰好 6 位的密码', () => {
    expect(() => validateCredentials('admin', 'Ab12!x')).not.toThrow()
  })

  it('拒绝少于 6 位的密码', () => {
    expect(() => validateCredentials('admin', 'Ab12!')).toThrow('管理员密码长度必须为 6 到 1024 个字符')
  })

  it.skipIf(typeof globalThis.Bun === 'undefined')('Bun Argon2id 哈希可验证且拒绝错误密码', async () => {
    const passwordHash = await hashPassword('Deploy-Test-123!')
    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$/)
    await expect(verifyPassword('Deploy-Test-123!', passwordHash)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', passwordHash)).resolves.toBe(false)
  })

  it.skipIf(typeof globalThis.Bun === 'undefined')('兼容升级前保存的标准 Argon2id PHC 哈希', async () => {
    const legacyHash = '$argon2id$v=19$m=19456,t=2,p=1$Rnj+DVLcBdkZYntGSQCJrvDioW1YfBiqWLhBCQy1vv0$bJOMLIwUVIvwrKlNDBB8g4h6VtpyWwVaYkt8q2LWvs4'
    await expect(verifyPassword('Legacy-Test-123!', legacyHash)).resolves.toBe(true)
  })
})
