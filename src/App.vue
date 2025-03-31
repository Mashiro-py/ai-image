<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { generateImage, setApiKey } from './apis/imageGenerator';

// 图像生成相关状态
const prompt = ref('');
const isLoading = ref(false);
const error = ref(null);
const generatedImage = ref(null);
const apiKeySet = ref(true); // 默认已设置API Key

// 预设的尺寸选项
const presetSizes = [
  { name: '正方形', width: 1024, height: 1024 },
  { name: '横向', width: 512, height: 512 },
  { name: '纵向', width: 256, height: 256 }
];

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
  quality: 5
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
  setApiKey(''); // 这里将使用实际的系统API Key
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

// 生成图像的方法
const handleGenerateImage = async () => {
  if (!prompt.value.trim()) {
    error.value = '请输入图像描述';
    return;
  }
  
  try {
    isLoading.value = true;
    error.value = null;
    
    const result = await generateImage(prompt.value, canvasSettings);
    generatedImage.value = result.imageUrl;
  } catch (err) {
    error.value = '图像生成失败: ' + err.message;
  } finally {
    isLoading.value = false;
  }
};

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
</script>

<template>
  <div class="app-container">
    <!-- 顶部标题 -->
    <header>
      <h1>AI 图像生成器</h1>
    </header>
    
    <div class="main-content">
      <!-- 左侧边栏 -->
      <aside class="sidebar">
        <div class="section">
          <h2>图像描述词</h2>
          <div class="prompt-input">
            <textarea 
              v-model="prompt" 
              placeholder="描述想要生成的图片" 
              rows="5"
              :disabled="isLoading"
            ></textarea>
            <div class="word-count">{{ prompt.length }}/300</div>
          </div>
          
          <button 
            class="generate-btn" 
            @click="handleGenerateImage" 
            :disabled="isLoading"
          >
            {{ isLoading ? '生成中...' : '生成图像' }}
          </button>
          
          <!-- 预设尺寸按钮 -->
          <div class="preset-sizes">
            <div class="preset-title">预设尺寸:</div>
            <div class="preset-btns">
              <button 
                v-for="size in presetSizes" 
                :key="size.name"
                class="preset-btn"
                :class="{ active: canvasSettings.width === size.width && canvasSettings.height === size.height }"
                @click="applyPresetSize(size.width, size.height)"
                :disabled="isLoading"
              >
                {{ size.name }} ({{ size.width }}x{{ size.height }})
              </button>
            </div>
          </div>
          
          <p class="error" v-if="error">{{ error }}</p>
        </div>
        
        <div class="section">
          <h2>生成模型</h2>
          <div class="model-selector">
            <div class="model-item active">
              <img src="./assets/images/model-icon.png" alt="模型图标" />
              <div class="model-info">
                <p>图片2.0</p>
                <p class="model-desc">文字描述|支持图片多角度</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>风格</h2>
          <button class="style-btn">
            <span class="icon">+</span>
            选择风格参考图
          </button>
        </div>
        
        <div class="section">
          <h2>精细度</h2>
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
          <h2>展示尺寸</h2>
          <div class="size-inputs">
            <div class="size-input">
              <label>W</label>
              <input 
                type="number" 
                v-model="canvasSettings.width" 
              />
            </div>
            <div class="link-icon">⟷</div>
            <div class="size-input">
              <label>H</label>
              <input 
                type="number" 
                v-model="canvasSettings.height" 
              />
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>展示比例</h2>
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
      </aside>
      
      <!-- 中间画布区域 -->
      <main class="canvas-area">
        <div class="canvas-container">
          <div 
            class="canvas" 
            :style="{ 
              width: `${canvasSettings.width}px`, 
              height: `${canvasSettings.height}px`
            }"
          >
            <div v-if="isLoading" class="loading-overlay">
              <div class="spinner"></div>
              <p>生成中，请稍候...</p>
            </div>
            
            <img 
              v-if="generatedImage" 
              :src="generatedImage" 
              alt="生成的图像"
              class="generated-image"
            />
            
            <div v-else class="empty-canvas">
              <p>输入描述并点击生成按钮开始创建图像</p>
            </div>
          </div>
        </div>
      </main>
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

.prompt-input {
  position: relative;
}

.prompt-input textarea {
  width: 100%;
  background-color: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #f0f0f0;
  padding: 0.75rem;
  resize: none;
  font-size: 1rem;
  min-height: 120px;
}

.word-count {
  position: absolute;
  bottom: 0.5rem;
  right: 0.75rem;
  font-size: 0.8rem;
  color: #888;
}

.generate-btn {
  width: 100%;
  background-color: #00a4e4;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.9rem;
  margin-top: 0.75rem;
  cursor: pointer;
  font-weight: bold;
  font-size: 1rem;
  transition: background-color 0.2s;
}

.generate-btn:hover {
  background-color: #0093ce;
}

.generate-btn:disabled {
  background-color: #555;
  cursor: not-allowed;
}

/* 预设尺寸按钮样式 */
.preset-sizes {
  margin-top: 1rem;
  background-color: #1a1a1a;
  border-radius: 4px;
  padding: 0.8rem;
}

.preset-title {
  font-size: 0.9rem;
  color: #aaa;
  margin-bottom: 0.5rem;
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

.error {
  color: #ff6b6b;
  font-size: 0.9rem;
  margin-top: 0.75rem;
}

/* 模型选择器样式 */
.model-selector {
  background-color: #1a1a1a;
  border-radius: 4px;
  padding: 1rem;
}

.model-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border-radius: 4px;
  cursor: pointer;
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

/* 风格按钮样式 */
.style-btn {
  width: 100%;
  background-color: #1a1a1a;
  border: 1px dashed #555;
  color: #aaa;
  padding: 1rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1rem;
}

.style-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.style-btn .icon {
  margin-right: 0.6rem;
  font-size: 1.2rem;
}

/* 滑块样式 */
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

/* 尺寸输入样式 */
.size-inputs {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.size-input {
  display: flex;
  align-items: center;
  background-color: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  width: 45%;
}

.size-input label {
  color: #888;
  margin-right: 0.75rem;
  font-size: 0.9rem;
  width: 1.5rem;
}

.size-input input {
  background: transparent;
  border: none;
  color: #f0f0f0;
  width: 100%;
  text-align: right;
  font-size: 1rem;
}

.size-input input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.link-icon {
  color: #888;
  font-size: 1.2rem;
}

/* 宽高比网格样式 */
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

/* 画布区域样式 */
.canvas-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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
  overflow: auto;
  padding: 0;
  box-sizing: border-box;
  position: relative;
}

.canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.canvas {
  position: relative;
  background-color: #1e1e1e;
  border: 2px dashed #00a4e4;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
  transition: width 0.3s, height 0.3s;
  min-width: 400px;
  min-height: 400px;
  max-width: 90%;
  max-height: 90%;
}

.empty-canvas {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  text-align: center;
  padding: 2rem;
  font-size: 1.1rem;
}

.generated-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(30, 30, 30, 0.8);
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

/* 响应式设计 */
@media (min-width: 1600px) {
  .sidebar {
    width: 360px;
    min-width: 360px;
  }
  
  .canvas-area {
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
  
  .canvas-area {
    width: calc(100% - 300px);
  }
}
</style>
