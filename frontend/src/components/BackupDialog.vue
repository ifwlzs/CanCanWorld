<script setup lang="ts">
import { Archive, RefreshCw, RotateCcw } from 'lucide-vue-next'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ref, watch } from 'vue'
import { apiRequest } from '../api/client'

interface BackupItem {
  id: string
  backupType: 'manual' | 'before_restore'
  schemaVersion: number
  itemCount: number
  checksum: string
  createdAt: string
}

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  restored: []
}>()
const backups = ref<BackupItem[]>([])
const loading = ref(false)
const restoringId = ref<string | null>(null)

/** 对话框每次打开时读取最新备份元数据，不把快照正文下载到浏览器。 */
async function loadBackups(): Promise<void> {
  loading.value = true
  try {
    backups.value = await apiRequest<BackupItem[]>('/api/v1/backups')
  } finally {
    loading.value = false
  }
}

/** 手动备份完成后立即刷新列表，便于确认节点数量和生成时间。 */
async function createBackup(): Promise<void> {
  loading.value = true
  try {
    const created = await apiRequest<BackupItem>('/api/v1/backups', { method: 'POST' })
    ElMessage.success(`已备份 ${created.itemCount} 个节点`)
    await loadBackups()
  } finally {
    loading.value = false
  }
}

/** 恢复会替换当前业务数据，前端二次确认后由服务端先创建保护快照。 */
async function restoreBackup(item: BackupItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将恢复 ${formatTime(item.createdAt)} 的 ${item.itemCount} 个节点，当前数据会先自动备份。`,
      '确认恢复备份',
      { type: 'warning', confirmButtonText: '恢复' }
    )
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }
  restoringId.value = item.id
  try {
    const result = await apiRequest<{ safetyBackupId: string; restoredNodes: number }>(`/api/v1/backups/${item.id}/restore`, { method: 'POST' })
    ElMessage.success(`已恢复 ${result.restoredNodes} 个节点`)
    emit('restored')
    await loadBackups()
  } finally {
    restoringId.value = null
  }
}

/** 使用浏览器本地格式展示时间，原始 API 始终保留 ISO 时间。 */
function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

watch(() => props.modelValue, (open) => {
  if (open) void loadBackups()
})
</script>

<template>
  <el-dialog :model-value="props.modelValue" title="备份与恢复" width="min(780px, calc(100vw - 32px))" @close="emit('update:modelValue', false)">
    <div class="backup-toolbar">
      <el-button type="primary" :loading="loading" @click="createBackup"><Archive :size="15" />创建备份</el-button>
      <el-button :loading="loading" aria-label="刷新备份列表" title="刷新备份列表" @click="loadBackups"><RefreshCw :size="15" /></el-button>
    </div>
    <el-table v-loading="loading" :data="backups" max-height="430" empty-text="暂无备份">
      <el-table-column label="创建时间" min-width="180">
        <template #default="{ row }">{{ formatTime(String(row.createdAt)) }}</template>
      </el-table-column>
      <el-table-column label="类型" width="120">
        <template #default="{ row }">{{ row.backupType === 'manual' ? '手动备份' : '恢复前快照' }}</template>
      </el-table-column>
      <el-table-column prop="itemCount" label="节点" width="90" />
      <el-table-column prop="schemaVersion" label="版本" width="80" />
      <el-table-column label="操作" width="90" align="right">
        <template #default="{ row }">
          <el-button
            text
            :loading="restoringId === row.id"
            :aria-label="`恢复 ${formatTime(row.createdAt)} 的备份`"
            title="恢复备份"
            @click="restoreBackup(row as BackupItem)"
          ><RotateCcw :size="15" /></el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>
