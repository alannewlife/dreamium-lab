# 现实被液化 · Liquid Reality

独立水纹实验：划过画面制造涟漪，也可以选择摄像头手势模式。

- 入口与实现：`index.html`，包含页面、样式和浏览器交互。
- 本地地址：`http://localhost:3000/liquid-reality/`。
- 线上地址：https://lab.dreamium.si/liquid-reality/

从仓库根目录运行 `npm run dev`。构建与测试也在根目录执行：`npm run build` 后运行 `npm test`，页面发布到 `dist/liquid-reality/index.html`。

鼠标和触摸模式不需要摄像头。摄像头模式需要 HTTPS（或 localhost）、用户授权和可用设备，手势模型由 jsDelivr 加载；画面和水纹在浏览器中处理。

本实验不依赖软物质的 React / Three.js 代码。未来拆分样式、脚本或新增素材时，继续放在本目录中。
