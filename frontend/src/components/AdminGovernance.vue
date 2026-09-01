<script setup lang="ts">
import type {
  BrokenBookmark,
  BrokenBookmarkResult,
  DuplicateGroup,
  DuplicateGroupResult
} from '@cancanworld/contracts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { AlertTriangle, Copy, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { apiRequest } from '../api/client'

/** 与 brokenCleanupSchema 的上限保持同步，用于提交前的本地提示。 */
const CLEANUP_LIMIT = 200

const emit = defineEmits<{
  /** 治理写入已提交，请求宿主重载前台树与后台统计。 */
  'nodes-changed': []
  /** 请求宿主打开指定书签的编辑器。 */
  'edit-node': [nodeId: number]
}>()

const view = ref<'duplicates' | 'broken'>('duplicates')
const loading = ref(false)
const errorMessage = ref('')
const submitting = ref(false)

const duplicates = ref<DuplicateGroupResult>({ items: [], total: 0, page: 1, pageSize: 20 })
const broken = ref<BrokenBookmarkResult>({ items: [], total: 0, page: 1, pageSize: 20 })
/** 每组当前选定的保留项，键为 url_hash。 */
const keepByGroup = ref<Record<string, number>>({})
const selectedBroken = ref<number[]>([])

const brokenAllSelected = computed(() => broken.value.items.length > 0 && selectedBroken.value.length === broken.value.items.length)

/** 判定原因转为面向用户的说明，使结论可解释。 */
function reasonLabel(item: BrokenBookmark): string {
  return item.reason === 'deterministic' ? '链接确定失效' : `连续失败 ${item.consecutiveFailures} 次`
}

/** 待删除集合为该组除保留项以外的全部成员。 */
function removeIdsOf(group: DuplicateGroup): number[] {
  const keepId = keepByGroup.value[group.urlHash]
  return group.members.filter((member) => member.id !== keepId).map((member) => member.id)
}

function keepIdOf(group: DuplicateGroup): number | undefined {
  return keepByGroup.value[group.urlHash]
}

/** 切换视图时立即加载对应数据，避免展示上一视图的残留结果。 */
async function switchView(next: 'duplicates' | 'broken'): Promise<void> {
  if (view.value === next) return
  view.value = next
  await load()
}

/** 加载当前视图数据；失败保留错误供重试，不清空已有内容。 */
async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    if (view.value === 'duplicates') {
      const result = await apiRequest<DuplicateGroupResult>('/api/v1/admin/governance/duplicates', {
        method: 'POST',
        body: JSON.stringify({ page: duplicates.value.page, pageSize: duplicates.value.pageSize })
      })
      duplicates.value = result
      // 成员按创建时间升序返回，默认保留第一条以保住最早的记录。
      keepByGroup.value = Object.fromEntries(
        result.items.filter((group) => group.members.length > 0).map((group) => [group.urlHash, group.members[0]!.id])
      )
    } else {
      broken.value = await apiRequest<BrokenBookmarkResult>('/api/v1/admin/governance/broken', {
        method: 'POST',
        body: JSON.stringify({ page: broken.value.page, pageSize: broken.value.pageSize })
      })
      selectedBroken.value = []
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loading.value = false
  }
}

/** 合并前二次确认影响范围，确认后提交保留项与待删除集合。 */
async function mergeGroup(group: DuplicateGroup): Promise<void> {
  if (submitting.value) return
  const keepId = keepIdOf(group)
  const removeIds = removeIdsOf(group)
  if (keepId === undefined || removeIds.length === 0) {
    ElMessage.warning('请先选择要保留的书签')
    return
  }
  const confirmed = await ElMessageBox.confirm(
    `将保留 1 个书签并删除其余 ${removeIds.length} 个，删除后无法恢复，是否继续？`,
    '合并重复链接',
    { type: 'warning', confirmButtonText: '删除' }
  ).then(() => true, () => false)
  if (!confirmed) return

  submitting.value = true
  try {
    const result = await apiRequest<{ removed: number }>('/api/v1/admin/governance/duplicates/merge', {
      method: 'POST',
      body: JSON.stringify({ keepId, removeIds })
    })
    ElMessage.success(`已删除 ${result.removed} 个重复书签`)
    emit('nodes-changed')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '合并失败')
  } finally {
    submitting.value = false
  }
}

/** 全选与取消全选当前页失效书签。 */
function toggleSelectAllBroken(): void {
  selectedBroken.value = brokenAllSelected.value ? [] : broken.value.items.map((item) => item.id)
}

function toggleBroken(id: number): void {
  selectedBroken.value = selectedBroken.value.includes(id)
    ? selectedBroken.value.filter((value) => value !== id)
    : [...selectedBroken.value, id]
}

/** 批量清理失效书签；上限与契约一致，避免整批被服务端拒绝。 */
async function cleanupBroken(): Promise<void> {
  if (submitting.value || selectedBroken.value.length === 0) return
  if (selectedBroken.value.length > CLEANUP_LIMIT) {
    ElMessage.warning(`一次最多清理 ${CLEANUP_LIMIT} 个书签，当前已选 ${selectedBroken.value.length} 个`)
    return
  }
  const confirmed = await ElMessageBox.confirm(
    `将删除 ${selectedBroken.value.length} 个失效书签，删除后无法恢复，是否继续？`,
    '清理失效书签',
    { type: 'warning', confirmButtonText: '删除' }
  ).then(() => true, () => false)
  if (!confirmed) return

  submitting.value = true
  try {
    const result = await apiRequest<{ removed: number; skipped: number }>('/api/v1/admin/governance/broken/cleanup', {
      method: 'POST',
      body: JSON.stringify({ nodeIds: selectedBroken.value })
    })
    ElMessage.success(result.skipped > 0 ? `已删除 ${result.removed} 个，跳过 ${result.skipped} 项` : `已删除 ${result.removed} 个失效书签`)
    selectedBroken.value = []
    emit('nodes-changed')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '清理失败')
  } finally {
    submitting.value = false
  }
}

defineExpose({ refresh: load })
onMounted(() => { void load() })
</script>

<template>
  <section class="governance">
    <div class="governance-toolbar">
      <div class="governance-views">
        <button
          :class="{ 'is-active': view === 'duplicates' }"
          data-testid="governance-view-duplicates"
          type="button"
          @click="switchView('duplicates')"
        >
          <Copy :size="15" />重复链接
        </button>
        <button
          :class="{ 'is-active': view === 'broken' }"
          data-testid="governance-view-broken"
          type="button"
          @click="switchView('broken')"
        >
          <AlertTriangle :size="15" />失效链接
        </button>
      </div>
      <button class="command-button" type="button" data-testid="governance-refresh" @click="load">
        <RefreshCw :size="15" />刷新
      </button>
    </div>

    <p v-if="errorMessage" class="admin-query-error" role="alert">
      {{ errorMessage }}
      <button class="command-button" type="button" data-testid="governance-retry" @click="load">重试</button>
    </p>

    <div v-if="view === 'duplicates'" v-loading="loading" class="governance-body">
      <p v-if="!loading && duplicates.items.length === 0 && !errorMessage" class="governance-empty">没有重复链接</p>
      <article v-for="group in duplicates.items" :key="group.urlHash" class="governance-group">
        <header>
          <div>
            <strong>{{ group.members[0]?.url }}</strong>
            <span>{{ group.memberCount }} 个重复，将删除 {{ removeIdsOf(group).length }} 项</span>
          </div>
          <el-button
            :data-testid="`duplicate-merge-${group.members[0]?.id}`"
            :disabled="submitting || removeIdsOf(group).length === 0"
            :loading="submitting"
            @click="mergeGroup(group)"
          >
            <Trash2 :size="15" />合并
          </el-button>
        </header>
        <!-- 保留项单选：每组只能留一条，其余成员构成待删除集合。 -->
        <el-radio-group
          v-model="keepByGroup[group.urlHash]"
          :data-testid="`duplicate-keep-${group.members[0]?.id}`"
        >
          <ul class="governance-members">
            <li v-for="member in group.members" :key="member.id" :class="{ 'is-keep': member.id === keepIdOf(group) }">
              <button
                class="governance-keep-option"
                :data-testid="`keep-option-${member.id}`"
                type="button"
                :aria-pressed="member.id === keepIdOf(group)"
                @click="keepByGroup[group.urlHash] = member.id"
              >
                {{ member.id === keepIdOf(group) ? '保留' : '设为保留' }}
              </button>
              <div class="governance-member-copy">
                <strong>{{ member.title }}</strong>
                <span>{{ member.fullPath.join(' / ') }}</span>
                <span>
                  点击 {{ member.clickCount }} 次
                  <template v-if="member.tags.length"> · 标签 {{ member.tags.join('、') }}</template>
                  <template v-if="member.remark"> · {{ member.remark }}</template>
                </span>
              </div>
              <button class="governance-edit" type="button" @click="emit('edit-node', member.id)">编辑</button>
            </li>
          </ul>
        </el-radio-group>
      </article>
    </div>

    <div v-else v-loading="loading" class="governance-body">
      <div v-if="broken.items.length > 0" class="governance-broken-toolbar">
        <button class="command-button" type="button" data-testid="broken-select-all" @click="toggleSelectAllBroken">
          {{ brokenAllSelected ? '取消全选' : '全选本页' }}
        </button>
        <span>已选 {{ selectedBroken.length }} 项，共 {{ broken.total }} 个失效书签</span>
        <el-button
          data-testid="broken-cleanup"
          :disabled="submitting || selectedBroken.length === 0"
          :loading="submitting"
          @click="cleanupBroken"
        >
          <Trash2 :size="15" />清理所选
        </el-button>
      </div>
      <p v-if="!loading && broken.items.length === 0 && !errorMessage" class="governance-empty">没有满足条件的失效书签</p>
      <ul class="governance-broken">
        <li v-for="item in broken.items" :key="item.id" :class="{ 'is-selected': selectedBroken.includes(item.id) }">
          <button
            class="governance-keep-option"
            :data-testid="`broken-select-${item.id}`"
            type="button"
            :aria-pressed="selectedBroken.includes(item.id)"
            @click="toggleBroken(item.id)"
          >
            {{ selectedBroken.includes(item.id) ? '已选' : '选择' }}
          </button>
          <div class="governance-member-copy">
            <strong>{{ item.title }}</strong>
            <span>{{ item.fullPath.join(' / ') }}</span>
            <span>{{ reasonLabel(item) }} · {{ item.lastCheckStatus }}<template v-if="item.lastHttpStatus"> · HTTP {{ item.lastHttpStatus }}</template></span>
          </div>
          <button class="governance-edit" type="button" @click="emit('edit-node', item.id)">编辑</button>
        </li>
      </ul>
    </div>
  </section>
</template>
