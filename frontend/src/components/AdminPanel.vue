<script setup lang="ts">
import type { AdminNodeBatchTagResult, AdminNodeFilterPreset, AdminNodeFilterPresetInput, AdminNodeQuery, NavigationNode } from '@cancanworld/contracts'
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
  LocateFixed,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Tags,
  Trash2,
  X
} from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { apiRequest } from '../api/client'
import BookmarkIcon from './BookmarkIcon.vue'
import AdminGovernance from './AdminGovernance.vue'
import AdminNodeFilters from './AdminNodeFilters.vue'
import { countAdvancedFilters, displayNodePath, locateFolderId } from './admin-node-model'
import { useAdminNodeQuery } from '../composables/use-admin-node-query'

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
  /** 节点写入后递增，后台表格据此刷新当前服务端查询。 */
  refreshToken?: number
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
  'locate-folder': [folderId: number]
  'layout-change': [value: 'style1' | 'style2']
  'theme-change': [value: 'default' | 'compact' | 'bookmark']
  /** 批量写入已提交，请求宿主重载前台树以同步标签展示和筛选候选。 */
  'tags-updated': []
}>()

/** 与 adminNodeBatchTagSchema 的上限保持同步，用于提交前的本地提示。 */
const BATCH_TAG_NODE_LIMIT = 200
const BATCH_TAG_LIMIT = 20

const activeTab = ref('overview')
const summary = ref<AdminSummary | null>(null)
const loading = ref(false)
const filterOpen = ref(false)
const presets = ref<AdminNodeFilterPreset[]>([])
const savingPresets = ref(false)
const batchTagOpen = ref(false)
const batchTagSaving = ref(false)
const batchTagMode = ref<'add' | 'remove' | 'replace'>('add')
const batchTagValues = ref<string[]>([])
const selectedRows = ref<Array<{ node: NavigationNode; path: string }>>([])
const nodeTable = ref<{ clearSelection: () => void } | null>(null)
const governanceView = ref<{ refresh: () => Promise<void> } | null>(null)
const nodeQuery = useAdminNodeQuery()
const draftQuery = nodeQuery.draft
const appliedQuery = computed(() => nodeQuery.applied.value)
const nodeLoading = computed(() => nodeQuery.loading.value)
const nodeError = computed(() => nodeQuery.errorMessage.value)
let keywordTimer: ReturnType<typeof setTimeout> | null = null
let refreshQueued = false
const nodeType = computed({
  get: () => nodeQuery.draft.nodeTypes.length === 1 ? nodeQuery.draft.nodeTypes[0] : 'all',
  set: (value: 'all' | 'folder' | 'bookmark') => {
    nodeQuery.draft.nodeTypes = value === 'all' ? ['folder', 'bookmark'] : [value]
  }
})
watch(nodeType, (value, previous) => {
  if (activeTab.value === 'nodes' && value !== previous) void nodeQuery.applyDraft()
})
const nodeRows = computed(() => nodeQuery.items.value.map((node) => ({ node, path: displayNodePath(node) })))
const availableTags = computed(() => {
  const seen = new Set<string>()
  const tags: string[] = []
  const visit = (items: NavigationNode[]): void => {
    for (const item of items) {
      for (const tag of item.tags) {
        const trimmed = tag.trim()
        const key = trimmed.toLowerCase()
        if (trimmed && !seen.has(key)) { seen.add(key); tags.push(trimmed) }
      }
      if (item.children?.length) visit(item.children)
    }
  }
  visit(props.nodes)
  return tags
})
const scheduleForm = reactive({ enabled: true, intervalSeconds: 1800 })
const scheduleSaving = ref(false)

/** 表格开启 reserve-selection 后跨页累积选中行，目录可选但提交时由后端统计并跳过。 */
function handleNodeSelection(rows: Array<{ node: NavigationNode; path: string }>): void {
  selectedRows.value = rows
}

/** 清空选择同时重置表格内部保留状态，否则跨页保留的行会在刷新后复现。 */
function clearNodeSelection(): void {
  selectedRows.value = []
  nodeTable.value?.clearSelection()
}

/** 打开批量标签对话框时恢复追加模式，避免上次编辑状态污染本次操作。 */
function openBatchTags(): void {
  batchTagMode.value = 'add'
  batchTagValues.value = []
  batchTagOpen.value = true
}

/** 在一个请求中提交书签标签变更，目录和不存在节点由服务端返回汇总。 */
async function submitBatchTags(): Promise<void> {
  const bookmarkIds = selectedRows.value.filter(({ node }) => node.nodeType === 'bookmark').map(({ node }) => node.id)
  const tags = [...new Set(batchTagValues.value.map((tag) => tag.trim()).filter(Boolean))]
  if (bookmarkIds.length === 0) {
    ElMessage.warning('没有可修改的书签')
    return
  }
  // 与共享契约上限保持一致，避免整批请求被服务端拒绝后用户无从判断超限数量。
  if (bookmarkIds.length > BATCH_TAG_NODE_LIMIT) {
    ElMessage.warning(`一次最多修改 ${BATCH_TAG_NODE_LIMIT} 个书签，当前已选 ${bookmarkIds.length} 个`)
    return
  }
  if (batchTagMode.value !== 'replace' && tags.length === 0) {
    ElMessage.warning('请至少输入一个标签')
    return
  }
  if (tags.length > BATCH_TAG_LIMIT) {
    ElMessage.warning(`一次最多提交 ${BATCH_TAG_LIMIT} 个标签`)
    return
  }
  batchTagSaving.value = true
  try {
    const result = await apiRequest<AdminNodeBatchTagResult>('/api/v1/admin/nodes/batch-tags', {
      method: 'POST',
      body: JSON.stringify({ nodeIds: bookmarkIds, mode: batchTagMode.value, tags })
    })
    clearNodeSelection()
    batchTagOpen.value = false
    const skipped = result.skippedFolders + result.missing
    ElMessage.success(skipped > 0 ? `已更新 ${result.updated} 个书签，跳过 ${skipped} 项` : `已更新 ${result.updated} 个书签`)
    // 标签写入会同时改变前台树和筛选候选，交由宿主重载树；树引用变化会驱动表格刷新，无需在此重复查询。
    emit('tags-updated')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量修改标签失败')
  } finally {
    batchTagSaving.value = false
  }
}

watch(() => [props.checkJob?.status, props.faviconJob?.status], (statuses, previous) => {
  const finished = statuses.some((status, index) => status !== previous?.[index] && status && !['pending', 'running'].includes(status))
  if (finished) void loadSummary()
})
watch(() => props.refreshToken, () => {
  queueNodeRefresh()
})
watch(() => props.nodes, () => {
  queueNodeRefresh()
})

/** 合并同一轮节点写入触发的多个刷新通知，避免树引用和版本号同时变化导致重复请求。 */
function queueNodeRefresh(): void {
  if (activeTab.value !== 'nodes' || refreshQueued) return
  refreshQueued = true
  queueMicrotask(() => { refreshQueued = false; void nodeQuery.refresh() })
}

/** 后台概览聚合数据独立刷新，节点表查询由服务端分页接口负责。 */
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

/** 切换到节点页时才发起服务端查询，避免打开后台概览就加载大表。 */
function openNodesTab(): void {
  activeTab.value = 'nodes'
  void nodeQuery.refresh()
}

/** 顶部刷新按钮按当前页面刷新对应数据，避免概览请求覆盖节点查询状态。 */
function refreshCurrentView(): void {
  if (activeTab.value === 'nodes') void nodeQuery.refresh()
  else if (activeTab.value === 'governance') void governanceView.value?.refresh()
  else void loadSummary()
}

/** 治理视图请求编辑某个书签时，切回节点页并按 ID 定位，复用既有编辑入口。 */
function locateNodeForEdit(nodeId: number): void {
  const target = findNodeById(props.nodes, nodeId)
  if (!target) {
    ElMessage.warning('该书签可能已被删除，请刷新后重试')
    return
  }
  emit('edit', target)
}

/** 在完整树中按 ID 查找节点；治理接口只返回 ID，编辑器需要完整节点。 */
function findNodeById(nodes: NavigationNode[], id: number): NavigationNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = node.children?.length ? findNodeById(node.children, id) : null
    if (found) return found
  }
  return null
}

/** 关键词输入使用短防抖减少连续请求，按 Enter 可立即提交并清理待执行计时器。 */
function applyKeywordNow(): void {
  if (keywordTimer) { clearTimeout(keywordTimer); keywordTimer = null }
  void nodeQuery.applyDraft()
}

watch(() => draftQuery.keyword, () => {
  if (activeTab.value !== 'nodes') return
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    keywordTimer = null
    if (activeTab.value === 'nodes') void nodeQuery.applyDraft()
  }, 300)
})

/** 卸载后台面板时取消待处理防抖，避免关闭页面后仍发起查询请求。 */
onBeforeUnmount(() => {
  if (keywordTimer) { clearTimeout(keywordTimer); keywordTimer = null }
})

/** 读取当前管理员的筛选预设；损坏设置由服务端统一回退为空数组。 */
async function loadPresets(): Promise<void> {
  try { presets.value = await apiRequest<AdminNodeFilterPreset[]>('/api/v1/settings/admin-node-filters') } catch { presets.value = [] }
}

/** 用整集合覆盖保存预设，成功后以服务端规范化时间和查询为准。 */
async function persistPresets(next: AdminNodeFilterPresetInput[]): Promise<void> {
  savingPresets.value = true
  try {
    presets.value = await apiRequest<AdminNodeFilterPreset[]>('/api/v1/settings/admin-node-filters', { method: 'PUT', body: JSON.stringify(next) })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存筛选预设失败')
  } finally { savingPresets.value = false }
}

/** 将抽屉提交的草稿交给共享查询模型，统一校验并重置分页。 */
function applyFilter(value: AdminNodeQuery): void {
  Object.assign(nodeQuery.draft, value)
  void nodeQuery.applyDraft()
}

function applyPreset(preset: AdminNodeFilterPreset): void {
  /** 预设不携带瞬时页码，应用后回到第一页并触发服务端查询。 */
  Object.assign(nodeQuery.draft, preset.query, { page: 1 })
  void nodeQuery.applyDraft()
}

/** 高级筛选重置保留预设列表，只恢复共享查询默认值。 */
function resetFilter(): void { void nodeQuery.reset() }

/** 新预设追加到当前集合，服务端负责校验名称、UUID 和数量上限。 */
function savePreset(input: AdminNodeFilterPresetInput): void {
  const next = [...presets.value.map(({ updatedAt: _updatedAt, ...preset }) => preset), input]
  void persistPresets(next)
}

/** 重命名只改动目标预设，避免覆盖其他已保存筛选。 */
function renamePreset(input: { id: string; name: string }): void {
  const next = presets.value.map((preset) => preset.id === input.id ? { ...preset, name: input.name } : preset)
  void persistPresets(next.map(({ updatedAt: _updatedAt, ...preset }) => preset))
}

/** 删除预设后以整集合写回设置项，保证服务端状态与列表一致。 */
function deletePreset(id: string): void {
  void persistPresets(presets.value.filter((preset) => preset.id !== id).map(({ updatedAt: _updatedAt, ...preset }) => preset))
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

onMounted(() => { void loadSummary(); void loadPresets() })
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="admin-brand"><span class="brand-mark">C</span><div><strong>CanCanWorld</strong><span>后台管理</span></div></div>
      <nav class="admin-nav" aria-label="后台导航">
        <button :class="{ 'is-active': activeTab === 'overview' }" type="button" @click="activeTab = 'overview'"><LayoutDashboard :size="18" />概览</button>
        <button :class="{ 'is-active': activeTab === 'nodes' }" type="button" @click="openNodesTab"><Link2 :size="18" />书签与目录</button>
        <button :class="{ 'is-active': activeTab === 'governance' }" type="button" @click="activeTab = 'governance'"><ShieldAlert :size="18" />链接治理</button>
        <button :class="{ 'is-active': activeTab === 'tasks' }" type="button" @click="activeTab = 'tasks'; loadSummary()"><Activity :size="18" />后台任务</button>
        <button :class="{ 'is-active': activeTab === 'appearance' }" type="button" @click="activeTab = 'appearance'"><Settings :size="18" />外观设置</button>
      </nav>
      <button class="admin-return" type="button" @click="emit('close')"><ArrowLeft :size="17" />返回前台</button>
    </aside>

    <main class="admin-main">
      <header class="admin-header">
        <div><p>站点管理</p><h1>{{ activeTab === 'overview' ? '运行概览' : activeTab === 'nodes' ? '书签与目录' : activeTab === 'governance' ? '链接治理' : activeTab === 'tasks' ? '后台任务' : '外观设置' }}</h1></div>
        <el-tooltip content="刷新数据" placement="bottom"><button class="icon-button bordered" type="button" aria-label="刷新后台数据" @click="refreshCurrentView"><RefreshCw :size="17" /></button></el-tooltip>
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
          <label class="admin-search"><Search :size="16" /><input v-model="draftQuery.keyword" type="search" placeholder="搜索名称、地址、备注、注释、标签或路径" @keyup.enter="applyKeywordNow" /></label>
          <el-segmented v-model="nodeType" :options="[{ label: '全部', value: 'all' }, { label: '书签', value: 'bookmark' }, { label: '目录', value: 'folder' }]" />
          <button class="command-button" type="button" @click="filterOpen = true"><SlidersHorizontal :size="16" />高级筛选<span v-if="countAdvancedFilters(appliedQuery)" class="filter-count">{{ countAdvancedFilters(appliedQuery) }}</span></button>
          <button class="command-button primary" type="button" @click="emit('create', 'bookmark')"><Plus :size="16" />新建书签</button>
        </div>
        <p v-if="nodeError" class="admin-query-error" role="alert">{{ nodeError }} <button class="command-button" type="button" data-testid="node-query-retry" @click="nodeQuery.refresh">重试</button></p>
        <div class="admin-table-wrap">
          <div v-if="selectedRows.length" class="admin-batch-toolbar">
            <span>已选 {{ selectedRows.length }} 项</span>
            <button class="command-button" type="button" data-testid="batch-tags-open" @click="openBatchTags"><Tags :size="16" />批量修改标签</button>
            <button class="command-button" type="button" data-testid="batch-clear-selection" @click="clearNodeSelection">清空选择</button>
          </div>
          <el-table ref="nodeTable" v-loading="nodeLoading" :data="nodeRows" height="100%" row-key="node.id" @selection-change="handleNodeSelection">
            <el-table-column type="selection" width="48" reserve-selection />
            <el-table-column label="图标" width="64"><template #default="scope"><span class="admin-node-icon"><BookmarkIcon :node="scope.row.node" :size="20" /></span></template></el-table-column>
            <el-table-column label="名称与备注" min-width="250"><template #default="scope"><div class="admin-node-copy"><strong>{{ scope.row.node.title }}</strong><span>{{ scope.row.node.remark || scope.row.node.description || scope.row.node.url || '目录' }}</span></div></template></el-table-column>
            <el-table-column label="路径" min-width="220"><template #default="scope"><el-tooltip content="定位目录" placement="top"><button class="admin-node-path" :data-testid="`locate-node-${scope.row.node.id}`" type="button" :aria-label="`定位目录：${scope.row.path}`" @click="emit('locate-folder', locateFolderId(scope.row.node))"><LocateFixed :size="14" /><span>{{ scope.row.path }}</span></button></el-tooltip></template></el-table-column>
            <el-table-column label="类型" width="84"><template #default="scope">{{ scope.row.node.nodeType === 'folder' ? '目录' : '书签' }}</template></el-table-column>
            <el-table-column label="可见性" width="90"><template #default="scope"><el-tag size="small" effect="plain">{{ scope.row.node.visibility === 'private' ? '私有' : '公开' }}</el-tag></template></el-table-column>
            <el-table-column label="状态" width="112"><template #default="scope">{{ scope.row.node.lastCheckStatus || '未检测' }}</template></el-table-column>
            <el-table-column label="点击" width="84"><template #default="scope">{{ scope.row.node.nodeType === 'bookmark' ? scope.row.node.clickCount : '-' }}</template></el-table-column>
            <el-table-column label="操作" width="104" fixed="right"><template #default="scope"><div class="table-actions"><el-tooltip content="编辑"><button class="icon-button" type="button" aria-label="编辑节点" @click="emit('edit', scope.row.node)"><Edit3 :size="16" /></button></el-tooltip><el-tooltip content="删除"><button class="icon-button danger" type="button" aria-label="删除节点" @click="emit('remove', scope.row.node)"><Trash2 :size="16" /></button></el-tooltip></div></template></el-table-column>
          </el-table>
        </div>
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[20, 50, 100, 200]"
          :current-page="appliedQuery.page"
          :page-size="appliedQuery.pageSize"
          :total="nodeQuery.total.value"
          @current-change="nodeQuery.changePage"
          @size-change="nodeQuery.changePageSize"
        />
        <AdminNodeFilters
          v-model="filterOpen"
          :query="draftQuery"
          :nodes="props.nodes"
          :tags="availableTags"
          :presets="presets"
          :saving-presets="savingPresets"
          @apply="applyFilter"
          @reset="resetFilter"
          @apply-preset="applyPreset"
          @save-preset="savePreset"
          @rename-preset="renamePreset"
          @delete-preset="deletePreset"
        />
        <el-dialog v-model="batchTagOpen" title="批量修改标签" width="min(460px, calc(100vw - 32px))" :close-on-click-modal="!batchTagSaving" :close-on-press-escape="!batchTagSaving" :show-close="!batchTagSaving">
          <div class="admin-batch-form">
            <!-- 单选组含多个可聚焦控件，用 aria-labelledby 关联标题而不是包裹在单个 label 内。 -->
            <div class="admin-batch-field">
              <span id="batch-tag-mode-label">操作</span>
              <el-segmented v-model="batchTagMode" aria-labelledby="batch-tag-mode-label" :options="[{ label: '追加', value: 'add' }, { label: '移除', value: 'remove' }, { label: '覆盖', value: 'replace' }]" />
            </div>
            <div class="admin-batch-field">
              <span id="batch-tag-values-label">标签</span>
              <div class="admin-batch-tags"><el-select v-model="batchTagValues" aria-labelledby="batch-tag-values-label" multiple filterable allow-create default-first-option /></div>
            </div>
          </div>
          <template #footer>
            <el-button :disabled="batchTagSaving" @click="batchTagOpen = false">取消</el-button>
            <el-button type="primary" :loading="batchTagSaving" :disabled="batchTagSaving" style="width: 96px" data-testid="batch-submit" @click="submitBatchTags">确认修改</el-button>
          </template>
        </el-dialog>
      </section>

      <section v-else-if="activeTab === 'governance'" class="admin-content">
        <AdminGovernance ref="governanceView" @nodes-changed="emit('tags-updated')" @edit-node="locateNodeForEdit" />
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
