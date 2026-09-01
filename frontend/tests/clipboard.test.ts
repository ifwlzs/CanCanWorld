import { describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '../src/utils/clipboard'

describe('剪贴板复制', () => {
  it('优先使用浏览器剪贴板 API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    await copyTextToClipboard('https://example.com', { writeText })
    expect(writeText).toHaveBeenCalledWith('https://example.com')
  })

  it('剪贴板 API 不可用时使用文本区域降级', async () => {
    const appendChild = vi.spyOn(document.body, 'appendChild')
    const removeChild = vi.spyOn(document.body, 'removeChild')
    // happy-dom 未实现 execCommand，测试中注入浏览器兼容接口。
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    const execCommand = vi.spyOn(document, 'execCommand')
    await copyTextToClipboard('https://example.com', null)
    expect(appendChild).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(removeChild).toHaveBeenCalled()
    appendChild.mockRestore()
    removeChild.mockRestore()
    execCommand.mockRestore()
  })
})
