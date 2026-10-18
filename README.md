# Dreamium Lab · 有趣实验站

一点物理，一点错觉，一点不务正业。Alan 的交互实验收藏。

**网站从 `index.html` 进入；开发从对应实验文件夹进入。** 每个实验是独立页面，只有进入时才加载自己的代码。

| 内容 | 文件夹 | 线上入口 |
| --- | --- | --- |
| 总入口 / 实验目录 | `index.html` + `hub/` | [lab.dreamium.si](https://lab.dreamium.si/) |
| 软物质 · Soft Matter | [`soft-matter/`](soft-matter/README.md) | [/soft-matter/](https://lab.dreamium.si/soft-matter/) |
| 现实被液化 · Liquid Reality | [`liquid-reality/`](liquid-reality/README.md) | [/liquid-reality/](https://lab.dreamium.si/liquid-reality/) |

## 文件夹怎么找

```text
index.html                 总入口：首页与实验卡片
hub/                       总入口的样式、封面插画
soft-matter/               实验 001：软物质
  index.html               页面入口
  src/                     React / Three.js 源码
  tests/                   物理回归测试
  docs/                    设计规格、历史验证
  scripts/                 独立 HTML 导出工具
  README.md                实验说明
  AGENTS.md                引擎冻结区与开发约束
liquid-reality/            实验 002：现实被液化
  index.html               独立 HTML，包含样式和交互
  README.md                实验说明
public/                    全站共用的静态文件：图标、404、站点地图
scripts/                   全站发布检查
deployment/               部署说明、旧域名跳转规则
docs/                      实验站的历史方案
vite.config.ts             全站页面入口与构建配置
package.json               全站开发、构建、测试命令
dist/                      自动生成的发布目录，不在这里改源码
```

根目录里的 `tsconfig*`、`eslint.config.js`、`package-lock.json` 是共用工程配置，通常不用改。

## 本地运行

需要 Node.js 22 或更新版本，所有命令都从仓库根目录运行。

```sh
npm ci
npm run dev
```

- 总入口：`http://localhost:3000/`
- 软物质：`http://localhost:3000/soft-matter/`
- 现实被液化：`http://localhost:3000/liquid-reality/`

```sh
npm run build       # 构建到 dist/
npm test            # 构建后执行：物理回归、发布页面及资源检查
npm run preview     # 预览构建产物
npm run build:single # 额外导出 dist-single/soft-matter.html
```

## 再加一个实验

1. 在根目录新建 `<slug>/`，与 `soft-matter/`、`liquid-reality/` 并列。英文短名就是网址路径，例如 `light-play/` → `/light-play/`。
2. 在里面放 `index.html` 和 `README.md`。简单实验可以是单 HTML；需要 React / TypeScript 时，把自己的源码放在该目录的 `src/`。实验专属资源和测试也放在自己的目录里。
3. 在 `vite.config.ts` 的 `build.rollupOptions.input` 增加这个 HTML 入口。如果使用 TypeScript，在 `tsconfig.app.json` 的 `include` 增加 `<slug>/src`；有测试则接入 `package.json` 的 `test` 命令。
4. 在根 `index.html` 增加实验卡片，更新数量和下一件实验编号；封面放 `hub/`。在实验里加回首页 `/` 的链接。
5. 更新本页实验表、`public/sitemap.xml` 和 `scripts/site.test.mjs` 中的页面清单，运行 `npm run build`，再运行 `npm test`。

沿用独立页面方式，样式与运行时互不干扰，无共享 SPA 路由。`public/` 只放全站静态文件，不放实验源码。

部署方式与回退步骤见 [deployment/README.md](deployment/README.md)。Cloudflare Pages 按 `dist/` 目录直接提供页面，所有现有线上路径保持不变。
