import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles.css'

// 根应用只注册全局基础设施，业务状态由各 Pinia Store 管理。
createApp(App).use(createPinia()).mount('#app')
