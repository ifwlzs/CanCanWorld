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
const errors = reactive({ username: '', password: '', confirmPassword: '' })
const requestError = ref('')

watch(() => props.modelValue, (open) => {
  if (open) {
    form.password = ''
    form.confirmPassword = ''
    clearErrors()
  }
})

watch(() => [form.username, form.password, form.confirmPassword], () => clearErrors())

/** 初始化与登录共用表单，但初始化必须二次确认密码。 */
async function submit(): Promise<void> {
  if (busy.value || !validateForm()) return
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
  } catch (error) {
    requestError.value = error instanceof Error ? error.message : '认证请求失败，请稍后重试'
  } finally {
    busy.value = false
  }
}

/** 前端约束与后端凭据策略保持一致，避免无效请求表现为按钮没有响应。 */
function validateForm(): boolean {
  clearErrors()
  const usernameLength = form.username.trim().length
  if (usernameLength < 3 || usernameLength > 128) errors.username = '管理员账号长度必须为 3 到 128 个字符'
  if (form.password.length < 6 || form.password.length > 1024) errors.password = '管理员密码长度必须为 6 到 1024 个字符'
  if (!props.initialized && form.password !== form.confirmPassword) errors.confirmPassword = '两次输入的密码不一致'
  return !errors.username && !errors.password && !errors.confirmPassword
}

/** 用户修改任一字段时清除旧错误，下一次提交会按最新内容重新验证。 */
function clearErrors(): void {
  errors.username = ''
  errors.password = ''
  errors.confirmPassword = ''
  requestError.value = ''
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
    <el-alert v-if="requestError" class="auth-error" :title="requestError" type="error" :closable="false" show-icon />
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="账号" :error="errors.username">
        <el-input v-model="form.username" autocomplete="username" minlength="3" maxlength="128" />
      </el-form-item>
      <el-form-item label="密码" :error="errors.password">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          :autocomplete="props.initialized ? 'current-password' : 'new-password'"
          minlength="6"
          maxlength="1024"
        />
      </el-form-item>
      <el-form-item v-if="!props.initialized" label="确认密码" :error="errors.confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" minlength="6" maxlength="1024" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" :loading="busy" @click="submit">{{ props.initialized ? '登录' : '创建管理员' }}</el-button>
    </template>
  </el-dialog>
</template>
