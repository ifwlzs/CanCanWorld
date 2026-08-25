import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createDatabase } from '../src/db/client.js'
import { readEnv } from '../src/config/env.js'

const baseUrl = 'http://localhost:3080/api/v1'
const username = `smoke_${Date.now()}`
const rootTitle = `SMOKE_ROOT_${Date.now()}`
const password = `Smoke-${crypto.randomUUID()}-Pass`
let cookie = ''
let csrfToken = ''
let rootFolderId: number | null = null
const importJobIds: string[] = []
const backupIds: string[] = []
const checkJobIds: string[] = []
let createdAdmin = false

/** 发送 smoke 请求并校验统一响应格式，Cookie 由脚本内存保存。 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (cookie) headers.set('cookie', cookie)
  if (csrfToken && !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) headers.set('x-csrf-token', csrfToken)
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  const setCookie = response.headers.getSetCookie()
  if (setCookie.length > 0) {
    const updates = new Map(cookie.split('; ').filter(Boolean).map((part) => part.split('=', 2) as [string, string]))
    for (const value of setCookie) {
      const [pair] = value.split(';', 1)
      const [name, token] = pair?.split('=', 2) ?? []
      if (name && token) updates.set(name, token)
    }
    cookie = [...updates].map(([name, value]) => `${name}=${value}`).join('; ')
  }
  const payload = await response.json() as { code: number; message: string; data: T }
  if (!response.ok || payload.code !== 0) throw new Error(`${response.status} ${payload.code}: ${payload.message}`)
  return payload.data
}

/** Smoke 流程覆盖健康检查、初始化、CSRF 写入、搜索和真实样本导入预览。 */
async function run(): Promise<void> {
  const health = await request<{ status: string }>('/health')
  if (health.status !== 'UP') throw new Error('健康检查状态异常')
  const status = await request<{ initialized: boolean }>('/auth/status')
  if (status.initialized) throw new Error('数据库已经存在管理员，跳过破坏性 smoke 初始化')

  const auth = await request<{ csrfToken: string }>('/auth/initialize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  createdAdmin = true
  csrfToken = auth.csrfToken

  const folder = await request<{ id: number }>('/nodes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentId: 1, nodeType: 'folder', title: rootTitle, url: null, description: null, iconUrl: null, visibility: 'private', tags: [] })
  })
  rootFolderId = folder.id
  await request('/nodes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentId: folder.id, nodeType: 'bookmark', title: 'SMOKE_BOOKMARK', url: 'https://example.com', description: '接口集成测试', iconUrl: null, visibility: 'private', tags: ['smoke'] })
  })
  const results = await request<Array<{ title: string }>>(`/search?q=SMOKE&folderId=${folder.id}`)
  if (!results.some((item) => item.title === 'SMOKE_BOOKMARK')) throw new Error('目录范围搜索没有返回测试书签')

  const check = await request<{ jobId: string }>('/bookmarks/check', { method: 'POST' })
  checkJobIds.push(check.jobId)
  let checked: { status: string; total: number; processed: number } = { status: 'pending', total: 0, processed: 0 }
  for (let attempt = 0; attempt < 40 && ['pending', 'running'].includes(checked.status); attempt++) {
    await Bun.sleep(250)
    checked = await request(`/check-jobs/${check.jobId}`)
  }
  if (checked.status !== 'completed' || checked.total !== 1 || checked.processed !== 1) throw new Error(`链接检测任务异常：${JSON.stringify(checked)}`)

  const samplePath = resolve(import.meta.dirname, '../../RunningCheese_Bookmarks_2026_05_06.html')
  const body = new FormData()
  body.append('file', new File([await readFile(samplePath)], 'bookmarks.html', { type: 'text/html' }))
  body.append('parentId', String(folder.id))
  const preview = await request<{ jobId: string; stats: { javascriptBookmarks: number; generatedFolders: number; separators: number } }>('/import/html/preview', { method: 'POST', body })
  importJobIds.push(preview.jobId)
  if (preview.stats.javascriptBookmarks !== 131 || preview.stats.generatedFolders !== 507 || preview.stats.separators !== 189) {
    throw new Error(`真实样本统计异常：${JSON.stringify(preview.stats)}`)
  }

  const smallBody = new FormData()
  smallBody.append('file', new File([`<!doctype NETSCAPE-Bookmark-file-1><DL><p>
    <DT><A HREF="https://separator.mayastudios.com/index.php?t=horz">──── Smoke 分组 ────</A>
    <DT><A HREF="javascript:document.title">Smoke JS</A>
    <DT><A HREF="https://separator.mayastudios.com/index.php?t=horz">──── Smoke 分割组 ────</A>
    <DT><A HREF="https://example.org">Smoke URL</A>
  </DL><p>`], 'smoke.html', { type: 'text/html' }))
  smallBody.append('parentId', String(folder.id))
  const smallPreview = await request<{ jobId: string }>('/import/html/preview', { method: 'POST', body: smallBody })
  importJobIds.push(smallPreview.jobId)
  const adjustedPreview = await request<{ nodes: Array<{ title: string }> }>(`/import/${smallPreview.jobId}/groups/1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'folder', title: 'Smoke 调整分组' })
  })
  if (adjustedPreview.nodes[0]?.title !== 'Smoke 调整分组') throw new Error('分组标记预览调整没有保存')
  const convertedPreview = await request<{ stats: { generatedFolders: number; separators: number } }>(`/import/${smallPreview.jobId}/groups/3`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'bookmark' })
  })
  if (convertedPreview.stats.generatedFolders !== 1 || convertedPreview.stats.separators !== 0) throw new Error('分组标记转换后的统计异常')
  const confirmed = await request<{ inserted: number; skipped: number }>(`/import/${smallPreview.jobId}/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ parentId: folder.id, duplicateStrategy: 'keep_all' })
  })
  if (confirmed.inserted !== 4) throw new Error(`导入确认写入数量异常：${JSON.stringify(confirmed)}`)
  const tree = await request<Array<{ id: number; title: string; children?: Array<{ title: string; children?: Array<{ title: string }> }> }>>('/nodes/tree')
  const smokeRoot = tree.find((node) => node.id === folder.id)
  const group = smokeRoot?.children?.find((node) => node.title === 'Smoke 调整分组')
  if (!group || group.children?.length !== 1) throw new Error('分组标记确认后没有生成正确文件夹层级')

  const backup = await request<{ id: string; itemCount: number }>('/backups', { method: 'POST' })
  backupIds.push(backup.id)
  if (backup.itemCount !== 6) throw new Error(`备份节点数量异常：${backup.itemCount}`)
  await request('/nodes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentId: folder.id, nodeType: 'bookmark', title: 'RESTORE_SHOULD_REMOVE', url: 'https://example.net', description: null, iconUrl: null, visibility: 'private', tags: [] })
  })
  const restored = await request<{ safetyBackupId: string; restoredNodes: number }>(`/backups/${backup.id}/restore`, { method: 'POST' })
  backupIds.push(restored.safetyBackupId)
  if (restored.restoredNodes !== 6) throw new Error(`恢复节点数量异常：${restored.restoredNodes}`)
  const restoredSearch = await request<Array<{ title: string }>>(`/search?q=RESTORE_SHOULD_REMOVE&folderId=${folder.id}`)
  if (restoredSearch.length !== 0) throw new Error('恢复事务没有移除备份后创建的节点')

  const exportResponse = await fetch(`${baseUrl}/export/html`, { headers: { cookie } })
  const exportedHtml = await exportResponse.text()
  if (!exportResponse.ok || !exportedHtml.includes('javascript:document.title') || !exportedHtml.includes('Smoke 调整分组')) throw new Error('HTML 导出内容不完整')

  process.stdout.write(JSON.stringify({ health: health.status, search: results.length, checked, importStats: preview.stats, confirmed, backup: backup.itemCount, restored: restored.restoredNodes }, null, 2))
}

/** 无论断言是否成功，只删除脚本创建的记录，不触碰用户已有数据。 */
async function cleanup(): Promise<void> {
  const { pool } = createDatabase(readEnv())
  try {
    for (const importJobId of importJobIds) await pool.execute('DELETE FROM import_job WHERE id = ?', [importJobId])
    if (rootFolderId) {
      const [rows] = await pool.execute<import('mysql2/promise').RowDataPacket[]>(`
        WITH RECURSIVE tree AS (
          SELECT id, 0 AS depth FROM navigation_node WHERE id = ?
          UNION ALL SELECT n.id, tree.depth + 1 FROM navigation_node n INNER JOIN tree ON n.parent_id = tree.id
        ) SELECT id FROM tree ORDER BY depth DESC
      `, [rootFolderId])
      for (const row of rows) await pool.execute('DELETE FROM navigation_node WHERE id = ?', [row.id])
    }
    if (createdAdmin) {
      const [users] = await pool.execute<import('mysql2/promise').RowDataPacket[]>('SELECT id FROM app_user WHERE username = ?', [username])
      for (const user of users) await pool.execute('DELETE FROM app_session WHERE user_id = ?', [user.id])
      await pool.execute('DELETE FROM app_user WHERE username = ?', [username])
    }
    for (const checkJobId of checkJobIds) {
      await pool.execute('DELETE FROM bookmark_check_job_item WHERE job_id = ?', [checkJobId])
      await pool.execute('UPDATE bookmark_check_log SET job_id = NULL WHERE job_id = ?', [checkJobId])
      await pool.execute('DELETE FROM bookmark_check_job WHERE id = ?', [checkJobId])
    }
    for (const backupId of backupIds) await pool.execute('DELETE FROM app_backup WHERE id = ?', [backupId])
    await pool.execute('DELETE FROM app_backup WHERE payload LIKE ?', [`%${rootTitle}%`])
    await pool.execute('DELETE FROM tag WHERE NOT EXISTS (SELECT 1 FROM node_tag WHERE node_tag.tag_id = tag.id)')
  } finally {
    await pool.end()
  }
}

try {
  await run()
} finally {
  await cleanup()
}
