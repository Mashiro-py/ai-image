import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createServer } from 'vite';
import axios from 'axios';

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 添加请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

async function startServer() {
  try {
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
      logLevel: 'debug',
      onError: (err, req, res) => {
        console.error('即梦API代理错误:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `代理请求失败: ${err.message}` }));
      }
    }));

    app.use('/api/deepseek', createProxyMiddleware({
      target: 'https://api.deepseek.com',
      changeOrigin: true,
      pathRewrite: { '^/api/deepseek': '' },
      logLevel: 'debug',
      onError: (err, req, res) => {
        console.error('DeepSeek API代理错误:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `代理请求失败: ${err.message}` }));
      }
    }));

    app.use('/api/coze', createProxyMiddleware({
      target: 'https://api.coze.cn',
      changeOrigin: true,
      pathRewrite: { '^/api/coze': '' },
      logLevel: 'debug',
      onError: (err, req, res) => {
        console.error('Coze API代理错误:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `代理请求失败: ${err.message}` }));
      }
    }));

    app.use('/api/deepseek2', createProxyMiddleware({
      target: 'http://39.104.18.10:8001',
      changeOrigin: true,
      pathRewrite: { '^/api/deepseek2': '' },
      logLevel: 'debug',
      onError: (err, req, res) => {
        console.error('DeepSeek2 API代理错误:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `代理请求失败: ${err.message}` }));
      }
    }));

    // 图片代理路由
    app.get('/api/proxy', async (req, res) => {
      try {
        const imageUrl = req.query.url;
        
        if (!imageUrl) {
          console.error('代理请求缺少URL参数');
          return res.status(400).send('URL参数缺失');
        }
        
        console.log(`代理图片请求: ${imageUrl}`);
        
        // 使用axios获取图片数据
        const response = await axios({
          method: 'get',
          url: imageUrl,
          responseType: 'stream',
          timeout: 30000, // 30秒超时
          headers: {
            'Referer': 'https://your-app-domain.com/', // 设置Referer头，有些服务器需要这个
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        // 设置正确的内容类型
        res.set('Content-Type', response.headers['content-type'] || 'image/png');
        
        // 添加缓存控制头
        res.set('Cache-Control', 'public, max-age=86400'); // 缓存一天
        
        // 将图片数据流传输到客户端
        response.data.pipe(res);
      } catch (error) {
        console.error('图片代理错误:', error.message);
        res.status(500).send(`代理请求失败: ${error.message}`);
      }
    });

    // 错误处理中间件
    app.use((err, req, res, next) => {
      console.error('服务器错误:', err);
      res.status(500).json({
        error: '服务器内部错误',
        message: err.message
      });
    });

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
      console.log('代理服务已配置，可以解决CORS问题');
    });
  } catch (err) {
    console.error('启动服务器时出错:', err);
    process.exit(1);
  }
}

startServer().catch((err) => {
  console.error('启动服务器时出错:', err);
  process.exit(1);
}); 