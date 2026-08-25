<script setup lang="ts">
import type { CreateNodeInput, NavigationNode } from '@cancanworld/contracts'
import {
  Bookmark,
  Activity,
  Archive,
  Clipboard,
  Download,
  ExternalLink,
  Folder,
  FolderPlus,
  Import,
  LogIn,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Wrench
} from 'lucide-vue-next'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { ApiError, apiRequest, setCsrfToken } from './api/client'
import AuthDialog from './components/AuthDialog.vue'
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

const navigation = useNavigationStore()
const auth = ref<AuthStatus>({ initialized: false, authenticated: false, username: null, csrfToken: null })
const authOpen = ref(false)
const editorOpen = ref(false)
const importOpen = ref(false)
const backupOpen = ref(false)
const sidebarOpen = ref(false)
const editingNode = ref<NavigationNode | null>(null)
const initialType = ref<'folder' | 'bookmark'>('bookmark')
const theme = ref<'default' | 'compact' | 'bookmark'>('default')
const draggedNode = ref<NavigationNode | null>(null)
const checkJob = ref<{ id: string; status: string; total: number; processed: number } | null>(null)

const pageTitle = computed(() => navigation.currentFolder?.title ?? '全部书签')
const pagePath = computed(() => navigation.currentFolderPath.length ? navigation.currentFolderPath.join(' / ') : '全部书签')

/** 初始化时先同步会话，再按当前权限加载后端已经过滤的节点树。 */
async function initialize(): Promise<void> {
  auth.value = await apiRequest<AuthStatus>('/api/v1/auth/status')
  if (auth.value.csrfToken) setCsrfToken(auth.value.csrfToken)
  if (!auth.value.initialized) authOpen.value = true
  const themeSetting = await apiRequest<{ theme: 'default' | 'compact' | 'bookmark' }>('/api/v1/settings/theme')
  theme.value = themeSetting.theme
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
  await navigation.loadTree()
}

/** 打开新建或编辑对话框，节点类型由触发按钮决定。 */
function openEditor(type: 'folder' | 'bookmark', node: NavigationNode | null = null): void {
  initialType.value = type
  editingNode.value = node
  editorOpen.value = true
}

/** 保存节点时编辑路径附带服务端时间戳，新建路径使用当前目录。 */
async function saveNode(input: CreateNodeInput): Promise<void> {
  if (editingNode.value) {
    await navigation.updateNode(editingNode.value.id, { ...input, updatedAt: editingNode.value.updatedAt })
  } else {
    await navigation.createNode({ ...input, parentId: navigation.selectedFolderId })
  }
  editorOpen.value = false
  ElMessage.success('已保存')
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
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 40904) {
      ElMessage.error(error instanceof Error ? error.message : '删除失败')
      return
    }
    const details = error.details as { childCount?: unknown } | null
    const childCount = typeof details?.childCount === 'number' ? details.childCount : 0
    const confirmed = await ElMessageBox.confirm(`该目录包含 ${childCount} 个直接子节点，是否删除目录及全部后代？`, '非空目录', {
      type: 'error',
      confirmButtonText: '删除全部'
    }).then(() => true, () => false)
    if (confirmed) await navigation.deleteNode(node.id, 'cascade')
  }
}

/** JavaScript 书签只复制原文；普通 URL 才允许新窗口打开。 */
async function activateBookmark(node: NavigationNode): Promise<void> {
  if (!node.url) return
  if (node.bookmarkType === 'javascript') {
    await navigator.clipboard.writeText(node.url)
    ElMessage.success('JavaScript 书签已复制')
    return
  }
  window.open(node.url, '_blank', 'noopener,noreferrer')
}

/** 主题只切换受控样式令牌，不加载远程代码。 */
function changeTheme(value: 'default' | 'compact' | 'bookmark'): void {
  theme.value = value
  localStorage.setItem('cancanworld-theme', value)
  if (auth.value.authenticated) {
    void apiRequest('/api/v1/settings/theme', {
      method: 'PUT',
      body: JSON.stringify({ theme: value, accentColor: '#19715f' })
    })
  }
}

/** 批量检测创建持久化任务，页面轮询进度而不占用原请求连接。 */
async function runChecks(bookmarkId?: number): Promise<void> {
  const path = bookmarkId === undefined ? '/api/v1/bookmarks/check' : `/api/v1/bookmarks/${bookmarkId}/check`
  const created = await apiRequest<{ jobId: string }>(path, { method: 'POST' })
  checkJob.value = { id: created.jobId, status: 'pending', total: 0, processed: 0 }
  const poll = async (): Promise<void> => {
    const job = await apiRequest<{ id: string; status: string; total: number; processed: number }>(`/api/v1/check-jobs/${created.jobId}`)
    checkJob.value = job
    if (['pending', 'running'].includes(job.status)) window.setTimeout(() => void poll(), 1000)
    else {
      await navigation.loadTree()
      ElMessage.success(`链接检测完成：${job.processed}/${job.total}`)
    }
  }
  await poll()
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
  try {
    await initialize()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '初始化失败')
  }
})
</script>

<template>
  <div class="app-shell" :data-theme="theme">
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
        <input v-model="navigation.query" type="search" :placeholder="`在 ${pageTitle} 中搜索`" />
      </form>
      <div class="top-actions">
        <el-dropdown trigger="click" @command="changeTheme">
          <button class="icon-button" type="button" aria-label="主题设置"><Settings :size="19" /></button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="default">默认主题</el-dropdown-item>
              <el-dropdown-item command="compact">紧凑主题</el-dropdown-item>
              <el-dropdown-item command="bookmark">书签主题</el-dropdown-item>
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
        <div v-if="auth.authenticated" class="workspace-actions">
          <el-dropdown trigger="click" @command="openEditor">
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
                <el-dropdown-item @click="runChecks()"><Activity :size="15" />检测全部链接</el-dropdown-item>
                <el-dropdown-item @click="exportHtml"><Download :size="15" />导出 HTML</el-dropdown-item>
                <el-dropdown-item @click="backupOpen = true"><Archive :size="15" />备份与恢复</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div v-if="checkJob && ['pending', 'running'].includes(checkJob.status)" class="job-progress">
        <span>链接检测</span>
        <el-progress :percentage="checkJob.total ? Math.round(checkJob.processed / checkJob.total * 100) : 0" :stroke-width="6" />
        <span>{{ checkJob.processed }} / {{ checkJob.total }}</span>
      </div>

      <div v-loading="navigation.loading" class="node-list">
        <template v-for="node in navigation.visibleNodes.filter((item) => item.nodeType !== 'separator')" :key="node.id">
          <article
            class="node-row"
            :draggable="auth.authenticated"
            @dragstart="draggedNode = node; $event.dataTransfer?.setData('application/x-cancanworld-node', String(node.id))"
            @dragover.prevent
            @drop.prevent="dropBefore(node)"
            @dblclick="node.nodeType === 'folder' ? navigation.selectFolder(node.id) : activateBookmark(node)"
          >
            <button class="node-icon" type="button" :aria-label="node.nodeType === 'folder' ? '打开目录' : '打开书签'" @click="node.nodeType === 'folder' ? navigation.selectFolder(node.id) : activateBookmark(node)">
              <Folder v-if="node.nodeType === 'folder'" :size="20" />
              <Wrench v-else-if="node.bookmarkType === 'javascript'" :size="20" />
              <Bookmark v-else :size="20" />
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
              <span v-if="node.url">{{ node.bookmarkType === 'javascript' ? 'JavaScript 书签' : node.url }}</span>
              <span v-else>{{ node.children?.length ?? 0 }} 个节点</span>
            </component>
            <div class="node-meta">
              <el-tag v-if="node.visibility === 'private'" size="small" effect="plain">私有</el-tag>
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
                  <el-dropdown-item v-if="node.nodeType === 'bookmark' && node.bookmarkType === 'url'" @click="runChecks(node.id)"><Activity :size="15" />检测链接</el-dropdown-item>
                  <el-dropdown-item divided @click="removeNode(node)">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </article>
        </template>
        <el-empty v-if="!navigation.loading && navigation.visibleNodes.length === 0" description="暂无内容" />
      </div>
    </main>

    <AuthDialog v-model="authOpen" :initialized="auth.initialized" @authenticated="authenticated" />
    <NodeEditor
      v-model="editorOpen"
      :parent-id="navigation.selectedFolderId"
      :node="editingNode"
      :initial-type="initialType"
      @submit="saveNode"
    />
    <ImportDialog v-model="importOpen" :parent-id="navigation.selectedFolderId" @imported="navigation.loadTree" />
    <BackupDialog v-model="backupOpen" @restored="navigation.loadTree" />
  </div>
</template>
