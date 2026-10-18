# 有趣实验站部署

- GitHub：https://github.com/alannewlife/dreamium-lab （原 jelly，历史保留）
- Cloudflare Pages 项目：`dreamium-lab`
- 生产分支：`main`
- 构建：`npm run build && npm test`
- 输出：`dist`
- Node.js：22
- 主入口：https://lab.dreamium.si/
- 实验直达：`/soft-matter/`、`/liquid-reality/`

个人主页的两张实验卡片直接打开对应实验；集合页为可选入口。Pages 将发布目录映射成 URL，不使用额外服务器或反向代理。

旧 `jelly` Pages 项目为直接上传模式，保留原部署用于回退；新建 Git 集成项目，让后续 main 推送自动发布。原 `jelly.dreamium.si` 绑定迁移到新项目后，由 Cloudflare Single Redirect 将根入口跳转 `/soft-matter/`，保留查询参数。规则存档于 `deployment/legacy-redirect.json`；Pages 的 `_redirects` 不支持按来源域名匹配，因此不使用该文件。

## 回退

原软物质源码标记：`backup/pre-lab-2026-10-18`（418d3c5）。旧 Pages 备用入口：`https://jelly-ix7.pages.dev/`。

需要完整恢复旧域名时，将 `jelly.dreamium.si` 的自定义域名绑定移回旧 Pages 项目，并把 CNAME 恢复为 `jelly-ix7.pages.dev`。新站后续版本可在 Pages Deployments 中回退成功部署。

## 验证范围

构建、13 项测试（11 项原物理回归 + 2 项发布目录/资源检查）、独立 HTML 导出、本地桌面和手机页面、原物理与引擎文件内容一致性已检查。浏览器中验证了形态切换/轻推、无摄像头水纹交互；实际摄像头硬件和手势模型识别效果仍取决于设备、授权及 CDN 网络。

## 目录整理后的发布

总入口仍为根 `index.html`，实验目录为 `soft-matter/`、`liquid-reality/`。两个实验均由根 `vite.config.ts` 注册入口，源码归属调整不改变线上路径。软物质开发约束已下沉至 `soft-matter/AGENTS.md`。

发布流程保持：在本地完成 `npm run build`、`npm test` 后，提交并推送到 GitHub `main`，由 Pages 自动构建。核验 Pages 的生产部署对应本次提交、最终阶段为 `success`，并检查首页和两个实验直达地址。
