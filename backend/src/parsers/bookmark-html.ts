import type { ImportIssue, ImportPreviewNode, ImportStats } from '@cancanworld/contracts'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import type { BookmarkParseLimits, GroupMarkerNode, ParsedBookmarkFile, RawImportNode } from '../domain/import.js'
import { getBookmarkType } from '../utils/url.js'

type ElementNode = DefaultTreeAdapterMap['element']
type ChildNode = DefaultTreeAdapterMap['childNode']
type ParentNode = DefaultTreeAdapterMap['parentNode']

const DEFAULT_SEPARATOR_HOSTS = new Set(['separator.mayastudios.com'])
const GROUP_EDGE_PATTERN = /^[\s\p{Pd}─━═_~=·•]+|[\s\p{Pd}─━═_~=·•]+$/gu

/** 使用 HTML5 DOM 容错解析 Netscape 书签格式，再规范化分组标记。 */
export function parseBookmarkHtml(html: string, limits: BookmarkParseLimits): ParsedBookmarkFile {
  if (Buffer.byteLength(html, 'utf8') > limits.maxFileBytes) throw new Error(`导入文件超过 ${limits.maxFileBytes} 字节限制`)
  const document = parse(html, { sourceCodeLocationInfo: true })
  const rootDl = findFirstElement(document, 'dl')
  if (!rootDl) throw new Error('没有找到 Netscape 书签 DL 根节点')

  const issues: ImportIssue[] = []
  const stats: ImportStats = {
    sourceFolders: 0,
    generatedFolders: 0,
    bookmarks: 0,
    javascriptBookmarks: 0,
    separators: 0,
    sourceSeparatorNodes: 0,
    failed: 0
  }
  let nodeIndex = 0

  /** 每层只读取当前 DL 的直接 DT/HR，嵌套 DL 由对应目录递归处理。 */
  function parseDl(dl: ElementNode, path: string[], depth: number): RawImportNode[] {
    if (depth > limits.maxDepth) throw new Error(`目录深度超过 ${limits.maxDepth} 层限制`)
    const result: RawImportNode[] = []
    for (const child of dl.childNodes) {
      if (isElement(child, 'hr')) {
        nodeIndex++
        stats.separators++
        stats.sourceSeparatorNodes++
        continue
      }
      if (!isElement(child, 'dt')) continue
      nodeIndex++
      if (nodeIndex > limits.maxNodes) throw new Error(`导入节点超过 ${limits.maxNodes} 个限制`)
      const source = makeSource(nodeIndex, child, path)
      const heading = findDirectContentElement(child, 'h3')
      if (heading) {
        const title = textContent(heading).trim() || '未命名目录'
        const nestedDl = child.childNodes.find((node): node is ElementNode => isElement(node, 'dl'))
        stats.sourceFolders++
        result.push({
          type: 'folder',
          title,
          children: nestedDl ? normalizeGroups(parseDl(nestedDl, [...path, title], depth + 1), stats) : [],
          source
        })
        continue
      }

      const anchor = findDirectContentElement(child, 'a')
      if (anchor) {
        const title = textContent(anchor).trim()
        const attributes = Object.fromEntries(anchor.attrs.map((attribute) => [attribute.name.toLowerCase(), attribute.value]))
        const url = attributes.href
        if (!url) {
          issues.push(makeIssue(source, title, 'MISSING_HREF', '书签缺少 HREF 属性'))
          stats.failed++
          continue
        }
        if (isSeparatorUrl(url)) {
          stats.sourceSeparatorNodes++
          const groupTitle = cleanGroupTitle(title)
          if (groupTitle) {
            result.push({
              type: 'group_marker',
              title: groupTitle,
              source: { ...source, originalTitle: title, originalUrl: url, generatedFromGroup: true }
            })
          } else {
            // 纯横线只计入导入统计，不进入预览和数据库节点树。
            stats.separators++
          }
          continue
        }
        const bookmarkType = getBookmarkType(url)
        result.push({ type: 'bookmark', title: title || url, url, bookmarkType, source })
        stats.bookmarks++
        if (bookmarkType === 'javascript') stats.javascriptBookmarks++
        continue
      }

      const hr = findDirectContentElement(child, 'hr')
      if (hr) {
        stats.separators++
        stats.sourceSeparatorNodes++
        continue
      }

      issues.push(makeIssue(source, '', 'UNSUPPORTED_NODE', '节点既不是目录也不是书签'))
      stats.failed++
    }
    return result
  }

  const nodes = normalizeGroups(parseDl(rootDl, [], 0), stats)
  return { nodes, stats, issues }
}

/** 同级扫描将带标题分组标记变为目录，并收纳直到下一个分组标记的节点。 */
export function normalizeGroups(nodes: RawImportNode[], stats: ImportStats): ImportPreviewNode[] {
  const result: ImportPreviewNode[] = []
  let currentGroup: ImportPreviewNode | null = null
  for (const node of nodes) {
    if (node.type === 'group_marker') {
      currentGroup = { type: 'folder', title: node.title, children: [], source: node.source }
      result.push(currentGroup)
      stats.generatedFolders++
      continue
    }
    if (currentGroup) currentGroup.children?.push(node)
    else result.push(node)
  }
  return result
}

/** 只清理标题两端的横线和框线字符，中间文本原样保留。 */
export function cleanGroupTitle(title: string): string {
  return title.replace(GROUP_EDGE_PATTERN, '').trim()
}

/** 已知分割线服务只作为格式信号，普通同名域名子串不会误判。 */
function isSeparatorUrl(value: string): boolean {
  try {
    return DEFAULT_SEPARATOR_HOSTS.has(new URL(value).hostname.toLowerCase())
  } catch {
    return false
  }
}

/** 深度优先查找首个指定元素，用于定位文档根 DL。 */
function findFirstElement(parent: ParentNode, tagName: string): ElementNode | null {
  for (const child of parent.childNodes) {
    if (isElement(child, tagName)) return child
    if (isElement(child)) {
      const nested = findFirstElement(child, tagName)
      if (nested) return nested
    }
  }
  return null
}

/** DT 内容元素必须位于嵌套 DL 之前，防止读取到后代书签。 */
function findDirectContentElement(parent: ElementNode, tagName: string): ElementNode | null {
  for (const child of parent.childNodes) {
    if (isElement(child, 'dl')) break
    if (isElement(child, tagName)) return child
  }
  return null
}

/** Parse5 通过 tagName 区分元素节点。 */
function isElement(node: ChildNode, tagName?: string): node is ElementNode {
  return 'tagName' in node && (tagName === undefined || node.tagName === tagName)
}

/** 提取纯文本，不解释或执行导入 HTML 中的任何标签和脚本。 */
function textContent(node: ParentNode): string {
  let value = ''
  for (const child of node.childNodes) {
    if ('value' in child) value += child.value
    else if (isElement(child)) value += textContent(child)
  }
  return value
}

/** 源信息随节点进入预览和数据库元数据，便于报告定位。 */
function makeSource(nodeIndex: number, node: ElementNode, folderPath: string[]): ImportPreviewNode['source'] {
  const line = node.sourceCodeLocation?.startLine
  return line === undefined ? { nodeIndex, folderPath } : { nodeIndex, line, folderPath }
}

/** 创建结构化导入问题，严格区分缺失可选字段和空字符串。 */
function makeIssue(source: ImportPreviewNode['source'], title: string, code: string, reason: string): ImportIssue {
  const base = { nodeIndex: source.nodeIndex, title, folderPath: source.folderPath, code, reason }
  return source.line === undefined ? base : { ...base, line: source.line }
}
