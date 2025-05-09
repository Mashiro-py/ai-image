import multer from 'multer';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置multer存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 使用系统临时目录或创建一个临时目录
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 创建multer实例
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制5MB
  }
});

// 使用内存处理，不保存到磁盘
const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制5MB
  }
});

// 处理文件上传的函数
export default async function handler(req, res) {
  // 检查是否是POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只允许POST请求' });
  }
  
  // 使用内存存储处理上传文件
  uploadMemory.single('file')(req, res, async function(err) {
    if (err) {
      console.error('文件上传错误:', err);
      return res.status(400).json({
        code: -1,
        msg: `文件上传错误: ${err.message}`,
        data: null
      });
    }
    
    // 检查是否有文件
    if (!req.file) {
      return res.status(400).json({
        code: -1,
        msg: '缺少文件',
        data: null
      });
    }
    
    try {
      console.log('收到文件上传请求:', {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      
      // 创建FormData对象
      const formData = new FormData();
      
      // 将buffer添加到FormData
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      
      console.log('准备向Coze上传文件');
      
      // 发送到Coze API
      const response = await axios.post('https://api.coze.cn/v1/files/upload', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': req.headers.authorization || 'Bearer pat_gVIYbuXftNX6ByXm8jjyRYqluzBydYatrV1BAe1jAXgjUE9887C52SYNotLxTZoX'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      console.log('Coze文件上传成功');
      
      // 返回Coze API的响应
      return res.status(200).json(response.data);
    } catch (error) {
      console.error('Coze文件上传失败:', error);
      
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
} 