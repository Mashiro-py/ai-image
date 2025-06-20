/**
 * AI图像生成器API服务
 * 负责与OpenAI API通信，发送图像生成请求并返回结果
 */
import axios from 'axios';

// API配置
const API_CONFIG = {
  baseUrl: 'https://api.openai.com/v1/',
  apiKey: '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', // 系统提供的API Key，实际部署时替换为真实的Key
  defaultModel: 'jimeng-3.0', // 默认使用CW1.0模型
  defaultSize: '1024x1024', // 默认图像尺寸
  // 即梦API配置
  jimengApi: {
    baseUrl: '/api/jimeng/', // 使用相对路径，通过代理转发
    // 多个session_id轮询
    apiKeys: [
      "95c1e94305ac13780d44bf13d7f3482b",
      "30899216a331e1c1d09df972bb985242", // 当前使用的
      "286dfb6c3240f2f0ac07894667dac7ee", 
      '8324211718f83d71dce67f4d63132e27',
      '0ddb2442c5ed08d2d8344708c955537e',
      'ad26aaf1ecf1c1b6d555eb237e62d3b3',
      'a45636f06f42b1d294c884ce6aba8f89',
      'c14e91dae7fdadc29f684db39ff1ed90'
    ],
    currentKeyIndex: Math.floor(Math.random() * 6), // 随机选择初始索引，实现负载均衡
    getNextApiKey: function() {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      return this.apiKeys[this.currentKeyIndex];
    },
    getCurrentApiKey: function() {
      return this.apiKeys[this.currentKeyIndex];
    },
    getRandomApiKey: function() {
      this.currentKeyIndex = Math.floor(Math.random() * this.apiKeys.length);
      return this.apiKeys[this.currentKeyIndex];
    },
    earlyCancelTimeout: 40000, // 40秒提前取消请求，避免等待过长时间
    maxTimeout: 180000 // 最长超时时间，保险措施
  }
};

// 支持的模型和它们的分辨率
export const AI_MODELS = {
  'jimeng-3.0': {
    name: 'CW1.0',
    description: '中文模型|4张图',
    supportedSizes: ['1024x1024', '1664x936', '936x1664'],
    presetSizes: [
      { name: '正方形', width: 1024, height: 1024 },
      { name: '横向', width: 1664, height: 936 },
      { name: '纵向', width: 936, height: 1664 }
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

// 创建即梦API的axios实例 - 不再在此处设置Authorization头，改为每次请求时单独设置
const jimengApiClient = axios.create({
  baseURL: API_CONFIG.jimengApi.baseUrl,
  timeout: API_CONFIG.jimengApi.maxTimeout, // 最长超时时间
  headers: {
    'Content-Type': 'application/json'
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
  // 使用指定的模型或默认模型
  const model = options.model || API_CONFIG.defaultModel;
  
  // 检查是否为即梦API模型
  if (model === 'jimeng-3.0') {
    return generateJimengImage(prompt, options);
  }
  
  // 使用固定高质量设置，不再根据options.quality参数调整
  const qualityPrompt = "extremely detailed, perfect lighting, cinematic quality, masterpiece";
  const fullPrompt = `${prompt} ${qualityPrompt}`;
  
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
    // 检查是否为跨域URL
    const isCrossDomain = url.startsWith('http') && !url.includes(window.location.hostname);
    
    if (isCrossDomain) {
      // 对于跨域URL，使用代理进行请求
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      return new File([blob], filename, { type: blob.type });
    } else {
      // 对于同域URL，直接请求
      const response = await fetch(url);
      const blob = await response.blob();
      return new File([blob], filename, { type: blob.type });
    }
  } catch (error) {
    console.error('图像URL转换为文件失败:', error);
    
    // 如果代理请求失败，尝试使用canvas方法（仅适用于已经加载到页面的图像）
    try {
      console.log('尝试使用canvas方法获取图像数据...');
      return await canvasMethodFallback(url, filename);
    } catch (fallbackError) {
      console.error('备用方法也失败:', fallbackError);
      throw new Error('图像URL转换为文件失败，请尝试手动下载并上传图片');
    }
  }
};

/**
 * 使用Canvas作为获取图像数据的备用方法
 * @param {string} url - 图像URL
 * @param {string} filename - 保存的文件名
 * @returns {Promise<File>} 返回File对象
 */
const canvasMethodFallback = (url, filename) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('无法从Canvas获取图像数据'));
            return;
          }
          
          const file = new File([blob], filename, { type: 'image/png' });
          resolve(file);
        }, 'image/png', 1.0);
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => reject(new Error('图像加载失败'));
    
    // 设置超时
    setTimeout(() => reject(new Error('图像加载超时')), 10000);
    
    // 加载图像
    img.src = url;
  });
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
      '/api/deepseek/v1/chat/completions',
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
 * 创建一个尝试不同端点上传文件的函数
 * @param {File} file - 要上传的文件
 * @returns {Promise<string>} 返回file_id
 */
const uploadFileWithFallback = async (file) => {
  console.log('正在尝试上传文件:', file.name, file.type, file.size);
  
  const formData = new FormData();
  formData.append('file', file);
  
  // 尝试所有可能的端点
  const endpoints = [
    '/api/upload-to-coze',
    '/api/coze/v1/files/upload'
  ];
  
  let lastError = null;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`尝试使用端点 ${endpoint} 上传文件...`);
      
      const response = await axios.post(
        endpoint,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': 'Bearer pat_gVIYbuXftNX6ByXm8jjyRYqluzBydYatrV1BAe1jAXgjUE9887C52SYNotLxTZoX'
          },
          timeout: 60000 // 60秒超时
        }
      );
      
      console.log(`${endpoint} 上传响应:`, response.data);
      
      if (response.data && response.data.code === 0 && response.data.data && response.data.data.id) {
        console.log(`上传成功，获取到file_id: ${response.data.data.id}`);
        return response.data.data.id;
      } else {
        console.warn(`${endpoint} 响应格式不正确:`, response.data);
      }
    } catch (error) {
      console.error(`${endpoint} 上传失败:`, error);
      lastError = error;
    }
  }
  
  // 如果所有尝试都失败了，抛出最后一个错误
  throw lastError || new Error('所有上传尝试均失败');
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
    if (!params.info) {
      throw new Error('Coze优化需要提供info参数');
    }
    
    // 准备请求参数
    const requestParams = {
      info: params.info || originalPrompt,
      company: params.company || '',
      Addition: params.Addition || '',
      originalPrompt // 保留原始提示词作为额外参数
    };
    
    // 如果有示例图片，上传并获取file_id
    if (params.example && params.example instanceof File) {
      try {
        // 使用带有自动重试的上传功能
        const fileId = await uploadFileWithFallback(params.example);
        
        // 按照Coze API要求的格式添加file_id
        requestParams.example = JSON.stringify({ file_id: fileId });
      } catch (uploadError) {
        console.error('示例图片上传失败，将继续但不包含图片:', uploadError);
        
        if (typeof alert === 'function') {
          alert('示例图片上传失败，将继续优化提示词但不包含示例图片。');
        }
      }
    } else {
      console.log('未提供示例图片或示例图片不是有效的文件对象');
    }
    
    console.log('Coze工作流请求参数:', requestParams);
    
    // 调用Coze工作流API
    const response = await axios.post(
      '/api/coze/v1/workflow/run',
      {
        workflow_id: '7499022151862059058',
        parameters: requestParams
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer pat_j9KRcN957xmDa9sS6P3PPHlCdPxKGrrE4mbxaCs2hjQt8KxpV9iPqvGvSGM5jHPf'
        }
      }
    );
    
    // 根据实际Coze返回格式解析数据
    console.log('Coze API返回数据:', response.data);
    
    if (response.data.code === 0 && response.data.data) {
      try {
        const parsedData = JSON.parse(response.data.data);
        if (parsedData && parsedData.data) {
          console.log('解析后的提示词:', parsedData.data);
          // 直接返回data字段的内容
          return parsedData.data;
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

/**
 * 使用CancelToken和超时控制发起请求，超过指定时间自动取消并重试
 * @param {Function} requestFunction - 请求函数，返回Promise
 * @param {number} timeoutMs - 提前取消的超时时间(ms)
 * @returns {Promise} - 请求结果或超时错误
 */
const requestWithEarlyTimeout = async (requestFunction, timeoutMs) => {
  // 创建一个可取消的token
  const source = axios.CancelToken.source();
  
  // 创建定时器Promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      source.cancel('操作超时，主动切换到下一个session_id');
      reject(new Error('提前超时，切换session_id'));
    }, timeoutMs);
  });
  
  // 创建请求Promise，传入CancelToken
  const requestPromise = requestFunction(source.token);
  
  // 使用Promise.race，谁先完成就用谁的结果
  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } catch (error) {
    if (axios.isCancel(error)) {
      // 请求被主动取消，返回特殊错误以便外层知道是提前超时
      error.isEarlyTimeout = true;
    }
    throw error;
  }
};

/**
 * 使用即梦API生成图像
 * @param {string} prompt - 图像描述文本
 * @param {Object} options - 图像生成选项
 * @returns {Promise<Object>} 返回生成的图像信息
 */
const generateJimengImage = async (prompt, options = {}) => {
  // 首先随机选择一个session_id开始，实现负载均衡
  API_CONFIG.jimengApi.getRandomApiKey();
  console.log(`初始随机选择session_id: ${API_CONFIG.jimengApi.getCurrentApiKey().substring(0, 8)}...`);
  
  let retryCount = 0;
  const maxRetries = API_CONFIG.jimengApi.apiKeys.length * 2; // 增加最大尝试次数，因为可能有提前超时的情况
  
  while (retryCount < maxRetries) {
    // 每次请求前获取当前的session_id
    const currentSessionId = API_CONFIG.jimengApi.getCurrentApiKey();
    
    try {
      // 检查是否指定了宽度和高度
      const width = options.width || 1024;
      const height = options.height || 1024;
      
      // 准备请求数据
      const requestData = {
        model: "jimeng-3.0",
        prompt: prompt,
        negativePrompt: "",
        width: width,
        height: height,
        sample_strength: 0.5
      };

      console.log(`CW1.0请求数据 (使用session_id: ${currentSessionId.substring(0, 8)}...):`, requestData);
      
      // 不再使用默认headers，而是每次请求时显式传入
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentSessionId}`
      };
      
      console.log(`发送请求，使用Authorization: Bearer ${currentSessionId.substring(0, 8)}...`);
      
      // 使用提前超时控制的请求函数，并传递当前headers
      const response = await requestWithEarlyTimeout(
        (cancelToken) => jimengApiClient.post('images/generations', requestData, { 
          cancelToken,
          headers: headers // 显式传递包含当前session_id的headers
        }), 
        API_CONFIG.jimengApi.earlyCancelTimeout
      );
      
      console.log('CW1.0响应:', response.data);
      
      // 检查响应数据
      if (!response.data.data || !Array.isArray(response.data.data) || response.data.data.length === 0) {
        throw new Error('CW1.0返回数据格式不正确');
      }
      
      // 构造返回结果 - 即梦API总是返回4张图像
      const imageUrls = response.data.data.map(item => item.url);
      
      // 返回第一张图片作为主图片，其他作为额外图片
      return {
        imageUrl: imageUrls[0],
        additionalImages: imageUrls.slice(1),
        prompt: prompt,
        model: "jimeng-3.0",
        size: `${width}x${height}`
      };
    } catch (error) {
      // 检查是否是我们主动提前取消的请求
      const isEarlyTimeout = error.isEarlyTimeout || 
                             (axios.isCancel && axios.isCancel(error)) ||
                             error.message === '提前超时，切换session_id';
      
      if (isEarlyTimeout) {
        console.log(`请求等待时间过长 (${API_CONFIG.jimengApi.earlyCancelTimeout}ms)，主动切换session_id`);
      } else {
        console.error(`CW1.0图像生成错误(使用session_id: ${currentSessionId.substring(0, 8)}...):`, error);
      }
      
      // 无论什么错误，都切换到下一个session_id
      // 这包括:
      // - 记录不存在错误 (errcode === -2007)
      // - 授权错误 (401/403)
      // - 超时错误
      // - 提前主动取消的请求
      // - 其他任何错误
      
      console.log(`切换到下一个session_id(当前失败的session_id: ${currentSessionId.substring(0, 8)}...)`);
      // 切换到下一个session_id
      API_CONFIG.jimengApi.getNextApiKey();
      const newSessionId = API_CONFIG.jimengApi.getCurrentApiKey();
      retryCount++;
      
      // 如果还有其他key可以尝试，继续循环
      if (retryCount < maxRetries) {
        console.log(`尝试使用新的session_id: ${newSessionId.substring(0, 8)}...`);
        continue;
      }
      
      // 如果已经尝试了所有key，则根据错误类型返回适当的错误信息
      if (isEarlyTimeout) {
        throw new Error('所有session_id都响应超时，请稍后再试');
      } else if (error.response) {
        // 服务器返回了错误状态码
        const errorMessage = error.response.data.error?.message || error.response.data.errmsg || 'CW1.0图像生成失败';
        throw new Error(errorMessage);
      } else if (error.code === 'ECONNABORTED') {
        // 请求超时
        throw new Error('CW1.0服务器响应超时，请稍后再试');
      } else if (error.request) {
        // 请求已发送但没有收到响应
        throw new Error('CW1.0服务器未响应，请检查网络连接');
      } else {
        // 请求配置出错
        throw error;
      }
    }
  }
  
  // 如果所有尝试都失败
  throw new Error('所有可用的session_id都失败了，请稍后再试');
};

/**
 * 使用DeepSeek 2.0 API优化提示词
 * @param {string} originalPrompt - 原始提示词
 * @returns {Promise<string>} 优化后的提示词
 */
export const optimizePromptWithDeepSeek2 = async (originalPrompt) => {
  try {
    const response = await axios.post(
      '/api/deepseek2/v1/chat/completions',
      {
        model: "deepseek",
        messages: [
          {
            role: "user",
            content: originalPrompt
          }
        ],
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'HUP7krphguth24m1+Vs6g6XoAkCC4LtlR5DhzhM9FkPCWvJTvHMK7PyGxYc+tPp3'
        }
      }
    );
    
    // 从响应中提取优化后的提示词
    if (response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
      const optimizedPrompt = response.data.choices[0].message.content;
      console.log('DeepSeek 2.0优化后的提示词:', optimizedPrompt);
      return optimizedPrompt;
    }
    
    throw new Error('DeepSeek 2.0 API返回数据格式不正确');
  } catch (error) {
    console.error('DeepSeek 2.0提示词优化失败:', error);
    throw new Error(`DeepSeek 2.0提示词优化失败: ${error.message}`);
  }
};
