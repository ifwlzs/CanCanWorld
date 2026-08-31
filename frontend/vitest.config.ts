import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/** 前端测试使用轻量 DOM 和真实 Vue 编译插件，避免测试结果偏离生产模板行为。 */
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts']
  }
})
