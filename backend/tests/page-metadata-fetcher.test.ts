import { describe, expect, it } from 'vitest'
import { decodeHtml, extractPageMetadata, resolveCharset } from '../src/services/page-metadata-fetcher.js'

/** 构造最小 HTML 文档，避免每个用例重复完整骨架。 */
function html(head: string): string {
  return `<!DOCTYPE html><html><head>${head}</head><body><p>正文</p></body></html>`
}

describe('页面元数据提取', () => {
  it('标题优先使用 og:title，其次 twitter:title，最后 title 标签', () => {
    expect(extractPageMetadata(html(`
      <title>标签标题</title>
      <meta name="twitter:title" content="推特标题">
      <meta property="og:title" content="OG 标题">
    `)).title).toBe('OG 标题')

    expect(extractPageMetadata(html(`
      <title>标签标题</title>
      <meta name="twitter:title" content="推特标题">
    `)).title).toBe('推特标题')

    expect(extractPageMetadata(html('<title>标签标题</title>')).title).toBe('标签标题')
  })

  it('描述优先使用 og:description，其次 twitter:description，最后 meta description', () => {
    expect(extractPageMetadata(html(`
      <meta name="description" content="普通描述">
      <meta name="twitter:description" content="推特描述">
      <meta property="og:description" content="OG 描述">
    `)).description).toBe('OG 描述')

    expect(extractPageMetadata(html(`
      <meta name="description" content="普通描述">
      <meta name="twitter:description" content="推特描述">
    `)).description).toBe('推特描述')

    expect(extractPageMetadata(html('<meta name="description" content="普通描述">')).description).toBe('普通描述')
  })

  it('缺失元数据时返回 null 而不是空字符串', () => {
    expect(extractPageMetadata(html(''))).toEqual({ title: null, description: null })
    // 只有空白内容的字段等同于缺失，避免把空串写进表单。
    expect(extractPageMetadata(html('<title>   </title><meta name="description" content="  ">'))).toEqual({ title: null, description: null })
  })

  it('折叠换行与连续空白，避免多行标题破坏表单展示', () => {
    expect(extractPageMetadata(html('<title>\n  多行\t  标题  \n</title>')).title).toBe('多行 标题')
  })

  it('解码 HTML 实体，保证展示文本与页面一致', () => {
    expect(extractPageMetadata(html('<title>A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;</title>')).title).toBe('A & B <C> "D" \'E\'')
    expect(extractPageMetadata(html('<meta name="description" content="&#20013;&#25991; &nbsp; 描述">')).description).toBe('中文 描述')
  })

  it('按契约上限截断超长标题和描述', () => {
    const result = extractPageMetadata(html(`<title>${'标'.repeat(600)}</title><meta name="description" content="${'述'.repeat(11000)}">`))
    expect(result.title).toHaveLength(512)
    expect(result.description).toHaveLength(10_000)
  })

  it('忽略 body 内的 title 元素，只读取 head 中的元数据', () => {
    const document = '<!DOCTYPE html><html><head><title>真实标题</title></head><body><svg><title>图形标题</title></svg></body></html>'
    expect(extractPageMetadata(document).title).toBe('真实标题')
  })

  it('大小写和属性顺序不影响识别', () => {
    expect(extractPageMetadata(html('<META PROPERTY="OG:TITLE" CONTENT="大写 OG">')).title).toBe('大写 OG')
    expect(extractPageMetadata(html('<meta content="顺序颠倒" property="og:description">')).description).toBe('顺序颠倒')
  })

  it('截断的 HTML 仍能提取已出现的元数据', () => {
    // 响应体达到上限会被截断，head 位于文档开头因此元数据通常已完整。
    expect(extractPageMetadata('<html><head><title>截断前标题</title><meta name="desc').title).toBe('截断前标题')
  })
})

describe('页面编码判定', () => {
  it('优先使用 Content-Type 中的 charset', () => {
    expect(resolveCharset('text/html; charset=gbk', Buffer.from(''))).toBe('gbk')
    expect(resolveCharset('text/html;charset="GB2312"', Buffer.from(''))).toBe('gb2312')
  })

  it('缺少响应头 charset 时回退到 HTML meta 声明', () => {
    expect(resolveCharset('text/html', Buffer.from('<html><head><meta charset="GBK">'))).toBe('gbk')
    expect(resolveCharset('text/html', Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=big5">'))).toBe('big5')
  })

  it('两者都缺失时默认 utf-8', () => {
    expect(resolveCharset('text/html', Buffer.from('<html><head><title>x</title>'))).toBe('utf-8')
    expect(resolveCharset(undefined, Buffer.from(''))).toBe('utf-8')
  })

  it('按判定编码解码 GBK 页面，避免中文站点乱码', () => {
    // GBK 编码的“中文标题”字节序列，验证非 UTF-8 页面能被正确还原。
    const gbkBytes = Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xb1, 0xea, 0xcc, 0xe2])
    expect(decodeHtml(gbkBytes, 'gbk')).toBe('中文标题')
  })

  it('未知编码回退为 utf-8 解码而不是抛错', () => {
    expect(decodeHtml(Buffer.from('标题', 'utf8'), 'x-unknown-charset')).toBe('标题')
  })
})
