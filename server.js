import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createServer } from 'vite';
import axios from 'axios';

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

async function startServer() {
  // 创建Vite开发服务器
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  // 使用Vite中间件
  app.use(vite.middlewares);

  // 代理API请求
  app.use('/api/jimeng', createProxyMiddleware({
    target: 'http://39.104.18.10:8000',
    changeOrigin: true,
    pathRewrite: { '^/api/jimeng': '/v1' },
  }));

  app.use('/api/deepseek', createProxyMiddleware({
    target: 'https://api.deepseek.com',
    changeOrigin: true,
    pathRewrite: { '^/api/deepseek': '' },
  }));

  app.use('/api/coze', createProxyMiddleware({
    target: 'https://api.coze.cn',
    changeOrigin: true,
    pathRewrite: { '^/api/coze': '' },
  }));

  app.use('/api/deepseek2', createProxyMiddleware({
    target: 'http://39.104.18.10:8001',
    changeOrigin: true,
    pathRewrite: { '^/api/deepseek2': '' },
  }));

  // 图片代理路由
  app.get('/api/proxy', async (req, res) => {
    try {
      const imageUrl = req.query.url;
      
      if (!imageUrl) {
        return res.status(400).send('URL参数缺失');
      }
      
      console.log(`代理图片请求: ${imageUrl}`);
      
      // 使用axios获取图片数据
      const response = await axios({
        method: 'get',
        url: imageUrl,
        responseType: 'stream',
        headers: {
          'Referer': 'https://your-app-domain.com/', // 设置Referer头，有些服务器需要这个
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      // 设置正确的内容类型
      res.set('Content-Type', response.headers['content-type']);
      
      // 将图片数据流传输到客户端
      response.data.pipe(res);
    } catch (error) {
      console.error('图片代理错误:', error.message);
      res.status(500).send(`代理请求失败: ${error.message}`);
    }
  });

  // 启动服务器
  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('代理服务已配置，可以解决CORS问题');
  });
}

startServer().catch((err) => {
  console.error('启动服务器时出错:', err);
}); 