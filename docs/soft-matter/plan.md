# Plan — Soft Matter (WebGPU jelly specimen page)

> **2026-09-07 用户追加需求(偏离源站的已确认变更)**:①果冻初始形状改为**苹果**(顶部果柄凹窝 + 果柄装饰件,替代源的块状糖体);②材质向**通透晶莹**方向重调(浅色透射壳 + 加色内辉光,替代源的深色糖果观感)。受影响的验证行(S1/S9/S10/S12/S13 等)以"用户要求"记录该偏差,不再以源站形状/饱和度为准。

Reference: 1720×1080 recording, browser chrome occupies top ~84px → page area 1720×996. All px below are page px unless noted. Single fixed viewport, no scroll. WebGL page → default-3d template, raw three.js. Source page runs WebGPU; replica renders the same look with WebGL/three.js (invisible at composite level; noted in report).

## Layout strategy
[S1] Page skeleton (full-frame anchor, Berry rest @0.2s): full-bleed canvas + DOM overlay; eyebrow+display heading block top-left (x≈57, heading y≈66–230); badge top-right (right margin ≈33, y≈35); hint copy + telemetry stats bottom-left (bottom ≈30); keywords line bottom-center (y≈960); control card bottom-right (right ≈29, bottom ≈32, w≈248, h≈348); jelly centered ≈(50%, 56%), on-screen width ≈0.37 viewport (still @0.2s) {core}

[S2] Display heading "Soft Matter.": 2 lines, high-contrast Didone serif (Playfair-Display-like), "Soft" roman / "Matter." italic, ~100px, line-height ~0.95, color #23262a, block width ≈0.17 viewport (still @0.2s) {core}

[S3] Eyebrow "MATERIAL STUDIES / NO. 001": ~11px, tracking ~0.2em, #55575a (still @0.2s) {detail}

[S4] Sub copy "A little gravity. / A little light. / A very soft solid.": 3 lines ~13px #55575a, line-height ~1.55, under heading at y≈260–298 (still @0.2s) {detail}

[S5] Badge "● WEBGPU · LIVE": green dot ≈#2e9e63 + ~11px tracking 0.18em #3a3b3e, top-right (badge crop @0.2s) {detail}

[S6] Bottom-left hint + telemetry: "Take hold. Let go." semibold ~14px #2a2c2e; "Drag the jelly. Feel the inertia." ~14px #6b6d6f; stats row mono ~17px #232527: "124.8 g|MASS", "96.5 %|REST VOLUME", "0.1 mJ|KINETIC ENERGY", labels ~9px tracking 0.15em #9a9c9d, columns at x≈60/148/240 (footer crop @0.2s) {core}

[S7] Bottom-center "FINITE ELEMENTS · REFRACTED LIGHT · WEBGPU": ~10px tracking 0.18em #8a8c8d (footer crop @0.2s) {detail}

[S8] Control card (第七轮修订: swatch 行被整合的标本行取代, 其余结构不变) "THE SPECIMEN": panel #eceeec radius ~16px subtle shadow on #d1d2d1 page; header "THE SPECIMEN" 11px bold tracking 0.18em + chip "ρ 1.05 g/cm³" (mono ~12px, white pill, hairline border); swatch pills Berry(crimson dot #c2185b)/Mint(green #1e9e50)/Honey(amber #d99a26), selected = white bg + dark ~1.5px border ring, unselected = flat gray #e0e2e0; slider rows "Firmness → 1.2 kPa" and "Internal damping → 3.0 s⁻¹" (label 14px, mono value right), track h≈5px rounded with dark filled-left + white hairline rest, dark round thumb ~15px (Firmness thumb ≈35% at 1.2 kPa → range 0.5–2.5; damping thumb ≈28% → range 0.5–10.0); buttons "Give it a nudge" dark #26282a pill white text + "Reset" white pill hairline border, equal 2-col; checkbox row "¼ speed" + "Show mesh" (16px rounded-sq) + "Pause" gray pill; hairline divider; "▸ Inside the experiment" 14px disclosure (panel crop @0.2s) {core}

[S9] Scene rest state: seamless light-gray studio (#d1d2d1, floor imperceptibly darker, no visible horizon), soft elliptical contact shadow under jelly; jelly = lumpy rounded-box superellipsoid (±4% low-freq silhouette noise), w/h ≈0.71, resting on ground; translucent candy material — saturated tint body, darker where thick, whitish silhouette rim, white streak reflections from studio env (still @0.2s) {core}

[S10] Color tokens: page bg #d1d2d1; ink #23262a; muted #55575a/#8a8c8d; panel #eceeec; Berry body ≈#d5197c dark bands ≈#8d0018; Mint body ≈#0cc35f dark ≈#0a6e35; Honey body ≈#e09a1c dark ≈#8d4402 (one-shot sampled @0.2/13.0/30.0s) {core}

[S11] Intro overlay centered on blob: "Soft matter, incoming." serif italic ~34px dark plum ≈#3a1024; 40px hairline rule; "Preparing the material and its little laws of motion..." ~14px #6b6d6f (still @19.15s) {detail}

[S12] Full-frame anchor, Mint rest (@13.0s): green jelly same framing/size as S9, Mint pill ringed, stats live (still @13.0s) {core}

[S13] Full-frame anchor, Honey + Firmness 0.60 kPa rest (@30.0s): amber jelly, Honey pill ringed, firmness value "0.60 kPa", thumb near left end (still @30.0s) {core}

## Component breakdown (untagged — architectural)
- Scaffold: default-3d template; engine core untouched.
- scene/softbody.ts — shape-matched soft body: Verlet particles = mesh vertices, optimal-rotation goal springs (stiffness ← firmness), ground collision + friction, global volume constraint, grab API (strong spring to cursor world point), KE + volume readouts, scripted ?autodemo grab/toss sequence.
- scene/materials.ts — jelly MeshPhysicalMaterial (transmission+attenuation tint), presets, shadow gradient texture.
- scene/Scene.ts — RoomEnvironment PMREM, lights, ground+fog, blob mesh, grab-dot sphere, shadow plane, pointer raycast, stats bridge, settings bus.
- hud/Hud.tsx — overlay chrome + intro overlay; hud/SpecimenPanel.tsx — control card.
- bus.ts — React→scene settings singleton; hudBridge scene→React stats (~10Hz).

## Interactions & animations
[D1] Idle ambient wobble: cursor away, silhouette lumps keep slowly drifting, body breathes (KE readout jitters 0.1–0.3 mJ); continuous, no trigger (source clip 41.5–43.5s; time-driven sim; testid=jelly-canvas) {core} {render}

[D2] Drag grab & release: mousedown on jelly pins nearest surface particle to cursor (white ~10px dot marker at grab point), body stretches elastically along cursor path — peak reaches ~2× rest height at default firmness; release snaps back with damped jiggle ~1.2–1.6s, 2–3 oscillations (source clip 1.6–4.6s; testid=jelly-canvas) {core} {render}

[D3] Color preset switch: click Mint/Honey → tint cross-fade ~0.5s (mid-blend shows both hues), selected pill gains dark ring; Berry #d5197c ↔ Mint #0cc35f ↔ Honey #e09a1c (source clip 11.3–12.4s; lerp color+attenuation; testid=swatch-mint etc.) {core} {render}

[D4] Firmness slider drag: thumb follows pointer, filled track shrinks, value live "1.2 kPa"→"0.60 kPa" (≥1 → 1 decimal, <1 → 2 decimals), jelly gets visibly stretchier (source clip 22.7–23.3s; range 0.5–2.5 kPa default 1.2; testid=slider-firmness) {core} {render}

[D5] Soft-mode stretch & toss: at 0.60 kPa grab pulls a long thin taffy cone (~2.5× rest height); whole body can lift off ground and tumble; shadow stays on ground, separating and lightening with height (source clip 24.8–27.0s & 36.0–38.0s; testid=jelly-canvas) {core} {render}

[D6] Live telemetry: REST VOLUME % ≈95–99.6 and KINETIC ENERGY 0.1–34.6 mJ update continuously with motion; MASS fixed "124.8 g" (source clips 0–18s footer; sim-derived; testid=stat-volume/stat-energy) {detail} {render}

[D7] Intro overlay lifecycle: visible over settled blob ~1.2s on load, fades out ~0.3–0.4s (source clip 18.8–20.0s; CSS opacity; testid=intro-overlay) {detail} {render}

Untagged (implemented, never demonstrated in source): "Give it a nudge" impulse, Reset, ¼ speed (timeScale 0.25), Show mesh wireframe, Pause/Resume, "Inside the experiment" expanded copy.

## Physics targets (build guide)
- Rest silhouette w/h ≈0.71, breathing ±2%; release jiggle decay ~1.4s; grab cone height ~2× (1.2 kPa) / ~2.5× (0.6 kPa); toss arcs ~0.6 viewport height, lands ~1.5s; volume display 95–99.6%; KE idle 0.1–0.3 mJ, toss 20–35 mJ.

## 用户追加功能(2026-09-07 第五轮)
[S14] 标本胶囊行(第七轮整合): 配色行移除, 单行三枚 Apple(红点)/Star(绿点)/Cube(黄点), 点击同时切换形状+配色 (绑定: 苹果红/星星绿/方块黄; 用户简化; testid=shape-apple/star/cube) {core}
[D8] 形状切换: 点击胶囊后**直接切换**为新形态 (用户修订: 无过渡动画, 瞬间重置到新形状静止态+姿态归位); Star=加厚五瓣枕头星(H 0.78), Cube=超椭球方糖; 果柄仅 Apple 形态且 Reset/切换后必朝上; 快速连点不乱形不消失 (方向快照 + 舞台边界 + NaN 守卫) (用户功能, 源站无此项; testid=shape-star) {core} {render}
