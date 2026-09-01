<script setup lang="ts">
import type { AdminNodeFilterPreset, AdminNodeFilterPresetInput, AdminNodeQuery, NavigationNode } from '@cancanworld/contracts'
import { computed, h, reactive, ref, watch, type VNode } from 'vue'
import { Check, Pencil, RotateCcw, Save, SlidersHorizontal, Trash2, X } from 'lucide-vue-next'
import { buildFolderOptions } from './node-editor-model'
import { cloneAdminNodeQuery } from './admin-node-model'

const props = withDefaults(defineProps<{
  modelValue: boolean
  query: AdminNodeQuery
  nodes: NavigationNode[]
  tags: string[]
  presets: AdminNodeFilterPreset[]
  savingPresets: boolean
}>(), { nodes: () => [], tags: () => [], presets: () => [], savingPresets: false })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [value: AdminNodeQuery]
  reset: []
  'apply-preset': [value: AdminNodeFilterPreset]
  'save-preset': [value: AdminNodeFilterPresetInput]
  'rename-preset': [value: { id: string; name: string }]
  'delete-preset': [value: string]
}>()

const draft = reactive<AdminNodeQuery>(cloneAdminNodeQuery(props.query))
const createdRange = ref<Array<Date | null>>([])
const checkedRange = ref<Array<Date | null>>([])
const presetName = ref('')
const renamingId = ref<string | null>(null)
const renameName = ref('')

const folderOptions = computed(() => buildFolderOptions(props.nodes))
const uniqueTags = computed(() => {
  const seen = new Set<string>()
  return props.tags.map((tag) => tag.trim()).filter((tag) => {
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) return false
    seen.add(key)
    return true
  })
})
const duplicatePresetName = computed(() => {
  const value = presetName.value.trim()
  return value.length > 0 && props.presets.some((preset) => preset.name.trim() === value)
})

/** 打开抽屉时同步外部查询，关闭后保留草稿直到下一次打开。 */
watch(() => props.modelValue, (open) => {
  if (!open) return
  Object.assign(draft, cloneAdminNodeQuery(props.query))
  createdRange.value = toRange(props.query.createdFrom, props.query.createdTo)
  checkedRange.value = toRange(props.query.checkedFrom, props.query.checkedTo)
}, { immediate: true })

/** 父组件切换查询时同步当前草稿，避免预设应用后显示旧值。 */
watch(() => props.query, (value) => {
  if (!props.modelValue) return
  Object.assign(draft, cloneAdminNodeQuery(value))
  createdRange.value = toRange(value.createdFrom, value.createdTo)
  checkedRange.value = toRange(value.checkedFrom, value.checkedTo)
}, { deep: true })

/** 将可选的两个边界转换成日期控件需要的稳定数组形状。 */
function toRange(from: string | undefined, to: string | undefined): Array<Date | null> {
  return from || to ? [from ? new Date(from) : null, to ? new Date(to) : null] : []
}

/** 日期控件可能返回 Date 或 ISO 字符串；统一为可被共享 Schema 校验的 ISO 值。 */
function setRange(target: 'created' | 'checked', value: unknown): void {
  const values = Array.isArray(value) ? value : []
  const dates = values.map((item) => item === null || item === undefined || item === '' ? null : item instanceof Date ? item : new Date(String(item))).map((item) => item && Number.isNaN(item.getTime()) ? null : item)
  if (target === 'created') {
    createdRange.value = dates
    draft.createdFrom = dates[0]?.toISOString()
    draft.createdTo = dates[1]?.toISOString()
  } else {
    checkedRange.value = dates
    draft.checkedFrom = dates[0]?.toISOString()
    draft.checkedTo = dates[1]?.toISOString()
  }
}

/** 为深层目录标签提供原生 tooltip，长名称仍由弹层样式省略显示。 */
function renderFolderLabel(render: typeof h, context: { data: { label?: string } }): VNode {
  const label = context.data.label ?? ''
  return render('span', { title: label }, label)
}

/** 兼容 Element 事件和语义测试桩可能发出的字符串布尔值。 */
function setBoolean(field: 'includeDescendants' | 'enabled', value: unknown): void {
  const next = value === true || value === 'true'
  draft[field] = next
}

/** 分段控件的“全部”选项以 undefined 表示，避免把空值发送为非法枚举。 */
function setVisibility(value: unknown): void {
  draft.visibility = value === 'private' ? 'private' : value === 'public' ? 'public' : undefined
}

/** 标签输入统一去空格并去重，保持共享查询集合约束。 */
function setTags(value: unknown): void {
  const values = Array.isArray(value) ? value : value === undefined || value === '' ? [] : [value]
  draft.tags = [...new Set(values.map(String).map((tag) => tag.trim()).filter((tag) => tag.length > 0))]
}

/** 健康度多选仅接受共享契约中的三种结论值。 */
function setHealth(value: unknown): void {
  const values = Array.isArray(value) ? value : value === undefined || value === '' ? [] : [value]
  draft.health = [...new Set(values.map(String))].filter((value): value is AdminNodeQuery['health'][number] => value === 'unchecked' || value === 'responded' || value === 'unreachable')
}

/** 应用始终提交深拷贝并回到第一页，分页状态由筛选动作重新计算。 */
function apply(): void {
  const snapshot = cloneAdminNodeQuery({ ...draft, page: 1 })
  emit('apply', snapshot)
  emit('update:modelValue', false)
}

function reset(): void {
  /** 重置交由父级恢复共享默认查询，预设列表保持不变。 */
  emit('reset')
}

/** 生成预设标识；HTTP/LAN 部署可能没有 randomUUID，使用随机字节或时间熵兜底。 */
function createPresetId(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // 某些非安全上下文访问 randomUUID 会直接抛出异常，继续走兼容分支。
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else {
    const now = Date.now()
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (now + Math.random() * 256) & 0xff
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 预设只保存持久筛选条件，剥离 page 后再交给共享输入契约。 */
function savePreset(): void {
  const name = presetName.value.trim()
  if (props.savingPresets || !name) return
  const { page: _page, ...savedQuery } = cloneAdminNodeQuery(draft)
  emit('save-preset', { id: createPresetId(), name, query: savedQuery })
  presetName.value = ''
}

function applyPreset(preset: AdminNodeFilterPreset): void {
  /** 预设对象和其中数组均复制后再发出，防止编辑抽屉反向修改列表。 */
  if (!props.savingPresets) emit('apply-preset', { ...preset, query: cloneAdminNodeQuery({ ...preset.query, page: 1 }) })
}

/** 进入重命名状态时复制原名称，取消不会污染预设列表。 */
function beginRename(preset: AdminNodeFilterPreset): void {
  if (props.savingPresets) return
  renamingId.value = preset.id
  renameName.value = preset.name
}

/** 重命名仅提交非空名称，保存锁期间忽略确认操作。 */
function confirmRename(id: string): void {
  const name = renameName.value.trim()
  if (!props.savingPresets && name) emit('rename-preset', { id, name })
  renamingId.value = null
}

/** 删除事件只携带预设 ID，服务端负责持久化和权限校验。 */
function deletePreset(id: string): void {
  if (!props.savingPresets) emit('delete-preset', id)
}
</script>

<template>
  <el-drawer :model-value="props.modelValue" class="admin-filter-drawer" :with-header="true" title="高级筛选" direction="rtl" @close="emit('update:modelValue', false)">
    <div class="admin-filter-form">
      <el-form label-position="top">
        <el-form-item label="目录">
          <el-tree-select
            :model-value="draft.folderId"
            data-testid="filter-folder"
            :data="folderOptions"
            node-key="id"
            :props="{ value: 'id', label: 'label', children: 'children' }"
            check-strictly
            filterable
            :render-content="renderFolderLabel"
            style="width: 100%"
            @update:model-value="(value: unknown) => { draft.folderId = Number(value) || 1 }"
          />
        </el-form-item>
        <el-form-item>
          <el-switch :model-value="draft.includeDescendants" data-testid="filter-descendants" @update:model-value="setBoolean('includeDescendants', $event)" />
          <span class="admin-filter-inline-label">包含子目录</span>
        </el-form-item>
        <el-form-item label="标签">
          <el-select :model-value="draft.tags" data-testid="filter-tags" multiple filterable collapse-tags style="width: 100%" @update:model-value="setTags">
            <el-option v-for="tag in uniqueTags" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签匹配">
          <el-segmented :model-value="draft.tagMode" data-testid="filter-tag-mode" :options="[{ label: '任一', value: 'any' }, { label: '全部', value: 'all' }]" @update:model-value="(value: unknown) => { draft.tagMode = value === 'all' ? 'all' : 'any' }" />
        </el-form-item>
        <el-form-item label="可见性">
          <el-segmented :model-value="draft.visibility" data-testid="filter-visibility" :options="[{ label: '全部', value: undefined }, { label: '公开', value: 'public' }, { label: '私有', value: 'private' }]" @update:model-value="setVisibility" />
        </el-form-item>
        <el-form-item label="启用状态">
          <el-segmented :model-value="draft.enabled" data-testid="filter-enabled" :options="[{ label: '全部', value: undefined }, { label: '启用', value: true }, { label: '停用', value: false }]" @update:model-value="(value: unknown) => { draft.enabled = value === undefined || value === '' ? undefined : value === true || value === 'true' }" />
        </el-form-item>
        <el-form-item label="检测健康度">
          <el-select :model-value="draft.health" data-testid="filter-health" multiple collapse-tags style="width: 100%" @update:model-value="setHealth">
            <el-option label="未检测" value="unchecked" /><el-option label="可访问" value="responded" /><el-option label="不可访问" value="unreachable" />
          </el-select>
        </el-form-item>
        <el-form-item label="创建时间">
          <el-date-picker :model-value="createdRange" data-testid="filter-created-range" type="datetimerange" style="width: 100%" @update:model-value="setRange('created', $event)" />
        </el-form-item>
        <el-form-item label="检测时间">
          <el-date-picker :model-value="checkedRange" data-testid="filter-checked-range" type="datetimerange" style="width: 100%" @update:model-value="setRange('checked', $event)" />
        </el-form-item>
        <div class="admin-filter-sort-row">
          <el-form-item label="排序字段"><el-select :model-value="draft.sortBy" data-testid="filter-sort-by" style="width: 100%" @update:model-value="(value: unknown) => { if (value === 'tree' || value === 'title' || value === 'createdAt' || value === 'clickCount' || value === 'lastCheckedAt') draft.sortBy = value }"><el-option label="目录顺序" value="tree" /><el-option label="名称" value="title" /><el-option label="创建时间" value="createdAt" /><el-option label="点击次数" value="clickCount" /><el-option label="检测时间" value="lastCheckedAt" /></el-select></el-form-item>
          <el-form-item label="方向"><el-select :model-value="draft.sortDirection" data-testid="filter-sort-direction" style="width: 100%" @update:model-value="(value: unknown) => { draft.sortDirection = value === 'asc' ? 'asc' : 'desc' }"><el-option label="升序" value="asc" /><el-option label="降序" value="desc" /></el-select></el-form-item>
        </div>
      </el-form>
      <section class="admin-filter-presets" aria-label="筛选预设">
        <h3>筛选预设</h3>
        <div class="admin-filter-preset-save"><el-input v-model="presetName" data-testid="preset-name" maxlength="40" placeholder="预设名称" /><el-button data-testid="preset-save" style="width: 88px" :disabled="props.savingPresets || !presetName.trim()" :loading="props.savingPresets" :title="duplicatePresetName ? '名称已存在，仍可保存' : '保存预设'" @click="savePreset"><Save :size="15" />另存</el-button></div>
        <p v-if="duplicatePresetName" class="admin-filter-duplicate">名称已存在，仍可保存</p>
        <ul v-if="props.presets.length" class="admin-filter-preset-list">
          <li v-for="preset in props.presets" :key="preset.id" :data-testid="`preset-${preset.id}`" class="admin-filter-preset-row">
            <template v-if="renamingId === preset.id"><el-input v-model="renameName" :data-testid="`preset-name-${preset.id}`" /><el-button :data-testid="`preset-rename-confirm-${preset.id}`" :disabled="props.savingPresets" title="确认重命名" @click="confirmRename(preset.id)"><Check :size="15" /></el-button><el-button title="取消" @click="renamingId = null"><X :size="15" /></el-button></template>
            <template v-else><span :data-testid="`preset-name-label-${preset.id}`" class="admin-filter-preset-name" :title="preset.name">{{ preset.name }}</span><div class="admin-filter-preset-actions"><el-button :data-testid="`preset-apply-${preset.id}`" :disabled="props.savingPresets" title="应用预设" @click="applyPreset(preset)"><SlidersHorizontal :size="15" /></el-button><el-button :data-testid="`preset-rename-${preset.id}`" :disabled="props.savingPresets" title="重命名" @click="beginRename(preset)"><Pencil :size="15" /></el-button><el-button :data-testid="`preset-delete-${preset.id}`" :disabled="props.savingPresets" title="删除预设" @click="deletePreset(preset.id)"><Trash2 :size="15" /></el-button></div></template>
          </li>
        </ul>
      </section>
    </div>
    <template #footer><div class="admin-filter-footer"><el-button data-testid="filter-reset" @click="reset"><RotateCcw :size="15" />重置</el-button><el-button data-testid="filter-apply" type="primary" @click="apply"><Check :size="15" />应用</el-button></div></template>
  </el-drawer>
</template>
