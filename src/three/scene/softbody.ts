import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'
import type { ShapeId } from './bus'

// 热循环复用临时对象 (避免每帧/每子步分配 → GC 卡顿)
const _tmpQ = new THREE.Quaternion()
const _tmpV = new THREE.Vector3()

// Shape-matching 软体: 粒子 = 网格顶点, Verlet 积分 + 最优旋转目标弹簧 +
// 地面碰撞 + 全局体积约束 + 抓取强弹簧。参考 Müller et al. "Shape Matching" (2005)。

export interface SoftParams {
  stiffness: number // 每子步形状匹配增益 (firmness kPa 映射)
  damping: number   // 1/s
  paused: boolean
}

const GROUND_Y = 0
const GRAVITY = -9.0

export class SoftBody {
  readonly geometry: THREE.BufferGeometry
  readonly count: number
  readonly rest: Float32Array
  restVolume: number = 0
  pos: Float32Array
  prev: Float32Array
  grabbed = -1
  grabTarget = new THREE.Vector3()

  params: SoftParams = { stiffness: 0.19, damping: 3, paused: false }

  private restC = new THREE.Vector3()
  private com = new THREE.Vector3()
  private q = new THREE.Quaternion()
  private idx!: ArrayLike<number>
  private readonly dirs: Float32Array
  private volume = 0
  private meanSpeed = 0
  private calmT = 0 // 持续低于 1.0 速度的累计时间 (星星站立微颤的延迟强沉降用)
  private noise: (x: number, y: number, z: number) => number

  shape: ShapeId = 'apple'

  // 各形态共用几何尺度
  private readonly a: number
  constructor(a = 1.38) {
    this.a = a
    const geo = new THREE.SphereGeometry(1, 64, 48)
    this.geometry = geo
    const attr = geo.getAttribute('position') as THREE.BufferAttribute
    this.count = attr.count
    this.pos = attr.array as Float32Array
    // 单位球方向快照: pos 之后会被物理覆写, rest 生成器只读这份 pristine 方向
    this.dirs = new Float32Array(this.pos)
    this.noise = createNoise3D(() => 0.4221)
    this.rest = new Float32Array(this.count * 3)
    this.prev = new Float32Array(this.count * 3)
    this.idx = geo.getIndex()!.array as ArrayLike<number>
    // 固定包围球: 变形后自动计算的 boundingSphere 会过期, 导致抛离原点后 raycast 误剔除
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 12)
    this.setShape('apple', true)
  }

  // 切换静止形状: 直接重置为新形状静止态 (用户要求, 无过渡); 切换即释放抓取
  setShape(shape: ShapeId, reset = false) {
    this.shape = shape
    this.grabbed = -1
    this.makeRest(shape)
    if (reset) {
      this.pos.set(this.rest)
      this.prev.set(this.rest)
      // 姿态一并归位: 残留的旧 q 会让 upright 把刚归位的形状拧歪 (苹果果柄朝向)
      this.q.identity()
      // 星星默认站立 (用户终版): 平躺 rest 绕 X 轴 +90° 立起, 盘面正对相机
      if (shape === 'star') this.standUp()
    }
    let cx = 0, cy = 0, cz = 0
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      cx += this.rest[k]; cy += this.rest[k + 1]; cz += this.rest[k + 2]
    }
    this.restC.set(cx / this.count, cy / this.count, cz / this.count)
    this.restVolume = SoftBody.volumeOf(this.rest, this.idx)
    this.volume = this.restVolume
  }

  // rest 生成器: 固定球面拓扑方向 (dirs 快照) → 各形状的目标半径/位置
  private makeRest(shape: ShapeId) {
    const a = this.a
    const out = this.rest
    const d = this.dirs
    for (let i = 0; i < this.count; i++) {
      const j = i * 3
      const dx = d[j], dy = d[j + 1], dz = d[j + 2]
      const mu = dy
      let px = 0, py = 0, pz = 0
      if (shape === 'apple') {
        // 苹果: 半径随仰角调制 — 顶部果柄凹窝 + 赤道隆起 + 浅底窝
        let r =
          1 +
          0.1 * (1 - mu * mu) -
          0.5 * Math.pow(Math.max(0, mu), 16) -
          0.16 * Math.pow(Math.max(0, -mu), 16) -
          0.06 * Math.pow(Math.max(0, -mu), 2)
        r *= 1 + 0.018 * this.noise(dx * 2.2 + 10, dy * 2.2, dz * 2.2)
        px = dx * r * a
        py = dy * r * a + 0.9 * a // 底部触地
        pz = dz * r * a
      } else if (shape === 'star') {
        // 五角星: 圆基五瓣调制 (五角完全均匀) × 平顶平底直壁, 厚度均匀。
        // rest 保持平躺几何 (材质/脸/内胆等视觉系统均按此姿态调校);
        // "默认站立"由 spawn 时绕 X 轴 +90° 的初始旋转给出 (见 standUp), 不改几何。
        const theta = Math.atan2(dz, dx)
        const lobe = 1 + 0.15 * Math.pow(Math.abs(Math.cos(2.5 * theta - Math.PI / 2)), 2.0)
        const R = 0.95 * lobe
        const T = 0.8
        const w = 0.55
        let r: number
        let y0: number
        const a = Math.abs(mu)
        if (a <= w) {
          r = R // 侧壁: 全半径, y ∈ (-T, T)
          y0 = (mu / w) * T
        } else {
          const t = (a - w) / (1 - w)
          r = R * Math.cos((t * Math.PI) / 2) // 顶/底面: 半径 R→0 铺盘
          y0 = (mu >= 0 ? 1 : -1) * T * (1 - (mu >= 0 ? 0.1 : 0) * t * t) // 底面平, 顶面微穹
        }
        const rl = Math.hypot(dx, dz)
        px = rl > 1e-4 ? (dx / rl) * r : 0
        pz = rl > 1e-4 ? (dz / rl) * r : 0
        py = y0 + T
        const lump = 1 + 0.01 * this.noise(dx * 2.6 + 10, dy * 2.6, dz * 2.6)
        px *= lump
        pz *= lump
        py += (lump - 1) * 0.3
      } else {
        // 方块: 超椭球 (圆角方糖)
        const n = 6, ea = 1.22, eb = 0.98, ec = 1.22
        const ssum =
          Math.pow(Math.abs(dx) / ea, n) +
          Math.pow(Math.abs(dy) / eb, n) +
          Math.pow(Math.abs(dz) / ec, n)
        const r = Math.pow(ssum, -1 / n)
        const lump = 1 + 0.012 * this.noise(dx * 2.6 + 10, dy * 2.6, dz * 2.6)
        px = dx * r * ea * lump
        py = dy * r * eb * lump + eb // 底面触地
        pz = dz * r * ec * lump
      }
      out[j] = px
      out[j + 1] = py
      out[j + 2] = pz
    }
  }

  static volumeOf(p: Float32Array, idx: ArrayLike<number>): number {
    let vol = 0
    for (let k = 0; k < idx.length; k += 3) {
      const i = idx[k] * 3, j = idx[k + 1] * 3, m = idx[k + 2] * 3
      const ax = p[i], ay = p[i + 1], az = p[i + 2]
      const bx = p[j], by = p[j + 1], bz = p[j + 2]
      const cx = p[m], cy = p[m + 1], cz = p[m + 2]
      vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    }
    return vol / 6
  }

  get volumeRatio(): number {
    return this.volume / this.restVolume
  }

  // 刚体位姿 (供果柄等装饰件跟随) — 返回内部引用, 只读使用 (copy 出去)
  get bodyCom(): THREE.Vector3 {
    return this.com
  }
  get bodyQuat(): THREE.Quaternion {
    return this.q
  }
  get appleTopY(): number {
    // 凹窝底部相对质心的偏移 (体空间)
    return (0.5 + 0.9) * this.a - this.restC.y
  }

  get speed(): number {
    return this.meanSpeed
  }

  // 光线拾取: 返回距光线最近且垂距 < 0.4 的顶点索引
  pickVertex(ray: THREE.Ray): number {
    const o = ray.origin, d = ray.direction
    let best = -1
    let bestAlong = Infinity
    const rel = new THREE.Vector3()
    for (let i = 0; i < this.count; i++) {
      rel.set(this.pos[i * 3] - o.x, this.pos[i * 3 + 1] - o.y, this.pos[i * 3 + 2] - o.z)
      const along = rel.dot(d)
      if (along <= 0) continue
      const perp2 = rel.lengthSq() - along * along
      if (perp2 < 0.16 && along < bestAlong) {
        bestAlong = along
        best = i
      }
    }
    return best
  }

  beginGrab(i: number, target: THREE.Vector3) {
    this.grabbed = i
    this.grabTarget.copy(target)
  }
  moveGrab(target: THREE.Vector3) {
    this.grabTarget.copy(target)
  }
  endGrab() {
    this.grabbed = -1
  }

  reset() {
    this.pos.set(this.rest)
    this.prev.set(this.rest)
    this.grabbed = -1
    this.q.identity()
    if (this.shape === 'star') this.standUp()
  }

  // 默认站立姿态: 平躺刚体绕质心绕 X 轴 +90° (厚度轴 +Y → +Z 正对相机, 一角朝上、
  // 两尖点地), p/prev 同步旋转 (速度中性, 零能量), q 同步为该姿态, 再整体抬到触地。
  // rest 几何保持平躺不变 — 材质/脸/内胆等视觉系统均按 rest 姿态调校。
  private standUp() {
    let cx = 0, cy = 0, cz = 0
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      cx += this.pos[k]; cy += this.pos[k + 1]; cz += this.pos[k + 2]
    }
    const c = this.com.set(cx / this.count, cy / this.count, cz / this.count)
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      const ry = this.pos[k + 1] - c.y, rz = this.pos[k + 2] - c.z
      this.pos[k + 1] = c.y - rz
      this.pos[k + 2] = c.z + ry
      const uy = this.prev[k + 1] - c.y, uz = this.prev[k + 2] - c.z
      this.prev[k + 1] = c.y - uz
      this.prev[k + 2] = c.z + uy
    }
    this.q.setFromAxisAngle(_tmpV.set(1, 0, 0), Math.PI / 2)
    let minY = Infinity
    for (let i = 0; i < this.count; i++) minY = Math.min(minY, this.pos[i * 3 + 1])
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      this.pos[k + 1] -= minY
      this.prev[k + 1] -= minY
    }
    c.y -= minY
  }

  nudge(dirX: number, dirZ: number, power: number) {
    for (let i = 0; i < this.count; i++) {
      this.prev[i * 3] -= dirX * power
      this.prev[i * 3 + 2] -= dirZ * power
    }
  }

  step(dt: number) {
    if (this.params.paused) {
      this.meanSpeed = 0
      return
    }
    this.ambient(dt)
    const dtc = Math.min(dt, 1 / 30)
    const sub = Math.max(1, Math.min(4, Math.round(dtc / (1 / 120))))
    const h = dtc / sub
    const damp = Math.exp(-(this.params.damping + 1.0) * h)
    const ghh = GRAVITY * h * h
    const alpha = this.params.stiffness
    const p = this.pos, pr = this.prev, rest = this.rest
    const n = this.count

    for (let s = 0; s < sub; s++) {
      // Verlet + 阻尼 + 重力
      for (let i = 0; i < n; i++) {
        const k = i * 3
        const vx = (p[k] - pr[k]) * damp
        const vy = (p[k + 1] - pr[k + 1]) * damp
        const vz = (p[k + 2] - pr[k + 2]) * damp
        pr[k] = p[k]; pr[k + 1] = p[k + 1]; pr[k + 2] = p[k + 2]
        p[k] += vx
        p[k + 1] += vy + ghh
        p[k + 2] += vz
      }

      // 质心 + 协方差 M = Σ q⊗(p-com)
      this.com.set(0, 0, 0)
      for (let i = 0; i < n; i++) {
        const k = i * 3
        this.com.x += p[k]; this.com.y += p[k + 1]; this.com.z += p[k + 2]
      }
      this.com.multiplyScalar(1 / n)
      const m = [0, 0, 0, 0, 0, 0, 0, 0, 0]
      for (let i = 0; i < n; i++) {
        const k = i * 3
        const qx = rest[k] - this.restC.x
        const qy = rest[k + 1] - this.restC.y
        const qz = rest[k + 2] - this.restC.z
        const dx = p[k] - this.com.x
        const dy = p[k + 1] - this.com.y
        const dz = p[k + 2] - this.com.z
        m[0] += qx * dx; m[1] += qx * dy; m[2] += qx * dz
        m[3] += qy * dx; m[4] += qy * dy; m[5] += qy * dz
        m[6] += qz * dx; m[7] += qz * dy; m[8] += qz * dz
      }

      // 迭代提取最优旋转 (残差旋转校正 q)
      const qq = this.q
      for (let it = 0; it < 5; it++) {
        const x2 = qq.x + qq.x, y2 = qq.y + qq.y, z2 = qq.z + qq.z
        const xx = qq.x * x2, xy = qq.x * y2, xz = qq.x * z2
        const yy = qq.y * y2, yz = qq.y * z2, zz = qq.z * z2
        const wx = qq.w * x2, wy = qq.w * y2, wz = qq.w * z2
        // R 列向量 (three.js 列主序旋转矩阵)
        const r1x = 1 - (yy + zz), r1y = xy + wz, r1z = xz - wy
        const r2x = xy - wz, r2y = 1 - (xx + zz), r2z = yz + wx
        const r3x = xz + wy, r3y = yz - wx, r3z = 1 - (xx + yy)
        // omega = r1×m1 + r2×m2 + r3×m3 (m_i 为 M 的列)
        const m1x = m[0], m1y = m[3], m1z = m[6]
        const m2x = m[1], m2y = m[4], m2z = m[7]
        const m3x = m[2], m3y = m[5], m3z = m[8]
        const ox = r1y * m1z - r1z * m1y + r2y * m2z - r2z * m2y + r3y * m3z - r3z * m3y
        const oy = r1z * m1x - r1x * m1z + r2z * m2x - r2x * m2z + r3z * m3x - r3x * m3z
        const oz = r1x * m1y - r1y * m1x + r2x * m2y - r2y * m2x + r3x * m3y - r3y * m3x
        const w = Math.sqrt(ox * ox + oy * oy + oz * oz) / n
        if (w < 1e-7) break
        const dq = _tmpQ.setFromAxisAngle(
          _tmpV.set(ox / (w * n), oy / (w * n), oz / (w * n)),
          Math.min(w, 0.35),
        )
        qq.premultiply(dq).normalize()
      }
      // 目标位置拉拽
      const x2 = qq.x + qq.x, y2 = qq.y + qq.y, z2 = qq.z + qq.z
      const xx = qq.x * x2, xy = qq.x * y2, xz = qq.x * z2
      const yy = qq.y * y2, yz = qq.y * z2, zz = qq.z * z2
      const wx = qq.w * x2, wy = qq.w * y2, wz = qq.w * z2
      const R = [
        1 - (yy + zz), xy + wz, xz - wy,
        xy - wz, 1 - (xx + zz), yz + wx,
        xz + wy, yz - wx, 1 - (xx + yy),
      ]
      for (let i = 0; i < n; i++) {
        const k = i * 3
        const qx = rest[k] - this.restC.x
        const qy = rest[k + 1] - this.restC.y
        const qz = rest[k + 2] - this.restC.z
        const gx = this.com.x + R[0] * qx + R[1] * qy + R[2] * qz
        const gy = this.com.y + R[3] * qx + R[4] * qy + R[5] * qz
        const gz = this.com.z + R[6] * qx + R[7] * qy + R[8] * qz
        p[k] += (gx - p[k]) * alpha
        p[k + 1] += (gy - p[k + 1]) * alpha
        p[k + 2] += (gz - p[k + 2]) * alpha
      }

      // 自立: 苹果/方块用扭矩 upright (果柄/体态回正)。星星不再有任何姿态外力 —
      // 默认站立由 rest 姿态直接给出, 之后完全交给物理 (曾经的舵机会与用户摆放拉锯
      // 造成周期性抽搐并最终把站立的星星抖倒, 已整体移除)。
      if (this.shape !== 'star') this.upright(h)

      // 质心 XZ 回中弹簧 (标本保持在画面中心; 同步 prev → 速度中性)
      {
        const k = 6.0 * h * h
        for (let i = 0; i < n; i++) {
          const kk = i * 3
          p[kk] -= this.com.x * k
          p[kk + 2] -= this.com.z * k
          pr[kk] -= this.com.x * k
          pr[kk + 2] -= this.com.z * k
        }
      }

      // 抓取约束: 半径内面片按衰减跟随 (拉出“肥”锥而非细针), 赢过形状匹配
      if (this.grabbed >= 0) {
        const g = this.grabbed * 3
        const gx = p[g], gy = p[g + 1], gz = p[g + 2]
        const R = 0.5
        for (let i = 0; i < n; i++) {
          const k = i * 3
          const dx = p[k] - gx, dy = p[k + 1] - gy, dz = p[k + 2] - gz
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 > R * R) continue
          const w = 1 - Math.sqrt(d2) / R
          const s = 0.55 * (0.3 + 0.7 * w)
          p[k] += (this.grabTarget.x - p[k]) * s
          p[k + 1] += (this.grabTarget.y - p[k + 1]) * s
          p[k + 2] += (this.grabTarget.z - p[k + 2]) * s
        }
      }

      // 地面碰撞 + 摩擦
      for (let i = 0; i < n; i++) {
        const k = i * 3
        if (p[k + 1] < GROUND_Y) {
          p[k + 1] = GROUND_Y
          pr[k] += (p[k] - pr[k]) * 0.4
          pr[k + 2] += (p[k + 2] - pr[k + 2]) * 0.4
          pr[k + 1] = p[k + 1] + (pr[k + 1] - p[k + 1]) * 0.12
        }
      }

      // 体积保持 (全局径向几何校正, 同步 prev: 不注入速度、不泵能量)
      // 每帧只在最后一个子步执行 — 全网格 O(三角形) 体积积分无需每子步跑
      if (s === sub - 1) {
        const vol = SoftBody.volumeOf(p, this.idx)
        this.volume = vol
        let corr = Math.cbrt(this.restVolume / Math.max(vol, 1e-6))
        corr = Math.min(1.02, Math.max(0.98, corr))
        if (Math.abs(corr - 1) > 0.0015) {
          const f = 1 + (corr - 1) * 0.5
          for (let i = 0; i < n; i++) {
            const k = i * 3
            p[k] = this.com.x + (p[k] - this.com.x) * f
            p[k + 1] = this.com.y + (p[k + 1] - this.com.y) * f
            p[k + 2] = this.com.z + (p[k + 2] - this.com.z) * f
            pr[k] = this.com.x + (pr[k] - this.com.x) * f
            pr[k + 1] = this.com.y + (pr[k + 1] - this.com.y) * f
            pr[k + 2] = this.com.z + (pr[k + 2] - this.com.z) * f
          }
        }
      }
    }

    // 全局限速: 防止约束迭代能量泵浦把苹果发射出去
    const vmax = 9 * h
    for (let i = 0; i < n; i++) {
      const k = i * 3
      const vx = p[k] - pr[k], vy = p[k + 1] - pr[k + 1], vz = p[k + 2] - pr[k + 2]
      const sp2 = vx * vx + vy * vy + vz * vz
      if (sp2 > vmax * vmax) {
        const f = vmax / Math.sqrt(sp2)
        pr[k] = p[k] - vx * f
        pr[k + 1] = p[k + 1] - vy * f
        pr[k + 2] = p[k + 2] - vz * f
      }
    }

    // 平均速率 (限速后计算, KE 读数反映真实速度)
    let sum = 0
    for (let i = 0; i < n; i++) {
      const k = i * 3
      const vx = p[k] - pr[k], vy = p[k + 1] - pr[k + 1], vz = p[k + 2] - pr[k + 2]
      sum += vx * vx + vy * vy + vz * vz
    }
    this.meanSpeed = Math.sqrt(sum / n) / h

    // 低速沉降: 静置时强阻尼, 保持端庄。阈值放宽到 1.0 — 贴地支撑(星星两尖点/软模式
    // 下的接触压缩)存在 ~0.3-0.9 速度单位的持续微振荡, 旧阈值 0.28 管不住即肉眼细颤 —
    // 但必须等"持续安静"才启用: 抛掷落地/松手回弹的余韵晃动速度也在该区间, 立即强阻尼
    // 会把弹跳感掐死。持续低于 1.0 达 1.2s (瞬态晃动已自然演完)后才升阈值, 全形态统一。
    if (this.meanSpeed >= 1.0) this.calmT = 0
    else this.calmT += dt
    const settleV = this.calmT > 1.2 ? 1.0 : 0.28
    if (this.meanSpeed < settleV && this.grabbed < 0) {
      for (let i = 0; i < n; i++) {
        const k = i * 3
        pr[k] += (p[k] - pr[k]) * 0.82
        pr[k + 1] += (p[k + 1] - pr[k + 1]) * 0.82
        pr[k + 2] += (p[k + 2] - pr[k + 2]) * 0.82
      }
    }

    // 舞台边界: 形变中松手可能把标本弹飞出画/雾外 (回中弹簧太慢追不上),
    // XZ 硬限位 + 速度中性平移, 保证标本永远留在画面里
    {
      const LIM = 4.2
      const ox = Math.abs(this.com.x) > LIM ? this.com.x - Math.sign(this.com.x) * LIM : 0
      const oz = Math.abs(this.com.z) > LIM ? this.com.z - Math.sign(this.com.z) * LIM : 0
      if (ox !== 0 || oz !== 0) {
        for (let i = 0; i < n; i++) {
          const k = i * 3
          p[k] -= ox
          p[k + 2] -= oz
          pr[k] -= ox
          pr[k + 2] -= oz
        }
        this.com.x -= ox
        this.com.z -= oz
      }
    }

    // NaN 自愈: 任何数值事故 → 立即重置到当前形状 (否则网格消失且永不恢复)
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) {
      this.reset()
    }
  }

  syncGeometry() {
    const attr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    this.geometry.computeVertexNormals()
  }

  // 内胆 / 轮缘壳几何 (同索引, 顶点相对质心缩放) — 透射壳内看到的结构 + 菲涅尔亮边载体
  readonly innerGeometry = new THREE.BufferGeometry()
  readonly rimGeometry = new THREE.BufferGeometry()

  buildShells() {
    this.innerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3))
    this.rimGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3))
    // 亮缘壳法线: 每帧按 (顶点-质心) 解析更新 (径向 blob 的精确法线)
    this.rimGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3))
    this.innerGeometry.setIndex(this.geometry.getIndex())
    this.rimGeometry.setIndex(this.geometry.getIndex())
    this.syncShells()
  }

  syncShells() {
    this.com.set(0, 0, 0)
    for (let i = 0; i < this.count; i++) {
      const j = i * 3
      this.com.x += this.pos[j]; this.com.y += this.pos[j + 1]; this.com.z += this.pos[j + 2]
    }
    this.com.multiplyScalar(1 / this.count)
    const inner = this.innerGeometry.getAttribute('position') as THREE.BufferAttribute
    const rim = this.rimGeometry.getAttribute('position') as THREE.BufferAttribute
    const rimN = this.rimGeometry.getAttribute('normal') as THREE.BufferAttribute
    const ai = inner.array as Float32Array
    const ar = rim.array as Float32Array
    const an = rimN.array as Float32Array
    // 内胆: 收缩 + 体"厚度轴"额外压缩, 形成中心深核。压缩轴跟随 q (体坐标 Y) —
    // 星星站立后厚度轴不再与世界 Y 重合, 按世界轴压会把宽度方向错压
    const q = this.q
    const x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z
    const xx = q.x * x2, xy = q.x * y2, xz = q.x * z2
    const yy = q.y * y2, yz = q.y * z2, zz = q.z * z2
    const wx = q.w * x2, wy = q.w * y2, wz = q.w * z2
    // R 列向量 (three.js 列主序旋转矩阵): 体 X/Y/Z 轴的世界方向
    const axx = 1 - (yy + zz), axy = xy + wz, axz = xz - wy
    const ayx = xy - wz, ayy = 1 - (xx + zz), ayz = yz + wx
    const azx = xz + wy, azy = yz - wx, azz = 1 - (xx + yy)
    const kx = 0.58, ky = 0.46, kz = 0.58
    for (let i = 0; i < this.count; i++) {
      const j = i * 3
      const vx = this.pos[j] - this.com.x
      const vy = this.pos[j + 1] - this.com.y
      const vz = this.pos[j + 2] - this.com.z
      const dx = vx * axx + vy * axy + vz * axz
      const dy = vx * ayx + vy * ayy + vz * ayz
      const dz = vx * azx + vy * azy + vz * azz
      ai[j] = this.com.x + axx * dx * kx + ayx * dy * ky + azx * dz * kz
      ai[j + 1] = this.com.y + axy * dx * kx + ayy * dy * ky + azy * dz * kz
      ai[j + 2] = this.com.z + axz * dx * kx + ayz * dy * ky + azz * dz * kz
      ar[j] = this.com.x + (this.pos[j] - this.com.x) * 1.02
      ar[j + 1] = this.com.y + (this.pos[j + 1] - this.com.y) * 1.02
      ar[j + 2] = this.com.z + (this.pos[j + 2] - this.com.z) * 1.02
      const nx = ar[j] - this.com.x, ny = ar[j + 1] - this.com.y, nz = ar[j + 2] - this.com.z
      const nl = Math.hypot(nx, ny, nz) || 1
      an[j] = nx / nl
      an[j + 1] = ny / nl
      an[j + 2] = nz / nl
    }
    inner.needsUpdate = true
    rim.needsUpdate = true
    rimN.needsUpdate = true
  }

  // 常驻环境微颤: 低频相干噪声漂移 (世界空间采样, 无净扭矩), 让静置时保持轻微“呼吸”
  private ambientT = 0
  private ambient(dt: number) {
    this.ambientT += dt
    const t = this.ambientT * 0.35
    const p = this.pos
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      const wx = p[k] * 0.8, wy = p[k + 1] * 0.8, wz = p[k + 2] * 0.8
      p[k] += this.noise(wx + t, wy, wz) * 0.0026
      p[k + 1] += this.noise(wx, wy + t, wz + 7) * 0.0022
      p[k + 2] += this.noise(wx, wy, wz + t + 13) * 0.0026
    }
  }

  // 苹果/方块自立扭矩: 倾倒超过 ~20° 时轻柔转回正立姿态 (死区防静置与地面打架)。
  // 回正旋转前记录最低点、旋转后按落差整体上抬 (p/pr 同步, 速度中性): 绕质心旋转会把
  // 支撑点压入地面被碰撞钳制抵消 — 立在棱/角上时表现为扭矩与地面原地拉锯的持续抖动
  // (用户报告方块自抖), 上抬补偿保证回正真正生效, 干脆倒回平稳姿态。
  private upright(h: number) {
    const q = this.q
    // 符号归一 (q 与 -q 同旋转, 但 w<0 时轴向量反向, 会把校正转反方向)
    let qw = q.w, qx = q.x, qy = q.y, qz = q.z
    if (qw < 0) {
      qw = -qw; qx = -qx; qy = -qy; qz = -qz
    }
    const w = 2 * Math.acos(Math.min(1, qw))
    if (w < 0.35) return
    const s = Math.sqrt(1 - qw * qw) || 1e-6
    const p = this.pos
    let minY = Infinity
    for (let i = 0; i < this.count; i++) {
      const y = p[i * 3 + 1]
      if (y < minY) minY = y
    }
    this.rotateAll(_tmpQ.setFromAxisAngle(_tmpV.set(qx / s, qy / s, qz / s), -w * Math.min(1, 1.6 * h)))
    let minY2 = Infinity
    for (let i = 0; i < this.count; i++) {
      const y = p[i * 3 + 1]
      if (y < minY2) minY2 = y
    }
    const lift = minY - minY2
    if (lift > 0) {
      for (let i = 0; i < this.count; i++) {
        const k = i * 3
        p[k + 1] += lift
        this.prev[k + 1] += lift
      }
      this.com.y += lift
    }
  }

  // 把整个刚体 (p 与 prev) 绕质心旋转 corr — 速度中性, 不注入能量
  private rotateAll(corr: THREE.Quaternion) {
    const p = this.pos
    const pr = this.prev
    const c = this.com
    const cw = corr.w, cx = corr.x, cy = corr.y, cz = corr.z
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      const rx = p[k] - c.x, ry = p[k + 1] - c.y, rz = p[k + 2] - c.z
      // v' = v + w·t + q×t, t = 2(q×v)
      const tx = 2 * (cy * rz - cz * ry)
      const ty = 2 * (cz * rx - cx * rz)
      const tz = 2 * (cx * ry - cy * rx)
      p[k] = c.x + rx + cw * tx + (cy * tz - cz * ty)
      p[k + 1] = c.y + ry + cw * ty + (cz * tx - cx * tz)
      p[k + 2] = c.z + rz + cw * tz + (cx * ty - cy * tx)
      // 同步旋转 prev
      const ux = pr[k] - c.x, uy = pr[k + 1] - c.y, uz = pr[k + 2] - c.z
      const sx = 2 * (cy * uz - cz * uy)
      const sy = 2 * (cz * ux - cx * uz)
      const sz = 2 * (cx * uy - cy * ux)
      pr[k] = c.x + ux + cw * sx + (cy * sz - cz * sy)
      pr[k + 1] = c.y + uy + cw * sy + (cz * sx - cx * sz)
      pr[k + 2] = c.z + uz + cw * sz + (cx * sy - cy * sx)
    }
  }

  // 影子足迹: XZ 包围盒 + 平均离地高度
  footprint(out: { minX: number; maxX: number; minZ: number; maxZ: number; height: number }) {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, hy = 0
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      if (this.pos[k] < minX) minX = this.pos[k]
      if (this.pos[k] > maxX) maxX = this.pos[k]
      if (this.pos[k + 2] < minZ) minZ = this.pos[k + 2]
      if (this.pos[k + 2] > maxZ) maxZ = this.pos[k + 2]
      hy += this.pos[k + 1]
    }
    out.minX = minX; out.maxX = maxX; out.minZ = minZ; out.maxZ = maxZ
    out.height = hy / this.count
  }

  // 沿给定世界方向的最大表面距离 (供脸部贴附到果冻前表面)
  frontDistAlong(dir: THREE.Vector3): number {
    let best = 0.4
    const p = this.pos
    const c = this.com
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      const d = (p[k] - c.x) * dir.x + (p[k + 1] - c.y) * dir.y + (p[k + 2] - c.z) * dir.z
      if (d > best) best = d
    }
    return best
  }

  dispose() {
    this.geometry.dispose()
    this.innerGeometry.dispose()
    this.rimGeometry.dispose()
  }
}
