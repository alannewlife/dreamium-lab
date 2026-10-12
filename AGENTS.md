# AGENTS.md — AI 代理工作指南

本文件给在本仓库工作的 AI 代理（代码审查、修改、验证）提供必读上下文。改动前请先读完，尤其是「冻结区」和「勿修复清单」。

## 项目一句话

单屏 3D 交互页 "Soft Matter"：浅灰摄影棚 + 通透软体果冻标本（Star/Apple/Cube 三形态，形状↔配色绑定），shape-matching 软体物理（3,185 粒子 = SphereGeometry(1,64,48) 顶点；UI 折叠文案里的 "~1.6k" 是过时文案，以 HUD 底部 3,185 为准），可抓取拖拽抛掷。React 19 + TS + Vite 7 + Tailwind v4 + 原生 three.js 0.160。

## 常用命令

```bash
npm run dev        # 开发服务器 http://localhost:3000（vite.config.ts 固定端口）
npm run build      # tsc -b && vite build
npm run lint       # eslint
```

重启约定：先 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 找到旧进程并 kill，再后台启动 `npm run dev`，curl 验证 200。

## 架构分层与权限

| 层 | 位置 | 规则 |
|----|------|------|
| 挂载层 | `src/three/Stage.tsx` | **冻结**。canvas/渲染器生命周期、rAF 循环、resize、StrictMode 守卫都在这，勿重写 |
| 引擎核心 | `src/three/engine/core/` | **冻结**（renderer/loop/signals/rng/forensic）。所有 3D 页面复用 |
| 引擎工具 | `src/three/engine/kit/` | 按需取用（hudBridge 的 `createHudStore` 正在被 bus.ts 使用） |
| 场景代码 | `src/three/scene/` | **工作区**：softbody.ts（物理）、Scene.ts（组装）、materials.ts（材质）、bus.ts（通信） |
| HUD | `src/three/hud/` | 工作区：Hud.tsx（覆盖层）、SpecimenPanel.tsx（控制卡），Tailwind + `pointer-events-none` |

场景契约：`SceneModule { init(ctx) / update(t, dt) / resize? / dispose() }`，`ctx = { renderer, scene, camera, clock, sizes, rng, signals, forensic }`。

## 数据流（勿破坏）

UI 与场景互不 import，全部经 `src/three/scene/bus.ts`：

- **UI → 场景**：可变单例 `settings`（场景每帧轮询）+ 一次性标志 `commands.nudge/reset`（场景消费后必须清 `false`）。
- **场景 → UI**：`hudStore.set({ volume, ke, shape })`，~8Hz 节流（`statTimer > 0.12`），React 侧 `hudStore.subscribe`。

## 编码约定

- 注释用中文，解释"为什么"而非"做了什么"。历史上多轮修复都有注释锚点（搜 `用户要求` / `用户报告`），改动相关代码前先读这些注释。
- **物理热循环（softbody.ts 的 step/substep）禁止每帧分配**：向量/四元数用模块级 `_tmp` 复用；closure 内也复用。这是修过 GC 卡顿的硬规矩。
- 临时 `THREE.CanvasTexture`/几何/材质必须在 `dispose()` 里释放（Scene.ts 有完整先例）。
- HUD 控件全部带 `data-testid`（`shape-*`、`slider-firmness`、`btn-nudge`、`btn-reset`、`chk-*`、`btn-pause`、`stat-*`、`intro-overlay`、`panel`）——自动化验证依赖它们，新控件必须加。
- UI 文案像素值、字距、颜色 token 均有规格（`docs/plan.md` S1–S13），改 HUD 样式先对照。

## 勿"修复"清单（有意设计）

1. **形状切换是瞬时重置，无过渡动画**——形变过渡会在快速连点时累积能量把标本弹飞（用户明确要求直接切换）。
2. **星星不用 shape-matching 扭矩**，用 `axisServo`（每帧实测 26 方向最薄轴对齐 ±Y，抓取时让位）；Apple 用带死区的 upright 扭矩。两套自立机制不同，勿统一。
3. **pointerup/mouseup 监听挂在 window 层**——移回 canvas 会因合成输入丢事件导致 `grabbed` 卡死、舵机失灵。
4. **形状↔配色绑定**（apple=berry / star=mint / cube=honey），胶囊行同时切两者；默认形态 star（无 URL 参数时）。
5. `boundingSphere` 固定半径 12——防止抛离原点后 raycast 被误剔除；改回动态计算会复发。
6. 体积约束每帧一次而非每子步；舞台 XZ 限位 ±4.2 + NaN 自愈守卫，都是防弹飞的。
7. **`upright()`（softbody.ts）的三个不变量缺一不可**（2026-09-08 修「方块碰一下持续抖动并上飘出画面」）：① 只修滚转（体顶轴 q·Ŷ 与世界 Y 夹角）、不碰偏航——偏航是准自由方向，按四元数总角回正会在无势阱方向上失稳锁死在 ~π；② 回正旋转必须同步 `q.premultiply(corr)`——只转粒子不转 q 时，形状匹配弹簧把旋转原样拽回（方块 180° 翻面是 rest 精确对称，翻面即最优解），姿态锁死、扭矩空转即持续抖动；③ 上抬只补地面穿透 `max(0,-minY2)`——按「旋转前最低点高度」补偿会在悬空态每子步净抬升（速度中性、无任何力拉回）→ 质心棘轮式匀速上飘。

## 验证与取证

- URL 确定性钩子（`engine/core/forensic.ts`，勿改）：`?freeze`、`?lite`、`?autodemo`、`?t=<0..1>`；业务侧另有 `?shape=`、`?firmness=`、`?introhold`（Hud.tsx 读）。
- `?autodemo` 时间线在 `Scene.ts#autodemo`（T=4.0s 起抓取/抛掷脚本），首次点击画布重新武装。
- 验收基线：静置 KE 恒定 0.1 mJ 不爆发（抖动回归的判据）；连点 12 次零间隔各形态落位干净；Reset 后果柄朝上。
- 历史规格与验证记录：`docs/plan.md`（S 编号布局规格）、`docs/report.md`（22 项验证 19 pass / 3 defer 及已知限制 D2/D5/D7）。

## 环境备注

- `node_modules` 是指向 `.nm-root/node_modules` 的软链接；`dist/` 为构建产物（历史 `vite preview` 用 8477 端口，非开发端口）。
- 源参考站为 WebGPU 实现，本项目用 WebGL/three.js 复刻同等观感，勿尝试引入 WebGPU API。
- 单 HTML 内联打包已验证可行（vite 内联配置 + 打包脚本），用户要求时再做，默认不启。
