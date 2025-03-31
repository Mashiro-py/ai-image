/**
 * AI图像生成器API服务
 * 负责与OpenAI API通信，发送图像生成请求并返回结果
 */
import axios from 'axios';

// API配置
const API_CONFIG = {
  baseUrl: 'https://api.openai.com/v1/',
  apiKey: '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', // 系统提供的API Key，实际部署时替换为真实的Key
  defaultModel: 'dall-e-2', // 默认使用DALL-E 3模型
  defaultSize: '1024x1024', // 默认图像尺寸
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
 * 生成图像
 * @param {string} prompt - 图像描述文本
 * @param {Object} options - 图像生成选项
 * @param {number} options.width - 图像宽度
 * @param {number} options.height - 图像高度
 * @param {number} options.quality - 图像质量 (1-10)
 * @param {string} options.aspectRatio - 图像宽高比
 * @returns {Promise<Object>} 返回生成的图像信息
 */
export const generateImage = async (prompt, options = {}) => {
  // 根据质量参数调整提示词
  const qualityPrompt = getQualityPromptAddition(options.quality || 5);
  const fullPrompt = `${prompt}  ${qualityPrompt}`;

  // 检查是否指定了宽度和高度
  const size = options.width && options.height 
    ? chooseBestPredefinedSize(options.width, options.height)
    : getBestSizeForAspectRatio(options.aspectRatio || '1:1');

  try {
    const response = await apiClient.post('/images/generations', {
      model: API_CONFIG.defaultModel,
      prompt: fullPrompt,
      n: 1,
      size: size,
      response_format: 'url'
    });
    
    return {
      imageUrl: response.data.data[0].url,
      prompt: prompt,
      model: API_CONFIG.defaultModel,
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
 * @returns {string} OpenAI API支持的尺寸字符串
 */
const getBestSizeForAspectRatio = (aspectRatio) => {
  // DALL-E 3支持的尺寸
  const supportedSizes = ['1024x1024', '1792x1024', '1024x1792'];
  // DALL-E 2支持的尺寸
  const supportedSizes2 = ['1024x1024', '512x512', '256x256'];
  
  // 计算宽高比值
  const [width, height] = aspectRatio.split(':').map(Number);
  const ratio = width / height;
  
  // 选择最接近的尺寸
  if (ratio > 1.3) { // 横向
    return '1024x1024';
  } else if (ratio < 0.77) { // 纵向
    return '512x512';
  } else { // 接近正方形
    return '256x256';
  }
};

/**
 * 根据用户选择的尺寸匹配最接近的API支持尺寸
 * @param {number} width - 用户选择的宽度
 * @param {number} height - 用户选择的高度
 * @returns {string} 最接近的API支持尺寸
 */
const chooseBestPredefinedSize = (width, height) => {
  // 支持的预设尺寸
  const supportedSizes = [
    { size: '1024x1024', width: 1024, height: 1024 },
    { size: '512x512', width: 512, height: 512 },
    { size: '256x256', width: 256, height: 256 }
  ];
  
  // 精确匹配预设尺寸
  const exactMatch = supportedSizes.find(
    s => s.width === width && s.height === height
  );
  
  if (exactMatch) {
    return exactMatch.size;
  }
  
  // 如果不是精确匹配，根据宽高比选择最接近的尺寸
  const ratio = width / height;
  
  if (ratio > 1.3) { // 横向
    return '1024x1024';
  } else if (ratio < 0.77) { // 纵向
    return '512x512';
  } else { // 接近正方形
    return '256x256';
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