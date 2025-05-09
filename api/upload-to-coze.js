import axios from 'axios';
import formidable from 'formidable';
import { createReadStream } from 'fs';
import FormData from 'form-data';

export const config = {
  api: {
    bodyParser: false, // 禁用内置的请求体解析，因为formidable会处理
  },
};

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

  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ code: -1, msg: '方法不允许', data: null });
  }

  console.log('收到Coze文件上传请求');

  try {
    // 使用formidable解析表单数据
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.maxFileSize = 5 * 1024 * 1024; // 5MB限制

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // 检查是否有文件
    if (!files || !files.file) {
      console.error('缺少文件');
      return res.status(400).json({ code: -1, msg: '缺少文件', data: null });
    }

    const file = files.file;
    console.log('文件上传成功:', {
      name: file.originalFilename || file.newFilename,
      type: file.mimetype,
      size: file.size
    });

    // 创建FormData用于发送到Coze API
    const formData = new FormData();
    const fileStream = createReadStream(file.filepath);
    formData.append('file', fileStream, {
      filename: file.originalFilename || 'upload.png',
      contentType: file.mimetype || 'image/png'
    });

    // 从请求中获取授权头
    const authHeader = req.headers.authorization || 'Bearer pat_gVIYbuXftNX6ByXm8jjyRYqluzBydYatrV1BAe1jAXgjUE9887C52SYNotLxTZoX';

    // 发送到Coze API
    console.log('正在发送文件到Coze API...');
    const response = await axios.post('https://api.coze.cn/v1/files/upload', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': authHeader
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log('Coze文件上传成功:', response.data);
    return res.status(200).json(response.data);

  } catch (error) {
    console.error('文件上传处理错误:', error);
    
    // 获取详细错误信息
    let errorMsg = error.message;
    let responseData = null;
    
    if (error.response) {
      errorMsg = `Coze服务器返回错误: ${error.response.status}`;
      responseData = error.response.data;
      console.error('Coze API错误响应:', responseData);
    }
    
    return res.status(500).json({
      code: -1,
      msg: `文件上传失败: ${errorMsg}`,
      data: responseData
    });
  }
} 