import type { ImportIssue, ImportPreviewNode, ImportStats } from '@cancanworld/contracts'

/** 解析结果包含最终预览树、可复现统计和逐项问题。 */
export interface ParsedBookmarkFile {
  nodes: ImportPreviewNode[]
  stats: ImportStats
  issues: ImportIssue[]
}

/** 解析上限在读取和遍历阶段分别生效，避免异常文件耗尽资源。 */
export interface BookmarkParseLimits {
  maxFileBytes: number
  maxNodes: number
  maxDepth: number
}

/** 原始分组标记仅存在于规范化前的内存结构。 */
export interface GroupMarkerNode {
  type: 'group_marker'
  title: string
  source: ImportPreviewNode['source']
}

export type RawImportNode = ImportPreviewNode | GroupMarkerNode
