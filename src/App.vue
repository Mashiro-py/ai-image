<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { 
  generateImage, 
  setApiKey, 
  setModel, 
  getCurrentModel, 
  AI_MODELS, 
  editImage, 
  expandImage, 
  urlToFile,
  optimizePromptWithDeepSeek,
  optimizePromptWithDeepSeek2,
  optimizePromptWithCoze
} from './apis/imageGenerator';

// 图像生成相关状态
const prompt = ref('');
const isLoading = ref(false);
const error = ref(null);
const apiKeySet = ref(true); // 默认已设置API Key
const selectedModel = ref(getCurrentModel()); // 当前选中的模型
const imageQuality = ref('standard'); // 图像质量设置

// 提示词优化相关状态
const isOptimizingPrompt = ref(false); // 是否正在优化提示词
const promptOptimizer = ref('none'); // 优化器选择: none, deepseek, deepseek2, coze
const cozeParams = reactive({
  info: '',
  company: '',
  example: null, // 用于存储上传的示例图片
  Addition: ''
});
const showCozeParamsDialog = ref(false); // 是否显示Coze参数输入对话框
const optimizedPrompt = ref(''); // 优化后的提示词

// 图像编辑相关状态
const uploadedImage = ref(null);
const isExpanding = ref(false);
const expandError = ref(null);

// 图像文件对象
const imageFile = ref(null);

// 图片生成数量选择 (dall-e-3最多1张，dall-e-2最多4张)
const imageCount = ref(1);
const maxImageCount = computed(() => 4); // 允许所有模型都可以选择最多4张图片

// 聊天历史记录
const chatHistory = ref([]);

// 预设的尺寸选项，基于当前选择的模型动态更新
const presetSizes = ref(AI_MODELS[selectedModel.value].presetSizes);

// 初始化画布尺寸
const initialCanvasSize = () => {
  // 计算画布区域的可用空间 (考虑到侧边栏和内边距)
  const availableWidth = window.innerWidth - 320 - 80; // 侧边栏宽度和内边距
  const availableHeight = window.innerHeight - 64 - 80; // 标题栏高度和内边距
  
  // 根据16:9比例设置初始尺寸，但不超过可用空间
  let width = Math.min(availableWidth, 1280);
  let height = Math.round(width / (16/9));
  
  // 确保高度也不超过可用空间
  if (height > availableHeight) {
    height = availableHeight;
    width = Math.round(height * (16/9));
  }
  
  return { width, height };
};

// 画布设置状态
const canvasSettings = reactive({
  ...initialCanvasSize(),
  aspectRatio: '1:1',
  quality: 5,
  model: selectedModel.value
});

// 处理图片上传
const handleImageUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  console.log('上传文件类型:', file.type, '大小:', file.size);
  
  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    expandError.value = '请上传有效的图片文件';
    return;
  }
  
  try {
    isLoading.value = true;
    
    // 转换为PNG格式
    const pngFile = await convertFileToPng(file);
    console.log('转换后文件:', pngFile.type, pngFile.size);
    
    // 检查文件大小
    if (pngFile.size > 4 * 1024 * 1024) {
      expandError.value = '图片大小不能超过4MB';
      return;
    }
    
    // 保存文件对象并预览
    imageFile.value = pngFile;
    uploadedImage.value = URL.createObjectURL(pngFile);
    generatedImages.value = []; // 清除当前生成的图片
    expandError.value = null; // 清除错误信息
    console.log('文件已保存:', imageFile.value);
  } catch (err) {
    console.error('图片处理错误:', err);
    expandError.value = '图片处理失败: ' + err.message;
  } finally {
    isLoading.value = false;
  }
};

// 将File对象转换为PNG格式
const convertFileToPng = async (file) => {
  console.log('开始转换图片到PNG格式');
  
  // 浏览器环境下，使用Canvas进行图像转换
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        // 创建Canvas
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 绘制图像到Canvas（设置白色背景避免透明问题）
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        // 转换为PNG格式
        canvas.toBlob((blob) => {
          if (blob) {
            const pngFile = new File([blob], 'image.png', { type: 'image/png' });
            console.log('PNG转换完成，文件大小:', pngFile.size);
            resolve(pngFile);
          } else {
            reject(new Error('无法创建PNG文件'));
          }
        }, 'image/png', 1.0);  // 使用最高质量
      } catch (err) {
        console.error('Canvas处理图像失败:', err);
        reject(new Error('图像处理失败: ' + err.message));
      }
    };
    
    img.onerror = () => {
      reject(new Error('图像加载失败'));
    };
    
    // 加载图像
    img.src = URL.createObjectURL(file);
  });
};

// 使用生成的图片作为编辑源
const useGeneratedImage = async (imageUrl) => {
  if (!imageUrl) {
    error.value = '请先生成图片';
    return;
  }
  
  try {
    isLoading.value = true;
    console.log('开始处理生成的图片...');
    
    // 从URL获取图片数据 - 使用no-cors模式处理CORS问题
    // 方法1: 使用img元素加载图片，然后通过canvas转换，避免CORS限制
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 尝试跨域加载，但可能不起作用
    
    // 创建一个Promise来处理图片加载
    const imageLoaded = new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法加载图片，可能是CORS限制'));
      
      // 设置一个超时
      setTimeout(() => reject(new Error('图片加载超时')), 10000);
    });
    
    // 设置图片源
    img.src = imageUrl;
    
    try {
      // 等待图片加载
      await imageLoaded;
      
      // 使用canvas转换为本地图片数据
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      // 获取图片数据作为blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png', 1.0);
      });
      
      if (!blob) {
        throw new Error('无法创建图片数据');
      }
      
      // 创建本地File对象
      const pngFile = new File([blob], 'generated-image.png', { type: 'image/png' });
      
      // 保存并预览
      imageFile.value = pngFile;
      // 创建一个本地对象URL而不是使用远程URL
      uploadedImage.value = URL.createObjectURL(pngFile);
      generatedImages.value = []; // 清除当前生成的图片
      console.log('图片处理完成，大小:', pngFile.size);
    } catch (corsError) {
      console.warn('CORS加载失败，尝试备选方案:', corsError);
      
      // 方法2: 如果CORS失败，显示提示并使用远程URL
      // 注意：这种方式在扩展时会失败，但至少可以显示图片
      uploadedImage.value = imageUrl;
      
      // 创建一个空的File对象，提示用户
      const emptyFile = new File(
        [new Blob(['临时数据'], {type: 'text/plain'})], 
        'placeholder.png', 
        {type: 'image/png'}
      );
      imageFile.value = emptyFile;
      
      error.value = '由于浏览器安全限制，无法直接编辑此图片。请先保存图片到本地，然后重新上传。';
    }
    
    expandError.value = null;
  } catch (err) {
    console.error('处理生成图片失败:', err);
    error.value = '使用生成图片失败: ' + err.message;
  } finally {
    isLoading.value = false;
  }
};

// 生成图像相关状态
const generatedImages = ref([]);
const currentSession = ref(null);

// 生成图像的方法
const handleGenerateImage = async () => {
  if (!prompt.value.trim()) {
    error.value = '请输入图像描述';
    return;
  }
  
  try {
    isLoading.value = true;
    error.value = null;
    
    // 创建新的会话
    const session = {
      id: Date.now(),
      prompt: prompt.value,
      timestamp: new Date().toLocaleString(),
      images: [],
      settings: { ...canvasSettings }
    };
    
    // 根据所选模型确定生成的逻辑
    if (selectedModel.value === 'jimeng-3.0') {
      // 即梦API总是返回4张图片
      error.value = `正在使用即梦API生成图片，这可能需要较长时间...`;
      const result = await generateImage(prompt.value, {
        ...canvasSettings,
        model: selectedModel.value
      });
      
      // 添加所有返回的图片到会话中
      session.images.push(result.imageUrl);
      if (result.additionalImages && Array.isArray(result.additionalImages)) {
        session.images.push(...result.additionalImages);
      }
    } else {
      // 其他模型（DALL-E等）的原有逻辑
      // 根据用户选择的数量生成图片
      const count = Math.min(imageCount.value, 4);
      console.log(`生成${count}张图片，模型: ${selectedModel.value}`);
      
      // 依次生成指定数量的图片
      for (let i = 0; i < count; i++) {
        // 显示进度信息
        error.value = `正在生成第 ${i+1}/${count} 张图片${imageQuality.value === 'hd' ? '（高质量模式，需要较长时间）' : ''}...`;
        const result = await generateImage(prompt.value, {
          ...canvasSettings,
          imageQuality: imageQuality.value
        });
        session.images.push(result.imageUrl);
      }
    }
    
    // 清除进度信息
    error.value = null;
    
    // 更新当前会话和历史记录
    currentSession.value = session;
    chatHistory.value.unshift(session); // 添加到历史记录的开头
    
    // 更新生成的图片列表
    generatedImages.value = session.images;
    uploadedImage.value = null; // 清除已上传的图片
    imageFile.value = null;
  } catch (err) {
    error.value = '图像生成失败: ' + err.message;
  } finally {
    isLoading.value = false;
  }
};

// 扩展图片
const handleExpandImage = async () => {
  if (!imageFile.value) {
    expandError.value = '请先上传图片或生成图片';
    return;
  }
  
  console.log('开始扩展图片:', imageFile.value);
  
  try {
    isExpanding.value = true;
    expandError.value = null;
    
    // 调用扩展API (direction参数已经不再使用，但保留兼容性)
    const result = await expandImage(imageFile.value, 'all', {
      size: '1024x1024' // 使用固定尺寸进行扩展
    });
    
    // 创建扩展会话
    const expandSession = {
      id: Date.now(),
      prompt: '扩展视角: ' + (currentSession.value?.prompt || '上传的图片'),
      timestamp: new Date().toLocaleString(),
      images: [result.imageUrl],
      isExpand: true,
      settings: { ...canvasSettings }
    };
    
    // 更新当前会话和历史记录
    currentSession.value = expandSession;
    chatHistory.value.unshift(expandSession); // 添加到历史记录的开头
    
    // 更新图片
    console.log('扩展成功，结果:', result);
    generatedImages.value = [result.imageUrl];
    uploadedImage.value = null; // 清除上传的图片
    imageFile.value = null;
  } catch (err) {
    console.error('扩展失败:', err);
    expandError.value = '图片扩展失败: ' + err.message;
  } finally {
    isExpanding.value = false;
  }
};

// 显示历史会话
const showHistorySession = (session) => {
  currentSession.value = session;
  generatedImages.value = session.images;
  uploadedImage.value = null;
  imageFile.value = null;
  error.value = null;
  expandError.value = null;
};

// 清除所有图片
const clearImages = () => {
  generatedImages.value = [];
  uploadedImage.value = null;
  imageFile.value = null;
  currentSession.value = null;
};

// 下载生成的图片
const downloadGeneratedImage = async (imageUrl) => {
  if (!imageUrl) {
    error.value = '没有可下载的图片';
    return;
  }
  
  try {
    isLoading.value = true;
    
    // 创建一个临时的a元素来下载图片
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 尝试跨域
    
    // 创建下载函数
    const downloadImage = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      // 转换为数据URL
      let dataURL;
      try {
        dataURL = canvas.toDataURL('image/png');
      } catch (e) {
        error.value = 'CORS限制阻止了下载图片';
        console.error('CORS阻止了canvas操作:', e);
        return false;
      }
      
      // 创建下载链接
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = 'generated-image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      return true;
    };
    
    // 尝试方法1：直接使用canvas
    img.onload = () => {
      const success = downloadImage();
      if (!success) {
        // 方法2：直接尝试下载URL
        console.log('尝试直接下载URL...');
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = 'generated-image.png';
        a.target = '_blank'; // 可能需要在新标签页打开
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      isLoading.value = false;
    };
    
    img.onerror = () => {
      console.warn('CORS阻止了图片加载，尝试直接下载...');
      // 尝试直接下载
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = 'generated-image.png';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      isLoading.value = false;
    };
    
    // 加载图片
    img.src = imageUrl;
  } catch (err) {
    console.error('下载图片失败:', err);
    error.value = '下载图片失败: ' + err.message;
    isLoading.value = false;
  }
};

// 监听模型变化，更新预设尺寸
watch(selectedModel, (newModel) => {
  // 更新模型设置
  setModel(newModel);
  // 更新预设尺寸
  presetSizes.value = AI_MODELS[newModel].presetSizes;
  // 更新画布设置中的模型
  canvasSettings.model = newModel;
  
  // 如果切换到即梦模型，固定生成4张图片
  if (newModel === 'jimeng-3.0') {
    imageCount.value = 4; // 固定为4张图片
  }
  
  // 如果当前尺寸在新模型中不存在，则切换到默认尺寸
  const currentSize = { width: canvasSettings.width, height: canvasSettings.height };
  const sizeExists = presetSizes.value.some(size => 
    size.width === currentSize.width && size.height === currentSize.height
  );
  
  if (!sizeExists) {
    // 默认使用第一个预设尺寸
    const defaultSize = presetSizes.value[0];
    canvasSettings.width = defaultSize.width;
    canvasSettings.height = defaultSize.height;
  }
});

// 窗口大小变化时调整画布尺寸
const handleResize = () => {
  const { width, height } = initialCanvasSize();
  
  // 保持当前的宽高比
  const [ratioWidth, ratioHeight] = canvasSettings.aspectRatio.split(':').map(Number);
  const aspectRatio = ratioWidth / ratioHeight;
  
  if (aspectRatio === 16/9) {
    // 如果是16:9，使用计算出的尺寸
    canvasSettings.width = width;
    canvasSettings.height = height;
  } else {
    // 对于其他比例，保持宽度并调整高度
    canvasSettings.width = width;
    canvasSettings.height = Math.round(width / aspectRatio);
  }
};

// 监听窗口大小变化及设置API Key
onMounted(() => {
  window.addEventListener('resize', handleResize);
  
  // 使用系统提供的API Key
  setApiKey('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'); // 这里将使用实际的系统API Key
});

// 组件卸载前移除事件监听器
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
});

// 可用的宽高比选项
const aspectRatios = [
  { name: '1:1', value: '1:1' },
  { name: '4:3', value: '4:3' },
  { name: '3:2', value: '3:2' },
  { name: '16:9', value: '16:9' },
  { name: '21:9', value: '21:9' },
  { name: '3:4', value: '3:4' },
  { name: '2:3', value: '2:3' },
  { name: '9:16', value: '9:16' }
];

// 更改宽高比的方法
const changeAspectRatio = (ratio) => {
  canvasSettings.aspectRatio = ratio;
  
  // 根据宽高比更新画布尺寸
  const [width, height] = ratio.split(':').map(Number);
  const aspectRatio = width / height;
  
  if (aspectRatio > 1) {
    // 横向
    canvasSettings.height = Math.round(canvasSettings.width / aspectRatio);
  } else {
    // 纵向
    canvasSettings.width = Math.round(canvasSettings.height * aspectRatio);
  }
};

// 应用预设尺寸的方法
const applyPresetSize = (width, height) => {
  canvasSettings.width = width;
  canvasSettings.height = height;
  
  // 更新宽高比
  const gcd = findGCD(width, height);
  const ratioWidth = width / gcd;
  const ratioHeight = height / gcd;
  canvasSettings.aspectRatio = `${ratioWidth}:${ratioHeight}`;
};

// 计算最大公约数（用于简化宽高比）
const findGCD = (a, b) => {
  return b === 0 ? a : findGCD(b, a % b);
};

// 优化提示词方法
const optimizePrompt = async () => {
  if (!prompt.value.trim()) {
    error.value = '请先输入需要优化的提示词';
    return;
  }
  
  try {
    isOptimizingPrompt.value = true;
    error.value = promptOptimizer.value === 'deepseek' 
      ? '正在使用DeepSeek优化提示词，请稍候...' 
      : promptOptimizer.value === 'deepseek2'
      ? '正在使用DeepSeek 2.0优化提示词，请稍候...'
      : '正在使用Coze优化提示词，这可能需要较长时间（约15-30秒）...';
    
    // 根据选择的优化器调用不同的API
    if (promptOptimizer.value === 'deepseek') {
      optimizedPrompt.value = await optimizePromptWithDeepSeek(prompt.value);
      prompt.value = optimizedPrompt.value;
      error.value = '提示词已成功优化';
      setTimeout(() => {
        if (error.value === '提示词已成功优化') {
          error.value = null;
        }
      }, 2000);
    } else if (promptOptimizer.value === 'deepseek2') {
      optimizedPrompt.value = await optimizePromptWithDeepSeek2(prompt.value);
      prompt.value = optimizedPrompt.value;
      error.value = '提示词已成功优化';
      setTimeout(() => {
        if (error.value === '提示词已成功优化') {
          error.value = null;
        }
      }, 2000);
    } else if (promptOptimizer.value === 'coze') {
      // 如果选择Coze但未显示参数对话框，则显示对话框
      if (!showCozeParamsDialog.value) {
        // 将当前输入框的内容保存到cozeParams.info中
        cozeParams.info = prompt.value;
        showCozeParamsDialog.value = true;
        isOptimizingPrompt.value = false;
        error.value = null;
        return;
      }
      
      // 验证Coze参数
      if (!cozeParams.info) {
        error.value = '请填写主要信息';
        isOptimizingPrompt.value = false;
        return;
      }
      
      try {
        // 调用Coze优化API
        const cozeResult = await optimizePromptWithCoze(cozeParams.info, cozeParams);
        
        // 确保我们得到了有效的优化结果
        if (cozeResult && typeof cozeResult === 'string') {
          // 更新提示词
          prompt.value = cozeResult.trim();
          optimizedPrompt.value = cozeResult.trim();
          
          // 关闭对话框
          showCozeParamsDialog.value = false;
          
          // 显示临时提示
          error.value = '提示词优化完成，正在生成图像...';
          
          // 等待DOM更新
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // 确保提示词已经更新到输入框
          if (prompt.value === cozeResult.trim()) {
            // 自动触发图像生成
            await handleGenerateImage();
          } else {
            throw new Error('提示词更新失败');
          }
        } else {
          throw new Error('未获取到有效的优化结果');
        }
      } catch (cozeError) {
        console.error('Coze处理错误:', cozeError);
        error.value = `Coze优化失败: ${cozeError.message}`;
        showCozeParamsDialog.value = false;
      }
    }
  } catch (err) {
    console.error('提示词优化失败:', err);
    error.value = err.message || '提示词优化失败';
  } finally {
    isOptimizingPrompt.value = false;
  }
};

// 处理Coze示例图片上传
const handleCozeExampleUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  console.log('上传示例图片:', file.type, file.size);
  
  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    expandError.value = '请上传有效的图片文件';
    return;
  }
  
  try {
    isLoading.value = true;
    
    // 保存文件对象并预览
    cozeParams.example = file;
    uploadedImage.value = URL.createObjectURL(file);
    generatedImages.value = []; // 清除当前生成的图片
    expandError.value = null; // 清除错误信息
    console.log('示例图片已保存:', cozeParams.example);
  } catch (err) {
    console.error('示例图片处理错误:', err);
    expandError.value = '示例图片处理失败: ' + err.message;
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="app-container">
    <!-- 顶部标题 -->
  <header>
      <h1>AI 图像聊天生成器</h1>
  </header>

    <div class="main-content">
      <!-- 左侧边栏 -->
      <aside class="sidebar">
        <div class="section">
          <h2>模型选择</h2>
          <div class="model-selector">
            <div 
              v-for="(modelInfo, modelId) in AI_MODELS" 
              :key="modelId"
              class="model-item"
              :class="{ active: selectedModel === modelId }"
              @click="selectedModel = modelId"
            >
              <img src="./assets/images/model-icon.png" alt="模型图标" />
              <div class="model-info">
                <p>{{ modelInfo.name }}</p>
                <p class="model-desc">{{ modelInfo.description }}</p>
              </div>
            </div>
          </div>
          
          <!-- 添加DALL-E-3质量选择按钮 -->
          <div v-if="selectedModel === 'dall-e-3'" class="quality-selector">
            <h3>图像质量</h3>
            <div class="quality-buttons">
              <button 
                class="quality-btn"
                :class="{ active: imageQuality === 'standard' }"
                @click="imageQuality = 'standard'"
              >
                标准质量
              </button>
              <button 
                class="quality-btn"
                :class="{ active: imageQuality === 'hd' }"
                @click="imageQuality = 'hd'"
              >
                高清质量
              </button>
            </div>
          </div>
          
          <!-- 添加即梦API特定提示 -->
          <div v-if="selectedModel === 'jimeng-3.0'" class="jimeng-info">
            <div class="info-message">
              <i class="info-icon">i</i>
              <span>即梦API将生成4张图片，无法调整数量</span>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>图像质量</h2>
          <div class="slider-container">
            <input 
              type="range" 
              min="1" 
              max="10" 
              v-model="canvasSettings.quality" 
              class="quality-slider"
            />
            <span class="slider-value">{{ canvasSettings.quality }}</span>
          </div>
        </div>
        
        <div class="section">
          <h2>图像比例</h2>
          <div class="aspect-ratio-grid">
            <button 
              v-for="ratio in aspectRatios" 
              :key="ratio.value"
              :class="['aspect-btn', { active: canvasSettings.aspectRatio === ratio.value }]"
              @click="changeAspectRatio(ratio.value)"
            >
              {{ ratio.name }}
            </button>
          </div>
        </div>
        
        <div class="section">
          <h2>预设尺寸</h2>
          <div class="preset-sizes">
            <div class="preset-btns">
              <button 
                v-for="size in presetSizes" 
                :key="size.name"
                class="preset-btn"
                :class="{ active: canvasSettings.width === size.width && canvasSettings.height === size.height }"
                @click="applyPresetSize(size.width, size.height)"
              >
                {{ size.name }} ({{ size.width }}x{{ size.height }})
              </button>
            </div>
          </div>
        </div>
      </aside>
      
      <!-- 中间聊天区域 -->
      <main class="chat-area">
        <!-- 聊天历史记录区域 -->
        <div class="chat-container">
          <!-- 聊天加载中状态 -->
          <div v-if="isLoading || isExpanding" class="loading-overlay">
            <div class="spinner"></div>
            <p v-if="isLoading">
              {{ imageQuality === 'hd' ? '正在生成高质量图片，这可能需要较长时间...' : '生成中，请稍候...' }}
            </p>
            <p v-else>扩展中，请稍候...</p>
          </div>
          
          <!-- 当前会话内容 -->
          <div v-if="currentSession" class="chat-session current-session">
            <div class="chat-message user-message">
              <div class="message-header">
                <span class="message-timestamp">{{ currentSession.timestamp }}</span>
              </div>
              <div class="message-content">
                <p class="message-text">{{ currentSession.prompt }}</p>
              </div>
            </div>
            
            <div class="chat-message ai-message">
              <div class="message-content">
                <div class="image-gallery">
                  <div v-for="(image, index) in currentSession.images" :key="index" class="image-item">
                    <img :src="image" alt="生成的图像" class="generated-image" />
                    
                    <div class="image-actions">
                      <button 
                        class="image-action-btn download"
                        @click="downloadGeneratedImage(image)"
                        :disabled="isLoading || isExpanding"
                      >
                        <span class="action-icon">↓</span>
                      </button>
                      
                      <button 
                        class="image-action-btn use"
                        @click="useGeneratedImage(image)"
                        :disabled="isLoading || isExpanding"
                      >
                        <span class="action-icon">✓</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 历史会话列表 -->
          <div v-if="chatHistory.length > 1" class="chat-history">
            <div 
              v-for="session in chatHistory.filter(s => s.id !== currentSession?.id)" 
              :key="session.id" 
              class="chat-session history-session"
              @click="showHistorySession(session)"
            >
              <div class="chat-message user-message">
                <div class="message-header">
                  <span class="message-timestamp">{{ session.timestamp }}</span>
                </div>
                <div class="message-content">
                  <p class="message-text">{{ session.prompt }}</p>
                </div>
              </div>
              
              <div class="chat-message ai-message">
                <div class="message-content">
                  <div class="image-gallery">
                    <div v-for="(image, index) in session.images.slice(0, 1)" :key="index" class="image-item thumbnail">
                      <img :src="image" alt="历史图像" class="generated-image" />
                      <div class="image-count" v-if="session.images.length > 1">+{{ session.images.length - 1 }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 空状态提示 -->
          <div v-if="!currentSession && !uploadedImage" class="empty-chat">
            <p>输入描述并点击生成按钮开始创建图像<br>或上传图片进行编辑</p>
          </div>
          
          <!-- 上传图片预览 -->
          <div v-if="uploadedImage && !currentSession" class="upload-preview">
            <div class="preview-header">
              <h3>已上传图片</h3>
            </div>
            <div class="preview-content">
              <img :src="uploadedImage" alt="上传的图像" class="uploaded-image" />
            </div>
          </div>
        </div>
        
        <!-- 图像控制按钮区域 -->
        <div class="chat-controls">
          <div class="control-btns">
            <label class="upload-label">
              <input 
                type="file" 
                accept="image/png,image/jpeg" 
                @change="handleImageUpload"
                :disabled="isLoading || isExpanding" 
                class="hidden-input"
              />
              <span class="control-btn upload">
                <i class="btn-icon">+</i>
                上传图片
              </span>
            </label>
            
            <button 
              class="control-btn expand"
              @click="handleExpandImage"
              :disabled="!imageFile || isLoading || isExpanding"
            >
              <i class="btn-icon">↔</i>
              扩展视角
            </button>
            
            <button 
              class="control-btn clear"
              @click="clearImages"
              :disabled="(!generatedImages.length && !uploadedImage) || isLoading || isExpanding"
            >
              <i class="btn-icon">×</i>
              清除
            </button>
          </div>
          
          <div class="input-container">
            <textarea 
              v-model="prompt" 
              placeholder="描述想要生成的图片" 
              rows="2"
              :disabled="isLoading || isExpanding"
              class="chat-input"
            ></textarea>
            
            <div class="input-actions">
              <!-- 添加提示词优化选择器 -->
              <div class="prompt-optimizer">
                <span class="optimizer-label">提示词优化:</span>
                <div class="optimizer-selector">
                  <button 
                    class="optimizer-btn"
                    :class="{ active: promptOptimizer === 'none' }"
                    @click="promptOptimizer = 'none'"
                    :disabled="isLoading || isExpanding || isOptimizingPrompt"
                  >
                    无
                  </button>
                  <button 
                    class="optimizer-btn"
                    :class="{ active: promptOptimizer === 'deepseek' }"
                    @click="promptOptimizer = 'deepseek'"
                    :disabled="isLoading || isExpanding || isOptimizingPrompt"
                  >
                    DeepSeek
                  </button>
                  <button 
                    class="optimizer-btn"
                    :class="{ active: promptOptimizer === 'deepseek2' }"
                    @click="promptOptimizer = 'deepseek2'"
                    :disabled="isLoading || isExpanding || isOptimizingPrompt"
                  >
                    DeepSeek 2.0
                  </button>
                  <button 
                    class="optimizer-btn"
                    :class="{ active: promptOptimizer === 'coze' }"
                    @click="promptOptimizer = 'coze'"
                    :disabled="isLoading || isExpanding || isOptimizingPrompt"
                  >
                    Coze
                  </button>
                  <button 
                    class="optimize-btn"
                    @click="optimizePrompt"
                    :disabled="isLoading || isExpanding || isOptimizingPrompt || promptOptimizer === 'none' || !prompt.trim()"
                  >
                    {{ isOptimizingPrompt ? '优化中...' : '优化' }}
                  </button>
                </div>
              </div>

              <div class="image-count-selector">
                <span class="count-label">图片数量:</span>
                <div class="count-buttons">
                  <button 
                    v-for="n in 4" 
                    :key="n" 
                    :class="['count-btn', { active: imageCount === n }]"
                    @click="imageCount = n"
                    :disabled="isLoading || isExpanding || selectedModel === 'jimeng-3.0'"
                    :title="selectedModel === 'jimeng-3.0' ? '即梦API固定生成4张图片' : ''"
                  >
                    {{ n }}
                  </button>
                </div>
              </div>
              
              <button 
                class="send-btn" 
                @click="handleGenerateImage" 
                :disabled="isLoading || isExpanding || !prompt.trim()"
              >
                {{ isLoading ? '生成中...' : '生成图像' }}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
    
    <!-- Coze参数对话框 -->
    <div v-if="showCozeParamsDialog" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3>请输入Coze优化所需参数</h3>
          <button class="modal-close" @click="showCozeParamsDialog = false">×</button>
        </div>
        <div class="modal-body">
          <div class="dialog-description">
            Coze工作流需要以下参数来优化您的提示词，生成更适合您需求的图像描述。处理时间可能较长，请耐心等待。
          </div>
          <div class="form-group">
            <label>主要信息 <span class="required">*</span></label>
            <input type="text" v-model="cozeParams.info" placeholder="请输入主要提示词信息" />
            <div class="field-hint">提示词的主要部分，必填</div>
          </div>
          <div class="form-group">
            <label>公司名称</label>
            <input type="text" v-model="cozeParams.company" placeholder="请输入公司名称（选填）" />
            <div class="field-hint">相关公司或品牌名称</div>
          </div>
          <div class="form-group">
            <label>示例图片</label>
            <input 
              type="file" 
              accept="image/*" 
              @change="handleCozeExampleUpload" 
              class="file-input"
            />
            <div class="field-hint">上传参考图片（选填）</div>
            <div v-if="cozeParams.example" class="example-preview">
              <img :src="URL.createObjectURL(cozeParams.example)" alt="示例图片预览" />
              <button @click="cozeParams.example = null" class="remove-example">移除</button>
            </div>
          </div>
          <div class="form-group">
            <label>额外信息</label>
            <textarea 
              v-model="cozeParams.Addition" 
              placeholder="请输入任何额外的相关信息（选填）"
              rows="3"
            ></textarea>
            <div class="field-hint">补充说明或其他相关信息</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="cancel-btn" @click="showCozeParamsDialog = false">取消</button>
          <button 
            class="confirm-btn" 
            @click="optimizePrompt"
            :disabled="!cozeParams.info"
          >
            确认并优化
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  font-family: Arial, sans-serif;
  color: #f0f0f0;
  background-color: #1e1e1e;
  margin: 0;
  padding: 0;
}

header {
  padding: 1rem 2rem;
  border-bottom: 1px solid #333;
  background-color: #262626;
  height: 60px;
  box-sizing: border-box;
}

h1 {
  margin: 0;
  font-size: 1.8rem;
  color: #f0f0f0;
}

.main-content {
  display: flex;
  overflow: hidden;
  width: 100%;
  height: calc(100vh - 60px); /* 使用精确的header高度 */
}

/* 左侧边栏样式 */
.sidebar {
  width: 320px;
  min-width: 320px;
  background-color: #262626;
  overflow-y: auto;
  padding: 1rem 1.5rem;
  border-right: 1px solid #333;
  height: 100%;
  box-sizing: border-box;
}

.section {
  margin-bottom: 2rem;
}

.section h2 {
  font-size: 1rem;
  margin-bottom: 1rem;
  color: #aaa;
}

.model-selector {
  background-color: #1a1a1a;
  border-radius: 4px;
  padding: 0.5rem;
}

.model-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.model-item:hover {
  background-color: #262626;
}

.model-item.active {
  background-color: rgba(0, 164, 228, 0.1);
  border: 1px solid rgba(0, 164, 228, 0.3);
}

.model-item img {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  margin-right: 1rem;
  object-fit: cover;
}

.model-info p {
  margin: 0;
  font-size: 1rem;
}

.model-desc {
  font-size: 0.8rem;
  color: #888;
  margin-top: 0.35rem;
}

/* 图像质量滑块样式 */
.slider-container {
  display: flex;
  align-items: center;
  padding: 0.5rem 0;
}

.quality-slider {
  flex: 1;
  -webkit-appearance: none;
  height: 6px;
  background-color: #444;
  border-radius: 3px;
}

.quality-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background-color: #00a4e4;
  border-radius: 50%;
  cursor: pointer;
}

.quality-slider:disabled {
  opacity: 0.5;
}

.slider-value {
  margin-left: 1rem;
  min-width: 2rem;
  text-align: center;
  font-size: 1rem;
}

/* 图像比例网格样式 */
.aspect-ratio-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.aspect-btn {
  padding: 0.6rem 0;
  background-color: #1a1a1a;
  border: 1px solid #444;
  color: #f0f0f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.aspect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.aspect-btn.active {
  background-color: rgba(0, 164, 228, 0.2);
  border-color: #00a4e4;
  color: #00a4e4;
}

/* 预设尺寸按钮样式 */
.preset-sizes {
  margin-top: 1rem;
  background-color: #1a1a1a;
  border-radius: 4px;
  padding: 0.8rem;
}

.preset-btns {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.preset-btn {
  flex: 1;
  background-color: #262626;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f0f0f0;
  padding: 0.6rem 0.25rem;
  font-size: 0.8rem;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}

.preset-btn:hover {
  background-color: #333;
  border-color: #555;
}

.preset-btn.active {
  background-color: rgba(0, 164, 228, 0.2);
  border-color: #00a4e4;
  color: #00a4e4;
}

.preset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 聊天区域样式 */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #121212;
  background-image: 
    linear-gradient(45deg, #1e1e1e 25%, transparent 25%),
    linear-gradient(-45deg, #1e1e1e 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1e1e1e 75%),
    linear-gradient(-45deg, transparent 75%, #1e1e1e 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  width: calc(100% - 320px);
  height: 100%;
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
  position: relative;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column-reverse; /* 新消息显示在底部 */
  overflow-y: auto;
  padding: 1rem;
  gap: 1rem;
  position: relative;
}

.chat-session {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}

.history-session {
  cursor: pointer;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #333;
  background-color: #1a1a1a;
  transition: all 0.2s;
  opacity: 0.8;
}

.history-session:hover {
  background-color: #262626;
  border-color: #444;
  opacity: 1;
}

.current-session {
  margin-bottom: 2rem;
}

.chat-message {
  display: flex;
  flex-direction: column;
  max-width: 100%;
}

.user-message {
  align-self: flex-start;
  margin-right: 20%;
}

.ai-message {
  align-self: flex-end;
  margin-left: 20%;
}

.message-header {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  font-size: 0.8rem;
  color: #888;
}

.message-timestamp {
  font-style: italic;
}

.message-content {
  padding: 1rem;
  border-radius: 8px;
  background-color: #262626;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.user-message .message-content {
  background-color: #2a3749;
}

.ai-message .message-content {
  background-color: #293237;
}

.message-text {
  margin: 0;
  line-height: 1.5;
  word-break: break-word;
}

.image-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
}

.image-item {
  position: relative;
  max-width: 48%;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.thumbnail {
  max-width: 100px;
  position: relative;
}

.image-count {
  position: absolute;
  bottom: 5px;
  right: 5px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
}

.image-actions {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: flex;
  gap: 0.5rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-item:hover .image-actions {
  opacity: 1;
}

.image-action-btn {
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 4px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.image-action-btn:hover {
  background-color: rgba(0, 0, 0, 0.9);
}

.image-action-btn.download {
  background-color: rgba(0, 164, 228, 0.8);
}

.image-action-btn.use {
  background-color: rgba(124, 193, 48, 0.8);
}

.action-icon {
  font-size: 1rem;
  font-weight: bold;
}

.generated-image,
.uploaded-image {
  width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
}

.empty-chat {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #888;
  text-align: center;
  padding: 2rem;
  font-size: 1.1rem;
  line-height: 1.6;
  max-width: 80%;
}

.upload-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 2rem auto;
  max-width: 600px;
}

.preview-header {
  width: 100%;
  text-align: center;
  margin-bottom: 1rem;
}

.preview-header h3 {
  color: #aaa;
  font-weight: normal;
}

.preview-content {
  width: 100%;
  max-width: 600px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #333;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(0, 164, 228, 0.3);
  border-radius: 50%;
  border-top-color: #00a4e4;
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 1.5rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 聊天控制区域样式 */
.chat-controls {
  min-height: 130px;
  background-color: #262626;
  display: flex;
  flex-direction: column;
  padding: 1rem 2rem;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.2);
}

.control-btns {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.upload-label {
  display: inline-block;
  cursor: pointer;
}

.hidden-input {
  display: none;
}

.control-btn {
  display: flex;
  align-items: center;
  background-color: #333;
  border: 1px solid #444;
  color: #f0f0f0;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover:not(:disabled) {
  background-color: #444;
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.control-btn.upload {
  background-color: #00a4e4;
  border-color: #00a4e4;
}

.control-btn.upload:hover:not(:disabled) {
  background-color: #0093ce;
}

.control-btn.expand {
  background-color: #8a57de;
  border-color: #8a57de;
}

.control-btn.expand:hover:not(:disabled) {
  background-color: #7745c7;
}

.control-btn.download {
  background-color: #00a4e4;
  border-color: #00a4e4;
}

.control-btn.download:hover:not(:disabled) {
  background-color: #0093ce;
}

.btn-icon {
  margin-right: 0.5rem;
  font-style: normal;
}

.input-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.chat-input {
  width: 100%;
  background-color: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f0f0f0;
  padding: 0.75rem;
  resize: none;
  font-size: 1rem;
  min-height: 120px;
  margin-bottom: 0.5rem;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.image-count-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.count-label {
  font-size: 0.9rem;
  color: #aaa;
}

.count-buttons {
  display: flex;
  gap: 0.25rem;
}

.count-btn {
  width: 32px;
  height: 32px;
  background-color: #333;
  border: 1px solid #444;
  color: #f0f0f0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.count-btn:hover:not(:disabled):not(.active) {
  background-color: #444;
}

.count-btn.active {
  background-color: #00a4e4;
  border-color: #00a4e4;
}

.count-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  background-color: #00a4e4;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.6rem 1.2rem;
  cursor: pointer;
  font-weight: bold;
  font-size: 1rem;
  transition: background-color 0.2s;
}

.send-btn:hover:not(:disabled) {
  background-color: #0093ce;
}

.send-btn:disabled {
  background-color: #555;
  cursor: not-allowed;
}

/* 响应式设计 */
@media (min-width: 1600px) {
  .sidebar {
    width: 360px;
    min-width: 360px;
  }
  
  .chat-area {
    width: calc(100% - 360px);
  }
  
  h1 {
    font-size: 2rem;
  }
  
  .prompt-input textarea {
    min-height: 150px;
  }
}

@media (max-width: 1200px) {
  .sidebar {
    width: 300px;
    min-width: 300px;
  }
  
  .chat-area {
    width: calc(100% - 300px);
  }
}

.quality-selector {
  margin-top: 1rem;
  padding: 0.5rem;
  background-color: #1a1a1a;
  border-radius: 4px;
}

.quality-selector h3 {
  font-size: 0.9rem;
  color: #aaa;
  margin-bottom: 0.5rem;
}

.quality-buttons {
  display: flex;
  gap: 0.5rem;
}

.quality-btn {
  flex: 1;
  padding: 0.5rem;
  background-color: #262626;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f0f0f0;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.quality-btn:hover {
  background-color: #333;
  border-color: #555;
}

.quality-btn.active {
  background-color: rgba(0, 164, 228, 0.2);
  border-color: #00a4e4;
  color: #00a4e4;
}

/* 提示词优化器样式 */
.prompt-optimizer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-right: 0.5rem;
}

.optimizer-label {
  font-size: 0.9rem;
  color: #aaa;
  white-space: nowrap;
}

.optimizer-selector {
  display: flex;
  gap: 0.25rem;
}

.optimizer-btn {
  padding: 0.4rem 0.6rem;
  background-color: #333;
  border: 1px solid #444;
  color: #f0f0f0;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.optimizer-btn:hover:not(:disabled):not(.active) {
  background-color: #444;
}

.optimizer-btn.active {
  background-color: rgba(0, 164, 228, 0.2);
  border-color: #00a4e4;
  color: #00a4e4;
}

.optimizer-btn:disabled,
.optimize-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.optimize-btn {
  padding: 0.4rem 0.7rem;
  background-color: #8a57de;
  border: 1px solid #8a57de;
  color: white;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.optimize-btn:hover:not(:disabled) {
  background-color: #7745c7;
}

/* 模态对话框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  background-color: #262626;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #f0f0f0;
}

.modal-close {
  background: none;
  border: none;
  color: #aaa;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.modal-body {
  padding: 1.5rem;
  max-height: 70vh;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #f0f0f0;
  font-size: 0.9rem;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  background-color: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f0f0f0;
  font-size: 1rem;
}

.form-group input::placeholder {
  color: #777;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.cancel-btn {
  padding: 0.6rem 1.2rem;
  background-color: #333;
  border: 1px solid #444;
  color: #f0f0f0;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background-color: #444;
}

.confirm-btn {
  padding: 0.6rem 1.2rem;
  background-color: #8a57de;
  border: 1px solid #8a57de;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.confirm-btn:hover:not(:disabled) {
  background-color: #7745c7;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-description {
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: #aaa;
}

.field-hint {
  font-size: 0.8rem;
  color: #777;
}

/* 即梦API信息提示样式 */
.jimeng-info {
  margin-top: 1rem;
  padding: 0.8rem;
  background-color: rgba(138, 87, 222, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(138, 87, 222, 0.3);
}

.info-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #aaa;
}

.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background-color: rgba(138, 87, 222, 0.5);
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
  font-style: normal;
  font-weight: bold;
}

.required {
  color: #ff4444;
  margin-left: 4px;
}

.file-input {
  width: 100%;
  padding: 0.75rem;
  background-color: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f0f0f0;
  cursor: pointer;
}

.example-preview {
  margin-top: 0.5rem;
  position: relative;
  max-width: 200px;
}

.example-preview img {
  width: 100%;
  height: auto;
  border-radius: 4px;
}

.remove-example {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background-color: rgba(255, 68, 68, 0.8);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 0.8rem;
}

.remove-example:hover {
  background-color: rgba(255, 68, 68, 1);
}

textarea {
  width: 100%;
  padding: 0.75rem;
  background-color: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f0f0f0;
  font-size: 1rem;
  resize: vertical;
  min-height: 80px;
}
</style>
