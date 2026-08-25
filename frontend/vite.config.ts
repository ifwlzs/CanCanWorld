import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

/** 开发环境将 API 转发到 Hono，生产环境由 Nginx 提供同样路径。 */
export default defineConfig({
  plugins: [
    vue(),
    // Element Plus 组件和指令按模板实际使用量引入；声明文件由项目手工维护，避免构建覆盖中文说明。
    Components({ resolvers: [ElementPlusResolver({ importStyle: 'css', directives: true })], dts: false })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3080'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
