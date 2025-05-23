import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createServer } from 'vite';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 设置文件上传中间件
const upload = multer({ 
  dest: 'uploads/', 
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制5MB
  }
});

// 确保上传目录存在
try {
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
} catch (err) {
  console.error('无法创建上传目录:', err);
}

// 添加请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// 添加直接处理Coze文件上传的路由 - 确保在Vite中间件之前注册
app.post('/api/upload-to-coze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        code: -1,
        msg: '缺少文件',
        data: null
      });
    }
    
    console.log('收到文件上传请求:', req.file);
    
    // 创建FormData对象
    const formData = new FormData();
    
    // 读取上传的文件并添加到FormData
    const fileStream = fs.createReadStream(req.file.path);
    formData.append('file', fileStream, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    
    console.log('准备向Coze上传文件:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    // 发送到Coze API
    const response = await axios.post('https://api.coze.cn/v1/files/upload', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': req.headers.authorization
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log('Coze文件上传成功:', response.data);
    
    // 删除临时文件
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('删除临时文件失败:', err);
    });
    
    // 返回Coze API的响应
    return res.json(response.data);
  } catch (error) {
    console.error('Coze文件上传失败:', error);
    
    // 删除临时文件
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('删除临时文件失败:', err);
      });
    }
    
    // 尝试获取详细错误信息
    let errorMsg = error.message;
    let responseData = null;
    
    if (error.response) {
      errorMsg = `服务器返回错误: ${error.response.status}`;
      responseData = error.response.data;
      console.error('Coze API错误响应:', responseData);
    }
    
    // 返回错误信息
    return res.status(500).json({
      code: -1,
      msg: `文件上传失败: ${errorMsg}`,
      data: responseData
    });
  }
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
      onProxyReq: (proxyReq, req, res) => {
        console.log(`[Coze代理] ${req.method} ${req.url}`);
        if (req.method === 'POST' && req.path === '/v1/files/upload') {
          console.log('[Coze代理] 检测到文件上传请求');
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log(`[Coze代理响应] ${req.method} ${req.url} - 状态码: ${proxyRes.statusCode}`);
        
        if (req.method === 'POST' && req.path === '/v1/files/upload' && proxyRes.statusCode >= 400) {
          let responseBody = '';
          proxyRes.on('data', (chunk) => {
            responseBody += chunk;
          });
          proxyRes.on('end', () => {
            try {
              console.error('[Coze文件上传错误] 响应内容:', responseBody);
            } catch (e) {
              console.error('[Coze文件上传错误] 无法解析响应内容');
            }
          });
        }
      },
      onError: (err, req, res) => {
        console.error('Coze API代理错误:', err);
        if (req.method === 'POST' && req.path === '/v1/files/upload') {
          console.error('[Coze文件上传] 代理错误详情:', {
            method: req.method,
            path: req.path,
            headers: req.headers,
            error: err.message
          });
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: `代理请求失败: ${err.message}`,
          details: '如果是文件上传问题，请检查文件大小和格式'
        }));
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