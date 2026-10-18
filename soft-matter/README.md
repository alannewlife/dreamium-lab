# Soft Matter — 软体果冻标本交互页

单屏固定视口的 3D 交互演示：浅灰摄影棚里一块通透的软体果冻（3,185 粒子 shape-matching 软体模拟），可以抓取、拖拽、抛掷，观察它的惯性、回弹与软态形变。

技术栈：**React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + 原生 three.js r0.160**（无 react-three-fiber，无 gsap）。

## 功能

- **三种标本形态**，形状与配色绑定，控制卡单行胶囊切换（形状瞬时重置，配色 0.5s 渐变）：
  | 形态 | 配色 | 质量 | 说明 |
  |------|------|------|------|
  | Star（默认） | Mint 绿 | 98.3 g | 圆形基底五瓣调制，面朝上自立（几何舵机） |
  | Apple | Berry 红 | 124.8 g | 果柄凹窝 + 跟随刚体位姿的果柄 |
  | Cube | Honey 黄 | 156.2 g | 超椭球 |
- **软体物理**：Verlet 积分 + 最优旋转目标弹簧（shape matching, Müller et al. 2005）+ 全局体积约束 + 地面碰撞摩擦 + 舞台边界限位 + NaN 自愈。
- **交互**：直接抓取网格顶点拖拽（抓取点白色圆点标记）；"Give it a nudge" 随机方向轻推；Reset 归位（果柄必朝上）。
- **控制卡 "THE SPECIMEN"**：Firmness（0.5–2.5 kPa，映射形状匹配刚度）、Internal damping（0.5–10 s⁻¹）、¼ speed、Show mesh（线框叠加）、Pause。
- **HUD 遥测**：MASS / REST VOLUME / KINETIC ENERGY 实时读数（场景 → React，~8Hz）。
- **渲染质感**：`MeshPhysicalMaterial` 透射壳体（transmission + attenuation）+ 背透光 fake-SSS（onBeforeCompile 注入）+ BackSide 加色内辉光 + 菲涅尔亮缘 + 中心加深精灵 + 径向渐变软接触阴影。

## 快速开始

```bash
npm run dev        # 从仓库根目录运行 → http://localhost:3000/soft-matter/
npm run build      # tsc -b && vite build → dist/
npm run preview    # 预览构建产物
npm run lint       # eslint
```

> 所有命令从仓库根目录运行；首次使用先执行 `npm ci`。本实验的源码、测试和历史文档均在 `soft-matter/` 内。

## URL 参数

| 参数 | 作用 |
|------|------|
| `?shape=star\|apple\|cube` | 预置形态（配色跟随绑定），无参数默认 star |
| `?firmness=<0.5–2.5>` | 预置软硬度 |
| `?freeze` | 冻结在当前帧（dt=0） |
| `?lite` | 降载模式 |
| `?autodemo` | 脚本化抓取/抛掷演示（首次点击画布重新武装） |
| `?introhold` | 加载覆盖层常显（截图取证用） |

## 目录结构

```
soft-matter/
├── index.html                 # 实验页面入口
├── README.md                  # 本说明
├── AGENTS.md                  # 冻结区与开发约束
├── src/
│   ├── main.tsx               # React 挂载入口
│   ├── App.tsx
│   ├── pages/Home.tsx         # 组装 Stage + Hud，单屏无滚动
│   ├── index.css              # Tailwind 主题 + 字体变量
│   └── three/
│       ├── Stage.tsx          # 渲染器生命周期 + rAF（冻结）
│       ├── engine/core/       # renderer/loop/signals/rng/forensic（冻结）
│       ├── engine/kit/        # hudBridge 等工具
│       ├── scene/             # 软体物理、场景、材质、通信总线
│       └── hud/               # 覆盖层与控制卡
├── tests/                     # 软体物理回归
├── docs/
│   ├── plan.md                # 布局规格（S 编号条目）
│   ├── report.md              # 历史验证报告
│   ├── physics-interaction-fix.md
│   └── verify.jsonl           # 历史验证取证
├── scripts/                   # 独立 HTML 导出后处理
└── vite.config.single.ts      # 独立 HTML 构建配置
```

历史记录中的 `src/` 均指本目录下的 `src/`；页面布局与物理实现未因目录整理改变。

## 数据流

UI 与 3D 场景互相不直接引用，通过 `scene/bus.ts` 单例通信：

- **UI → 场景**：`settings`（设置对象，场景每帧读取）+ `commands`（一次性命令标志 `nudge`/`reset`，场景消费后清零）。
- **场景 → UI**：`hudStore`（hudBridge pub/sub，~8Hz 推送 volume/ke/shape 遥测）。

## 已知设计决策（有意为之，勿"修复"）

- 形状切换是**瞬时重置**，无形变过渡——避免连续切换累积能量把标本弹飞（用户明确要求）。
- 星星不用 shape-matching 扭矩，改用 `axisServo` 几何舵机（实测最薄轴对齐 ±Y）。
- 指针释放监听在 **window 层**——合成输入/面板上松手时 canvas 层会丢 mouseup，导致抓取卡死。
- 物理热循环内禁止每帧分配临时对象（统一复用模块级 `_tmp` 变量，避免 GC 卡顿）。
