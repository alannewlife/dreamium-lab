import * as THREE from 'three'
import type { PresetId } from './bus'

// 三种“标本”配色: tint = 壳层基色, deep = 衰减/内胆深色, dot = 面板色点
export const PRESETS: Record<PresetId, { tint: number; deep: number; dot: string; label: string }> = {
  berry: { tint: 0xffdcee, deep: 0xf0258c, dot: '#c2185b', label: 'Berry' },
  mint: { tint: 0xc9f8db, deep: 0x1cc465, dot: '#1e9e50', label: 'Mint' },
  honey: { tint: 0xffecb8, deep: 0xefa50a, dot: '#d99a26', label: 'Honey' },
}

// 背透光 (fake SSS): 光穿过糖体的方向性辉光 — 透过 onBeforeCompile 注入壳层材质
export const sssUniforms = {
  uSSSColor: { value: new THREE.Color(PRESETS.berry.deep) },
  // 背光灯光线行进方向 (光位 (-3,4,-7) → 场景中心)
  uLightDir: { value: new THREE.Vector3(3, -4, 7).normalize() },
}

// 通透晶莹取向: 低粗糙度清晰折射 + 弱吸收 + 近零自发光, 内胆暗带提供深度
export function createJellyMaterial(): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(PRESETS.berry.tint),
    metalness: 0,
    roughness: 0.06,
    transmission: 1,
    thickness: 0.9,
    ior: 1.45,
    attenuationColor: new THREE.Color(PRESETS.berry.deep),
    attenuationDistance: 1.85,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.0,
    specularIntensity: 1,
  })
  mat.emissive = new THREE.Color(PRESETS.berry.deep)
  mat.emissiveIntensity = 0.07
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sssUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nuniform vec3 uSSSColor;\nuniform vec3 uLightDir;',
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  {
    // 背透光: 视线顺着来光方向穿过糖体时, 边缘区域透出糖果色辉光
    vec3 V = normalize(cameraPosition - vWPos);
    float through = pow(max(dot(V, uLightDir), 0.0), 3.0);
    float rimGate = 1.0 - abs(dot(normalize(vWNormal), V));
    gl_FragColor.rgb += uSSSColor * through * (0.3 + 0.7 * rimGate) * 0.4;
  }`,
      )
  }
  return mat
}

// 配色切换: 壳层 color/attenuation 与内胆 color 同步 lerp
export function applyPreset(
  mat: THREE.MeshPhysicalMaterial,
  inner: THREE.MeshBasicMaterial | null,
  shade: THREE.SpriteMaterial | null,
  rim: THREE.ShaderMaterial | null,
  from: PresetId,
  to: PresetId,
  k: number,
) {
  const a = PRESETS[from]
  const b = PRESETS[to]
  mat.color.setHex(a.tint).lerp(new THREE.Color(b.tint), k)
  mat.attenuationColor.setHex(a.deep).lerp(new THREE.Color(b.deep), k)
  mat.emissive.setHex(a.deep).multiplyScalar(0.07).lerp(new THREE.Color(b.deep).multiplyScalar(0.07), k)
  sssUniforms.uSSSColor.value.setHex(a.deep).lerp(new THREE.Color(b.deep), k)
  if (rim)
    (rim.uniforms.uColor.value as THREE.Color)
      .setHex(a.deep)
      .lerp(new THREE.Color(0xffffff), 0.35)
      .lerp(new THREE.Color(b.deep).lerp(new THREE.Color(0xffffff), 0.35), k)
  if (inner)
    inner.color
      .setHex(a.deep)
      .multiplyScalar(0.95)
      .lerp(new THREE.Color(b.deep).multiplyScalar(0.95), k)
  if (shade)
    shade.color
      .setHex(a.deep)
      .multiplyScalar(0.95)
      .lerp(new THREE.Color(b.deep).multiplyScalar(0.95), k)
}

// 中心加深渐变 (内阴影, 灰度 — 颜色由 SpriteMaterial 按 preset 着色): 中间暗、边缘透亮
export function createCoreShadeTexture(): THREE.CanvasTexture {
  const s = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(70,70,70,0.52)')
  grad.addColorStop(0.55, 'rgba(135,135,135,0.26)')
  grad.addColorStop(0.8, 'rgba(200,200,200,0.08)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 地面接触阴影: 径向渐变贴图
export function createShadowTexture(): THREE.CanvasTexture {
  const s = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(25,23,21,0.72)')
  grad.addColorStop(0.55, 'rgba(25,23,21,0.3)')
  grad.addColorStop(1, 'rgba(25,23,21,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 内胆暗带贴图: 灰度斑块 (乘以内胆颜色得到深色内部密度变化)
export function createBandsTexture(): THREE.CanvasTexture {
  const s = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const g = cv.getContext('2d')!
  g.fillStyle = '#000000'
  g.fillRect(0, 0, s, s)
  const blobs: Array<[number, number, number, number]> = [
    [70, 88, 92, 0.5],
    [176, 60, 72, 0.45],
    [128, 168, 104, 0.42],
    [40, 190, 74, 0.39],
    [214, 176, 80, 0.4],
  ]
  for (const [x, y, r, a] of blobs) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, `rgba(150,150,150,${a})`)
    rg.addColorStop(1, 'rgba(150,150,150,0)')
    g.fillStyle = rg
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  // 亮色焦散纹理: 体内游动的白色光纹 (通透感来源)
  g.lineCap = 'round'
  const streaks: Array<[number, number, number, number, number, number, number]> = [
    [96, 190, 120, 120, 150, 40, 9],
    [170, 210, 150, 150, 210, 130, 7],
    [60, 60, 110, 110, 40, 130, 6],
    [190, 80, 150, 150, 235, 30, 8],
    [130, 30, 160, 160, 100, 210, 5],
  ]
  for (const [x0, y0, cx, cy, x1, y1, w] of streaks) {
    g.strokeStyle = 'rgba(255,255,255,0.8)'
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x0, y0)
    g.quadraticCurveTo(cx, cy, x1, y1)
    g.stroke()
  }
  for (const [x, y, r] of [
    [150, 100, 16],
    [80, 150, 13],
    [210, 140, 12],
  ] as Array<[number, number, number]>) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, 'rgba(255,255,255,0.9)')
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = rg
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const vgrad = g.createLinearGradient(0, 0, 0, s)
  vgrad.addColorStop(0, 'rgba(255,255,255,0.4)')
  vgrad.addColorStop(1, 'rgba(70,70,70,0.3)')
  g.fillStyle = vgrad
  g.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
