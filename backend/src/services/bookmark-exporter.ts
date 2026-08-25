import type { NavigationNode } from '@cancanworld/contracts'

/** 导出标准 Netscape Bookmark HTML，JavaScript 书签只做属性转义、不改写内容。 */
export function exportBookmarkHtml(nodes: NavigationNode[]): string {
  const body = serializeNodes(nodes, 1)
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- 此文件由 CanCanWorld 生成。 -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>CanCanWorld Bookmarks</TITLE>
<H1>CanCanWorld Bookmarks</H1>
<DL><p>
${body}</DL><p>
`
}

/** 递归保持统一节点树中的同级混合顺序。 */
function serializeNodes(nodes: NavigationNode[], depth: number): string {
  const indent = '    '.repeat(depth)
  let html = ''
  for (const node of nodes) {
    if (node.nodeType === 'folder') {
      html += `${indent}<DT><H3>${escapeText(node.title)}</H3>\n`
      html += `${indent}<DL><p>\n${serializeNodes(node.children ?? [], depth + 1)}${indent}</DL><p>\n`
    } else if (node.nodeType === 'separator') {
      html += `${indent}<DT><HR>\n`
    } else if (node.nodeType === 'bookmark' && node.url) {
      html += `${indent}<DT><A HREF="${escapeAttribute(node.url)}">${escapeText(node.title)}</A>\n`
      if (node.description) html += `${indent}<DD>${escapeText(node.description)}\n`
    }
  }
  return html
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;')
}
