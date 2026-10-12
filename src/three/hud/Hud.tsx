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
      <div className="font-display text-[34px] text-[#3a1024] max-md:text-[26px]">软物质，来袭。</div>
      <div className="mx-auto mt-4 h-[2px] w-10 bg-[#3a1024]/60" />
      <div className="mt-4 text-[14px] text-[#5f6163]">正在准备材料，和它小小的运动定律……</div>
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
    // 手机: 挂到左上标题块 (标语) 下方, 避开右上徽标行与大标题; 214px 对应标题块固定内容的总高
    <div className="mt-5 flex gap-10 max-md:fixed max-md:left-5 max-md:right-auto max-md:top-[214px] max-md:mt-0 max-md:gap-6">
      <Stat v={MASS_BY_SHAPE[s.shape]} l="MASS" testid="stat-mass" />
      <Stat v={`${s.volume.toFixed(1)} %`} l="REST VOLUME" testid="stat-volume" />
      <Stat v={`${s.ke.toFixed(1)} mJ`} l="KINETIC ENERGY" testid="stat-energy" />
    </div>
  )
}

export default function Hud() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      <div className="absolute left-[57px] top-[36px] max-md:left-5 max-md:top-5">
        <div className="text-[11px] font-semibold tracking-[0.22em] text-[#55575a]">
          MATERIAL STUDIES&ensp;/&ensp;NO. 001
        </div>
        <h1 className="font-display mt-2 text-[100px] leading-[0.95] font-bold text-[#23262a] max-md:mt-1.5 max-md:text-[48px]">
          软
          <br />
          物质。
        </h1>
        <p className="mt-6 text-[13px] leading-[1.55] text-[#55575a] max-md:mt-3 max-md:text-[12px]">
          一点重力。
          <br />
          一点光。
          <br />
          一块很软的固体。
        </p>
      </div>

      <div className="absolute right-[33px] top-[28px] flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#3a3b3e] max-md:right-5 max-md:top-[46px]">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#2e9e63]" />
        <span>SIMULATION&ensp;·&ensp;LIVE</span>
      </div>

      {/* 用户要求(手机适配): 操作提示在手机上也保留, 放到折叠控制卡上方; 抽屉展开时经 App.css 的 :has 规则淡出避让 */}
      <div className="hud-hints absolute bottom-[24px] left-[60px] max-md:left-5 max-md:bottom-[124px]">
        <div className="text-[14px] font-semibold text-[#2a2c2e] max-md:text-[13px]">抓住，然后放手。</div>
        <div className="text-[14px] text-[#6b6d6f] max-md:text-[13px]">拖动果冻，感受它的惯性。</div>
        <div className="text-[14px] text-[#6b6d6f] max-md:text-[13px]">抛出去——它知道怎么落地。</div>
        <Stats />
      </div>

      <div className="absolute bottom-[30px] left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-[0.2em] text-[#8a8c8d] max-md:hidden">
        SHAPE MATCHING&ensp;·&ensp;REFRACTED LIGHT&ensp;·&ensp;3,185 PARTICLES
      </div>

      <SpecimenPanel />
      <IntroOverlay />
    </div>
  )
}
