import { defineConfig } from 'vitest/config'

/** 测试默认使用 Node 环境，确保领域逻辑不依赖浏览器全局变量。 */
export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/db/migrate.ts']
    }
  }
})
