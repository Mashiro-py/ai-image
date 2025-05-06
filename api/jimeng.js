import axios from 'axios';

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 获取请求路径，移除前导的/api/jimeng
    const path = req.url.replace(/^\/api\/jimeng/, '');
    
    // 构建目标URL
    const targetUrl = `http://39.104.18.10:8000/v1${path}`;
    
    console.log(`代理即梦API请求: ${targetUrl}`);
    
    // 提取请求方法、头信息和正文
    const method = req.method;
    const headers = {
      ...req.headers,
      'host': '39.104.18.10:8000',
      'origin': 'http://39.104.18.10:8000',
      'Authorization': `Bearer c14e91dae7fdadc29f684db39ff1ed90`
    };
    
    // 删除一些可能导致问题的头信息
    delete headers.host;
    delete headers.connection;
    
    // 使用axios转发请求
    const response = await axios({
      method,
      url: targetUrl,
      headers,
      data: method !== 'GET' ? req.body : undefined,
      validateStatus: () => true // 不抛出HTTP错误
    });
    
    // 返回API响应
    res.status(response.status);
    
    // 设置响应头
    for (const [key, value] of Object.entries(response.headers)) {
      // 跳过某些响应头，避免冲突
      if (!['content-length', 'connection', 'keep-alive', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }
    
    return res.send(response.data);
  } catch (error) {
    console.error('即梦API代理错误:', error.message);
    return res.status(500).json({ error: `代理请求失败: ${error.message}` });
  }
} 