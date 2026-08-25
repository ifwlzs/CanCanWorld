import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { createDatabase } from '../backend/src/db/client.js'
import { readEnv } from '../backend/src/config/env.js'

const appUrl = 'http://localhost:5173'
const username = `visual_${Date.now()}`
const password = 'Ab12!x'
const rootTitle = `视觉测试_${Date.now()}`
const artifacts = resolve(import.meta.dirname, '../artifacts')

await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const errors: string[] = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

/** 使用浏览器真实流程初始化、调用 API 并验证桌面和移动布局。 */
async function run(): Promise<void> {
  await page.goto(appUrl, { waitUntil: 'networkidle' })
  const initializeDialog = page.locator('.el-dialog:visible')
  await initializeDialog.waitFor({ state: 'visible' })

  const inputs = initializeDialog.locator('input')
  await inputs.nth(1).fill('Ab12!')
  await inputs.nth(2).fill('Ab12!')
  await page.getByRole('button', { name: '创建管理员' }).click()
  await page.getByText('管理员密码长度必须为 6 到 1024 个字符', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(artifacts, '01-initialize-desktop.png'), fullPage: true })

  await inputs.nth(0).fill(username)
  await inputs.nth(1).fill(password)
  await inputs.nth(2).fill(password)
  await page.getByRole('button', { name: '创建管理员' }).click()
  await initializeDialog.waitFor({ state: 'hidden' })

  const csrfCookie = (await context.cookies()).find((cookie) => cookie.name === 'cw_csrf')
  if (!csrfCookie) throw new Error('浏览器登录后没有获得 CSRF Cookie')
  const headers = { 'x-csrf-token': csrfCookie.value }
  const folderResponse = await context.request.post('http://localhost:3080/api/v1/nodes', {
    headers,
    data: { parentId: 1, nodeType: 'folder', title: rootTitle, url: null, description: null, iconUrl: null, visibility: 'private', tags: [] }
  })
  if (!folderResponse.ok()) throw new Error(`创建视觉测试目录失败：${folderResponse.status()}`)
  const folderId = (await folderResponse.json()).data.id as number
  for (const data of [
    { parentId: folderId, nodeType: 'bookmark', title: 'CanCanWorld 文档', url: 'https://example.com/docs', description: '普通网址书签', iconUrl: null, visibility: 'private', tags: ['文档'] },
    { parentId: folderId, nodeType: 'bookmark', title: '复制当前标题', url: 'javascript:navigator.clipboard.writeText(document.title)', description: 'JavaScript 书签只允许复制', iconUrl: null, visibility: 'private', tags: ['工具'] }
  ]) {
    const response = await context.request.post('http://localhost:3080/api/v1/nodes', { headers, data })
    if (!response.ok()) throw new Error(`创建视觉测试节点失败：${response.status()}`)
  }
  const nestedFolderResponse = await context.request.post('http://localhost:3080/api/v1/nodes', {
    headers,
    data: { parentId: folderId, nodeType: 'folder', title: '深层目录', url: null, description: null, iconUrl: null, visibility: 'private', tags: [] }
  })
  if (!nestedFolderResponse.ok()) throw new Error(`创建视觉测试深层目录失败：${nestedFolderResponse.status()}`)
  const nestedFolderId = (await nestedFolderResponse.json()).data.id as number
  const nestedBookmarkResponse = await context.request.post('http://localhost:3080/api/v1/nodes', {
    headers,
    data: { parentId: nestedFolderId, nodeType: 'bookmark', title: '深层书签', url: 'https://example.com/nested', description: null, iconUrl: null, visibility: 'private', tags: [] }
  })
  if (!nestedBookmarkResponse.ok()) throw new Error(`创建视觉测试深层书签失败：${nestedBookmarkResponse.status()}`)

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: rootTitle, exact: true }).click()
  await page.getByText('CanCanWorld 文档', { exact: true }).waitFor()
  await assertNoHorizontalOverflow(page)
  await page.screenshot({ path: resolve(artifacts, '02-bookmarks-desktop.png'), fullPage: true })

  await page.locator('.node-list').getByText('深层目录', { exact: true }).click()
  await page.getByText(`${rootTitle} / 深层目录`, { exact: true }).waitFor()
  await page.getByText('深层书签', { exact: true }).waitFor()
  await page.getByRole('button', { name: rootTitle, exact: true }).click()
  await page.getByText('CanCanWorld 文档', { exact: true }).waitFor()

  await page.getByRole('button', { name: '导入' }).click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择 HTML 文件', exact: true }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(resolve(import.meta.dirname, '../RunningCheese_Bookmarks_2026_05_06.html'))
  await page.getByText('RunningCheese_Bookmarks_2026_05_06.html', { exact: true }).waitFor()
  await page.getByRole('button', { name: '解析预览' }).click()
  await page.getByText('131', { exact: true }).waitFor({ timeout: 15000 })
  await page.getByText('507', { exact: true }).waitFor()
  await page.getByText('189', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(artifacts, '03-import-preview.png'), fullPage: false })
  await page.getByRole('button', { name: '取消' }).click()

  await page.getByRole('button', { name: '更多工具' }).click()
  await page.getByText('备份与恢复', { exact: true }).click()
  await page.getByRole('button', { name: '创建备份' }).click()
  await page.getByText(/已备份 \d+ 个节点/).waitFor()
  await page.screenshot({ path: resolve(artifacts, '05-backups-desktop.png'), fullPage: false })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '退出登录' }).click()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const loginDialog = page.locator('.el-dialog:visible')
  const loginInputs = loginDialog.locator('input')
  await loginInputs.nth(0).fill(username)
  await loginInputs.nth(1).fill('Wrong-Password-123')
  const errorCountBeforeFailedLogin = errors.length
  await loginDialog.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByText('账号或密码错误', { exact: true }).waitFor()
  const failedLoginErrors = errors.splice(errorCountBeforeFailedLogin)
  if (failedLoginErrors.some((message) => !message.includes('401 (Unauthorized)'))) {
    throw new Error(`错误登录产生了非预期控制台错误：${failedLoginErrors.join(' | ')}`)
  }
  await loginInputs.nth(1).fill(password)
  await loginDialog.getByRole('button', { name: '登录', exact: true }).click()
  await loginDialog.waitFor({ state: 'hidden' })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开目录' }).click()
  await page.waitForTimeout(250)
  const sidebarBox = await page.locator('.sidebar').boundingBox()
  if (!sidebarBox || sidebarBox.x !== 0 || sidebarBox.width < 280) throw new Error(`移动侧栏位置异常：${JSON.stringify(sidebarBox)}`)
  await assertNoHorizontalOverflow(page)
  await page.screenshot({ path: resolve(artifacts, '04-mobile-sidebar.png'), fullPage: true })

  if (errors.length > 0) throw new Error(`浏览器控制台存在错误：${errors.join(' | ')}`)
  process.stdout.write(JSON.stringify({ screenshots: 5, desktop: '1440x900', mobile: '390x844', consoleErrors: errors.length }, null, 2))
}

/** 检查页面根布局没有水平溢出，防止按钮和长文本挤出移动视口。 */
async function assertNoHorizontalOverflow(targetPage: typeof page): Promise<void> {
  const dimensions = await targetPage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  if (dimensions.scrollWidth > dimensions.clientWidth) throw new Error(`页面存在水平溢出：${JSON.stringify(dimensions)}`)
}

/** 只清理本次视觉测试的管理员、目录、预览和标签。 */
async function cleanup(): Promise<void> {
  await browser.close()
  const { pool } = createDatabase(readEnv())
  try {
    const [roots] = await pool.execute<import('mysql2/promise').RowDataPacket[]>('SELECT id FROM navigation_node WHERE title = ?', [rootTitle])
    for (const root of roots) {
      const [nodes] = await pool.execute<import('mysql2/promise').RowDataPacket[]>(`
        WITH RECURSIVE tree AS (
          SELECT id, 0 AS depth FROM navigation_node WHERE id = ?
          UNION ALL SELECT n.id, tree.depth + 1 FROM navigation_node n INNER JOIN tree ON n.parent_id = tree.id
        ) SELECT id FROM tree ORDER BY depth DESC
      `, [root.id])
      for (const node of nodes) await pool.execute('DELETE FROM navigation_node WHERE id = ?', [node.id])
    }
    await pool.execute('DELETE FROM import_job WHERE file_name = ?', ['RunningCheese_Bookmarks_2026_05_06.html'])
    await pool.execute('DELETE FROM app_backup WHERE payload LIKE ?', [`%${rootTitle}%`])
    await pool.execute('DELETE FROM app_user WHERE username = ?', [username])
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
