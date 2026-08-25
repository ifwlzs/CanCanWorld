import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { UrlPolicy } from '../src/services/url-policy.js'

/** 构造策略测试所需的最小完整配置。 */
function env(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    DATABASE_HOST: 'localhost', DATABASE_PORT: 3306, DATABASE_NAME: 'test', DATABASE_USER: 'test', DATABASE_PASSWORD: 'test', DATABASE_POOL_SIZE: 1,
    SERVER_HOST: '127.0.0.1', SERVER_PORT: 3080, FRONTEND_ORIGIN: 'http://localhost:5173', SESSION_SECRET: 'a'.repeat(32), CSRF_SECRET: 'b'.repeat(32), SESSION_TTL_SECONDS: 3600,
    IMPORT_MAX_FILE_BYTES: 1024, IMPORT_MAX_NODES: 100, IMPORT_MAX_DEPTH: 10, IMPORT_JOB_TTL_SECONDS: 3600,
    LINK_CHECK_INTERVAL_SECONDS: 1800, LINK_CHECK_CONCURRENCY: 2, LINK_CHECK_PER_HOST_CONCURRENCY: 1, LINK_CHECK_TIMEOUT_MS: 1000,
    LINK_CHECK_MAX_REDIRECTS: 5, LINK_CHECK_MAX_RESPONSE_BYTES: 1024, LINK_CHECK_ALLOWED_PORTS: '80,443', LINK_CHECK_ALLOWED_CIDRS: '', LINK_CHECK_HISTORY_RETENTION_DAYS: 30,
    LOG_LEVEL: 'info', NODE_ENV: 'test', ...overrides
  }
}

describe('链接检测 URL 策略', () => {
  it('拒绝环回和内网地址', async () => {
    const policy = new UrlPolicy(env())
    await expect(policy.resolve('http://127.0.0.1')).rejects.toThrow('受限地址')
    await expect(policy.resolve('http://192.168.1.2')).rejects.toThrow('受限地址')
    await expect(policy.resolve('http://[::1]')).rejects.toThrow('受限地址')
  })

  it('只通过明确 CIDR 白名单放行内网例外', async () => {
    const policy = new UrlPolicy(env({ LINK_CHECK_ALLOWED_CIDRS: '192.168.2.0/24' }))
    await expect(policy.resolve('http://192.168.2.190')).resolves.toMatchObject({ address: '192.168.2.190', family: 4 })
    await expect(policy.resolve('http://192.168.3.1')).rejects.toThrow('受限地址')
  })

  it('拒绝协议、凭据和端口越界', async () => {
    const policy = new UrlPolicy(env())
    await expect(policy.resolve('file:///etc/passwd')).rejects.toThrow('只支持 HTTP')
    await expect(policy.resolve('http://user:pass@example.com')).rejects.toThrow('用户凭据')
    await expect(policy.resolve('http://8.8.8.8:8080')).rejects.toThrow('端口')
  })
})
