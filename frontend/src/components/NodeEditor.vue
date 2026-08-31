<script setup lang="ts">
import type { CreateNodeInput, NavigationNode } from '@cancanworld/contracts'
import { computed, reactive, watch } from 'vue'
import { buildFolderOptions, type NodeDraftErrors, validateNodeDraft } from './node-editor-model'

const props = withDefaults(defineProps<{
  modelValue: boolean
  parentId: number
  nodes?: NavigationNode[]
  node?: NavigationNode | null
  initialType?: 'folder' | 'bookmark'
  saving?: boolean
  errorMessage?: string | null
}>(), {
  nodes: () => [],
  node: null,
  initialType: 'bookmark',
  saving: false,
  errorMessage: null
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [value: CreateNodeInput]
}>()

const form = reactive<CreateNodeInput>({
  parentId: props.parentId,
  nodeType: props.initialType,
  title: '',
  url: null,
  description: null,
  remark: null,
  iconUrl: null,
  visibility: 'public',
  tags: []
})
const fieldErrors = reactive<NodeDraftErrors>({})

const title = computed(() => props.node ? '编辑节点' : '新建节点')
const folderOptions = computed(() => buildFolderOptions(props.nodes))

/** 每次打开对话框时从目标节点重新建立表单，防止上次编辑残留。 */
watch(() => props.modelValue, (open) => {
  if (!open) return
  clearFieldErrors()
  form.parentId = props.node?.parentId ?? props.parentId
  form.nodeType = props.node?.nodeType === 'folder' || props.node?.nodeType === 'bookmark' ? props.node.nodeType : props.initialType
  form.title = props.node?.title ?? ''
  form.url = props.node?.url ?? null
  form.description = props.node?.description ?? null
  form.remark = props.node?.remark ?? null
  form.iconUrl = props.node?.iconUrl ?? null
  form.visibility = props.node?.visibility ?? 'public'
  form.tags = [...(props.node?.tags ?? [])]
}, { immediate: true })

/** 本地校验先给出可恢复提示，保存锁则阻止同一草稿产生重复请求。 */
function submit(): void {
  if (props.saving) return
  if (form.nodeType === 'folder') form.url = null
  clearFieldErrors()
  Object.assign(fieldErrors, validateNodeDraft(form))
  if (Object.keys(fieldErrors).length > 0) return
  emit('submit', {
    ...form,
    title: form.title.trim(),
    url: form.url?.trim() || null,
    tags: [...form.tags]
  })
}

/** 保存进行中时忽略所有关闭来源，避免请求完成后出现意外新增。 */
function close(): void {
  if (!props.saving) emit('update:modelValue', false)
}

/** 每次校验和重新打开前删除旧字段错误，防止修正后仍显示过期原因。 */
function clearFieldErrors(): void {
  delete fieldErrors.parentId
  delete fieldErrors.title
  delete fieldErrors.url
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    :title="title"
    width="min(520px, calc(100vw - 32px))"
    :close-on-click-modal="!props.saving"
    :close-on-press-escape="!props.saving"
    :show-close="!props.saving"
    @close="close"
  >
    <el-alert v-if="props.errorMessage" :title="props.errorMessage" type="error" :closable="false" show-icon role="alert" />
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item v-if="!props.node" label="保存到" :error="fieldErrors.parentId ?? ''">
        <el-tree-select
          v-model="form.parentId"
          data-testid="node-parent"
          popper-class="node-parent-popper"
          :data="folderOptions"
          node-key="id"
          :props="{ value: 'id', label: 'label', children: 'children' }"
          check-strictly
          filterable
          :render-after-expand="true"
          placeholder="选择目标目录"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="类型">
        <el-segmented v-model="form.nodeType" :options="[
          { label: '书签', value: 'bookmark' },
          { label: '目录', value: 'folder' }
        ]" />
      </el-form-item>
      <el-form-item label="名称" required :error="fieldErrors.title ?? ''">
        <el-input v-model="form.title" data-testid="node-title" maxlength="512" show-word-limit />
      </el-form-item>
      <el-form-item v-if="form.nodeType === 'bookmark'" label="地址" required :error="fieldErrors.url ?? ''">
        <el-input v-model="form.url" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item v-if="form.nodeType === 'bookmark'" label="网站注释">
        <el-input v-model="form.description" type="textarea" :rows="2" maxlength="10000" />
      </el-form-item>
      <el-form-item v-if="form.nodeType === 'bookmark'" label="个人备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="10000" />
      </el-form-item>
      <el-form-item v-if="form.nodeType === 'bookmark'" label="标签">
        <el-select v-model="form.tags" multiple filterable allow-create default-first-option />
      </el-form-item>
      <el-form-item label="可见性">
        <el-segmented v-model="form.visibility" :options="[
          { label: '公开', value: 'public' },
          { label: '私有', value: 'private' }
        ]" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button data-testid="node-cancel" :disabled="props.saving" @click="close">取消</el-button>
      <!-- 保存按钮预留加载图标空间，避免异步状态切换时页脚发生横向跳动。 -->
      <el-button data-testid="node-save" type="primary" style="width: 88px" :disabled="props.saving" :loading="props.saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
