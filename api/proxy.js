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
      return res.status(400).json({ error: 'URL参数缺失' });
    }
    
    console.log(`代理图片请求: ${url}`);
    
    // 使用axios获取图片数据
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      headers: {
        'Referer': 'https://your-app-domain.com/', // 设置Referer头，有些服务器需要这个
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // 设置正确的内容类型
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
    
    // 返回图片数据
    return res.send(response.data);
  } catch (error) {
    console.error('图片代理错误:', error.message);
    return res.status(500).json({ error: `代理请求失败: ${error.message}` });
  }
} 