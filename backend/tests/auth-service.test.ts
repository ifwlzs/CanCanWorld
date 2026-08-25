import { describe, expect, it } from 'vitest'
import { validateCredentials } from '../src/services/auth-service.js'

describe('管理员凭据策略', () => {
  it('接受恰好 6 位的密码', () => {
    expect(() => validateCredentials('admin', 'Ab12!x')).not.toThrow()
  })

  it('拒绝少于 6 位的密码', () => {
    expect(() => validateCredentials('admin', 'Ab12!')).toThrow('管理员密码长度必须为 6 到 1024 个字符')
  })
})
