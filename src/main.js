import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

// 关闭Vue开发工具
const app = createApp(App)
app.config.devtools = false
app.config.productionTip = false
app.mount('#app')
