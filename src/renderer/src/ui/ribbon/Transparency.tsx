import { useEffect, useState } from 'react'
import { Blend } from 'lucide-react'
import { SmallButton } from './controls'

/**
 * Publisher's transparency control: a 0–100% slider with a number box.
 * `value` is the transparency (0 = solid, 1 = fully clear); null = not available.
 */
export function TransparencySlider({ label, value, onChange, hint }: {
  label: string
  value: number | null
  onChange: (t: number) => void
  hint?: string
}) {
  const pct = value === null ? 0 : Math.round(value * 100)
  const [text, setText] = useState(String(pct))
  useEffect(() => setText(String(pct)), [pct])
  const disabled = value === null
  const commit = (s: string) => {
    const v = Math.max(0, Math.min(100, Math.round(Number(s.replace('%', '')))))
    if (Number.isFinite(v)) onChange(v / 100)
    else setText(String(pct))
  }
  return (
    <div className={`tslider ${disabled ? 'disabled' : ''}`}>
      <div className="tslider-label">{label}</div>
      <div className="tslider-row">
        <span className="tslider-end">0%</span>
        <input
          type="range" min={0} max={100} step={1} value={pct} disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          style={{ ['--pct' as string]: `${pct}%` }}
        />
        <span className="tslider-end">100%</span>
        <input
          className="tslider-num" value={disabled ? '' : `${text}`} disabled={disabled}
          aria-label={`${label} percent`}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit((e.target as HTMLInputElement).value) }
            if (e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(100, pct + 5) / 100) }
            if (e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0, pct - 5) / 100) }
          }}
        />
        <span>%</span>
      </div>
      {disabled && hint && <div className="tslider-hint">{hint}</div>}
      {!disabled && (
        <div className="tslider-presets">
          {[0, 25, 50, 75, 90].map((p) => (
            <button key={p} className={`tpreset ${pct === p ? 'on' : ''}`} onClick={() => onChange(p / 100)} title={`${p}% transparent`}>
              <span className="tpreset-swatch" style={{ opacity: 1 - p / 100 }} />{p}%
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface TransparencyRow {
  label: string
  value: number | null
  onChange: (t: number) => void
  hint?: string
}

/** Ribbon button that drops down one or more transparency sliders. */
export function TransparencyButton({ label = 'Transparency', rows, disabled }: { label?: string; rows: TransparencyRow[]; disabled?: boolean }) {
  return (
    <SmallButton
      icon={Blend}
      label={label}
      disabled={disabled}
      menu={() => (
        <div className="tslider-panel">
          {rows.map((r) => <TransparencySlider key={r.label} {...r} />)}
        </div>
      )}
    />
  )
}
