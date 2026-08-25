<script setup lang="ts">
import type { ImportGroupOverride, ImportPreview, ImportPreviewNode } from '@cancanworld/contracts'
import { FileUp, Link, Minus, Pencil, Upload } from 'lucide-vue-next'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, ref } from 'vue'
import { apiRequest } from '../api/client'

const props = defineProps<{ modelValue: boolean; parentId: number }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  imported: []
}>()

const file = ref<File | null>(null)
const preview = ref<ImportPreview | null>(null)
const strategy = ref<'keep_all' | 'skip_same_url'>('keep_all')
const busy = ref(false)
const summary = computed(() => preview.value?.stats)
const previewTree = computed(() => preview.value?.nodes.map(toTreeItem) ?? [])

interface PreviewTreeItem {
  key: string
  label: string
  sourceIndex: number
  generatedGroup: boolean
  title: string
  children?: PreviewTreeItem[]
}

/** 预览树只包含展示字段，JavaScript 原文和 URL 不进入树标签。 */
function toTreeItem(node: ImportPreviewNode): PreviewTreeItem {
  const label = node.type === 'separator' ? '分割线' : `${node.type === 'folder' ? '目录' : node.bookmarkType === 'javascript' ? 'JavaScript' : '书签'}：${node.title}`
  const item = {
    key: `${node.source.nodeIndex}:${node.type}`,
    label,
    sourceIndex: node.source.nodeIndex,
    generatedGroup: node.type === 'folder' && node.source.generatedFromGroup === true,
    title: node.title
  }
  return node.children?.length ? { ...item, children: node.children.map(toTreeItem) } : item
}

/** 浏览器只读取用户选择的单个 HTML 文件，不在本地执行其中任何脚本。 */
function selectFile(event: Event): void {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  preview.value = null
}

/** 上传后端解析并返回规范化树，确认前不写正式节点表。 */
async function createPreview(): Promise<void> {
  if (!file.value) return
  busy.value = true
  try {
    const body = new FormData()
    body.append('file', file.value)
    body.append('parentId', String(props.parentId))
    preview.value = await apiRequest<ImportPreview>('/api/v1/import/html/preview', { method: 'POST', body })
  } finally {
    busy.value = false
  }
}

/** 确认请求携带随机幂等键，重复点击不会重复导入。 */
async function confirmImport(): Promise<void> {
  if (!preview.value) return
  busy.value = true
  try {
    await apiRequest(`/api/v1/import/${preview.value.jobId}/confirm`, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ parentId: props.parentId, duplicateStrategy: strategy.value })
    })
    emit('imported')
    emit('update:modelValue', false)
    preview.value = null
    file.value = null
  } finally {
    busy.value = false
  }
}

/** 分组覆盖由服务端基于原始元数据执行，浏览器不直接改写整棵预览树。 */
async function applyGroupOverride(nodeIndex: number, override: ImportGroupOverride): Promise<void> {
  if (!preview.value) return
  busy.value = true
  try {
    preview.value = await apiRequest<ImportPreview>(`/api/v1/import/${preview.value.jobId}/groups/${nodeIndex}`, {
      method: 'PUT',
      body: JSON.stringify(override)
    })
  } finally {
    busy.value = false
  }
}

/** 重命名只接受非空目录名，长度约束同时由共享契约和后端复核。 */
async function renameGroup(item: PreviewTreeItem): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('输入新的文件夹名称', '重命名分组', {
      inputValue: item.title,
      inputValidator: (input) => input.trim().length > 0 && input.trim().length <= 512 || '名称长度必须为 1 到 512 个字符'
    })
    await applyGroupOverride(item.sourceIndex, { type: 'folder', title: value.trim() })
  } catch (error) {
    if (!isMessageBoxCancellation(error)) ElMessage.error(error instanceof Error ? error.message : '分组重命名失败')
  }
}

/** 转换分组标记会把其子节点提升到当前层级，确认框明确展示结构影响。 */
async function convertGroup(item: PreviewTreeItem, type: 'bookmark' | 'separator'): Promise<void> {
  try {
    const label = type === 'bookmark' ? '普通书签' : '分割线'
    await ElMessageBox.confirm(`转换为${label}后，组内节点将提升到同级。`, `转换“${item.title}”`, { type: 'warning' })
    await applyGroupOverride(item.sourceIndex, { type })
  } catch (error) {
    if (!isMessageBoxCancellation(error)) ElMessage.error(error instanceof Error ? error.message : '分组转换失败')
  }
}

/** Element Plus 以字符串拒绝值表示用户主动取消，其他异常仍应反馈。 */
function isMessageBoxCancellation(error: unknown): boolean {
  return error === 'cancel' || error === 'close'
}
</script>

<template>
  <el-dialog :model-value="props.modelValue" title="导入浏览器书签" width="min(760px, calc(100vw - 32px))" @close="emit('update:modelValue', false)">
    <div v-if="!preview" class="upload-zone">
      <FileUp :size="36" />
      <input id="bookmark-file" type="file" accept=".html,.htm,text/html" @change="selectFile" />
      <label for="bookmark-file">{{ file?.name ?? '选择 HTML 文件' }}</label>
      <el-button :icon="Upload" :disabled="!file" :loading="busy" @click="createPreview">解析预览</el-button>
    </div>
    <template v-else>
      <div class="import-stats">
        <div><strong>{{ summary?.sourceFolders }}</strong><span>原始目录</span></div>
        <div><strong>{{ summary?.generatedFolders }}</strong><span>分组目录</span></div>
        <div><strong>{{ summary?.bookmarks }}</strong><span>书签</span></div>
        <div><strong>{{ summary?.javascriptBookmarks }}</strong><span>JavaScript</span></div>
        <div><strong>{{ summary?.separators }}</strong><span>分割线</span></div>
        <div><strong>{{ summary?.failed }}</strong><span>问题</span></div>
      </div>
      <el-alert v-if="preview.issues.length" :title="`${preview.issues.length} 个节点需要注意`" type="warning" :closable="false" />
      <el-table v-if="preview.issues.length" :data="preview.issues.slice(0, 100)" max-height="260">
        <el-table-column prop="nodeIndex" label="#" width="70" />
        <el-table-column prop="title" label="标题" min-width="150" />
        <el-table-column prop="reason" label="原因" min-width="240" />
      </el-table>
      <div class="preview-tree">
        <div class="preview-tree-heading">导入结构</div>
        <el-tree :data="previewTree" node-key="key" :props="{ label: 'label', children: 'children' }" :indent="18">
          <template #default="{ data }: { data: PreviewTreeItem }">
            <span class="preview-tree-row">
              <span>{{ data.label }}</span>
              <span v-if="data.generatedGroup" class="preview-tree-actions">
                <button type="button" aria-label="重命名分组" title="重命名分组" @click.stop="renameGroup(data)"><Pencil :size="14" /></button>
                <button type="button" aria-label="转换为普通书签" title="转换为普通书签" @click.stop="convertGroup(data, 'bookmark')"><Link :size="14" /></button>
                <button type="button" aria-label="转换为分割线" title="转换为分割线" @click.stop="convertGroup(data, 'separator')"><Minus :size="14" /></button>
              </span>
            </span>
          </template>
        </el-tree>
      </div>
      <div class="import-options">
        <span>重复 URL</span>
        <el-segmented v-model="strategy" :options="[
          { label: '保留全部', value: 'keep_all' },
          { label: '跳过已有', value: 'skip_same_url' }
        ]" />
      </div>
    </template>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button v-if="preview" type="primary" :loading="busy" @click="confirmImport">确认导入</el-button>
    </template>
  </el-dialog>
</template>
