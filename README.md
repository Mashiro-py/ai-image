# AI 图像生成器

一款基于 Vue 3 和 OpenAI API 开发的 AI 图像生成应用程序。

## 应用预览

![应用预览图](./public/images/demo.png)

## 功能特性

- 使用 OpenAI API 生成高质量图像
- 自定义图像尺寸和宽高比
- 调整图像生成质量
- 响应式设计，适配不同屏幕尺寸

## 技术栈

- Vue 3 + Composition API
- Vite
- OpenAI API

## 安装和使用

1. 克隆仓库
```sh
git clone https://github.com/你的用户名/ai-image.git
cd ai-image
```

2. 安装依赖
```sh
npm install
```

3. 运行开发服务器
```sh
npm run dev
```

4. 构建生产版本
```sh
npm run build
```

## 配置说明

在 `src/apis/imageGenerator.js` 中配置您的 OpenAI API 密钥：

```js
setApiKey('你的API密钥');
```

## 许可证

MIT
