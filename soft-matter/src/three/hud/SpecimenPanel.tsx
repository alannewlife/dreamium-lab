import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { settings, commands, SHAPES, SHAPE_PRESET, type PresetId } from '../scene/bus'
import { PRESETS } from '../scene/materials'

const fmtKpa = (v: number) => `${v >= 1 ? v.toFixed(1) : v.toFixed(2)} kPa`
const fmtInv = (v: number) => `${v.toFixed(1)} s⁻¹`

function JellySlider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  fmt: (v: number) => string
  testid: string
  onChange: (v: number) => void
}) {
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] text-[#2a2c2e]">{props.label}</span>
        <span className="font-tech text-[13px] tracking-[0.02em] text-[#2a2c2e]">{props.fmt(props.value)}</span>
      </div>
      <input
        data-testid={props.testid}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
        className="jelly-range mt-2 block w-full"
        style={{ '--fill': `${fill}%` } as CSSProperties}
        aria-label={props.label}
      />
    </div>
  )
}

function Check({ label, on, testid, onClick }: { label: string; on: boolean; testid: string; onClick: () => void }) {
  return (
    <button data-testid={testid} onClick={onClick} className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-[#2a2c2e]">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-[4px] border ${
          on ? 'border-[#26282a] bg-[#26282a]' : 'border-[#b9b7b3] bg-white'
        }`}
      >
        {on && (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1.5 5.2 4 7.6 8.5 2.6" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  )
}

export default function SpecimenPanel() {
  const [ui, setUi] = useState({ ...settings })
  const [open, setOpen] = useState(false)
  // 用户要求(手机适配): 控制卡默认只显示三个形状, 点卡头或上拉展开其余控件, 下拉/再点收起。
  // expanded 只在 max-md 断点被 CSS 消费, 桌面端恒展开、观感零变化。
  const [expanded, setExpanded] = useState(false)
  const grab = useRef<{ y0: number; fired: boolean } | null>(null)
  const onGrabStart = (e: ReactPointerEvent) => {
    grab.current = { y0: e.clientY, fired: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onGrabMove = (e: ReactPointerEvent) => {
    const g = grab.current
    if (!g || g.fired) return
    const dy = e.clientY - g.y0
    if (dy < -24) {
      setExpanded(true)
      g.fired = true
    } else if (dy > 24) {
      setExpanded(false)
      g.fired = true
    }
  }
  // 未触发阈值的 pointerup 直接清手势; 触发过的保留到 click 里吞掉, 防手势+click 双重翻转
  const onGrabEnd = () => {
    if (grab.current && !grab.current.fired) grab.current = null
  }
  const onHeaderTap = () => {
    if (grab.current?.fired) {
      grab.current = null
      return
    }
    setExpanded((v) => !v)
  }
  const sync = (patch: Partial<typeof settings>) => {
    Object.assign(settings, patch)
    setUi({ ...settings })
  }

  return (
    <aside
      data-testid="panel"
      className="pointer-events-auto absolute bottom-8 right-7 w-[252px] rounded-2xl bg-[#edeeec]/95 p-4 shadow-[0_14px_36px_rgba(40,38,34,0.12)] max-md:bottom-[calc(env(safe-area-inset-bottom)_+_12px)] max-md:left-4 max-md:right-4 max-md:w-auto max-md:p-3.5"
    >
      {/* 用户要求(手机适配): 抽屉把手 + 醒目的展开提示, 让折叠态一眼可知可上拉; 桌面均不渲染 */}
      <div className="mx-auto mb-1 hidden h-1 w-10 rounded-full bg-[#c6c4c0] max-md:block" />
      <div
        onPointerDown={onGrabStart}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabEnd}
        onPointerCancel={() => (grab.current = null)}
        onClick={onHeaderTap}
        className="flex items-center justify-between max-md:cursor-grab touch-none"
      >
        <span className="text-[11px] font-bold tracking-[0.18em] text-[#1e1f20]">标本档案</span>
        <span className="flex items-center gap-2">
          <span className="font-tech rounded-full border border-[#d8d6d2] bg-white px-2.5 py-0.5 text-[11.5px] text-[#3c3e40]">
            ρ 1.05 g/cm³
          </span>
          {/* 展开提示胶囊: 折叠态「▲ 上拉展开」(箭头浮动), 展开态「▼ 收起」; 点击冒泡到卡头统一处理 */}
          <button
            type="button"
            data-testid="panel-toggle"
            aria-expanded={expanded}
            className={`hidden max-md:flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium ${
              expanded
                ? 'border border-[#d8d6d2] text-[#3c3e40]'
                : 'border border-[#b3b1ad] text-[#1e1f20] shadow-[0_1px_4px_rgba(40,38,34,0.14)]'
            }`}
          >
            <span className={`text-[10px] leading-none ${expanded ? '' : 'sheet-hint-arrow'}`}>
              {expanded ? '▼' : '▲'}
            </span>
            {expanded ? '收起' : '上拉展开'}
          </button>
        </span>
      </div>

      <div className="mt-3 flex gap-1.5">
        {SHAPES.map(({ id, label }) => (
          <button
            key={id}
            data-testid={`shape-${id}`}
            onClick={() => sync({ shape: id, preset: SHAPE_PRESET[id] })}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] transition-colors ${
              ui.shape === id
                ? 'border-[1.5px] border-[#2b2b2b] bg-white font-medium text-[#1e1f20]'
                : 'border-[1.5px] border-transparent bg-[#e2e4e2] text-[#3c3e40]'
            }`}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: PRESETS[SHAPE_PRESET[id]].dot }}
            />
            {label}
          </button>
        ))}
      </div>

      {/* 可折叠卡体: grid-rows 0fr→1fr 做高度过渡; 桌面无对应类, 恒为普通文档流 */}
      <div
        className={`max-md:grid max-md:overflow-hidden max-md:transition-[grid-template-rows] max-md:duration-300 max-md:ease-out ${
          expanded ? 'max-md:grid-rows-[1fr]' : 'max-md:grid-rows-[0fr]'
        }`}
      >
        <div className="max-md:min-h-0">
          <div className="mt-4">
            <JellySlider
              label="硬度"
              value={ui.firmness}
              min={0.5}
              max={2.5}
              step={0.05}
              fmt={fmtKpa}
              testid="slider-firmness"
              onChange={(v) => sync({ firmness: v })}
            />
          </div>
          <div className="mt-3.5">
            <JellySlider
              label="内部阻尼"
              value={ui.damping}
              min={0.5}
              max={10}
              step={0.1}
              fmt={fmtInv}
              testid="slider-damping"
              onChange={(v) => sync({ damping: v })}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              data-testid="btn-nudge"
              onClick={() => {
                commands.nudge = true
              }}
              className="rounded-xl bg-[#26282a] py-2.5 text-[13.5px] font-medium text-white transition-transform active:scale-[0.98]"
            >
              推它一下
            </button>
            <button
              data-testid="btn-reset"
              onClick={() => {
                commands.reset = true
              }}
              className="rounded-xl border border-[#d5d3cf] bg-white py-2.5 text-[13.5px] font-medium text-[#1e1f20]"
            >
              复位
            </button>
          </div>

          <div className="mt-3.5 flex items-center gap-4">
            <Check label="¼ 速" on={ui.quarter} testid="chk-speed" onClick={() => sync({ quarter: !ui.quarter })} />
            <Check label="显示网格" on={ui.showMesh} testid="chk-mesh" onClick={() => sync({ showMesh: !ui.showMesh })} />
            <button
              data-testid="btn-pause"
              onClick={() => sync({ paused: !ui.paused })}
              className="ml-auto rounded-full bg-[#e2e4e2] px-3 py-1 text-[13px] text-[#2a2c2e]"
            >
              {ui.paused ? '继续' : '暂停'}
            </button>
          </div>

          <div className="mt-3.5 border-t border-[#dcdad6] pt-3">
            <button
              data-testid="disclosure"
              onClick={() => setOpen(!open)}
              className="flex items-center gap-1.5 text-[13px] text-[#2a2c2e]"
            >
              <span className={`inline-block text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
              实验细节
            </button>
            {open && (
              <p className="mt-2 text-[12px] leading-relaxed text-[#6b6d6f]">
                一个由 3,185 个粒子构成的 shape-matching 软体，以 Verlet 子步积分。全局压强约束维持静止体积；硬度
                缩放形状匹配增益；表面以透射物理材质渲染。
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
