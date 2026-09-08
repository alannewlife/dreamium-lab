import { useEffect, useState } from 'react'
import { hudStore, type HudState, type ShapeId } from '../scene/bus'
import SpecimenPanel from './SpecimenPanel'

// 各标本质量 (用户要求按形状区分; 切换时联动)
const MASS_BY_SHAPE: Record<ShapeId, string> = {
  star: '98.3 g',
  apple: '124.8 g',
  cube: '156.2 g',
}

// 加载覆盖层: 显示 ~1.3s 后 0.4s 淡出 (source 18.8–20.0s); ?introhold 取证钩子保持常显
function IntroOverlay() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>('show')
  const hold = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('introhold')
  useEffect(() => {
    if (hold) return
    const t1 = setTimeout(() => setPhase('fade'), 1300)
    const t2 = setTimeout(() => setPhase('gone'), 1780)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [hold])
  if (phase === 'gone') return null
  return (
    <div
      data-testid="intro-overlay"
      className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2 text-center transition-opacity duration-[420ms] ease-out"
      style={{ opacity: phase === 'show' ? 1 : 0 }}
    >
      <div className="font-display text-[34px] italic text-[#3a1024]">Soft matter, incoming.</div>
      <div className="mx-auto mt-4 h-[2px] w-10 bg-[#3a1024]/60" />
      <div className="mt-4 text-[14px] text-[#5f6163]">Preparing the material and its little laws of motion...</div>
    </div>
  )
}

function Stat({ v, l, testid }: { v: string; l: string; testid: string }) {
  return (
    <div>
      <div data-testid={testid} className="font-tech text-[17px] tracking-[0.04em] text-[#232527]">
        {v}
      </div>
      <div className="mt-1 text-[9px] font-semibold tracking-[0.18em] text-[#9a9c9d]">{l}</div>
    </div>
  )
}

function Stats() {
  const [s, setS] = useState<HudState>({ ...hudStore.get() })
  useEffect(() => hudStore.subscribe((v) => setS({ ...v })), [])
  return (
    <div className="mt-5 flex gap-10">
      <Stat v={MASS_BY_SHAPE[s.shape]} l="MASS" testid="stat-mass" />
      <Stat v={`${s.volume.toFixed(1)} %`} l="REST VOLUME" testid="stat-volume" />
      <Stat v={`${s.ke.toFixed(1)} mJ`} l="KINETIC ENERGY" testid="stat-energy" />
    </div>
  )
}

export default function Hud() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      <div className="absolute left-[57px] top-[36px]">
        <div className="text-[11px] font-semibold tracking-[0.22em] text-[#55575a]">
          MATERIAL STUDIES&ensp;/&ensp;NO. 001
        </div>
        <h1 className="font-display mt-2 text-[100px] leading-[0.95] font-medium text-[#23262a]">
          Soft
          <br />
          <span className="italic">Matter.</span>
        </h1>
        <p className="mt-6 text-[13px] leading-[1.55] text-[#55575a]">
          A little gravity.
          <br />
          A little light.
          <br />
          A very soft solid.
        </p>
      </div>

      <div className="absolute right-[33px] top-[28px] flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#3a3b3e]">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#2e9e63]" />
        <span>SIMULATION&ensp;·&ensp;LIVE</span>
      </div>

      <div className="absolute bottom-[24px] left-[60px]">
        <div className="text-[14px] font-semibold text-[#2a2c2e]">Take hold. Let go.</div>
        <div className="text-[14px] text-[#6b6d6f]">Drag the jelly. Feel the inertia.</div>
        <div className="text-[14px] text-[#6b6d6f]">Toss it — it knows how to fall.</div>
        <Stats />
      </div>

      <div className="absolute bottom-[30px] left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-[0.2em] text-[#8a8c8d]">
        SHAPE MATCHING&ensp;·&ensp;REFRACTED LIGHT&ensp;·&ensp;3,185 PARTICLES
      </div>

      <SpecimenPanel />
      <IntroOverlay />
    </div>
  )
}
