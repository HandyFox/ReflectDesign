import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export function RibbonGroup({ label, children, launcher }: { label: string; children: ReactNode; launcher?: () => void }) {
  return (
    <div className="rgroup">
      <div className="rgroup-body">{children}</div>
      <div className="rgroup-label">
        {label}
        {launcher && (
          <button className="rgroup-launcher" title={`${label} settings`} onClick={launcher} aria-label={`${label} settings`}>
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 1h4M1 1v4M2 2l5 5M7 3v4H3" stroke="currentColor" fill="none" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}

export function Col({ children }: { children: ReactNode }) {
  return <div className="rcol">{children}</div>
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="rrow">{children}</div>
}

interface ButtonProps {
  icon?: LucideIcon
  iconNode?: ReactNode
  label?: string
  title?: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  color?: string
  /** Shows a dropdown arrow; `menu` renders its content. */
  menu?: (close: () => void) => ReactNode
  /** Split button: the main part runs onClick, the arrow opens the menu. */
  split?: boolean
  shortcut?: string
}

function tip(p: ButtonProps): string {
  const base = p.title ?? p.label ?? ''
  return p.shortcut ? `${base} (${p.shortcut})` : base
}

/** Large ribbon button: 32px icon with the label underneath. */
export function BigButton(p: ButtonProps) {
  const Icon = p.icon
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const click = () => {
    if (p.menu && !p.split) setOpen(true)
    else p.onClick?.()
  }
  return (
    <div className={`rbig ${p.active ? 'active' : ''} ${p.split ? 'split' : ''}`} ref={ref}>
      <button className="rbig-main" disabled={p.disabled} title={tip(p)} onClick={click} aria-pressed={p.active}>
        <span className="rbig-icon" style={{ color: p.color }}>{Icon ? <Icon size={30} strokeWidth={1.4} /> : p.iconNode}</span>
        {!p.split && <span className="rbig-label">{p.label}{p.menu && <ChevronDown size={10} />}</span>}
        {p.split && <span className="rbig-label">{p.label}</span>}
      </button>
      {p.split && p.menu && (
        <button className="rbig-arrow" disabled={p.disabled} onClick={() => setOpen(true)} aria-label={`${p.label} options`}>
          <ChevronDown size={10} />
        </button>
      )}
      {open && p.menu && <Popup anchor={ref.current!} onClose={() => setOpen(false)}>{p.menu(() => setOpen(false))}</Popup>}
    </div>
  )
}

/** Small ribbon button: 16px icon with an optional label to the right. */
export function SmallButton(p: ButtonProps) {
  const Icon = p.icon
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className={`rsmall ${p.active ? 'active' : ''} ${p.split ? 'split' : ''}`} ref={ref}>
      <button
        className="rsmall-main"
        disabled={p.disabled}
        title={tip(p)}
        aria-pressed={p.active}
        onClick={() => (p.menu && !p.split ? setOpen(true) : p.onClick?.())}
      >
        <span className="rsmall-icon" style={{ color: p.color }}>{Icon ? <Icon size={16} strokeWidth={1.7} /> : p.iconNode}</span>
        {p.label && <span className="rsmall-label">{p.label}</span>}
        {p.menu && !p.split && <ChevronDown size={9} />}
      </button>
      {p.split && p.menu && (
        <button className="rsmall-arrow" disabled={p.disabled} onClick={() => setOpen(true)} aria-label={`${p.title ?? p.label} options`}>
          <ChevronDown size={9} />
        </button>
      )}
      {open && p.menu && <Popup anchor={ref.current!} onClose={() => setOpen(false)}>{p.menu(() => setOpen(false))}</Popup>}
    </div>
  )
}

/** A floating panel attached below an element; closes on outside click or Escape. */
export function Popup({ anchor, onClose, children, align = 'left' }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const el = ref.current
    const w = el?.offsetWidth ?? 200
    const h = el?.offsetHeight ?? 200
    let left = align === 'left' ? r.left : r.right - w
    let top = r.bottom + 1
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4))
    if (top + h > window.innerHeight - 4) top = Math.max(4, r.top - h - 1)
    setPos({ left, top })
  }, [anchor, align])
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', down, true)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key) }
  }, [anchor, onClose])
  return createPortal(
    <div className="popup" ref={ref} style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      {children}
    </div>,
    document.body
  )
}

export function MenuItem({ icon: Icon, label, onClick, checked, disabled, shortcut, iconNode }: {
  icon?: LucideIcon; iconNode?: ReactNode; label: string; onClick?: () => void; checked?: boolean; disabled?: boolean; shortcut?: string
}) {
  return (
    <button className={`menu-item ${checked ? 'checked' : ''}`} disabled={disabled} onClick={onClick}>
      <span className="menu-icon">{Icon ? <Icon size={16} strokeWidth={1.6} /> : iconNode ?? (checked ? '✓' : '')}</span>
      <span className="menu-label">{label}</span>
      {shortcut && <span className="menu-shortcut">{shortcut}</span>}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="menu-sep" />
}

export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="menu-header">{children}</div>
}

/**
 * Editable combo box (font name, font size, zoom). Commits on Enter, on
 * blur, or when an item is picked from the list.
 */
export function Combo({ value, items, onCommit, width = 120, renderItem, title, placeholder, filter = true }: {
  value: string
  items: string[]
  onCommit: (v: string) => void
  width?: number
  renderItem?: (v: string) => ReactNode
  title?: string
  placeholder?: string
  filter?: boolean
}) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!open) setText(value) }, [value, open])
  const shown = filter && typed && text ? items.filter((i) => i.toLowerCase().startsWith(text.toLowerCase())) : items
  useEffect(() => {
    if (!open || !listRef.current) return
    const sel = listRef.current.querySelector('.selected') as HTMLElement | null
    sel?.scrollIntoView({ block: 'nearest' })
  }, [open])
  const commit = (v: string) => {
    setOpen(false)
    setTyped(false)
    if (v.trim() && v !== value) onCommit(v.trim())
    else setText(value)
  }
  return (
    <div className="combo" ref={ref} style={{ width }} title={title}>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); setTyped(true); setOpen(true) }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          // preventDefault stops the key from reaching the text box once focus returns to it.
          if (e.key === 'Enter') { e.preventDefault(); commit(items.find((s) => s.toLowerCase() === text.toLowerCase()) ?? text); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { e.preventDefault(); setText(value); setOpen(false); (e.target as HTMLInputElement).blur() }
          if (e.key === 'ArrowDown') setOpen(true)
        }}
        onBlur={() => { if (!open) commit(text) }}
        aria-label={title}
      />
      <button className="combo-arrow" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); setTyped(false); setOpen(!open) }} aria-label={`${title} list`}>
        <ChevronDown size={10} />
      </button>
      {open && (
        <Popup anchor={ref.current!} onClose={() => commit(text)}>
          <div className="combo-list" ref={listRef} style={{ minWidth: width }}>
            {shown.map((i) => (
              <button key={i} className={`combo-item ${i === value ? 'selected' : ''}`} onMouseDown={(e) => { e.preventDefault(); commit(i) }}>
                {renderItem ? renderItem(i) : i}
              </button>
            ))}
            {shown.length === 0 && <div className="combo-empty">No matches</div>}
          </div>
        </Popup>
      )}
    </div>
  )
}

/** Numeric field with a unit, like Publisher's Size group (e.g. 2.5"). */
export function MeasureField({ label, icon: Icon, value, onCommit, format, parse, width = 64, title }: {
  label?: string
  icon?: LucideIcon
  value: number | null
  onCommit: (v: number) => void
  format: (v: number) => string
  parse: (s: string) => number | null
  width?: number
  title?: string
}) {
  const [text, setText] = useState(value === null ? '' : format(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setText(value === null ? '' : format(value)) }, [value, focus, format])
  const commit = () => {
    const v = parse(text)
    if (v !== null && Number.isFinite(v)) onCommit(v)
    else setText(value === null ? '' : format(value))
  }
  return (
    <label className="measure" title={title ?? label}>
      {Icon && <Icon size={14} strokeWidth={1.6} />}
      {label && <span className="measure-label">{label}</span>}
      <input
        style={{ width }}
        value={text}
        disabled={value === null}
        onFocus={(e) => { setFocus(true); e.target.select() }}
        onBlur={() => { setFocus(false); commit() }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { e.preventDefault(); setText(value === null ? '' : format(value)); (e.target as HTMLInputElement).blur() }
        }}
      />
    </label>
  )
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="rcheck">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Separator() {
  return <div className="rsep" />
}
