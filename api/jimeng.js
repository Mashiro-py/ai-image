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
    // 获取请求路径
    const urlParts = req.url.split('?');
    const path = urlParts[0].replace(/^\/api\/jimeng/, '');
    const query = urlParts.length > 1 ? `?${urlParts[1]}` : '';
    
    // 构建目标URL
    const targetUrl = `http://39.104.18.10:8000/v1${path}${query}`;
    
    console.log(`代理即梦API请求: ${targetUrl}`);
    
    // 提取请求方法、头信息和正文
    const method = req.method;
    const headers = {
      ...req.headers,
      'host': '39.104.18.10:8000',
      'origin': 'http://39.104.18.10:8000',
      'Authorization': req.headers.authorization || `Bearer 30899216a331e1c1d09df972bb985242,286dfb6c3240f2f0ac07894667dac7ee,8324211718f83d71dce67f4d63132e27,0ddb2442c5ed08d2d8344708c955537e,ad26aaf1ecf1c1b6d555eb237e62d3b3,a45636f06f42b1d294c884ce6aba8f89`
    };
    
    // 删除一些可能导致问题的头信息
    //286dfb6c3240f2f0ac07894667dac7ee
    //8324211718f83d71dce67f4d63132e27
    //0ddb2442c5ed08d2d8344708c955537e
    //ad26aaf1ecf1c1b6d555eb237e62d3b3
    //a45636f06f42b1d294c884ce6aba8f89
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