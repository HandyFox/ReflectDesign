import { createContext, useContext, useState, type ReactNode } from 'react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { PAGE_PRESETS, formatLength, parseLength } from '@core/model/units'
import { A4, CARD_PRESETS, FOLD_KINDS, FOLD_NAMES, LETTER, cardPlan, sheetFor, type FoldKind } from '@core/model/card'
import { SpellingDialog } from './SpellingDialog'
import { GoogleFontsDialog } from './GoogleFontsDialog'
import { FormatDialog } from './FormatDialog'

type DialogKind = 'pageSetup' | 'renamePage' | 'saveTemplate' | 'newTemplate' | 'spelling' | 'googleFonts' | 'format'

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
      {open === 'newTemplate' && <NewTemplateDialog onClose={close} />}
      {open === 'spelling' && <SpellingDialog onClose={close} />}
      {open === 'googleFonts' && <GoogleFontsDialog onClose={close} />}
      {open === 'format' && <FormatDialog onClose={close} />}
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
  // Layout type, like Publisher: an ordinary full page, or a folded greeting card.
  const [layout, setLayout] = useState<'full' | FoldKind>(ps.card?.fold ?? 'full')
  const [sheet, setSheet] = useState<'letter' | 'a4'>(ps.card && ps.card.sheetWidth < 600 ? 'a4' : 'letter')
  const pw = parseLength(w, u), ph = parseLength(h, u)
  const paper = sheet === 'a4' ? A4 : LETTER
  const tooBig = layout !== 'full' && pw && ph ? (() => {
    const plan = cardPlan(layout, pw, ph)
    const s = sheetFor(plan, paper)
    return plan.width > s.width + 0.6 || plan.height > s.height + 0.6
  })() : false
  const ok = () => {
    const mm = { top: parseLength(m.top, u), left: parseLength(m.left, u), bottom: parseLength(m.bottom, u), right: parseLength(m.right, u) }
    if (!pw || !ph || pw < 18 || ph < 18) return setError('Enter a page width and height of at least 0.25".')
    if (pw > 241 * 72 || ph > 241 * 72) return setError('Pages can be up to 241" on each side.')
    if (Object.values(mm).some((v) => v === null || v < 0)) return setError('Enter valid margins.')
    if (layout === 'full') {
      cmd.setFullPageLayout()
      cmd.setPageSize(pw, ph)
    } else {
      cmd.setCardLayout(layout, pw, ph, paper)
    }
    cmd.setMargins(mm as typeof ps.margins)
    onClose()
  }
  const presets = layout === 'full' ? PAGE_PRESETS.map((p) => ({ name: p.name, width: p.width, height: p.height, sheet: null as null | 'letter' | 'a4' }))
    : CARD_PRESETS.filter((p) => p.fold === layout).map((p) => ({ name: p.name, width: p.width, height: p.height, sheet: (p.sheet === A4 ? 'a4' : 'letter') as 'letter' | 'a4' }))
  // Preview proportions
  const pv = pw && ph ? { w: pw > ph ? 120 : (120 * pw) / ph, h: pw > ph ? (120 * ph) / pw : 120 } : { w: 90, h: 120 }
  return (
    <Dialog title="Page Setup" onClose={onClose} onOk={ok} width={560}>
      <div className="pagesetup">
        <div>
          <fieldset>
            <legend>Page</legend>
            <label className="field">
              <span>Layout:</span>
              <select value={layout} onChange={(e) => {
                const next = e.target.value as 'full' | FoldKind
                setLayout(next)
                // Picking a card layout starts from its standard size.
                if (next !== 'full') {
                  const p = CARD_PRESETS.find((x) => x.fold === next)!
                  setW(f(p.width)); setH(f(p.height)); setSheet(p.sheet === A4 ? 'a4' : 'letter')
                }
              }}>
                <option value="full">Full page</option>
                {FOLD_KINDS.map((k) => <option key={k} value={k}>{FOLD_NAMES[k]}</option>)}
              </select>
            </label>
            <LengthInput label={layout === 'full' ? 'Width:' : 'Card width:'} value={w} onChange={setW} autoFocus />
            <LengthInput label={layout === 'full' ? 'Height:' : 'Card height:'} value={h} onChange={setH} />
            <label className="field">
              <span>Preset:</span>
              <select value="" onChange={(e) => {
                const p = presets.find((x) => x.name === e.target.value)
                if (p) { setW(f(p.width)); setH(f(p.height)); if (p.sheet) setSheet(p.sheet) }
              }}>
                <option value="">Choose a size…</option>
                {presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </label>
            {layout !== 'full' && (
              <label className="field">
                <span>Paper:</span>
                <select value={sheet} onChange={(e) => setSheet(e.target.value as 'letter' | 'a4')}>
                  <option value="letter">Letter (8.5 × 11")</option>
                  <option value="a4">A4 (210 × 297 mm)</option>
                </select>
              </label>
            )}
            {layout !== 'full' && <div className="hint">The card size is the size once folded. The publication gets four pages: Front, Inside, Inside and Back.</div>}
            {tooBig && <div className="warn">Unfolded, this card is bigger than {paper.name} paper; it will be shrunk when printed.</div>}
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

const TEMPLATE_CATEGORIES = ['Bulletin Boards', 'Posters', 'Flyers', 'Signs', 'Classroom', 'Seasonal', 'Personal']

/** File › New › New Blank Template: name the template and pick its page size. */
function NewTemplateDialog({ onClose }: { onClose: () => void }) {
  const u = ed.unit
  const f = (v: number) => formatLength(v, u)
  const [name, setName] = useState('My Template')
  const [category, setCategory] = useState('Bulletin Boards')
  const [description, setDescription] = useState('')
  const [w, setW] = useState(f(612))
  const [h, setH] = useState(f(792))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = async () => {
    if (busy) return
    const n = name.trim()
    const pw = parseLength(w, u), ph = parseLength(h, u)
    if (!n) return setError('Give the template a name.')
    if (!pw || !ph || pw < 18 || ph < 18) return setError('Enter a page width and height of at least 0.25".')
    if (pw > 241 * 72 || ph > 241 * 72) return setError('Pages can be up to 241" on each side.')
    setBusy(true)
    const existing = await cmd.personalTemplateNames()
    if (existing.some((x) => x.toLowerCase() === n.toLowerCase())) {
      setBusy(false)
      return setError('You already have a template with that name. Choose another name.')
    }
    onClose()
    await cmd.newBlankTemplate({ name: n, category: category.trim() || 'Personal', description }, pw, ph)
  }
  return (
    <Dialog title="New Blank Template" okLabel="Create" onClose={onClose} onOk={ok} width={460}>
      <p className="muted">Design your template, then press <b>Save</b> (Ctrl+S) to update it. It appears under <b>New › Personal</b>.</p>
      <label className="field wide"><span>Template name:</span><input value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} autoFocus /></label>
      <label className="field wide">
        <span>Category:</span>
        <input list="tpl-cats-new" value={category} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="tpl-cats-new">{TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="field wide">
        <span>Page size:</span>
        <select value="" onChange={(e) => {
          const p = PAGE_PRESETS.find((x) => x.name === e.target.value)
          if (p) { setW(f(p.width)); setH(f(p.height)) }
        }}>
          <option value="">Choose a size…</option>
          {PAGE_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <label className="field wide"><span>Width:</span><input value={w} onChange={(e) => setW(e.target.value)} onFocus={(e) => e.target.select()} /></label>
      <label className="field wide"><span>Height:</span><input value={h} onChange={(e) => setH(e.target.value)} onFocus={(e) => e.target.select()} /></label>
      <label className="field wide"><span>Description:</span><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      {error && <div className="error">{error}</div>}
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
