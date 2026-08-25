<script setup lang="ts">
import type { CreateNodeInput, NavigationNode } from '@cancanworld/contracts'
import { computed, reactive, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  parentId: number
  node?: NavigationNode | null
  initialType?: 'folder' | 'bookmark'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [value: CreateNodeInput]
}>()

const form = reactive<CreateNodeInput>({
  parentId: props.parentId,
  nodeType: props.initialType ?? 'bookmark',
  title: '',
  url: null,
  description: null,
  iconUrl: null,
  visibility: 'public',
  tags: []
})

const title = computed(() => props.node ? '编辑节点' : '新建节点')

/** 每次打开对话框时从目标节点重新建立表单，防止上次编辑残留。 */
watch(() => props.modelValue, (open) => {
  if (!open) return
  form.parentId = props.node?.parentId ?? props.parentId
  form.nodeType = props.node?.nodeType === 'folder' || props.node?.nodeType === 'bookmark' ? props.node.nodeType : (props.initialType ?? 'bookmark')
  form.title = props.node?.title ?? ''
  form.url = props.node?.url ?? null
  form.description = props.node?.description ?? null
  form.iconUrl = props.node?.iconUrl ?? null
  form.visibility = props.node?.visibility ?? 'public'
  form.tags = [...(props.node?.tags ?? [])]
}, { immediate: true })

/** 目录自动清空 URL，最终交叉校验仍由后端负责。 */
function submit(): void {
  if (form.nodeType === 'folder') form.url = null
  emit('submit', { ...form, tags: [...form.tags] })
}
</script>

<template>
  <el-dialog :model-value="props.modelValue" :title="title" width="min(520px, calc(100vw - 32px))" @close="emit('update:modelValue', false)">
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="类型">
        <el-segmented v-model="form.nodeType" :options="[
          { label: '书签', value: 'bookmark' },
          { label: '目录', value: 'folder' }
        ]" />
      </el-form-item>
      <el-form-item label="名称" required>
        <el-input v-model="form.title" maxlength="512" show-word-limit />
      </el-form-item>
      <el-form-item v-if="form.nodeType === 'bookmark'" label="地址" required>
        <el-input v-model="form.url" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item v-if="form.nodeType === 'bookmark'" label="描述">
        <el-input v-model="form.description" type="textarea" :rows="2" maxlength="10000" />
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
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
