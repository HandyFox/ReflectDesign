import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popup } from './controls'
import { editor } from '@core/editor'

const THEME = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47']
const STANDARD = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0']

function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * amount))
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Office-style tint/shade rows under each theme colour. */
function shades(hex: string): string[] {
  const isLight = hex === '#FFFFFF'
  const isDark = hex === '#000000'
  if (isLight) return [0.05, 0.15, 0.25, 0.35, 0.5].map((a) => mix(hex, 0, a))
  if (isDark) return [0.5, 0.35, 0.25, 0.15, 0.05].map((a) => mix(hex, 255, a))
  return [mix(hex, 255, 0.8), mix(hex, 255, 0.6), mix(hex, 255, 0.4), mix(hex, 0, 0.25), mix(hex, 0, 0.5)]
}

export function ColorGrid({ onPick, onNone, noneLabel, close }: { onPick: (c: string) => void; onNone?: () => void; noneLabel?: string; close: () => void }) {
  const recent = editor.doc.recentColors
  const pick = (c: string) => {
    const r = editor.doc.recentColors
    editor.doc.recentColors = [c, ...r.filter((x) => x !== c)].slice(0, 10)
    onPick(c)
    close()
  }
  const custom = useRef<HTMLInputElement>(null)
  return (
    <div className="color-grid">
      {onNone && (
        <button className="menu-item" onClick={() => { onNone(); close() }}>
          <span className="menu-icon"><span className="swatch none" /></span>
          <span className="menu-label">{noneLabel ?? 'No Color'}</span>
        </button>
      )}
      <div className="menu-header">Theme Colors</div>
      <div className="swatch-row">{THEME.map((c) => <Swatch key={c} c={c} onPick={pick} />)}</div>
      <div className="swatch-cols">
        {THEME.map((c) => (
          <div key={c} className="swatch-col">{shades(c).map((s) => <Swatch key={s} c={s} onPick={pick} />)}</div>
        ))}
      </div>
      <div className="menu-header">Standard Colors</div>
      <div className="swatch-row">{STANDARD.map((c) => <Swatch key={c} c={c} onPick={pick} />)}</div>
      {recent.length > 0 && (
        <>
          <div className="menu-header">Recent Colors</div>
          <div className="swatch-row">{recent.map((c) => <Swatch key={c} c={c} onPick={pick} />)}</div>
        </>
      )}
      <div className="menu-sep" />
      <button className="menu-item" onClick={() => custom.current?.click()}>
        <span className="menu-icon">🎨</span>
        <span className="menu-label">More Colors...</span>
      </button>
      <input ref={custom} type="color" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} onChange={(e) => pick(e.target.value.toUpperCase())} />
    </div>
  )
}

function Swatch({ c, onPick }: { c: string; onPick: (c: string) => void }) {
  return <button className="swatch" style={{ background: c }} title={c} onClick={() => onPick(c)} aria-label={c} />
}

/** Split button: click applies the last colour, the arrow opens the palette (Font Color, Shape Fill, ...). */
export function ColorButton({ icon, title, color, onPick, onNone, noneLabel, label }: {
  icon: ReactNode
  title: string
  color: string | null
  onPick: (c: string) => void
  onNone?: () => void
  noneLabel?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [last, setLast] = useState(color ?? '#FF0000')
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className="rsmall split" ref={ref}>
      <button className="rsmall-main" title={title} onClick={() => onPick(last)}>
        <span className="rsmall-icon color-icon">
          {icon}
          <span className="color-bar" style={{ background: last }} />
        </span>
        {label && <span className="rsmall-label">{label}</span>}
      </button>
      <button className="rsmall-arrow" onClick={() => setOpen(true)} aria-label={`${title} options`}>
        <ChevronDown size={9} />
      </button>
      {open && (
        <Popup anchor={ref.current!} onClose={() => setOpen(false)}>
          <ColorGrid onPick={(c) => { setLast(c); onPick(c) }} onNone={onNone} noneLabel={noneLabel} close={() => setOpen(false)} />
        </Popup>
      )}
    </div>
  )
}
