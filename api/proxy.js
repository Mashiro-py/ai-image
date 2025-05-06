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
    const { url } = req.query;
    
    if (!url) {
      console.error('代理请求缺少URL参数');
      return res.status(400).json({ error: 'URL参数缺失' });
    }
    
    console.log(`代理图片请求: ${url}`);
    
    // 使用axios获取图片数据
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      timeout: 30000, // 30秒超时
      headers: {
        'Referer': 'https://your-app-domain.com/', // 设置Referer头，有些服务器需要这个
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      validateStatus: () => true // 不抛出HTTP错误
    });
    
    // 检查响应状态
    if (response.status !== 200) {
      console.error(`图片代理请求失败，状态码: ${response.status}`);
      return res.status(response.status).json({ 
        error: `代理请求失败，状态码: ${response.status}`,
        message: response.statusText 
      });
    }
    
    // 设置正确的内容类型
    const contentType = response.headers['content-type'] || 'image/png';
    res.setHeader('Content-Type', contentType);
    
    // 添加缓存控制头
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存一天
    
    // 返回图片数据
    console.log(`图片代理成功，内容类型: ${contentType}, 大小: ${response.data.length} 字节`);
    return res.send(response.data);
  } catch (error) {
    console.error('图片代理错误:', error.message);
    
    // 详细的错误信息
    const errorDetails = {
      error: `代理请求失败: ${error.message}`,
      code: error.code || 'UNKNOWN_ERROR'
    };
    
    // 如果是超时或网络错误，返回更具体的状态码
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ ...errorDetails, message: '请求超时' });
    } else if (error.code === 'ENOTFOUND') {
      return res.status(502).json({ ...errorDetails, message: '无法解析主机名' });
    }
    
    return res.status(500).json(errorDetails);
  }
} 