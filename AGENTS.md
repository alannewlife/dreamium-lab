# Dreamium Lab — 有趣实验站

本仓库包含总入口和多个独立实验。先读根 `README.md` 找到对应目录，再读实验自己的说明与约束。

## 目录职责

- `index.html` + `hub/`：总入口、实验卡片、首页样式与封面。
- `soft-matter/`：软物质实验的入口、源码、测试、文档与独立导出配置。修改前必读 `soft-matter/AGENTS.md`，其中规定冻结区、数据流与勿修复清单。
- `liquid-reality/`：水纹实验，独立 HTML，见该目录 `README.md`。
- `public/`：全站共用静态文件，不放实验源码。
- `scripts/`：全站发布检查；`deployment/`：部署说明；`docs/`：站点历史方案。
- `dist/`、`dist-single/`：生成产物，不直接编辑。

## 新增实验

新建根目录下的独立 `<slug>/index.html`，与已有实验并列，配套 `README.md`。在 `vite.config.ts` 注册构建入口，在根首页添加卡片，并更新首页数量、站点地图、发布检查与根 README。需要 TypeScript 时更新 `tsconfig.app.json` 的 include。避免实验之间互相 import，暂不抽取共享引擎或共享前端路由。

## 运行与验证

从仓库根目录执行，所有实验共用一个依赖安装与开发服务器：

```sh
npm run dev        # http://localhost:3000
npm run build      # tsc -b && vite build → dist/
npm test           # 必须在 build 后运行
npm run preview
```

Cloudflare Pages 按目录提供页面：`/`、`/soft-matter/`、`/liquid-reality/`，不得因源码整理改变公开网址。

重启开发服务器前，先用 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 找到旧进程，再终止并后台启动 `npm run dev`，curl 验证 200。

注释用中文，解释原因。整理目录时保持现有实验实现与行为，冻结文件允许原样搬迁，不允许改写。
