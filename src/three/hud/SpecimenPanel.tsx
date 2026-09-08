import { useState, type CSSProperties } from 'react'
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
  const sync = (patch: Partial<typeof settings>) => {
    Object.assign(settings, patch)
    setUi({ ...settings })
  }

  return (
    <aside
      data-testid="panel"
      className="pointer-events-auto absolute bottom-8 right-7 w-[252px] rounded-2xl bg-[#edeeec]/95 p-4 shadow-[0_14px_36px_rgba(40,38,34,0.12)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.18em] text-[#1e1f20]">THE SPECIMEN</span>
        <span className="font-tech rounded-full border border-[#d8d6d2] bg-white px-2.5 py-0.5 text-[11.5px] text-[#3c3e40]">
          ρ 1.05 g/cm³
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

      <div className="mt-4">
        <JellySlider
          label="Firmness"
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
          label="Internal damping"
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
          Give it a nudge
        </button>
        <button
          data-testid="btn-reset"
          onClick={() => {
            commands.reset = true
          }}
          className="rounded-xl border border-[#d5d3cf] bg-white py-2.5 text-[13.5px] font-medium text-[#1e1f20]"
        >
          Reset
        </button>
      </div>

      <div className="mt-3.5 flex items-center gap-4">
        <Check label="¼ speed" on={ui.quarter} testid="chk-speed" onClick={() => sync({ quarter: !ui.quarter })} />
        <Check label="Show mesh" on={ui.showMesh} testid="chk-mesh" onClick={() => sync({ showMesh: !ui.showMesh })} />
        <button
          data-testid="btn-pause"
          onClick={() => sync({ paused: !ui.paused })}
          className="ml-auto rounded-full bg-[#e2e4e2] px-3 py-1 text-[13px] text-[#2a2c2e]"
        >
          {ui.paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      <div className="mt-3.5 border-t border-[#dcdad6] pt-3">
        <button
          data-testid="disclosure"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-[13px] text-[#2a2c2e]"
        >
          <span className={`inline-block text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          Inside the experiment
        </button>
        {open && (
          <p className="mt-2 text-[12px] leading-relaxed text-[#6b6d6f]">
            A 3,185-particle shape-matched soft body, integrated with Verlet substeps. A global pressure constraint
            keeps the rest volume; firmness scales the shape-matching gain; the surface is drawn with a transmissive
            physical material.
          </p>
        )}
      </div>
    </aside>
  )
}
