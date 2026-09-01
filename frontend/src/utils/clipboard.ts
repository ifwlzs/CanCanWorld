/** 可注入的剪贴板写入接口，便于在不同浏览器能力下复用和测试。 */
export interface ClipboardWriter {
  writeText(value: string): Promise<void>
}

/**
 * 写入文本到系统剪贴板；优先使用异步 API，普通 HTTP 或旧浏览器则退回隐藏文本框。
 * @param value 需要复制的原始文本
 * @param writer 可选的剪贴板实现，未传入时读取当前浏览器能力
 */
export async function copyTextToClipboard(value: string, writer?: ClipboardWriter | null): Promise<void> {
  const target = writer === undefined
    ? (typeof navigator !== 'undefined' && navigator.clipboard ? navigator.clipboard : null)
    : writer
  if (target) {
    await target.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('浏览器拒绝复制操作')
  } finally {
    document.body.removeChild(textarea)
  }
}
