<script setup lang="ts">
import type { NavigationNode } from '@cancanworld/contracts'
import {
  Activity,
  ArrowLeft,
  Download,
  Edit3,
  FolderPlus,
  ImageDown,
  Import,
  LayoutDashboard,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X
} from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiRequest } from '../api/client'
import BookmarkIcon from './BookmarkIcon.vue'

interface AdminSummary {
  counts: {
    folders: number
    bookmarks: number
    privateBookmarks: number
    missingIcons: number
    unavailable: number
    icons: number
  }
  linkCheckSchedule: {
    enabled: boolean
    intervalSeconds: number
  }
  checkJobs: AdminJob[]
  faviconJobs: AdminJob[]
}

interface AdminJob {
  id: string
  status: string
  total: number
  processed: number
  succeeded: number
  failed: number
  createdAt: string
}

interface FlatNode {
  node: NavigationNode
  path: string
}

interface ActiveTask {
  id: string
  status: string
  total: number
  processed: number
  label: string
}

const props = defineProps<{
  nodes: NavigationNode[]
  selectedFolderId: number
  layoutStyle: 'style1' | 'style2'
  theme: 'default' | 'compact' | 'bookmark'
  checkJob: ActiveTask | null
  faviconJob: ActiveTask | null
}>()

const emit = defineEmits<{
  close: []
  create: [type: 'folder' | 'bookmark']
  edit: [node: NavigationNode]
  remove: [node: NavigationNode]
  import: []
  backup: []
  check: [scope: 'folder' | 'all']
  favicon: [options: { folderId?: number; refresh: boolean; label: string }]
  'cancel-task': [kind: 'check' | 'favicon']
  'layout-change': [value: 'style1' | 'style2']
  'theme-change': [value: 'default' | 'compact' | 'bookmark']
}>()

const activeTab = ref('overview')
const summary = ref<AdminSummary | null>(null)
const loading = ref(false)
const query = ref('')
const nodeType = ref<'all' | 'folder' | 'bookmark'>('all')
const page = ref(1)
const pageSize = ref(50)
const scheduleForm = reactive({ enabled: true, intervalSeconds: 1800 })
const scheduleSaving = ref(false)

// 后台表格一次压平完整树，再由客户端筛选和分页，避免每次输入都重新请求全量数据。
const flatNodes = computed(() => flattenNodes(props.nodes))
const filteredNodes = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return flatNodes.value.filter(({ node, path }) => {
    if (nodeType.value !== 'all' && node.nodeType !== nodeType.value) return false
    if (!keyword) return true
    return [node.title, node.url ?? '', node.remark ?? '', node.description ?? '', node.tags.join(' '), path]
      .some((value) => value.toLocaleLowerCase().includes(keyword))
  })
})
const pagedNodes = computed(() => filteredNodes.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

watch([query, nodeType, pageSize], () => { page.value = 1 })
watch(() => [props.checkJob?.status, props.faviconJob?.status], (statuses, previous) => {
  const finished = statuses.some((status, index) => status !== previous?.[index] && status && !['pending', 'running'].includes(status))
  if (finished) void loadSummary()
})

/** 后台概览聚合数据独立刷新，节点表继续复用前台已经加载的完整树。 */
async function loadSummary(): Promise<void> {
  loading.value = true
  try {
    summary.value = await apiRequest<AdminSummary>('/api/v1/admin/summary')
    scheduleForm.enabled = summary.value.linkCheckSchedule.enabled
    scheduleForm.intervalSeconds = summary.value.linkCheckSchedule.intervalSeconds
  } finally {
    loading.value = false
  }
}

/** 保存后台定时检测设置；调度器会在下一次轮询时读取新值。 */
async function saveSchedule(): Promise<void> {
  scheduleSaving.value = true
  try {
    const saved = await apiRequest<AdminSummary['linkCheckSchedule']>('/api/v1/settings/link-check', {
      method: 'PUT',
      body: JSON.stringify(scheduleForm)
    })
    scheduleForm.enabled = saved.enabled
    scheduleForm.intervalSeconds = saved.intervalSeconds
    if (summary.value) summary.value.linkCheckSchedule = saved
    ElMessage.success('定时检测设置已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存定时检测设置失败')
  } finally {
    scheduleSaving.value = false
  }
}

/** 递归压平目录树并保留完整目录路径，供后台统一检索和表格展示。 */
function flattenNodes(nodes: NavigationNode[], ancestors: string[] = []): FlatNode[] {
  const result: FlatNode[] = []
  for (const node of nodes) {
    const path = [...ancestors, node.title]
    result.push({ node, path: path.join(' / ') })
    if (node.children?.length) result.push(...flattenNodes(node.children, path))
  }
  return result
}

/** 最近任务时间按当前浏览器的中文区域设置展示。 */
function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

/** 将数据库设置中的秒数转换为后台可读的中文周期。 */
function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`
  return `${seconds} 秒`
}

onMounted(() => void loadSummary())
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="admin-brand"><span class="brand-mark">C</span><div><strong>CanCanWorld</strong><span>后台管理</span></div></div>
      <nav class="admin-nav" aria-label="后台导航">
        <button :class="{ 'is-active': activeTab === 'overview' }" type="button" @click="activeTab = 'overview'"><LayoutDashboard :size="18" />概览</button>
        <button :class="{ 'is-active': activeTab === 'nodes' }" type="button" @click="activeTab = 'nodes'"><Link2 :size="18" />书签与目录</button>
        <button :class="{ 'is-active': activeTab === 'tasks' }" type="button" @click="activeTab = 'tasks'; loadSummary()"><Activity :size="18" />后台任务</button>
        <button :class="{ 'is-active': activeTab === 'appearance' }" type="button" @click="activeTab = 'appearance'"><Settings :size="18" />外观设置</button>
      </nav>
      <button class="admin-return" type="button" @click="emit('close')"><ArrowLeft :size="17" />返回前台</button>
    </aside>

    <main class="admin-main">
      <header class="admin-header">
        <div><p>站点管理</p><h1>{{ activeTab === 'overview' ? '运行概览' : activeTab === 'nodes' ? '书签与目录' : activeTab === 'tasks' ? '后台任务' : '外观设置' }}</h1></div>
        <el-tooltip content="刷新数据" placement="bottom"><button class="icon-button bordered" type="button" aria-label="刷新后台数据" @click="loadSummary"><RefreshCw :size="17" /></button></el-tooltip>
      </header>

      <section v-if="activeTab === 'overview'" v-loading="loading" class="admin-content">
        <div class="metric-grid">
          <article><span>书签</span><strong>{{ summary?.counts.bookmarks ?? 0 }}</strong></article>
          <article><span>目录</span><strong>{{ summary?.counts.folders ?? 0 }}</strong></article>
          <article><span>已获取图标</span><strong>{{ summary?.counts.icons ?? 0 }}</strong></article>
          <article><span>缺少图标</span><strong>{{ summary?.counts.missingIcons ?? 0 }}</strong></article>
          <article><span>私有书签</span><strong>{{ summary?.counts.privateBookmarks ?? 0 }}</strong></article>
          <article><span>连接异常</span><strong>{{ summary?.counts.unavailable ?? 0 }}</strong></article>
        </div>
        <div class="admin-section">
          <div class="admin-section-heading"><div><h2>常用操作</h2><p>管理动作仍通过统一 API 和事务执行</p></div></div>
          <div class="quick-actions">
            <button type="button" @click="emit('create', 'bookmark')"><Plus :size="18" /><span>新建书签</span></button>
            <button type="button" @click="emit('create', 'folder')"><FolderPlus :size="18" /><span>新建目录</span></button>
            <button type="button" @click="emit('import')"><Import :size="18" /><span>导入 HTML</span></button>
            <button type="button" @click="emit('backup')"><Download :size="18" /><span>备份与恢复</span></button>
            <button type="button" @click="emit('check', 'all')"><Activity :size="18" /><span>检测全部链接</span></button>
            <button type="button" @click="emit('favicon', { refresh: false, label: '缺失图标' })"><ImageDown :size="18" /><span>获取缺失图标</span></button>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'nodes'" class="admin-content">
        <div class="admin-toolbar">
          <label class="admin-search"><Search :size="16" /><input v-model="query" type="search" placeholder="搜索名称、地址、备注、注释、标签或路径" /></label>
          <el-segmented v-model="nodeType" :options="[{ label: '全部', value: 'all' }, { label: '书签', value: 'bookmark' }, { label: '目录', value: 'folder' }]" />
          <button class="command-button primary" type="button" @click="emit('create', 'bookmark')"><Plus :size="16" />新建书签</button>
        </div>
        <div class="admin-table-wrap">
          <el-table :data="pagedNodes" height="100%" row-key="node.id">
            <el-table-column label="图标" width="64"><template #default="scope"><span class="admin-node-icon"><BookmarkIcon :node="scope.row.node" :size="20" /></span></template></el-table-column>
            <el-table-column label="名称与备注" min-width="250"><template #default="scope"><div class="admin-node-copy"><strong>{{ scope.row.node.title }}</strong><span>{{ scope.row.node.remark || scope.row.node.description || scope.row.node.url || '目录' }}</span></div></template></el-table-column>
            <el-table-column label="路径" min-width="220" prop="path" show-overflow-tooltip />
            <el-table-column label="类型" width="84"><template #default="scope">{{ scope.row.node.nodeType === 'folder' ? '目录' : '书签' }}</template></el-table-column>
            <el-table-column label="可见性" width="90"><template #default="scope"><el-tag size="small" effect="plain">{{ scope.row.node.visibility === 'private' ? '私有' : '公开' }}</el-tag></template></el-table-column>
            <el-table-column label="状态" width="112"><template #default="scope">{{ scope.row.node.lastCheckStatus || '未检测' }}</template></el-table-column>
            <el-table-column label="点击" width="84"><template #default="scope">{{ scope.row.node.nodeType === 'bookmark' ? scope.row.node.clickCount : '-' }}</template></el-table-column>
            <el-table-column label="操作" width="104" fixed="right"><template #default="scope"><div class="table-actions"><el-tooltip content="编辑"><button class="icon-button" type="button" aria-label="编辑节点" @click="emit('edit', scope.row.node)"><Edit3 :size="16" /></button></el-tooltip><el-tooltip content="删除"><button class="icon-button danger" type="button" aria-label="删除节点" @click="emit('remove', scope.row.node)"><Trash2 :size="16" /></button></el-tooltip></div></template></el-table-column>
          </el-table>
        </div>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[20, 50, 100, 200]"
          :total="filteredNodes.length"
        />
      </section>

      <section v-else-if="activeTab === 'tasks'" v-loading="loading" class="admin-content task-layout">
        <div class="admin-section schedule-section">
          <div class="admin-section-heading"><div><h2>定时检测</h2><p>服务端按固定周期创建全库链接检测任务；存在运行中任务时会跳过本轮，避免任务堆积。</p></div><el-tag :type="scheduleForm.enabled ? 'success' : 'info'" effect="plain">{{ scheduleForm.enabled ? '已启用' : '未启用' }}</el-tag></div>
          <div class="schedule-controls">
            <label><span>启用定时检测</span><el-switch v-model="scheduleForm.enabled" /></label>
            <label><span>执行周期</span><el-input-number v-model="scheduleForm.intervalSeconds" :min="60" :max="604800" :step="60" controls-position="right" /><small>{{ formatInterval(scheduleForm.intervalSeconds) }}</small></label>
            <button class="command-button primary" type="button" :disabled="scheduleSaving" @click="saveSchedule">{{ scheduleSaving ? '保存中...' : '保存设置' }}</button>
          </div>
        </div>
        <div class="admin-section">
          <div class="admin-section-heading"><div><h2>链接检测</h2><p>查看最近任务或创建新的范围检测</p></div><div><button class="command-button" type="button" @click="emit('check', 'folder')">当前目录</button><button class="command-button primary" type="button" @click="emit('check', 'all')">全部链接</button></div></div>
          <div v-if="props.checkJob && ['pending', 'running'].includes(props.checkJob.status)" class="admin-task-progress">
            <div><strong>{{ props.checkJob.label }}</strong><span>{{ props.checkJob.processed }} / {{ props.checkJob.total }}</span></div>
            <el-progress :percentage="props.checkJob.total ? Math.round(props.checkJob.processed / props.checkJob.total * 100) : 0" :stroke-width="7" />
            <el-tooltip content="取消检测"><button class="icon-button danger" type="button" aria-label="取消链接检测" @click="emit('cancel-task', 'check')"><X :size="17" /></button></el-tooltip>
          </div>
          <el-table :data="summary?.checkJobs ?? []"><el-table-column label="创建时间"><template #default="scope">{{ formatTime(scope.row.createdAt) }}</template></el-table-column><el-table-column prop="status" label="状态" width="110" /><el-table-column label="进度" width="130"><template #default="scope">{{ scope.row.processed }} / {{ scope.row.total }}</template></el-table-column><el-table-column prop="failed" label="失败" width="80" /></el-table>
        </div>
        <div class="admin-section">
          <div class="admin-section-heading"><div><h2>图标获取</h2><p>后台抓取并缓存同源 favicon</p></div><div><button class="command-button" type="button" @click="emit('favicon', { folderId: props.selectedFolderId, refresh: false, label: '当前目录图标' })">当前目录</button><button class="command-button primary" type="button" @click="emit('favicon', { refresh: false, label: '缺失图标' })">全部缺失</button></div></div>
          <div v-if="props.faviconJob && ['pending', 'running'].includes(props.faviconJob.status)" class="admin-task-progress">
            <div><strong>{{ props.faviconJob.label }}</strong><span>{{ props.faviconJob.processed }} / {{ props.faviconJob.total }}</span></div>
            <el-progress :percentage="props.faviconJob.total ? Math.round(props.faviconJob.processed / props.faviconJob.total * 100) : 0" :stroke-width="7" />
            <el-tooltip content="取消获取"><button class="icon-button danger" type="button" aria-label="取消图标获取" @click="emit('cancel-task', 'favicon')"><X :size="17" /></button></el-tooltip>
          </div>
          <el-table :data="summary?.faviconJobs ?? []"><el-table-column label="创建时间"><template #default="scope">{{ formatTime(scope.row.createdAt) }}</template></el-table-column><el-table-column prop="status" label="状态" width="110" /><el-table-column label="进度" width="130"><template #default="scope">{{ scope.row.processed }} / {{ scope.row.total }}</template></el-table-column><el-table-column prop="failed" label="失败" width="80" /></el-table>
        </div>
      </section>

      <section v-else class="admin-content">
        <div class="admin-section appearance-form">
          <div><h2>前台布局</h2><p>风格 1 保留管理列表；风格 2 使用 OneNav 式卡片网格。</p></div>
          <el-segmented :model-value="props.layoutStyle" :options="[{ label: '风格 1', value: 'style1' }, { label: '风格 2', value: 'style2' }]" @change="emit('layout-change', $event as 'style1' | 'style2')" />
          <div><h2>显示密度</h2><p>密度设置独立于布局风格。</p></div>
          <el-segmented :model-value="props.theme" :options="[{ label: '标准', value: 'default' }, { label: '紧凑', value: 'compact' }, { label: '暖色', value: 'bookmark' }]" @change="emit('theme-change', $event as 'default' | 'compact' | 'bookmark')" />
        </div>
      </section>
    </main>
  </div>
</template>
