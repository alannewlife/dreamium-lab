# dreamium lab · 有趣实验

一点物理，一点错觉，一点不务正业。Alan 的交互实验收藏。

| 页面 | 地址 | 源码 |
| --- | --- | --- |
| 实验入口 | https://lab.dreamium.si/ | `index.html`、`hub/` |
| 软物质 | https://lab.dreamium.si/soft-matter/ | `soft-matter/index.html`、`src/` |
| 现实被液化 | https://lab.dreamium.si/liquid-reality/ | `public/liquid-reality/index.html` |

## 开发与验证

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run dev
npm run build
npm test
npm run preview
```

原软物质由 React + TypeScript + Three.js 构建。入口页是静态 HTML/CSS，水纹是独立 HTML；不共享 React 运行时或前端路由，不需要常驻后端。进入哪个实验才加载哪个实验的资源。

`npm test` 在构建后执行，包含原有 11 项软体物理测试和发布目录、页面资源检查。软物质规格和历史验证保留在 `docs/soft-matter/`，引擎冻结规则见 `AGENTS.md`。

`npm run build:single` 仍导出独立软物质页面至 `dist-single/soft-matter.html`。

## 发布

使用新建并连接 GitHub 的 Cloudflare Pages 项目 `dreamium-lab`（旧 `jelly` 为直接上传，保留回退），生产分支 `main`，命令 `npm run build && npm test`，输出 `dist`。`/soft-matter/` 对应 `dist/soft-matter/index.html`，`/liquid-reality/` 对应 `dist/liquid-reality/index.html`，无需 Worker、反向代理或 SPA fallback。

主域名绑定 `lab.dreamium.si`，原 `jelly.dreamium.si` 保留绑定，通过 `public/_redirects` 跳转软物质新地址并保留查询参数。GitHub 仓库更名为 `alannewlife/dreamium-lab`，保留全部提交历史；本地目录暂留 `jelly`，避免破坏现有开发路径。

水纹的触摸/鼠标模式不需要摄像头；摄像头模式需 HTTPS、用户授权及可用设备，手势模型由 jsDelivr 加载。相机和水纹在浏览器中处理。

## 新增实验

独立 HTML 放到 `public/<slug>/index.html`，直接发布；需构建的页面放到 `<slug>/index.html`，在 `vite.config.ts` 的 `build.rollupOptions.input` 增加入口。给每个实验加回站点入口的链接，并在根首页增加卡片。优先隔离样式与运行时代码。

封面为示意插画，不自动运行 WebGL 或请求摄像头。旧版回退标记为 `backup/pre-lab-2026-10-18`。
