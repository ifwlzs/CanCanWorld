import { describe, expect, it } from 'vitest'
import type { NavigationNode } from '@cancanworld/contracts'
import { exportBookmarkHtml } from '../src/services/bookmark-exporter.js'
import { parseBookmarkHtml } from '../src/parsers/bookmark-html.js'

/** 构造测试节点，验证特殊字符和 JavaScript 内容经过导出导入仍保持一致。 */
function node(input: Partial<NavigationNode> & Pick<NavigationNode, 'id' | 'nodeType' | 'title'>): NavigationNode {
  return {
    parentId: 1, url: null, description: null, iconUrl: null, sortKey: '1024', enabled: true,
    visibility: 'public', tags: [], updatedAt: new Date(0).toISOString(), ...input
  }
}

describe('Netscape HTML 导出', () => {
  it('保持目录、普通 URL 和 JavaScript 原文', () => {
    const script = `javascript:(function(){const x="<&";alert(x)})()`
    const html = exportBookmarkHtml([
      node({ id: 2, nodeType: 'folder', title: '工具 & 开发', children: [
        node({ id: 3, parentId: 2, nodeType: 'bookmark', title: '脚本 <测试>', url: script, bookmarkType: 'javascript' }),
        node({ id: 5, parentId: 2, nodeType: 'bookmark', title: '示例', url: 'https://example.com/?a=1&b=2', bookmarkType: 'url' })
      ] })
    ])
    const parsed = parseBookmarkHtml(html, { maxFileBytes: 1024 * 1024, maxNodes: 100, maxDepth: 10 })
    expect(parsed.nodes[0]?.title).toBe('工具 & 开发')
    expect(parsed.nodes[0]?.children?.[0]?.url).toBe(script)
    expect(parsed.nodes[0]?.children?.map((item) => item.type)).toEqual(['bookmark', 'bookmark'])
    expect(html).not.toContain('<HR>')
  })
})
