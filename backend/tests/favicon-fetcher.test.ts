import { describe, expect, it } from 'vitest'
import { detectImageType } from '../src/services/favicon-fetcher.js'

describe('favicon 图片格式识别', () => {
  it('识别 ICO、PNG、GIF、JPEG 和 WebP 文件签名', () => {
    expect(detectImageType(Buffer.from([0x00, 0x00, 0x01, 0x00]))).toBe('image/x-icon')
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(detectImageType(Buffer.from('GIF89a', 'ascii'))).toBe('image/gif')
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBe('image/jpeg')
    expect(detectImageType(Buffer.from('RIFF1234WEBP', 'ascii'))).toBe('image/webp')
  })

  it('拒绝 HTML 和无法识别的响应内容', () => {
    expect(detectImageType(Buffer.from('<html>not an icon</html>'))).toBeNull()
    expect(detectImageType(Buffer.alloc(0))).toBeNull()
  })
})
