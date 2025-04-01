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
    const response = await apiClient.post('/images/generations', {
      model: model,
      prompt: fullPrompt,
      n: 1,
      size: size,
      response_format: 'url'
    });
    
    return {
      imageUrl: response.data.data[0].url,
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
 * 修改图像（调整尺寸等）
 * 此功能在前端处理，不需要调用API
 * @param {string} imageUrl - 原始图像URL
 * @param {Object} options - 调整选项
 * @returns {Promise<string>} 修改后的图像URL (或Canvas对象)
 */
export const modifyImage = async (imageUrl, options = {}) => {
  // 这个功能在前端通过Canvas API实现
  // 在实际应用中可以根据需要扩展此功能
  return imageUrl;
};