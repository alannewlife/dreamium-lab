import { createHudStore } from '../engine/kit/hudBridge'

// UI → scene 单向设置总线 + scene → UI 读数桥
export type PresetId = 'berry' | 'mint' | 'honey'
export type ShapeId = 'apple' | 'star' | 'cube'

// 顺序: 星星置首 (用户要求, 与苹果对调)
export const SHAPES: Array<{ id: ShapeId; label: string }> = [
  { id: 'star', label: 'Star' },
  { id: 'apple', label: 'Apple' },
  { id: 'cube', label: 'Cube' },
]

// 形状↔配色绑定 (用户简化: 苹果红 / 星星绿 / 方块黄, 一行胶囊同时切换)
export const SHAPE_PRESET: Record<ShapeId, PresetId> = {
  apple: 'berry',
  star: 'mint',
  cube: 'honey',
}

export interface Settings {
  firmness: number // kPa, 0.5–2.5
  damping: number  // 1/s, 0.5–10
  preset: PresetId
  shape: ShapeId
  quarter: boolean
  showMesh: boolean
  paused: boolean
}

// URL 参数可预置 firmness / shape (验证用确定性状态)
const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
const fq = parseFloat(q.get('firmness') ?? '')
const sq = q.get('shape')
// 默认形态 = 星星 (用户要求: 初始加载即站立星星; 无 ?shape= 参数时)
const shapeOk: ShapeId = sq === 'star' || sq === 'cube' || sq === 'apple' ? sq : 'star'

export const settings: Settings = {
  firmness: Number.isFinite(fq) ? Math.min(2.5, Math.max(0.5, fq)) : 1.2,
  damping: 3.0,
  preset: 'berry',
  shape: shapeOk,
  quarter: false,
  showMesh: false,
  paused: false,
}
// shape 由 URL 预置时, 配色跟随绑定 (苹果红/星星绿/方块黄)
settings.preset = SHAPE_PRESET[settings.shape]

// 场景消费后清除的一次性命令标志
export const commands = { nudge: false, reset: false }

export interface HudState {
  volume: number // % of rest volume
  ke: number     // mJ
  shape: ShapeId // 当前标本 (MASS 等按形状区分的读数用)
}

export const hudStore = createHudStore<HudState>({ volume: 96.5, ke: 0.1, shape: 'star' })
