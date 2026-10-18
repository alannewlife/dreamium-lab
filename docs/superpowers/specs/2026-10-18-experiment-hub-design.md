# 有趣实验站

用户已确认将原 jelly 项目作为实验站，整理 GitHub、Cloudflare 及个人主页入口。

- 站点：lab.dreamium.si，首页为轻量实验陈列，纸白、墨黑、薄荷绿，与个人主页呼应。
- /soft-matter/：原 React/Three.js 应用，保留物理、引擎、查询参数及控制面板。
- /liquid-reality/：现有完整 HTML，保留无摄像头水纹及摄像头手势模式，增加回实验站链接。
- 每个实验是独立页面，浏览器仅在进入实验后加载对应代码；无需常驻服务、数据库或共享前端路由。
- 继续使用原 Cloudflare Pages 项目，构建命令 npm run build、输出 dist；目录自动映射路径。
- GitHub jelly 更名 dreamium-lab，保留历史和可回退标记；更新本地 remote。
- jelly.dreamium.si 旧链接跳转软物质新地址，保留查询参数。
- 清除未使用的 UI 脚手架和依赖；保留物理说明、历史验证资料，忽略本地构建产物。
- dreamium 首页替换软物质单条入口为有趣实验展示，提供入口及两个直达链接。
- 验证：原物理测试、构建、产物链接检查、桌面/手机页面、线上部署与旧址跳转。
