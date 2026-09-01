import { pageMetadataInputSchema } from '@cancanworld/contracts'
import { describe, expect, it } from 'vitest'

describe('页面元数据契约', () => {
  it('接受合法 HTTP 与 HTTPS 地址并去除首尾空格', () => {
    expect(pageMetadataInputSchema.parse({ url: '  https://example.com/docs  ' })).toEqual({ url: 'https://example.com/docs' })
    expect(pageMetadataInputSchema.parse({ url: 'http://example.com' }).url).toBe('http://example.com')
  })

  it('拒绝空地址、缺失字段和超长地址', () => {
    expect(pageMetadataInputSchema.safeParse({ url: '' }).success).toBe(false)
    expect(pageMetadataInputSchema.safeParse({ url: '   ' }).success).toBe(false)
    expect(pageMetadataInputSchema.safeParse({}).success).toBe(false)
    expect(pageMetadataInputSchema.safeParse({ url: `https://example.com/${'a'.repeat(4096)}` }).success).toBe(false)
  })

  it('拒绝非 HTTP 协议，避免抓取入口触及本地文件或其他协议', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com', 'data:text/html,x']) {
      expect(pageMetadataInputSchema.safeParse({ url }).success).toBe(false)
    }
  })
})
