import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// 移除开发工具插件
// import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // 禁用开发工具
      devTools: false
    }),
    // 移除开发工具插件
    // vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // 禁用源码映射，减少开发工具的使用
  build: {
    sourcemap: false
  },
  // 添加代理配置，解决CORS问题
  server: {
    proxy: {
      '/api/jimeng': {
        target: 'http://39.104.18.10:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jimeng/, '/v1')
      },
      '/api/deepseek': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deepseek/, '')
      },
      '/api/coze': {
        target: 'https://api.coze.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/coze/, '')
      },
      '/api/deepseek2': {
        target: 'http://39.104.18.10:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deepseek2/, '')
      },
      // 添加图片代理路由
      '/api/proxy': {
        target: 'http://localhost:3000', // 这个地址会被实际请求的URL替换
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 从查询参数中获取目标URL
            const url = new URL(req.url, 'http://localhost').searchParams.get('url');
            if (url) {
              // 解析目标URL
              const targetUrl = new URL(url);
              // 设置代理目标为实际URL
              options.target = `${targetUrl.protocol}//${targetUrl.host}`;
              // 设置路径为URL的路径部分
              proxyReq.path = targetUrl.pathname + targetUrl.search;
            }
          });
        }
      }
    }
  }
})
