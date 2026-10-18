# Experiment Hub Implementation Plan

**Goal:** 将原软物质项目整理为有趣实验入口，并同步个人主页与发布配置。
**Architecture:** Vite 多页面入口（主页、软物质）加原样发布的水纹 HTML。共享发布目录，源码和运行页面分开。
**Tech Stack:** 静态 HTML/CSS、原 React/Three.js、Vite、Cloudflare Pages。
**Spec:** docs/superpowers/specs/2026-10-18-experiment-hub-design.md

## Global Constraints
- 保留冻结引擎和软体物理逻辑；不承诺未验证的摄像头硬件行为。
- 不清理用户未提交文件；保留历史与原子站兼容。

## Tasks
- [x] 写产物路由和资源检查：node --test scripts/site.test.mjs，先确认旧构建失败。
- [x] 添加 hub 首页、soft-matter/index.html、public/liquid-reality/index.html；Vite 配置显式入口，资源相对路径。
- [x] 清理未引用 UI、依赖和脚手架，保留原物理及单文件导出；更新文档、锁文件与站点静态规则。
- [x] 修改个人主页 index.html、v2/refinements.css、src/projects.js，添加实验集合及两个直达入口。
- [ ] 运行 npm run build、npm test、npm run build:single，检查桌面与手机以及实验页面。
- [ ] 创建回退标记、GitHub 改名、提交并推送；核对 Pages source 和构建设置，绑定 lab 域名并核验旧址跳转。
