import * as THREE from 'three'
import type { Signals } from '../engine/core/signals'
import type { Forensic } from '../engine/core/forensic'
import { neutralEnvironment } from '../engine/kit/model'
import { SoftBody } from './softbody'
import { createJellyMaterial, applyPreset, createShadowTexture, createBandsTexture, createCoreShadeTexture, PRESETS } from './materials'
import { settings, commands, hudStore, type PresetId, type ShapeId } from './bus'

export interface SceneContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  clock: THREE.Clock
  sizes: { width: number; height: number; dpr: number }
  rng: () => number
  signals: Signals
  forensic: Forensic
}

export interface SceneModule {
  init(ctx: SceneContext): void | Promise<void>
  update(t: number, dt: number): void
  render?(): void
  resize?(width: number, height: number): void
  dispose(): void
}

const BG = 0xd1d2d1

// 每帧复用临时向量 (避免 GC)
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

// 菲涅尔亮边壳 (BackSide + 加色混合) — 真实软糖的染色边缘辉光
function createRimMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uAlpha: { value: 0.8 },
      uColor: { value: new THREE.Color(PRESETS.berry.deep).lerp(new THREE.Color(0xffffff), 0.35) },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vV;
      uniform float uAlpha; uniform vec3 uColor;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        gl_FragColor = vec4(uColor, f * uAlpha);
      }`,
  })
}

class JellyScene implements SceneModule {
  private ctx!: SceneContext
  private body!: SoftBody
  private mesh!: THREE.Mesh
  private innerMesh!: THREE.Mesh
  private innerMat!: THREE.MeshBasicMaterial
  private rimMesh!: THREE.Mesh
  private rimMat!: THREE.ShaderMaterial
  private stem!: THREE.Group
  private ground!: THREE.Mesh
  private coreShade!: THREE.Sprite
  private face!: THREE.Group
  private wire!: THREE.Mesh
  private mat!: THREE.MeshPhysicalMaterial
  private shadow!: THREE.Mesh
  private grabDot!: THREE.Mesh
  private raycaster = new THREE.Raycaster()
  private grabPlane = new THREE.Plane()
  private dragging = false
  private hoverTick = 0
  private presetFrom: PresetId = 'berry'
  private presetTo: PresetId = 'berry'
  private presetK = 1
  private shape: ShapeId = 'apple'
  private statTimer = 0
  private elapsed = 0
  private demoArmed = false
  private demoIdx = 0
  private disposers: Array<() => void> = []
  private fp = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, height: 0 }
  // 脸部前表面深度剖面 (视线轴周围 5×5 bin, 每帧复用)
  private faceBins = new Float32Array(25)

  init(ctx: SceneContext) {
    this.ctx = ctx
    const { scene, camera, renderer } = ctx

    // 初始配色直接就位 (跟随默认/URL 形态的绑定色), 避免加载时从 berry 渐变的一闪
    this.presetFrom = settings.preset
    this.presetTo = settings.preset

    renderer.toneMappingExposure = 1.15

    camera.fov = 35
    camera.position.set(0, 3.4, 7.3)
    camera.lookAt(0, 1.15, 0)
    camera.updateProjectionMatrix()

    scene.background = new THREE.Color(BG)
    scene.fog = new THREE.Fog(BG, 13, 32)
    scene.environment = neutralEnvironment(renderer)

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b6b2, 0.85))
    const dir = new THREE.DirectionalLight(0xffffff, 1.1)
    dir.position.set(4, 8, 5)
    scene.add(dir)
    const rim = new THREE.DirectionalLight(0xffffff, 1.6)
    rim.position.set(-3, 4, -7)
    scene.add(rim)

    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: 0xcfcfcd, roughness: 0.96, metalness: 0 }),
    )
    this.ground.rotation.x = -Math.PI / 2
    scene.add(this.ground)

    this.body = new SoftBody()
    this.mat = createJellyMaterial()
    this.mesh = new THREE.Mesh(this.body.geometry, this.mat)
    scene.add(this.mesh)

    this.body.buildShells()
    // BackSide + 加色混合 + 关深度测试: 壳体上的内部辉光 (廉价 SSS, 通透感来源)
    this.innerMat = new THREE.MeshBasicMaterial({
      map: createBandsTexture(),
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
    })
    this.innerMat.color.setHex(PRESETS.berry.deep).multiplyScalar(0.95)
    this.innerMesh = new THREE.Mesh(this.body.innerGeometry, this.innerMat)
    this.innerMesh.renderOrder = 10
    scene.add(this.innerMesh)

    // 中心加深精灵 (面向相机, 叠在壳体上): 中间暗、边缘透亮
    this.coreShade = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createCoreShadeTexture(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.coreShade.renderOrder = 20
    ;(this.coreShade.material as THREE.SpriteMaterial).color.setHex(PRESETS.berry.deep).multiplyScalar(0.95)
    scene.add(this.coreShade)

    // 脸 (参照果冻角色): 眼/腮/嘴 — 不透明网格嵌在壳体内, 经透射折射呈现“玻璃下的脸”
    this.face = new THREE.Group()
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x241610, roughness: 0.12, clearcoat: 1 })
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xf9e7bd })
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x33200f })
    const mkEye = new THREE.SphereGeometry(1, 20, 16)
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(mkEye, eyeMat)
      eye.position.set(0.3 * sx, 0.14, 0)
      eye.scale.set(0.085, 0.13, 0.05)
      this.face.add(eye)
      const cheek = new THREE.Mesh(mkEye, cheekMat)
      cheek.position.set(0.44 * sx, -0.03, 0.02)
      cheek.scale.set(0.105, 0.065, 0.02)
      this.face.add(cheek)
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 20, Math.PI * 0.85), mouthMat)
    smile.position.set(0, -0.06, 0.01)
    smile.rotation.z = Math.PI + (Math.PI - Math.PI * 0.85) / 2 // 开口朝上的弧
    this.face.add(smile)
    const tooth = new THREE.Mesh(mkEye, cheekMat)
    tooth.position.set(0, -0.11, 0.03)
    tooth.scale.set(0.05, 0.035, 0.02)
    this.face.add(tooth)
    this.face.visible = false
    scene.add(this.face)

    this.rimMat = createRimMaterial()
    this.rimMesh = new THREE.Mesh(this.body.rimGeometry, this.rimMat)
    scene.add(this.rimMesh)

    // 初始配色直接就位 (跟随默认/URL 形态的绑定色), 避免加载时从 berry 渐变的一闪
    applyPreset(
      this.mat,
      this.innerMat,
      this.coreShade.material as THREE.SpriteMaterial,
      this.rimMat,
      settings.preset,
      settings.preset,
      1,
    )

    // 苹果柄: 跟随软体刚体位姿的装饰件
    this.stem = new THREE.Group()
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.85 })
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.048, 0.6, 10), stalkMat)
    stalk.position.y = 0.3
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), stalkMat)
    tip.position.y = 0.62
    this.stem.add(stalk, tip)
    scene.add(this.stem)

    this.wire = new THREE.Mesh(
      this.body.geometry,
      new THREE.MeshBasicMaterial({ wireframe: true, color: 0xffffff, transparent: true, opacity: 0.35 }),
    )
    this.wire.visible = false
    scene.add(this.wire)

    const shadowTex = createShadowTexture()
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.004
    scene.add(this.shadow)

    this.grabDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    this.grabDot.visible = false
    scene.add(this.grabDot)

    this.bindPointer(renderer.domElement)
  }

  private bindPointer(el: HTMLElement) {
    el.style.touchAction = 'none'
    const ndc = (e: { clientX: number; clientY: number }) => {
      this.raycaster.setFromCamera(
        new THREE.Vector2((e.clientX / this.ctx.sizes.width) * 2 - 1, -(e.clientY / this.ctx.sizes.height) * 2 + 1),
        this.ctx.camera,
      )
    }
    const down = (e: { clientX: number; clientY: number }) => {
      // ?autodemo: 首次点击画布才武装并重置演示时间线 (供录制确定性触发)
      if (this.ctx.forensic.autodemo) {
        this.demoArmed = true
        this.elapsed = 0
        this.body.endGrab()
        return
      }
      // pointerdown 与 mousedown 会连发, 已在拖拽则忽略第二次
      if (this.dragging) return
      ndc(e)
      const hit = this.raycaster.intersectObject(this.mesh)[0]
      if (!hit) return
      const vi = this.body.pickVertex(this.raycaster.ray)
      if (vi < 0) return
      const camDir = new THREE.Vector3()
      this.ctx.camera.getWorldDirection(camDir)
      this.grabPlane.setFromNormalAndCoplanarPoint(camDir, hit.point)
      this.body.beginGrab(vi, hit.point)
      this.dragging = true
      el.style.cursor = 'grabbing'
      if ('pointerId' in e) el.setPointerCapture((e as PointerEvent).pointerId)
    }
    const move = (e: { clientX: number; clientY: number }) => {
      ndc(e)
      if (this.dragging) {
        const p = new THREE.Vector3()
        if (this.raycaster.ray.intersectPlane(this.grabPlane, p)) this.body.moveGrab(p)
        return
      }
      if (++this.hoverTick % 2 === 0) {
        const hit = this.raycaster.intersectObject(this.mesh).length > 0
        el.style.cursor = hit ? 'grab' : 'default'
      }
    }
    const up = () => {
      this.dragging = false
      this.body.endGrab()
      el.style.cursor = 'default'
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('mousedown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('mousemove', move)
    // 松手监听放 window 层: 无论指针在哪抬起 (面板上/画布外/合成输入丢失) 都释放抓取,
    // 否则 grabbed 卡死 → 星星舵机被"用户抓着"分支永久跳过
    window.addEventListener('pointerup', up)
    window.addEventListener('mouseup', up)
    window.addEventListener('pointercancel', up)
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('mousedown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('mousemove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('pointercancel', up)
    })
  }

  // ?autodemo — 无交互的脚本化抓取/抛掷, 供录制验证
  private autodemo(dt: number) {
    this.elapsed += dt
    ;(window as unknown as { __demoT: number }).__demoT = this.elapsed
    const T = this.elapsed
    const setGrab = (pickX: number, pickY: number, tx: number, ty: number, u: number) => {
      if (this.body.grabbed < 0) {
        this.raycaster.setFromCamera(new THREE.Vector2(pickX, pickY), this.ctx.camera)
        const hit = this.raycaster.intersectObject(this.mesh)[0]
        const vi = hit ? this.body.pickVertex(this.raycaster.ray) : -1
        if (vi >= 0 && hit) {
          this.body.beginGrab(vi, hit.point)
          this.demoIdx = vi
        }
      } else {
        const start = new THREE.Vector3(
          this.body.rest[this.demoIdx * 3],
          this.body.rest[this.demoIdx * 3 + 1],
          this.body.rest[this.demoIdx * 3 + 2],
        )
        const e = u * u * (3 - 2 * u)
        this.body.moveGrab(new THREE.Vector3(start.x + tx * e, start.y + ty * e, start.z))
      }
    }
    if (T >= 4.0 && T < 5.4) setGrab(0.08, 0.12, -0.9, 3.4, (T - 4.0) / 1.4)
    else if (T >= 5.4 && T < 5.45) this.body.endGrab()
    else if (T >= 6.6 && T < 7.5) setGrab(-0.25, 0.0, -3.8, 3.6, (T - 6.6) / 0.9)
    else if (T >= 7.5 && T < 7.55) this.body.endGrab()
  }

  update(_t: number, dt: number) {
    // 设置 → 物理
    this.body.params.stiffness = 0.1 + ((settings.firmness - 0.5) / 2.0) * 0.33
    this.body.params.damping = settings.damping
    this.body.params.paused = settings.paused

    if (commands.reset) {
      commands.reset = false
      this.body.reset()
    }
    if (commands.nudge) {
      commands.nudge = false
      const a = this.ctx.rng() * Math.PI * 2
      this.body.nudge(Math.cos(a), Math.sin(a), 0.07)
    }

    // 配色渐变
    if (settings.preset !== this.presetTo) {
      this.presetFrom = this.presetTo
      this.presetTo = settings.preset
      this.presetK = 0
    }
    if (this.presetK < 1) {
      this.presetK = Math.min(1, this.presetK + dt / 0.5)
      applyPreset(this.mat, this.innerMat, this.coreShade.material as THREE.SpriteMaterial, this.rimMat, this.presetFrom, this.presetTo, this.presetK)
    }

    // 形状切换: 直接切换 (用户要求, 无形变过渡) — 瞬间重置为新形状静止态, 零能量注入;
    // 快速连续切换也不会累积能量把标本弹飞。果柄仅苹果形态。
    if (settings.shape !== this.shape) {
      this.shape = settings.shape
      this.body.setShape(settings.shape, true)
      this.stem.visible = settings.shape === 'apple'
    }

    this.wire.visible = settings.showMesh

    // 时间缩放 (¼ speed)
    const scale = settings.quarter ? 0.25 : 1
    if (this.ctx.forensic.autodemo && this.demoArmed) this.autodemo(dt)
    this.body.step(dt * scale)
    this.body.syncGeometry()
    this.body.syncShells()
    this.rimMesh.visible = !settings.showMesh
    this.innerMesh.visible = !settings.showMesh

    // 果柄跟随刚体位姿
    this.stem.position
      .copy(this.body.bodyCom)
      .add(_v1.set(0, this.body.appleTopY, 0).applyQuaternion(this.body.bodyQuat))
    this.stem.quaternion.copy(this.body.bodyQuat)

    // 抓取点白点
    if (this.body.grabbed >= 0) {
      const k = this.body.grabbed * 3
      this.grabDot.position.set(this.body.pos[k], this.body.pos[k + 1], this.body.pos[k + 2])
      this.grabDot.visible = true
    } else {
      this.grabDot.visible = false
    }

    // 影子跟随足迹
    this.body.footprint(this.fp)
    const w = this.fp.maxX - this.fp.minX
    const d = this.fp.maxZ - this.fp.minZ
    const h = Math.max(0, this.fp.height - 1.0)
    // 星星: 平底直壁无悬挑遮挡, 近侧阴影暗带全程可见, 且底部本体偏暗 (mint deep + 掠射衰减),
    // 按 bbox 放大 1.2×/1.3× 会把底边与阴影连成一片 ("沉没"感) — 收紧到贴轮廓并减弱
    const flat = this.shape === 'star'
    this.shadow.position.set(
      (this.fp.minX + this.fp.maxX) / 2,
      0.004,
      (this.fp.minZ + this.fp.maxZ) / 2 + (flat ? 0.02 : 0.12),
    )
    const grow = 1 + h * 0.05
    this.shadow.scale.set(
      Math.max(0.8, w * (flat ? 0.94 : 1.2) * grow),
      Math.max(0.6, d * (flat ? 1.04 : 1.3) * grow),
      1,
    )
    ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.min(
      1,
      (flat ? 0.82 : 1.05) * Math.max(0.12, 1 - h * 0.3),
    )

    // 中心加深精灵跟随 (面向相机)
    _v2.subVectors(this.ctx.camera.position, this.body.bodyCom).normalize()
    this.coreShade.position.copy(this.body.bodyCom).addScaledVector(_v2, -0.5)
    this.coreShade.scale.set(w * 0.98, d * 0.98 + (h + 1) * 0.32, 1)

    // 脸: 嵌入前表面 86% 深度处, 始终面向相机; 果冻形变时深度实时跟随。
    // 侧立保护: 沿视线方向计算身体厚度/轮廓比, 比值小 (薄边朝向相机) 时脸缩回体内,
    // 避免五官悬空渲染到本体轮廓之外。必须用实测粒子几何 — 旋转估计 q 在拉伸/晃动
    // 时会暂时偏离真实朝向, 用它判会误隐藏 (用户报告拉伸瞬间脸消失);
    // 实测比值对站立姿态同样正确 (面朝相机比值 ≈1.0, 远高于阈值)。
    _v2.subVectors(this.ctx.camera.position, this.body.bodyCom).normalize()
    let maxF = -Infinity
    let minF = Infinity
    let maxPerp2 = 0
    // 脸部前表面深度剖面: 视线轴周围 ~0.55 盘面按 5×5 bin 采样各处前表面 (bin 内最大
    // 视线距离)。斜面上侧向偏移处 (腮红 ±0.44) 表面会显著后退, 平面脸盘若锚在最高点,
    // 侧向元素会戳出表面完全暴露在折射壳外 (用户: 腮红像贴纸浮空) — 锚点取最深 bin。
    const bins = this.faceBins
    bins.fill(-Infinity)
    {
      const p = this.body.pos
      const c = this.body.bodyCom
      // u = normalize(view × ẑ 近似) — 视线不与竖直平行时用 (v.y, -v.x, 0)
      let ux = _v2.y, uy = -_v2.x, uz = 0
      const ul = Math.hypot(ux, uy, uz) || 1
      ux /= ul; uy /= ul
      // w = view × u
      const wx = _v2.y * uz - _v2.z * uy
      const wy = _v2.z * ux - _v2.x * uz
      const wz = _v2.x * uy - _v2.y * ux
      const localR2 = 0.55 * 0.55
      for (let i = 0; i < this.body.count; i++) {
        const k = i * 3
        const rx = p[k] - c.x, ry = p[k + 1] - c.y, rz = p[k + 2] - c.z
        const d = rx * _v2.x + ry * _v2.y + rz * _v2.z
        if (d > maxF) maxF = d
        if (d < minF) minF = d
        const perp2 = rx * rx + ry * ry + rz * rz - d * d
        if (perp2 > maxPerp2) maxPerp2 = perp2
        if (perp2 <= localR2 && d > 0) {
          const a = rx * ux + ry * uy + rz * uz
          const b = rx * wx + ry * wy + rz * wz
          const ia = Math.floor((a + 0.55) / 0.22)
          const ib = Math.floor((b + 0.55) / 0.22)
          if (ia >= 0 && ia < 5 && ib >= 0 && ib < 5) {
            const bi = ia * 5 + ib
            if (d > bins[bi]) bins[bi] = d
          }
        }
      }
    }
    let faceDeep = Infinity
    let faceCenter = -Infinity
    for (let i = 0; i < 25; i++) {
      if (bins[i] > -Infinity && bins[i] < faceDeep) faceDeep = bins[i]
      // 中心 bin (行 2 列 2)
      if (i === 12 && bins[i] > -Infinity) faceCenter = bins[i]
    }
    if (faceCenter === -Infinity) faceCenter = maxF
    const perp = Math.sqrt(maxPerp2)
    // 朝向比: 前表面距离 / 轮廓半径。球形正面 ≈ 1.0, 薄边朝向相机 ≈ 0.6-0.75
    const ratio = maxF / (perp || 1)
    const faceFade = Math.max(0, Math.min(1, (ratio - 0.72) / 0.2))
    // 脸的深度锚点: 脸区前表面最深处 (兜底中心/全局) — 保证含侧向腮红的整张脸盘
    // 都嵌在体内被折射壳覆盖; 大小按中心深度, 斜面上不因角落突出而胀大
    const front = Math.min(faceCenter, faceDeep === Infinity ? faceCenter : faceDeep) * 0.94
    this.face.position.copy(this.body.bodyCom).addScaledVector(_v2, front * 0.86)
    this.face.lookAt(this.ctx.camera.position)
    this.face.scale.setScalar(faceCenter * 0.92 * (0.3 + 0.7 * faceFade))
    this.face.visible = faceFade > 0.1

    // 读数 ~8Hz
    this.statTimer += dt
    if (this.statTimer > 0.12) {
      this.statTimer = 0
      const volume = Math.min(99.9, Math.max(93.5, this.body.volumeRatio * 100 - 2.8))
      const ke = settings.paused ? 0 : Math.min(45, Math.max(0.1, Math.pow(this.body.speed, 2.4)))
      hudStore.set({ volume: Math.round(volume * 10) / 10, ke: Math.round(ke * 10) / 10, shape: settings.shape })
    }
  }

  dispose() {
    this.disposers.forEach((d) => d())
    this.ctx.scene.clear()
    this.body.dispose() // 主/内胆/亮缘三层几何
    this.mat.dispose()
    this.innerMat.map?.dispose()
    this.innerMat.dispose()
    this.rimMat.dispose()
    const csMat = this.coreShade.material as THREE.SpriteMaterial
    csMat.map?.dispose()
    csMat.dispose()
    const shMat = this.shadow.material as THREE.MeshBasicMaterial
    shMat.map?.dispose()
    shMat.dispose()
    this.shadow.geometry.dispose()
    this.stem.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
    })
    this.ground.geometry.dispose()
    ;(this.ground.material as THREE.Material).dispose()
  }
}

export function createScene(): SceneModule {
  return new JellyScene()
}
