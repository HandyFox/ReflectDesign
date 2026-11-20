import { createContext, useContext, useState, type ReactNode } from 'react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { PAGE_PRESETS, formatLength, parseLength } from '@core/model/units'

type DialogKind = 'pageSetup' | 'renamePage' | 'saveTemplate'

const Ctx = createContext<{ open: (k: DialogKind) => void }>({ open: () => {} })
export const useDialogs = () => useContext(Ctx)

export function DialogHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<DialogKind | null>(null)
  const close = () => setOpen(null)
  return (
    <Ctx.Provider value={{ open: setOpen }}>
      {children}
      {open === 'pageSetup' && <PageSetupDialog onClose={close} />}
      {open === 'renamePage' && <RenamePageDialog onClose={close} />}
      {open === 'saveTemplate' && <SaveTemplateDialog onClose={close} />}
    </Ctx.Provider>
  )
}

export function Dialog({ title, children, onClose, onOk, okLabel = 'OK', width = 420 }: {
  title: string; children: ReactNode; onClose: () => void; onOk: () => void; okLabel?: string; width?: number
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog" style={{ width }} role="dialog" aria-label={title}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') onOk() }}>
        <div className="dialog-title">
          <span>{title}</span>
          <button className="dialog-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-buttons">
          <button className="btn primary" onClick={onOk}>{okLabel}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function LengthInput({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} autoFocus={autoFocus} />
    </label>
  )
}

/** Page Setup — Publisher's "Create New Page Size" dialog. */
function PageSetupDialog({ onClose }: { onClose: () => void }) {
  const ps = ed.doc.pageSetup
  const u = ed.unit
  const f = (v: number) => formatLength(v, u)
  const [w, setW] = useState(f(ps.width))
  const [h, setH] = useState(f(ps.height))
  const [m, setM] = useState({ top: f(ps.margins.top), left: f(ps.margins.left), bottom: f(ps.margins.bottom), right: f(ps.margins.right) })
  const [error, setError] = useState('')
  const pw = parseLength(w, u), ph = parseLength(h, u)
  const ok = () => {
    const mm = { top: parseLength(m.top, u), left: parseLength(m.left, u), bottom: parseLength(m.bottom, u), right: parseLength(m.right, u) }
    if (!pw || !ph || pw < 18 || ph < 18) return setError('Enter a page width and height of at least 0.25".')
    if (pw > 241 * 72 || ph > 241 * 72) return setError('Pages can be up to 241" on each side.')
    if (Object.values(mm).some((v) => v === null || v < 0)) return setError('Enter valid margins.')
    cmd.setPageSize(pw, ph)
    cmd.setMargins(mm as typeof ps.margins)
    onClose()
  }
  // Preview proportions
  const pv = pw && ph ? { w: pw > ph ? 120 : (120 * pw) / ph, h: pw > ph ? (120 * ph) / pw : 120 } : { w: 90, h: 120 }
  return (
    <Dialog title="Page Setup" onClose={onClose} onOk={ok} width={560}>
      <div className="pagesetup">
        <div>
          <fieldset>
            <legend>Page</legend>
            <LengthInput label="Width:" value={w} onChange={setW} autoFocus />
            <LengthInput label="Height:" value={h} onChange={setH} />
            <label className="field">
              <span>Preset:</span>
              <select value="" onChange={(e) => {
                const p = PAGE_PRESETS.find((x) => x.name === e.target.value)
                if (p) { setW(f(p.width)); setH(f(p.height)) }
              }}>
                <option value="">Choose a size…</option>
                {PAGE_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </label>
          </fieldset>
          <fieldset>
            <legend>Margin Guides</legend>
            <div className="grid2">
              <LengthInput label="Top:" value={m.top} onChange={(v) => setM({ ...m, top: v })} />
              <LengthInput label="Left:" value={m.left} onChange={(v) => setM({ ...m, left: v })} />
              <LengthInput label="Bottom:" value={m.bottom} onChange={(v) => setM({ ...m, bottom: v })} />
              <LengthInput label="Right:" value={m.right} onChange={(v) => setM({ ...m, right: v })} />
            </div>
          </fieldset>
          {error && <div className="error">{error}</div>}
          <div className="hint">Type sizes in inches (8.5), or add a unit: 21 cm, 600 mm, 72 pt.</div>
        </div>
        <div className="preview-col">
          <div className="muted">Preview</div>
          <div className="page-preview" style={{ width: pv.w, height: pv.h }} />
          <div className="muted">{pw && ph ? `${f(pw)} × ${f(ph)}` : ''}</div>
        </div>
      </div>
    </Dialog>
  )
}

function RenamePageDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(ed.page.name)
  return (
    <Dialog title="Rename Page" onClose={onClose} onOk={() => { ed.change('Rename Page', () => { ed.page.name = name.trim() }); onClose() }}>
      <label className="field wide">
        <span>Page title:</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={`Page ${ed.pageIndex + 1}`} />
      </label>
    </Dialog>
  )
}

function SaveTemplateDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(ed.fileName)
  const [category, setCategory] = useState('Bulletin Boards')
  const [description, setDescription] = useState('')
  return (
    <Dialog title="Save as Template" okLabel="Save" onClose={onClose}
      onOk={async () => {
        if (!name.trim()) return
        const ok = await cmd.saveAsTemplate({ name: name.trim(), category: category.trim() || 'Personal', description })
        if (ok) onClose()
      }}>
      <p className="muted">Your template will appear under <b>New › Personal</b>.</p>
      <label className="field wide"><span>Template name:</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label className="field wide">
        <span>Category:</span>
        <input list="tpl-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="tpl-cats">
          {['Bulletin Boards', 'Posters', 'Flyers', 'Signs', 'Classroom', 'Seasonal', 'Personal'].map((c) => <option key={c} value={c} />)}
        </datalist>
      </label>
      <label className="field wide"><span>Description:</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
    </Dialog>
  )
}
