/**
 * AI图像生成器API服务
 * 负责与OpenAI API通信，发送图像生成请求并返回结果
 */
import axios from 'axios';

// API配置
const API_CONFIG = {
  baseUrl: 'https://api.openai.com/v1/',
  apiKey: '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', // 系统提供的API Key，实际部署时替换为真实的Key
  defaultModel: 'dall-e-2', // 默认使用DALL-E 2模型
  defaultSize: '1024x1024', // 默认图像尺寸
};

// 支持的模型和它们的分辨率
export const AI_MODELS = {
  'dall-e-3': {
    name: 'DALL-E 3',
    description: '最高质量|最新模型',
    supportedSizes: ['1024x1024', '1792x1024', '1024x1792'],
    presetSizes: [
      { name: '正方形', width: 1024, height: 1024 },
      { name: '横向', width: 1792, height: 1024 },
      { name: '纵向', width: 1024, height: 1792 }
    ]
  },
  'dall-e-2': {
    name: 'DALL-E 2',
    description: '基础模型|速度更快',
    supportedSizes: ['1024x1024', '512x512', '256x256'],
    presetSizes: [
      { name: '正方形', width: 1024, height: 1024 },
      { name: '中等', width: 512, height: 512 },
      { name: '小型', width: 256, height: 256 }
    ]
  }
};

// 创建axios实例
const apiClient = axios.create({
  baseURL: API_CONFIG.baseUrl,
  timeout: 60000, // 60秒超时
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_CONFIG.apiKey}`
  }
});

/**
 * 设置API Key (供内部使用)
 * @param {string} apiKey - 系统提供的OpenAI API Key
 */
export const setApiKey = (apiKey) => {
  API_CONFIG.apiKey = apiKey;
  // 更新axios实例的默认headers
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
};

/**
 * 设置默认模型
 * @param {string} model - 模型名称 (例如: 'dall-e-3', 'dall-e-2')
 */
export const setModel = (model) => {
  if (AI_MODELS[model]) {
    API_CONFIG.defaultModel = model;
    return true;
  }
  return false;
};

/**
 * 获取当前设置的模型
 * @returns {string} 当前模型名称
 */
export const getCurrentModel = () => {
  return API_CONFIG.defaultModel;
};

/**
 * 生成图像
 * @param {string} prompt - 图像描述文本
 * @param {Object} options - 图像生成选项
 * @param {number} options.width - 图像宽度
 * @param {number} options.height - 图像高度
 * @param {number} options.quality - 图像质量 (1-10)
 * @param {string} options.aspectRatio - 图像宽高比
 * @param {string} options.model - 可选，覆盖默认模型
 * @returns {Promise<Object>} 返回生成的图像信息
 */
export const generateImage = async (prompt, options = {}) => {
  // 根据质量参数调整提示词
  const qualityPrompt = getQualityPromptAddition(options.quality || 5);
  const fullPrompt = `${prompt}  ${qualityPrompt}`;

  // 使用指定的模型或默认模型
  const model = options.model || API_CONFIG.defaultModel;
  
  // 检查是否指定了宽度和高度
  const size = options.width && options.height 
    ? chooseBestPredefinedSize(options.width, options.height, model)
    : getBestSizeForAspectRatio(options.aspectRatio || '1:1', model);

  try {
    const requestData = {
      model: model,
      prompt: fullPrompt,
      n: 1,
      size: size,
      response_format: 'url'
    };

    // 如果是DALL-E-3模型，添加quality参数
    if (model === 'dall-e-3' && options.imageQuality === 'hd') {
      requestData.quality = 'hd';
    }

    const response = await apiClient.post('/images/generations', requestData);
    
    const imageUrl = response.data.data[0].url;
    console.log('API返回的图像URL:', imageUrl);
    
    // 立即尝试预下载图像以便后续使用
    try {
      await preloadImage(imageUrl);
      console.log('图像预加载成功');
    } catch (preloadError) {
      console.warn('图像预加载失败 (CORS问题):', preloadError);
    }
    
    return {
      imageUrl: imageUrl,
      prompt: prompt,
      model: model,
      size: size
    };
  } catch (error) {
    console.error('图像生成错误:', error);
    // 处理Axios错误
    if (error.response) {
      // 服务器返回了错误状态码
      const errorMessage = error.response.data.error?.message || '图像生成失败';
      throw new Error(errorMessage);
    } else if (error.request) {
      // 请求已发送但没有收到响应
      throw new Error('服务器未响应，请检查网络连接');
    } else {
      // 请求配置出错
      throw error;
    }
  }
};

/**
 * 预加载图像以检查是否有CORS问题
 * @param {string} url - 图像URL
 * @returns {Promise<void>}
 */
const preloadImage = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve();
    img.onerror = (err) => reject(new Error('图像预加载失败，可能存在CORS限制'));
    img.src = url;
    
    // 设置超时以防止长时间等待
    setTimeout(() => reject(new Error('图像预加载超时')), 5000);
  });
};

/**
 * 编辑图像 - 使用OpenAI的图像编辑API
 * @param {File} imageFile - 图像文件对象
 * @param {string} prompt - 描述需要如何编辑图像的提示词
 * @param {Object} options - 编辑选项
 * @param {string} options.size - 输出图像尺寸
 * @param {File} options.maskFile - 可选的蒙版文件，指定需要替换的区域
 * @returns {Promise<Object>} 返回编辑后的图像信息
 */
export const editImage = async (imageFile, prompt, options = {}) => {
  try {
    // 检查图像文件
    if (!imageFile) {
      throw new Error('必须提供图像文件');
    }
    
    console.log('编辑图像 - 原始文件:', imageFile.name, imageFile.type, imageFile.size + ' bytes');
    
    // 确保是PNG格式
    let processedImageFile = imageFile;
    if (imageFile.type !== 'image/png') {
      console.log('需要转换为PNG格式');
      processedImageFile = await convertToPNG(imageFile);
      console.log('转换后的图像文件:', processedImageFile.type, processedImageFile.size + ' bytes');
    }
    
    // 检查并处理文件大小
    if (processedImageFile.size > 4 * 1024 * 1024) {
      console.log('图像需要压缩，当前大小:', processedImageFile.size);
      processedImageFile = await resizeImage(processedImageFile, 4 * 1024 * 1024);
      console.log('压缩后的图像大小:', processedImageFile.size);
    }
    
    // 创建FormData对象用于发送文件
    const formData = new FormData();
    formData.append('image', processedImageFile);
    formData.append('prompt', prompt);
    
    // 处理蒙版文件
    let processedMaskFile = options.maskFile;
    if (processedMaskFile) {
      console.log('处理蒙版文件:', processedMaskFile.type, processedMaskFile.size);
      
      // 确保蒙版是PNG格式
      if (processedMaskFile.type !== 'image/png') {
        processedMaskFile = await convertToTransparentMask(processedMaskFile);
        console.log('转换后的蒙版文件:', processedMaskFile.type, processedMaskFile.size);
      }
      
      // 确保蒙版大小符合要求
      if (processedMaskFile.size > 4 * 1024 * 1024) {
        processedMaskFile = await resizeImage(processedMaskFile, 4 * 1024 * 1024);
        console.log('压缩后的蒙版大小:', processedMaskFile.size);
      }
      
      formData.append('mask', processedMaskFile);
    }
    
    // 打印FormData内容
    for (let [key, value] of formData.entries()) {
      console.log(key + ':', value instanceof File ? `${value.name} (${value.type}, ${value.size} bytes)` : value);
    }
    
    // 设置图像尺寸
    const size = options.size || '1024x1024';
    formData.append('size', size);
    
    // 设置其他选项
    formData.append('n', 1); // 只生成1张图片
    formData.append('response_format', 'url');
    
    // 创建特殊的axios实例用于发送FormData
    const formDataApiClient = axios.create({
      baseURL: API_CONFIG.baseUrl,
      timeout: 120000, // 较长的超时时间，因为编辑可能需要更长时间
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      }
    });
    
    const response = await formDataApiClient.post('/images/edits', formData);
    
    return {
      imageUrl: response.data.data[0].url,
      prompt: prompt,
      size: size
    };
  } catch (error) {
    console.error('图像编辑错误:', error);
    // 处理Axios错误
    if (error.response) {
      // 服务器返回了错误状态码
      const errorDetails = error.response.data.error || {};
      const errorMessage = errorDetails.message || '图像编辑失败';
      console.log('API错误详情:', errorDetails);
      throw new Error(errorMessage);
    } else if (error.request) {
      // 请求已发送但没有收到响应
      throw new Error('服务器未响应，请检查网络连接');
    } else {
      // 请求配置出错
      throw error;
    }
  }
};

/**
 * 将图像转换为PNG格式
 * @param {File} file - 原始图像文件
 * @returns {Promise<File>} 返回PNG格式的文件
 */
const convertToPNG = (file) => {
  console.log('开始转换图片到PNG格式');
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // 创建canvas并设置尺寸
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        // 先绘制白色背景（解决透明背景问题）
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 绘制图像
        ctx.drawImage(img, 0, 0);
        
        // 转换为PNG文件
        canvas.toBlob((blob) => {
          const pngFile = new File([blob], 'image.png', { type: 'image/png' });
          console.log('PNG转换完成，大小:', pngFile.size);
          resolve(pngFile);
        }, 'image/png', 1.0); // 使用最高质量
      } catch (err) {
        console.error('Canvas转换失败:', err);
        reject(err);
      }
    };
    img.onerror = (err) => reject(err);
    
    // 加载图像
    img.src = URL.createObjectURL(file);
  });
};

/**
 * 将图像转换为透明背景的蒙版
 * @param {File} file - 原始图像文件
 * @returns {Promise<File>} 返回适用于蒙版的PNG文件
 */
const convertToTransparentMask = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // 创建canvas并设置尺寸
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        // 清除canvas，确保透明背景
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 绘制图像，保留白色区域，其他区域透明
        ctx.drawImage(img, 0, 0);
        
        // 转换为PNG文件
        canvas.toBlob((blob) => {
          const pngFile = new File([blob], 'mask.png', { type: 'image/png' });
          resolve(pngFile);
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => reject(err);
    
    // 加载图像
    img.src = URL.createObjectURL(file);
  });
};

/**
 * 根据扩展方向创建mask图像
 * @param {File} imageFile - 原始图像文件
 * @param {string} direction - 扩展方向
 * @returns {Promise<File>} 返回mask文件对象
 */
const createExpandMask = async (imageFile, direction) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // 创建canvas并设置尺寸
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        // 创建透明背景的mask（表示保留区域）
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 根据方向，在需要扩展的边缘绘制白色区域（表示要修改的区域）
        ctx.fillStyle = 'white';
        
        const borderSize = Math.max(20, Math.min(canvas.width, canvas.height) * 0.1); // 边缘大小为图像尺寸的10%，最小20px
        
        switch (direction) {
          case 'top':
            ctx.fillRect(0, 0, canvas.width, borderSize);
            break;
          case 'bottom':
            ctx.fillRect(0, canvas.height - borderSize, canvas.width, borderSize);
            break;
          case 'left':
            ctx.fillRect(0, 0, borderSize, canvas.height);
            break;
          case 'right':
            ctx.fillRect(canvas.width - borderSize, 0, borderSize, canvas.height);
            break;
          case 'all':
            // 四周都留出扩展区域
            ctx.fillRect(0, 0, canvas.width, borderSize); // 上
            ctx.fillRect(0, canvas.height - borderSize, canvas.width, borderSize); // 下
            ctx.fillRect(0, 0, borderSize, canvas.height); // 左
            ctx.fillRect(canvas.width - borderSize, 0, borderSize, canvas.height); // 右
            break;
        }
        
        // 转换为PNG文件
        canvas.toBlob((blob) => {
          const maskFile = new File([blob], 'mask.png', { type: 'image/png' });
          resolve(maskFile);
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => reject(err);
    
    // 加载图像
    img.src = URL.createObjectURL(imageFile);
  });
};

/**
 * 扩展图像 - 实现"缩小视角，扩大画布"效果
 * @param {File} imageFile - 原始图像文件
 * @param {string} direction - 扩展方向(已弃用，保留参数兼容性)
 * @param {Object} options - 扩展选项
 * @returns {Promise<Object>} 返回扩展后的图像信息
 */
export const expandImage = async (imageFile, direction = 'all', options = {}) => {
  try {
    // 检查图像文件
    if (!imageFile) {
      throw new Error('必须提供图像文件');
    }
    
    console.log('扩展图像 - 原始文件:', imageFile.name, imageFile.type, imageFile.size + ' bytes');
    
    // 确保图片是PNG格式
    let processedImageFile = imageFile;
    if (imageFile.type !== 'image/png') {
      console.log('需要转换为PNG格式...');
      processedImageFile = await convertToPNG(imageFile);
      console.log('转换完成, 新文件大小:', processedImageFile.size);
    }
    
    // 创建扩展画布（将原图缩小并居中放置）
    const expandedImageFile = await createExpandedCanvas(processedImageFile, 2.0); // 放大系数2.0表示画布扩大到原来的2倍
    console.log('扩展画布完成, 新文件大小:', expandedImageFile.size);
    
    // 检查图片大小
    let finalImageFile = expandedImageFile;
    if (expandedImageFile.size > 4 * 1024 * 1024) {
      console.log('需要压缩图片...');
      finalImageFile = await resizeImage(expandedImageFile, 4 * 1024 * 1024);
      console.log('压缩完成, 最终文件大小:', finalImageFile.size);
    }
    
    // 根据不同场景设置提示词
    const prompt = "Zoom out from this image. Extend the image with natural background that matches the style and content. Keep all original elements intact and centered, just add appropriate surroundings.";
    
    // 直接调用OpenAI的图像编辑API，不使用mask
    // 创建FormData对象用于发送文件
    const formData = new FormData();
    formData.append('image', finalImageFile);
    formData.append('prompt', prompt);
    
    // 设置图像尺寸
    const size = options.size || '1024x1024';
    formData.append('size', size);
    
    // 设置其他选项
    formData.append('n', 1); // 只生成1张图片
    formData.append('response_format', 'url');
    
    // 创建axios实例用于发送FormData
    const formDataApiClient = axios.create({
      baseURL: API_CONFIG.baseUrl,
      timeout: 120000,
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      }
    });
    
    console.log('发送扩展图像请求，提示词:', prompt);
    const response = await formDataApiClient.post('/images/edits', formData);
    
    return {
      imageUrl: response.data.data[0].url,
      prompt: prompt,
      size: size
    };
    
  } catch (error) {
    console.error('扩展图像失败:', error);
    throw new Error('扩展图像失败: ' + error.message);
  }
};

/**
 * 创建扩展画布 - 将原图缩小并居中放置在更大的透明画布上
 * @param {File} file - 原始图像文件
 * @param {number} scaleFactor - 画布扩大系数(如2.0表示扩大到原来的2倍)
 * @returns {Promise<File>} 返回处理后的文件
 */
const createExpandedCanvas = (file, scaleFactor = 2.0) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // 获取原始尺寸
        const originalWidth = img.width;
        const originalHeight = img.height;
        
        // 创建扩大的画布
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(originalWidth * scaleFactor);
        canvas.height = Math.round(originalHeight * scaleFactor);
        const ctx = canvas.getContext('2d');
        
        // 使背景透明
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 计算居中位置
        const x = Math.round((canvas.width - originalWidth) / 2);
        const y = Math.round((canvas.height - originalHeight) / 2);
        
        // 绘制原始图像到居中位置
        ctx.drawImage(img, x, y, originalWidth, originalHeight);
        
        console.log(`画布扩展: 从 ${originalWidth}x${originalHeight} 到 ${canvas.width}x${canvas.height}`);
        
        // 转换为PNG文件
        canvas.toBlob((blob) => {
          const expandedFile = new File([blob], 'expanded-image.png', { type: 'image/png' });
          resolve(expandedFile);
        }, 'image/png', 1.0);
      } catch (err) {
        console.error('创建扩展画布失败:', err);
        reject(err);
      }
    };
    img.onerror = (err) => reject(err);
    
    // 加载图像
    img.src = URL.createObjectURL(file);
  });
};

/**
 * 根据质量参数获取额外的提示词
 * @param {number} quality - 质量参数 (1-10)
 * @returns {string} 质量相关的附加提示词
 */
const getQualityPromptAddition = (quality) => {
  // 质量级别映射到提示词
  const qualityMap = {
    1: 'rough sketch, basic details',
    2: 'simple drawing, limited details',
    3: 'moderate details, basic lighting',
    4: 'good details, decent lighting',
    5: 'clear details, good lighting and colors',
    6: 'high quality, detailed, good composition',
    7: 'very detailed, excellent lighting, high resolution',
    8: 'highly detailed, professional quality, perfect lighting',
    9: 'ultra detailed, masterful composition, photorealistic',
    10: 'extremely detailed, perfect lighting, cinematic quality, masterpiece'
  };

  return qualityMap[quality] || qualityMap[5];
};

/**
 * 根据宽高比选择最佳尺寸
 * @param {string} aspectRatio - 宽高比 (例如: '16:9', '4:3', '1:1')
 * @param {string} model - 模型名称
 * @returns {string} OpenAI API支持的尺寸字符串
 */
const getBestSizeForAspectRatio = (aspectRatio, model = API_CONFIG.defaultModel) => {
  // 获取模型支持的尺寸
  const supportedSizes = AI_MODELS[model]?.supportedSizes || AI_MODELS['dall-e-2'].supportedSizes;
  
  // 计算宽高比值
  const [width, height] = aspectRatio.split(':').map(Number);
  const ratio = width / height;
  
  if (model === 'dall-e-3') {
    // DALL-E 3 的尺寸选择逻辑
    if (ratio > 1.3) { // 横向
      return '1792x1024';
    } else if (ratio < 0.77) { // 纵向
      return '1024x1792';
    } else { // 接近正方形
      return '1024x1024';
    }
  } else {
    // DALL-E 2 的尺寸选择逻辑
    if (ratio > 1.3 || ratio < 0.77) { // 非方形
      return '1024x1024'; // DALL-E 2 只支持正方形，所以返回最大尺寸
    } else {
      return '1024x1024';
    }
  }
};

/**
 * 根据用户选择的尺寸匹配最接近的API支持尺寸
 * @param {number} width - 用户选择的宽度
 * @param {number} height - 用户选择的高度
 * @param {string} model - 模型名称
 * @returns {string} 最接近的API支持尺寸
 */
const chooseBestPredefinedSize = (width, height, model = API_CONFIG.defaultModel) => {
  // 获取当前模型支持的预设尺寸
  const modelConfig = AI_MODELS[model] || AI_MODELS['dall-e-2'];
  const supportedSizes = modelConfig.presetSizes.map(size => ({
    size: `${size.width}x${size.height}`,
    width: size.width,
    height: size.height
  }));
  
  // 精确匹配预设尺寸
  const exactMatch = supportedSizes.find(
    s => s.width === width && s.height === height
  );
  
  if (exactMatch) {
    return exactMatch.size;
  }
  
  // 如果不是精确匹配，根据宽高比选择最接近的尺寸
  const ratio = width / height;
  
  if (model === 'dall-e-3') {
    if (ratio > 1.3) { // 横向
      return '1792x1024';
    } else if (ratio < 0.77) { // 纵向
      return '1024x1792';
    } else { // 接近正方形
      return '1024x1024';
    }
  } else {
    // DALL-E 2 只支持正方形尺寸，根据大小选择不同分辨率
    const totalPixels = width * height;
    if (totalPixels > 400000) {
      return '1024x1024';
    } else if (totalPixels > 100000) {
      return '512x512';
    } else {
      return '256x256';
    }
  }
};

/**
 * 调整图像大小以满足大小限制
 * @param {File} file - 图像文件
 * @param {number} maxBytes - 最大字节数
 * @param {number} quality - 初始质量，递减
 * @returns {Promise<File>} 返回调整大小后的文件
 */
const resizeImage = (file, maxBytes, quality = 0.9) => {
  return new Promise((resolve, reject) => {
    // 如果文件已经小于限制，则直接返回
    if (file.size <= maxBytes) {
      resolve(file);
      return;
    }
    
    // 如果质量太低，则不再压缩
    if (quality < 0.3) {
      console.warn('无法将图像压缩到目标大小，当前质量已达最低限制');
      resolve(file);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      try {
        // 创建canvas并设置尺寸
        const canvas = document.createElement('canvas');
        const aspectRatio = img.width / img.height;
        
        // 保持宽高比，但限制尺寸
        let width = img.width;
        let height = img.height;
        
        // 如果图像太大，先从尺寸上减小
        if (width > 3000 || height > 3000) {
          if (width > height) {
            width = 3000;
            height = Math.round(width / aspectRatio);
          } else {
            height = 3000;
            width = Math.round(height * aspectRatio);
          }
        }
        
        // 如果文件仍然太大，分阶段降低分辨率
        const scaleFactor = Math.min(1, Math.sqrt(maxBytes / file.size) * 0.9);
        if (scaleFactor < 1) {
          width = Math.floor(width * scaleFactor);
          height = Math.floor(height * scaleFactor);
          console.log(`降低分辨率至 ${width}x${height} (缩放比例: ${scaleFactor.toFixed(2)})`);
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // 先绘制白色背景
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 绘制图像
        ctx.drawImage(img, 0, 0, width, height);
        
        // 转换为PNG文件
        canvas.toBlob((blob) => {
          const resizedFile = new File([blob], 'resized-image.png', { type: 'image/png' });
          
          // 检查是否满足大小要求
          if (resizedFile.size <= maxBytes) {
            console.log(`图像压缩成功: ${resizedFile.size} bytes`);
            resolve(resizedFile);
          } else {
            // 如果仍然太大，递归调用，降低质量
            console.log(`压缩不足: 当前大小 ${resizedFile.size} bytes, 目标 ${maxBytes} bytes, 降低质量至 ${(quality-0.1).toFixed(2)}`);
            resolve(resizeImage(resizedFile, maxBytes, quality - 0.1));
          }
        }, 'image/png', quality);
      } catch (err) {
        console.error('图像压缩失败:', err);
        reject(err);
      }
    };
    img.onerror = (err) => reject(err);
    
    // 加载图像
    img.src = URL.createObjectURL(file);
  });
};

/**
 * 将远程图像URL转换为File对象
 * @param {string} url - 图像URL
 * @param {string} filename - 保存的文件名
 * @returns {Promise<File>} 返回File对象
 */
export const urlToFile = async (url, filename) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type });
  } catch (error) {
    console.error('图像URL转换为文件失败:', error);
    throw new Error('图像URL转换为文件失败');
  }
};

/**
 * 使用DeepSeek API优化提示词
 * @param {string} originalPrompt - 原始提示词
 * @returns {Promise<string>} 优化后的提示词
 */
export const optimizePromptWithDeepSeek = async (originalPrompt) => {
  try {
    // 调用DeepSeek API进行提示词优化
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的AI图像生成提示词专家。请优化用户提供的提示词，使其能够生成更加精美、详细的图像。添加适当的细节描述、风格、光影、色彩等元素。'
          },
          {
            role: 'user',
            content: `请优化以下图像生成提示词，不要改变原始意图，但让描述更加生动、详细：\n\n"${originalPrompt}"`
          }
        ],
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk-1890c0853a0841cfa2512732dc7c93c7' // 实际使用时替换为真实API密钥
        }
      }
    );
    
    // 提取优化后的提示词
    const optimizedPrompt = response.data.choices[0].message.content;
    console.log('DeepSeek优化后的提示词:', optimizedPrompt);
    
    return optimizedPrompt;
  } catch (error) {
    console.error('DeepSeek提示词优化失败:', error);
    throw new Error(`DeepSeek提示词优化失败: ${error.message}`);
  }
};

/**
 * 使用Coze工作流API优化提示词
 * @param {string} originalPrompt - 原始提示词
 * @param {Object} params - Coze所需参数
 * @returns {Promise<string>} 优化后的提示词
 */
export const optimizePromptWithCoze = async (originalPrompt, params) => {
  try {
    // 验证必要参数
    if (!params.title || !params.subTitle || !params.company || !params.industryKeywords) {
      throw new Error('Coze优化需要提供所有必要参数：title、subTitle、company、industryKeywords');
    }
    
    // 调用Coze工作流API
    const response = await axios.post(
      'https://api.coze.cn/v1/workflow/run',
      {
        workflow_id: '7491234780052209674',
        parameters: {
          title: params.title,
          subTitle: params.subTitle,
          company: params.company,
          industryKeywords: params.industryKeywords,
          originalPrompt // 添加原始提示词作为额外参数
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer pat_59HJdzlPDfR7mEhel5hiRO4R2FLX5wj9fb3wyXaUPf546fPfPscIHyrB39HZE21S'
        }
      }
    );
    
    // 根据实际Coze返回格式解析数据
    console.log('Coze API返回数据:', response.data);
    
    if (response.data.code === 0 && response.data.data) {
      // 解析JSON字符串获取output内容
      try {
        const parsedData = JSON.parse(response.data.data);
        if (parsedData && parsedData.output) {
          console.log('解析后的提示词:', parsedData.output);
          return parsedData.output;
        }
      } catch (parseError) {
        console.error('解析Coze返回数据失败:', parseError);
      }
    }
    
    // 如果无法从返回数据中提取优化后的提示词，使用原始提示词
    console.warn('未能从Coze返回数据中提取优化后的提示词，使用原始提示词');
    return originalPrompt;
  } catch (error) {
    console.error('Coze提示词优化失败:', error);
    throw new Error(`Coze提示词优化失败: ${error.message}`);
  }
};