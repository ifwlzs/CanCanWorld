import { chromium, type Locator, type Page } from 'playwright'
import type { NavigationNode } from '../packages/contracts/src/index.js'

const appUrl = 'http://127.0.0.1:5173'
const createRequests: Array<Record<string, unknown>> = []
let failNextCreate = false

/** 浏览器夹具使用完整共享契约，确保页面读取字段与真实 API 一致。 */
function node(overrides: Partial<NavigationNode>): NavigationNode {
  return {
    id: 2,
    parentId: 1,
    nodeType: 'folder',
    title: '软件',
    url: null,
    description: null,
    remark: null,
    iconUrl: null,
    sortKey: '1024',
    enabled: true,
    visibility: 'public',
    tags: [],
    clickCount: 0,
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
    ...overrides
  }
}

const navigationTree = [node({ children: [node({ id: 9, parentId: 2, title: '深层目录', children: [] })] })]
const emptySummary = {
  counts: { folders: 2, bookmarks: 0, privateBookmarks: 0, missingIcons: 0, unavailable: 0, icons: 0 },
  linkCheckSchedule: { enabled: true, intervalSeconds: 1800 },
  checkJobs: [],
  faviconJobs: []
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const consoleErrors: string[] = []

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

/** 用统一响应包装拦截页面 API，精确记录创建载荷并可切换一次服务端失败。 */
async function installApiRoutes(target: Page): Promise<void> {
  await target.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/auth/status') {
      await route.fulfill({ json: { code: 0, message: 'success', data: { initialized: true, authenticated: true, username: 'admin', csrfToken: 'test-csrf' } } })
      return
    }
    if (path === '/api/v1/settings/theme') {
      await route.fulfill({ json: { code: 0, message: 'success', data: { theme: 'default', accentColor: '#19715f', layoutStyle: 'style1' } } })
      return
    }
    if (path === '/api/v1/nodes/tree' && request.method() === 'GET') {
      await route.fulfill({ json: { code: 0, message: 'success', data: navigationTree } })
      return
    }
    if (path === '/api/v1/admin/summary') {
      await route.fulfill({ json: { code: 0, message: 'success', data: emptySummary } })
      return
    }
    if (path === '/api/v1/nodes' && request.method() === 'POST') {
      createRequests.push(request.postDataJSON() as Record<string, unknown>)
      if (failNextCreate) {
        failNextCreate = false
        await route.fulfill({ status: 500, json: { code: 50000, message: '服务器内部错误', data: null } })
      } else {
        await route.fulfill({ status: 201, json: { code: 0, message: 'success', data: { id: 99 } } })
      }
      return
    }
    await route.fulfill({ status: 404, json: { code: 40400, message: '接口不存在', data: null } })
  })
}

/** 从当前页面打开目录新建弹窗，避免测试依赖 Element Plus 生成的浮层 ID。 */
async function openFrontendFolderEditor(target: Page): Promise<Locator> {
  await target.getByRole('button', { name: '新建', exact: true }).click()
  await target.locator('.el-dropdown-menu:visible').getByText('目录', { exact: true }).click()
  const dialog = target.locator('.el-dialog:visible')
  await dialog.waitFor()
  return dialog
}

/** 兼容 Element Plus 将透传属性放在输入根或原生 input 上的两种结构。 */
function titleInput(dialog: Locator): Locator {
  return dialog.locator('[data-testid="node-title"] input, input[data-testid="node-title"]').first()
}

/** 保存后用短等待确认弹窗关闭，失败时携带请求和可见文本便于定位提交边界。 */
async function expectDialogClosed(dialog: Locator, label: string): Promise<void> {
  try {
    await dialog.waitFor({ state: 'hidden', timeout: 1500 })
  } catch {
    throw new Error(`${label}后弹窗未关闭；请求=${JSON.stringify(createRequests)}；弹窗=${JSON.stringify(await dialog.innerText())}`)
  }
}

/** 选择目录时通过可见树节点名称操作，验证真实弹层而非直接改内部状态。 */
async function chooseFolder(target: Page, dialog: Locator, label: string): Promise<void> {
  await dialog.locator('[data-testid="node-parent"]').click()
  await target.locator('.el-select-dropdown:visible').getByText(label, { exact: true }).click()
}

/** 两个矩形只要横纵轴同时相交即视为布局重叠。 */
function overlaps(left: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>, right: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y
}

/** 验证前后台默认目录、失败恢复及移动端弹窗几何边界。 */
async function run(): Promise<void> {
  await installApiRoutes(page)
  await page.goto(appUrl, { waitUntil: 'networkidle' })

  await page.locator('.tree-label').filter({ hasText: '软件' }).click()
  await page.locator('.tree-label').filter({ hasText: '深层目录' }).click()
  await page.getByRole('heading', { name: '深层目录', exact: true }).waitFor()

  let dialog = await openFrontendFolderEditor(page)
  await titleInput(dialog).fill('软件更新')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expectDialogClosed(dialog, '前台保存')
  if (createRequests[0]?.parentId !== 9) throw new Error(`前台创建目录父 ID 错误：${JSON.stringify(createRequests[0])}`)

  await page.getByRole('button', { name: '后台管理', exact: true }).click()
  await page.getByRole('heading', { name: '运行概览', exact: true }).waitFor()
  await page.getByRole('button', { name: '新建目录', exact: true }).click()
  dialog = page.locator('.el-dialog:visible')
  await titleInput(dialog).fill('后台目录')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expectDialogClosed(dialog, '后台保存')
  if (createRequests[1]?.parentId !== 1) throw new Error(`后台创建目录没有默认根目录：${JSON.stringify(createRequests[1])}`)

  await page.getByRole('button', { name: '新建目录', exact: true }).click()
  dialog = page.locator('.el-dialog:visible')
  await chooseFolder(page, dialog, '深层目录')
  await titleInput(dialog).fill('软件更新')
  failNextCreate = true
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: '服务器内部错误' }).waitFor()
  if (await titleInput(dialog).inputValue() !== '软件更新') throw new Error('服务端失败后标题草稿被清空')
  if (createRequests[2]?.parentId !== 9) throw new Error(`用户选择的深层父 ID 被覆盖：${JSON.stringify(createRequests[2])}`)

  await page.setViewportSize({ width: 390, height: 844 })
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  if (dimensions.scrollWidth > dimensions.clientWidth) throw new Error(`移动端存在水平溢出：${JSON.stringify(dimensions)}`)
  const cancelBox = await dialog.getByRole('button', { name: '取消', exact: true }).boundingBox()
  const saveBox = await dialog.getByRole('button', { name: '保存', exact: true }).boundingBox()
  if (!cancelBox || !saveBox || overlaps(cancelBox, saveBox)) throw new Error(`移动端页脚按钮重叠：${JSON.stringify({ cancelBox, saveBox })}`)

  const unexpectedErrors = consoleErrors.filter((message) => !message.includes('500 (Internal Server Error)'))
  if (unexpectedErrors.length > 0) throw new Error(`浏览器控制台存在非预期错误：${unexpectedErrors.join(' | ')}`)
  process.stdout.write(JSON.stringify({ createParentIds: createRequests.map((request) => request.parentId), mobile: dimensions, consoleErrors: consoleErrors.length }, null, 2))
}

try {
  await run()
} finally {
  await browser.close()
}
