<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { apiRequest, setCsrfToken } from '../api/client'

const props = defineProps<{ modelValue: boolean; initialized: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  authenticated: []
}>()

const busy = ref(false)
const form = reactive({ username: 'admin', password: '', confirmPassword: '' })

watch(() => props.modelValue, (open) => {
  if (open) {
    form.password = ''
    form.confirmPassword = ''
  }
})

/** 初始化与登录共用表单，但初始化必须二次确认密码。 */
async function submit(): Promise<void> {
  if (!props.initialized && form.password !== form.confirmPassword) throw new Error('两次输入的密码不一致')
  busy.value = true
  try {
    const path = props.initialized ? '/api/v1/auth/login' : '/api/v1/auth/initialize'
    const result = await apiRequest<{ csrfToken: string }>(path, {
      method: 'POST',
      body: JSON.stringify({ username: form.username, password: form.password })
    })
    setCsrfToken(result.csrfToken)
    emit('authenticated')
    emit('update:modelValue', false)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    :title="props.initialized ? '管理员登录' : '初始化管理员'"
    width="min(420px, calc(100vw - 32px))"
    :close-on-click-modal="props.initialized"
    @close="emit('update:modelValue', false)"
  >
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="账号">
        <el-input v-model="form.username" autocomplete="username" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item v-if="!props.initialized" label="确认密码">
        <el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" :loading="busy" @click="submit">{{ props.initialized ? '登录' : '创建管理员' }}</el-button>
    </template>
  </el-dialog>
</template>
