<script setup lang="ts">
import type { CreateNodeInput, NavigationNode } from '@cancanworld/contracts'
import {
  Bookmark,
  Activity,
  Archive,
  ArrowDown,
  ArrowUp,
  Clipboard,
  Download,
  ExternalLink,
  Folder,
  FolderSearch,
  FolderPlus,
  Globe2,
  ImageDown,
  Import,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings
} from 'lucide-vue-next'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { ApiError, apiRequest, setCsrfToken } from './api/client'
import AuthDialog from './components/AuthDialog.vue'
import AdminPanel from './components/AdminPanel.vue'
import BookmarkIcon from './components/BookmarkIcon.vue'
import FolderTree from './components/FolderTree.vue'
import NodeEditor from './components/NodeEditor.vue'
import { useNavigationStore } from './stores/navigation'

// 管理工具仅在用户打开时加载，避免导入和备份组件增加首屏脚本体积。
const BackupDialog = defineAsyncComponent(() => import('./components/BackupDialog.vue'))
const ImportDialog = defineAsyncComponent(() => import('./components/ImportDialog.vue'))

interface AuthStatus {
  initialized: boolean
  authenticated: boolean
  username: string | null
  csrfToken: string | null
}

interface AppearanceSetting {
  theme: 'default' | 'compact' | 'bookmark'
  accentColor: string
  layoutStyle: 'style1' | 'style2'
}

const navigation = useNavigationStore()
const auth = ref<AuthStatus>({ initialized: false, authenticated: false, username: null, csrfToken: null })
const authOpen = ref(false)
const editorOpen = ref(false)
const importOpen = ref(false)
const backupOpen = ref(false)
const adminOpen = ref(false)
const sidebarOpen = ref(false)
const editingNode = ref<NavigationNode | null>(null)
const initialType = ref<'folder' | 'bookmark'>('bookmark')
const editorParentId = ref(1)
const editorSaving = ref(false)
const editorError = ref<string | null>(null)
const theme = ref<'default' | 'compact' | 'bookmark'>('default')
const layoutStyle = ref<'style1' | 'style2'>('style1')
const draggedNode = ref<NavigationNode | null>(null)
const sortField = ref<'createdAt' | 'url' | 'title' | 'clickCount'>('createdAt')
const sortDirection = ref<'asc' | 'desc'>('desc')

/** 检测目标使用可辨识联合，避免把目录 ID 和书签 ID 混为同一种数字参数。 */
type CheckTarget =
  | { scope: 'all'; label: string }
  | { scope: 'folder'; folderId: number; label: string }
  | { scope: 'bookmark'; bookmarkId: number; label: string }

interface CheckJobProgress {
  id: string
  status: string
  total: number
  processed: number
  label: string
}

const checkJob = ref<CheckJobProgress | null>(null)
const faviconJob = ref<CheckJobProgress | null>(null)

const pageTitle = computed(() => navigation.currentFolder?.title ?? '全部书签')
const pagePath = computed(() => navigation.currentFolderPath.length ? navigation.currentFolderPath.join(' / ') : '全部书签')
const titleCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

/** 目录保持在书签之前；书签按用户选择字段排序，并用名称和 ID 保证结果稳定。 */
const sortedVisibleNodes = computed(() => {
  const direction = sortDirection.value === 'asc' ? 1 : -1
  return navigation.visibleNodes
    .filter((node) => node.nodeType !== 'separator')
    .slice()
    .sort((left: NavigationNode, right: NavigationNode) => {
      if (left.nodeType !== right.nodeType) return left.nodeType === 'folder' ? -1 : 1
      if (left.nodeType === 'folder') return BigInt(left.sortKey) < BigInt(right.sortKey) ? -1 : 1
      let compared = 0
      if (sortField.value === 'createdAt') compared = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      else if (sortField.value === 'url') compared = titleCollator.compare(left.url ?? '', right.url ?? '')
      else if (sortField.value === 'title') compared = titleCollator.compare(left.title, right.title)
      else compared = left.clickCount - right.clickCount
      if (compared === 0) compared = titleCollator.compare(left.title, right.title) || left.id - right.id
      return compared * direction
    })
})

/** 初始化时先同步会话，再按当前权限加载后端已经过滤的节点树。 */
async function initialize(): Promise<void> {
  auth.value = await apiRequest<AuthStatus>('/api/v1/auth/status')
  if (auth.value.csrfToken) setCsrfToken(auth.value.csrfToken)
  if (!auth.value.initialized) authOpen.value = true
  const themeSetting = await apiRequest<AppearanceSetting>('/api/v1/settings/theme')
  theme.value = themeSetting.theme
  layoutStyle.value = themeSetting.layoutStyle
  await navigation.loadTree()
}

/** 登录或初始化完成后刷新身份和私有节点。 */
async function authenticated(): Promise<void> {
  auth.value = await apiRequest<AuthStatus>('/api/v1/auth/status')
  if (auth.value.csrfToken) setCsrfToken(auth.value.csrfToken)
  await navigation.loadTree()
}

/** 注销会话并重新读取匿名可见树。 */
async function logout(): Promise<void> {
  await apiRequest('/api/v1/auth/logout', { method: 'POST' })
  setCsrfToken('')
  auth.value = { initialized: true, authenticated: false, username: null, csrfToken: null }
  adminOpen.value = false
  await navigation.loadTree()
}

/** 打开编辑器时固定来源目录；后台显式传入根目录，避免继承隐藏的前台上下文。 */
function openEditor(type: 'folder' | 'bookmark', node: NavigationNode | null = null, parentId = navigation.selectedFolderId): void {
  initialType.value = type
  editingNode.value = node
  editorParentId.value = node?.parentId ?? parentId
  editorError.value = null
  editorOpen.value = true
}

/** 保存期间锁定编辑器；失败保留草稿和服务端原因，成功后才关闭并提示。 */
async function saveNode(input: CreateNodeInput): Promise<void> {
  if (editorSaving.value) return
  editorSaving.value = true
  editorError.value = null
  try {
    if (editingNode.value) {
      await navigation.updateNode(editingNode.value.id, { ...input, updatedAt: editingNode.value.updatedAt })
    } else {
      await navigation.createNode(input)
    }
    editorOpen.value = false
    ElMessage.success('已保存')
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : '保存失败'
    ElMessage.error(editorError.value)
  } finally {
    editorSaving.value = false
  }
}

/** 非空目录由后端返回冲突后再显式确认级联删除。 */
async function removeNode(node: NavigationNode): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除“${node.title}”？`, '删除节点', { type: 'warning' })
  } catch {
    return
  }
  try {
    await navigation.deleteNode(node.id)
    ElMessage.success('已删除')
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 40904) {
      showDeleteError(error)
      return
    }
    const details = error.details as { childCount?: unknown } | null
    const childCount = typeof details?.childCount === 'number' ? details.childCount : 0
    const confirmed = await ElMessageBox.confirm(`该目录包含 ${childCount} 个直接子节点，是否删除目录及全部后代？`, '非空目录', {
      type: 'error',
      confirmButtonText: '删除全部'
    }).then(() => true, () => false)
    if (!confirmed) return
    try {
      await navigation.deleteNode(node.id, 'cascade')
      ElMessage.success('已删除')
    } catch (cascadeError) {
      showDeleteError(cascadeError)
    }
  }
}

/** 普通删除和级联删除共用错误出口，确保异步失败不会成为未处理 Promise。 */
function showDeleteError(error: unknown): void {
  ElMessage.error(error instanceof Error ? error.message : '删除失败')
}

/** JavaScript 书签只复制原文；普通 URL 才允许新窗口打开。 */
async function activateBookmark(node: NavigationNode): Promise<void> {
  if (!node.url) return
  if (node.bookmarkType === 'javascript') {
    await navigator.clipboard.writeText(node.url)
    void recordBookmarkClick(node)
    ElMessage.success('JavaScript 书签已复制')
    return
  }
  window.open(node.url, '_blank', 'noopener,noreferrer')
  void recordBookmarkClick(node)
}

/** 打开窗口后再异步计数，计数接口异常不阻塞用户访问目标网站。 */
async function recordBookmarkClick(node: NavigationNode): Promise<void> {
  try {
    const result = await apiRequest<{ clickCount: number }>(`/api/v1/nodes/${node.id}/click`, { method: 'POST' })
    node.clickCount = result.clickCount
  } catch {
    // 点击统计属于附属行为，目标网站已经打开时不弹出干扰性错误。
  }
}

/** 将检测字段转换为适合卡片快速扫描的明确结论。 */
function healthConclusion(node: NavigationNode): { label: string; tone: 'up' | 'down' | 'unknown' } {
  if (!node.lastCheckedAt) return { label: '未检测', tone: 'unknown' }
  if (typeof node.lastHttpStatus === 'number') return { label: `存活 · HTTP ${node.lastHttpStatus}`, tone: 'up' }
  return { label: `异常 · ${node.lastCheckStatus || '无响应'}`, tone: 'down' }
}

/** 外观设置只保存受控样式令牌，不加载远程代码或自定义模板。 */
function changeTheme(value: 'default' | 'compact' | 'bookmark'): void {
  theme.value = value
  localStorage.setItem('cancanworld-theme', value)
  persistAppearance()
}

function changeLayoutStyle(value: 'style1' | 'style2'): void {
  layoutStyle.value = value
  localStorage.setItem('cancanworld-layout', value)
  persistAppearance()
}

/** 顶部外观菜单用命令前缀区分布局和密度设置。 */
function changeAppearanceCommand(command: string): void {
  if (command === 'style1' || command === 'style2') changeLayoutStyle(command)
  else if (command === 'default' || command === 'compact' || command === 'bookmark') changeTheme(command)
}

function persistAppearance(): void {
  if (auth.value.authenticated) {
    void apiRequest('/api/v1/settings/theme', {
      method: 'PUT',
      body: JSON.stringify({ theme: theme.value, accentColor: '#19715f', layoutStyle: layoutStyle.value })
    })
  }
}

/** 按全库、当前目录树或单书签创建任务，页面轮询进度而不占用原请求连接。 */
async function runChecks(target: CheckTarget): Promise<void> {
  const path = target.scope === 'all'
    ? '/api/v1/bookmarks/check'
    : target.scope === 'folder'
      ? `/api/v1/bookmarks/check?folderId=${target.folderId}`
      : `/api/v1/bookmarks/${target.bookmarkId}/check`
  const created = await apiRequest<{ jobId: string }>(path, { method: 'POST' })
  checkJob.value = { id: created.jobId, status: 'pending', total: 0, processed: 0, label: target.label }
  const poll = async (): Promise<void> => {
    const job = await apiRequest<{ id: string; status: string; total: number; processed: number }>(`/api/v1/check-jobs/${created.jobId}`)
    checkJob.value = { ...job, label: target.label }
    if (['pending', 'running'].includes(job.status)) window.setTimeout(() => void poll(), 1000)
    else {
      await navigation.loadTree()
      ElMessage.success(`${target.label}检测完成：${job.processed}/${job.total}`)
    }
  }
  await poll()
}

/** favicon 任务在后台抓取并同源缓存图片，完成后重载树以显示新图标。 */
async function runFavicons(options: { folderId?: number; refresh: boolean; label: string }): Promise<void> {
  const body = options.folderId === undefined
    ? { refresh: options.refresh }
    : { folderId: options.folderId, refresh: options.refresh }
  const created = await apiRequest<{ jobId: string }>('/api/v1/favicon-jobs', { method: 'POST', body: JSON.stringify(body) })
  faviconJob.value = { id: created.jobId, status: 'pending', total: 0, processed: 0, label: options.label }
  const poll = async (): Promise<void> => {
    const job = await apiRequest<{ id: string; status: string; total: number; processed: number }>(`/api/v1/favicon-jobs/${created.jobId}`)
    faviconJob.value = { ...job, label: options.label }
    if (['pending', 'running'].includes(job.status)) window.setTimeout(() => void poll(), 1000)
    else {
      await navigation.loadTree()
      ElMessage.success(`${options.label}获取完成：${job.processed}/${job.total}`)
    }
  }
  await poll()
}

/** 后台任务页取消当前任务后立即更新本地状态，轮询拿到最终状态时自然停止。 */
async function cancelActiveTask(kind: 'check' | 'favicon'): Promise<void> {
  const job = kind === 'check' ? checkJob.value : faviconJob.value
  if (!job || !['pending', 'running'].includes(job.status)) return
  const path = kind === 'check' ? `/api/v1/check-jobs/${job.id}/cancel` : `/api/v1/favicon-jobs/${job.id}/cancel`
  try {
    await apiRequest(path, { method: 'POST' })
    job.status = 'cancelled'
    ElMessage.success(`${job.label}已取消`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '取消任务失败')
  }
}

/** HTML 导出使用同源 Cookie 下载，服务器会包含管理员可见的私有节点。 */
function exportHtml(): void {
  window.location.assign('/api/v1/export/html')
}

/** 拖到目录时追加到目录尾部，目标目录的最大排序键来自已加载树。 */
async function moveIntoFolder(nodeId: number, folderId: number): Promise<void> {
  const node = navigation.getNode(nodeId)
  const folder = folderId === 1 ? null : navigation.getNode(folderId)
  if (!node || node.id === folderId) return
  const children = folder?.children ?? navigation.tree
  const maxSort = children.reduce((value, child) => BigInt(child.sortKey) > value ? BigInt(child.sortKey) : value, 0n)
  await navigation.moveNode(node, folderId, String(maxSort + 1024n))
}

/** 同级放置使用目标排序键，后端以 ID 作为稳定次序并执行乐观锁。 */
async function dropBefore(target: NavigationNode): Promise<void> {
  if (!draggedNode.value || draggedNode.value.id === target.id || target.parentId === null) return
  const targetSort = BigInt(target.sortKey)
  await navigation.moveNode(draggedNode.value, target.parentId, String(targetSort > 0n ? targetSort - 1n : 0n))
  draggedNode.value = null
}

onMounted(async () => {
  const saved = localStorage.getItem('cancanworld-theme')
  if (saved === 'compact' || saved === 'bookmark') theme.value = saved
  const savedLayout = localStorage.getItem('cancanworld-layout')
  if (savedLayout === 'style2') layoutStyle.value = savedLayout
  try {
    await initialize()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '初始化失败')
  }
})
</script>

<template>
  <AdminPanel
    v-if="adminOpen && auth.authenticated"
    :nodes="navigation.tree"
    :selected-folder-id="navigation.selectedFolderId"
    :layout-style="layoutStyle"
    :theme="theme"
    :check-job="checkJob"
    :favicon-job="faviconJob"
    @close="adminOpen = false"
    @create="openEditor($event, null, 1)"
    @edit="openEditor($event.nodeType === 'folder' ? 'folder' : 'bookmark', $event)"
    @remove="removeNode"
    @import="importOpen = true"
    @backup="backupOpen = true"
    @check="$event === 'all' ? runChecks({ scope: 'all', label: '全部链接' }) : runChecks({ scope: 'folder', folderId: navigation.selectedFolderId, label: '当前目录链接' })"
    @favicon="runFavicons"
    @cancel-task="cancelActiveTask"
    @layout-change="changeLayoutStyle"
    @theme-change="changeTheme"
  />
  <div v-else class="app-shell" :data-theme="theme" :data-layout="layoutStyle">
    <header class="topbar">
      <button class="icon-button mobile-only" type="button" aria-label="打开目录" @click="sidebarOpen = !sidebarOpen">
        <Menu :size="20" />
      </button>
      <div class="brand">
        <span class="brand-mark">C</span>
        <strong>CanCanWorld</strong>
      </div>
      <form class="search-box" @submit.prevent="navigation.search">
        <Search :size="17" />
        <input v-model="navigation.query" type="search" :placeholder="`搜索 ${pageTitle} 的名称、链接、备注、注释或标签`" />
      </form>
      <div class="top-actions">
        <button v-if="auth.authenticated" class="command-button" type="button" aria-label="后台管理" @click="adminOpen = true"><LayoutDashboard :size="17" /><span>管理后台</span></button>
        <el-dropdown trigger="click" @command="changeAppearanceCommand">
          <button class="icon-button" type="button" aria-label="主题设置"><Settings :size="19" /></button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="style1">风格 1 · 管理列表</el-dropdown-item>
              <el-dropdown-item command="style2">风格 2 · OneNav</el-dropdown-item>
              <el-dropdown-item command="default" divided>标准密度</el-dropdown-item>
              <el-dropdown-item command="compact">紧凑密度</el-dropdown-item>
              <el-dropdown-item command="bookmark">暖色主题</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <button v-if="auth.authenticated" class="icon-button" type="button" aria-label="退出登录" @click="logout">
          <LogOut :size="19" />
        </button>
        <button v-else class="command-button" type="button" @click="authOpen = true">
          <LogIn :size="17" /><span>登录</span>
        </button>
      </div>
    </header>

    <aside class="sidebar" :class="{ 'is-open': sidebarOpen }">
      <div class="sidebar-heading">
        <span>目录</span>
        <button v-if="auth.authenticated" class="icon-button" type="button" aria-label="新建目录" @click="openEditor('folder')">
          <FolderPlus :size="17" />
        </button>
      </div>
      <button class="all-bookmarks" :class="{ 'is-selected': navigation.selectedFolderId === 1 }" type="button" @click="navigation.selectFolder(1)">
        <Bookmark :size="16" /><span>全部书签</span>
      </button>
      <FolderTree :nodes="navigation.tree" :selected-id="navigation.selectedFolderId" @select="navigation.selectFolder" @move="moveIntoFolder" />
    </aside>

    <main class="workspace">
      <div class="workspace-header">
        <div>
          <p class="eyebrow">{{ navigation.searchResults ? `搜索结果 · ${pagePath}` : pagePath }}</p>
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="workspace-tools">
          <div class="sort-controls">
            <el-select v-model="sortField" aria-label="书签排序字段">
              <el-option label="添加时间" value="createdAt" />
              <el-option label="链接" value="url" />
              <el-option label="网站名" value="title" />
              <el-option label="点击次数" value="clickCount" />
            </el-select>
            <el-tooltip :content="sortDirection === 'asc' ? '升序' : '降序'">
              <button class="icon-button bordered" type="button" :aria-label="sortDirection === 'asc' ? '当前升序，点击改为降序' : '当前降序，点击改为升序'" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
                <ArrowUp v-if="sortDirection === 'asc'" :size="17" />
                <ArrowDown v-else :size="17" />
              </button>
            </el-tooltip>
          </div>
          <div v-if="auth.authenticated" class="workspace-actions">
            <el-dropdown trigger="click" @command="openEditor($event as 'folder' | 'bookmark')">
            <button class="command-button primary" type="button"><Plus :size="17" /><span>新建</span></button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="bookmark"><Bookmark :size="15" />书签</el-dropdown-item>
                <el-dropdown-item command="folder"><Folder :size="15" />目录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <button class="command-button" type="button" @click="importOpen = true"><Import :size="17" /><span>导入</span></button>
          <el-dropdown trigger="click">
            <button class="icon-button bordered" type="button" aria-label="更多工具"><MoreHorizontal :size="18" /></button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="runChecks({ scope: 'folder', folderId: navigation.selectedFolderId, label: '当前目录链接' })"><FolderSearch :size="15" />检测当前目录（含子目录）</el-dropdown-item>
                <el-dropdown-item @click="runChecks({ scope: 'all', label: '全部链接' })"><Globe2 :size="15" />检测全部链接</el-dropdown-item>
                <el-dropdown-item @click="runFavicons({ folderId: navigation.selectedFolderId, refresh: false, label: '当前目录图标' })"><ImageDown :size="15" />获取当前目录图标</el-dropdown-item>
                <el-dropdown-item @click="exportHtml"><Download :size="15" />导出 HTML</el-dropdown-item>
                <el-dropdown-item @click="backupOpen = true"><Archive :size="15" />备份与恢复</el-dropdown-item>
              </el-dropdown-menu>
            </template>
            </el-dropdown>
          </div>
        </div>
      </div>

      <div v-if="checkJob && ['pending', 'running'].includes(checkJob.status)" class="job-progress">
        <span>{{ checkJob.label }}</span>
        <el-progress :percentage="checkJob.total ? Math.round(checkJob.processed / checkJob.total * 100) : 0" :stroke-width="6" />
        <span>{{ checkJob.processed }} / {{ checkJob.total }}</span>
      </div>
      <div v-if="faviconJob && ['pending', 'running'].includes(faviconJob.status)" class="job-progress">
        <span>{{ faviconJob.label }}</span>
        <el-progress :percentage="faviconJob.total ? Math.round(faviconJob.processed / faviconJob.total * 100) : 0" :stroke-width="6" />
        <span>{{ faviconJob.processed }} / {{ faviconJob.total }}</span>
      </div>

      <div v-loading="navigation.loading" class="node-list">
        <template v-for="node in sortedVisibleNodes" :key="node.id">
          <article
            class="node-row"
            :draggable="auth.authenticated"
            @dragstart="draggedNode = node; $event.dataTransfer?.setData('application/x-cancanworld-node', String(node.id))"
            @dragover.prevent
            @drop.prevent="dropBefore(node)"
            @dblclick="node.nodeType === 'folder' ? navigation.selectFolder(node.id) : activateBookmark(node)"
          >
            <button class="node-icon" type="button" :aria-label="node.nodeType === 'folder' ? '打开目录' : '打开书签'" @click="node.nodeType === 'folder' ? navigation.selectFolder(node.id) : activateBookmark(node)">
              <BookmarkIcon :node="node" :size="20" />
            </button>
            <component
              :is="node.nodeType === 'folder' ? 'button' : 'div'"
              class="node-copy"
              :class="{ 'is-folder': node.nodeType === 'folder' }"
              :type="node.nodeType === 'folder' ? 'button' : undefined"
              @click="node.nodeType === 'folder' ? navigation.selectFolder(node.id) : undefined"
            >
              <strong>{{ node.title }}</strong>
              <span v-if="node.fullPath?.length" class="node-path">{{ node.fullPath.join(' / ') }}</span>
              <span v-if="node.remark" class="node-remark">备注：{{ node.remark }}</span>
              <span v-if="node.description" class="node-description">注释：{{ node.description }}</span>
              <span v-if="node.url" class="node-url">{{ node.bookmarkType === 'javascript' ? 'JavaScript 书签' : node.url }}</span>
              <span v-else>{{ node.children?.length ?? 0 }} 个节点</span>
              <div v-if="node.nodeType === 'bookmark'" class="style2-card-details">
                <div class="card-status-row"><span class="health-conclusion" :data-tone="healthConclusion(node).tone">{{ healthConclusion(node).label }}</span></div>
                <div class="card-tag-row">
                  <span class="click-count">点击 {{ node.clickCount }}</span>
                  <span v-for="tag in node.tags.slice(0, 2)" :key="tag" class="bookmark-tag">{{ tag }}</span>
                  <span v-if="node.tags.length > 2" class="bookmark-tag">+{{ node.tags.length - 2 }}</span>
                </div>
              </div>
            </component>
            <div class="node-meta">
              <el-tag v-if="node.visibility === 'private'" size="small" effect="plain">私有</el-tag>
              <el-tag v-if="node.nodeType === 'bookmark'" size="small" effect="plain">点击 {{ node.clickCount }}</el-tag>
              <el-tag v-for="tag in node.tags.slice(0, 2)" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
              <el-tag
                v-if="node.lastCheckedAt"
                size="small"
                effect="plain"
                :type="typeof node.lastHttpStatus === 'number' ? 'success' : 'danger'"
                :title="typeof node.lastResponseTime === 'number' ? `${node.lastResponseTime} ms` : node.lastCheckStatus ?? ''"
              >
                {{ typeof node.lastHttpStatus === 'number' ? `HTTP ${node.lastHttpStatus}` : node.lastCheckStatus }}
              </el-tag>
            </div>
            <button v-if="node.nodeType === 'bookmark'" class="icon-button" type="button" :aria-label="node.bookmarkType === 'javascript' ? '复制脚本' : '打开链接'" @click="activateBookmark(node)">
              <Clipboard v-if="node.bookmarkType === 'javascript'" :size="17" />
              <ExternalLink v-else :size="17" />
            </button>
            <el-dropdown v-if="auth.authenticated" trigger="click">
              <button class="icon-button" type="button" aria-label="更多操作"><MoreHorizontal :size="18" /></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openEditor(node.nodeType === 'folder' ? 'folder' : 'bookmark', node)">编辑</el-dropdown-item>
                  <el-dropdown-item v-if="node.nodeType === 'bookmark' && node.bookmarkType === 'url'" @click="runChecks({ scope: 'bookmark', bookmarkId: node.id, label: node.title })"><Activity :size="15" />检测链接</el-dropdown-item>
                  <el-dropdown-item divided @click="removeNode(node)">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </article>
        </template>
        <el-empty v-if="!navigation.loading && navigation.visibleNodes.length === 0" description="暂无内容" />
      </div>
    </main>

  </div>
  <AuthDialog v-model="authOpen" :initialized="auth.initialized" @authenticated="authenticated" />
  <NodeEditor
    v-model="editorOpen"
    :parent-id="editorParentId"
    :nodes="navigation.tree"
    :node="editingNode"
    :initial-type="initialType"
    :saving="editorSaving"
    :error-message="editorError"
    @submit="saveNode"
  />
  <ImportDialog v-model="importOpen" :parent-id="navigation.selectedFolderId" @imported="navigation.loadTree" />
  <BackupDialog v-model="backupOpen" @restored="navigation.loadTree" />
</template>
