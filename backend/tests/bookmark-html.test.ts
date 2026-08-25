import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanGroupTitle, normalizeGroups, parseBookmarkHtml } from '../src/parsers/bookmark-html.js'
import type { ImportStats } from '@cancanworld/contracts'

const limits = { maxFileBytes: 10 * 1024 * 1024, maxNodes: 100000, maxDepth: 256 }

/** 创建空统计供纯规范化单元测试使用。 */
function emptyStats(): ImportStats {
  return { sourceFolders: 0, generatedFolders: 0, bookmarks: 0, javascriptBookmarks: 0, separators: 0, sourceSeparatorNodes: 0, failed: 0 }
}

describe('浏览器书签 HTML 解析', () => {
  it('区分 JavaScript 和带标题分组，并忽略纯视觉横线', () => {
    const html = `<!doctype NETSCAPE-Bookmark-file-1><DL><p>
      <DT><H3>工具</H3><DL><p>
        <DT><A HREF="https://separator.mayastudios.com/index.php?t=horz">──── 图片工具 ────</A>
        <DT><A HREF="javascript:(function(){alert('x')})()">脚本</A>
        <DT><A HREF="https://example.com">示例</A>
        <DT><A HREF="https://separator.mayastudios.com/index.php?t=horz">────────</A>
      </DL><p>
    </DL><p>`
    const parsed = parseBookmarkHtml(html, limits)
    const folder = parsed.nodes[0]
    expect(folder?.type).toBe('folder')
    expect(folder?.children?.[0]?.title).toBe('图片工具')
    expect(folder?.children?.[0]?.children?.map((node) => node.type)).toEqual(['bookmark', 'bookmark'])
    expect(parsed.stats).toMatchObject({ sourceFolders: 1, generatedFolders: 1, bookmarks: 2, javascriptBookmarks: 1, separators: 1, sourceSeparatorNodes: 2 })
  })

  it('分组作用域不跨越父目录边界', () => {
    const stats = emptyStats()
    const source = { nodeIndex: 1, folderPath: [] as string[] }
    const result = normalizeGroups([
      { type: 'group_marker', title: '甲', source },
      { type: 'bookmark', title: 'A', url: 'https://a.example', bookmarkType: 'url', source },
      { type: 'group_marker', title: '乙', source },
      { type: 'bookmark', title: 'B', url: 'https://b.example', bookmarkType: 'url', source }
    ], stats)
    expect(result.map((node) => node.title)).toEqual(['甲', '乙'])
    expect(result[0]?.children?.[0]?.title).toBe('A')
    expect(result[1]?.children?.[0]?.title).toBe('B')
    expect(stats.generatedFolders).toBe(2)
  })

  it('只去除分组标题两端的框线字符', () => {
    expect(cleanGroupTitle('───── 图片-转换 ─────')).toBe('图片-转换')
    expect(cleanGroupTitle('────────────')).toBe('')
  })

  it('真实样本满足预审统计并完整保留超长 JavaScript 书签', async () => {
    const path = resolve(import.meta.dirname, '../../RunningCheese_Bookmarks_2026_05_06.html')
    const parsed = parseBookmarkHtml(await readFile(path, 'utf8'), limits)
    expect(parsed.stats.sourceFolders).toBe(270)
    expect(parsed.stats.generatedFolders).toBe(507)
    expect(parsed.stats.javascriptBookmarks).toBe(131)
    expect(parsed.stats.separators).toBe(189)
    expect(parsed.stats.sourceSeparatorNodes).toBe(696)

    const countTypes = (nodes: typeof parsed.nodes): Record<string, number> => {
      const counts: Record<string, number> = {}
      const visit = (items: typeof parsed.nodes): void => {
        for (const node of items) {
          counts[node.type] = (counts[node.type] ?? 0) + 1
          if (node.children) visit(node.children)
        }
      }
      visit(nodes)
      return counts
    }
    expect(countTypes(parsed.nodes).separator ?? 0).toBe(0)

    const urls: string[] = []
    const collect = (nodes: typeof parsed.nodes): void => {
      for (const node of nodes) {
        if (node.url?.startsWith('javascript:')) urls.push(node.url)
        if (node.children) collect(node.children)
      }
    }
    collect(parsed.nodes)
    expect(Math.max(...urls.map((url) => url.length))).toBe(62300)
  })
})
