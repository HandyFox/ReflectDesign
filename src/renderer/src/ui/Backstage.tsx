import { useEffect, useState } from 'react'
import { ArrowLeft, FileDown, FilePlus2, FolderOpen, Info, Printer, Save, SaveAll, X } from 'lucide-react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { PAGE_PRESETS, formatLength } from '@core/model/units'
import type { TemplateInfo } from '@shared/api'
import { platform } from '../platform'
import { useEditor } from './useEditor'
import { useDialogs } from './dialogs/DialogHost'
import { ExportView, PrintView } from './ExportPrint'
import { STARTER_TEMPLATES, type StarterTemplate } from '@core/templates/starters'

const starterThumbs = new Map<string, string>()

function StarterCard({ t }: { t: StarterTemplate }) {
  const [src, setSrc] = useState(starterThumbs.get(t.id))
  useEffect(() => {
    if (src) return
    const doc = t.build()
    cmd.pageThumbnail(doc, 0, 220).then((png) => {
      if (!png) return
      const url = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }))
      starterThumbs.set(t.id, url)
      setSrc(url)
    })
  }, [t, src])
  return (
    <button className="tpl" title={t.description} onClick={() => cmd.newFromStarter(t)}>
      <div className="tpl-thumb">{src ? <img src={src} alt="" /> : <div style={thumbBox(612, 792)} />}</div>
      <div className="tpl-name">{t.name}</div>
    </button>
  )
}

type View = NonNullable<typeof ed.backstage>

export function Backstage() {
  const e = useEditor()
  const dialogs = useDialogs()
  if (!e.backstage) return null
  const view = e.backstage
  const go = (v: View) => { ed.backstage = v; ed.touch() }
  const close = () => { ed.backstage = null; ed.touch() }
  return (
    <div className="backstage" onKeyDown={(ev) => { if (ev.key === 'Escape') close() }} tabIndex={-1}>
      <nav className="bs-nav">
        <button className="bs-back" onClick={close} aria-label="Back"><ArrowLeft size={22} /></button>
        <NavItem icon={Info} label="Info" active={view === 'info'} onClick={() => go('info')} />
        <NavItem icon={FilePlus2} label="New" active={view === 'new'} onClick={() => go('new')} />
        <NavItem icon={FolderOpen} label="Open" active={view === 'open'} onClick={() => { cmd.openDocument() }} />
        <NavItem icon={Save} label="Save" onClick={() => { cmd.save().then((ok) => ok && close()) }} />
        <NavItem icon={SaveAll} label="Save As" active={view === 'save'} onClick={() => go('save')} />
        <NavItem icon={FileDown} label="Export" active={view === 'export'} onClick={() => go('export')} />
        <NavItem icon={Printer} label="Print" active={view === 'print'} onClick={() => go('print')} />
        <NavItem icon={X} label="Close" onClick={() => { cmd.newDocument() }} />
      </nav>
      <main className="bs-main">
        {view === 'info' && <InfoView />}
        {view === 'new' && <NewView />}
        {view === 'save' && (
          <div>
            <h1>Save As</h1>
            <div className="bs-cards">
              <button className="bs-card" onClick={() => cmd.saveAs()}>
                <SaveAll size={28} />
                <div><b>ReflectDesign Publication (.rdx)</b><div className="muted">Save a copy of this publication.</div></div>
              </button>
              <button className="bs-card" onClick={() => { dialogs.open('saveTemplate') }}>
                <FilePlus2 size={28} />
                <div><b>ReflectDesign Template (.rdt)</b><div className="muted">Save this design as a template you can start new publications from.</div></div>
              </button>
            </div>
          </div>
        )}
        {view === 'export' && <ExportView />}
        {view === 'print' && <PrintView />}
        {view === 'open' && <div><h1>Open</h1><button className="btn primary" onClick={() => cmd.openDocument()}>Browse…</button></div>}
      </main>
    </div>
  )
}

function NavItem({ icon: Icon, label, active, onClick }: { icon: typeof Info; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button className={`bs-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={16} />
      <span>{label}</span>
    </button>
  )
}

function InfoView() {
  const d = ed.doc
  const u = ed.unit
  return (
    <div>
      <h1>Info</h1>
      <table className="info-table">
        <tbody>
          <tr><th>File</th><td>{ed.filePath ?? 'Not saved yet'}</td></tr>
          <tr><th>Page size</th><td>{formatLength(d.pageSetup.width, u)} × {formatLength(d.pageSetup.height, u)}</td></tr>
          <tr><th>Pages</th><td>{d.pages.length}</td></tr>
          <tr><th>Pictures</th><td>{Object.keys(d.assets).length}</td></tr>
          <tr><th>Created</th><td>{new Date(d.info.created).toLocaleString()}</td></tr>
          <tr><th>Modified</th><td>{new Date(d.info.modified).toLocaleString()}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

const BLANKS: Array<{ name: string; w: number; h: number }> = [
  { name: 'Letter (Portrait)', w: 612, h: 792 },
  { name: 'Letter (Landscape)', w: 792, h: 612 },
  { name: 'Tabloid 11 × 17"', w: 792, h: 1224 },
  { name: 'Poster 18 × 24"', w: 1296, h: 1728 },
  { name: 'Poster 24 × 36"', w: 1728, h: 2592 },
  { name: 'Banner 2 × 6 ft', w: 5184, h: 1728 }
]

function NewView() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [more, setMore] = useState(false)
  useEffect(() => {
    platform.listTemplates().then((t) => { setTemplates(t); setLoaded(true) })
  }, [])
  const featured = templates.filter((t) => t.builtIn)
  const personal = templates.filter((t) => !t.builtIn)
  const byCategory = new Map<string, TemplateInfo[]>()
  for (const t of personal) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t])
  return (
    <div>
      <h1>New</h1>
      <h2>Blank Page Sizes</h2>
      <div className="tpl-grid">
        {(more ? PAGE_PRESETS.map((p) => ({ name: p.name, w: p.width, h: p.height })) : BLANKS).map((b) => (
          <button key={b.name} className="tpl" onClick={() => cmd.newDocument(b.w, b.h)}>
            <div className="tpl-thumb blank"><div style={thumbBox(b.w, b.h)} /></div>
            <div className="tpl-name">{b.name}</div>
          </button>
        ))}
        <button className="tpl" onClick={() => setMore(!more)}>
          <div className="tpl-thumb more">{more ? 'Fewer' : 'More Blank Page Sizes'}</div>
        </button>
      </div>
      <h2>Featured</h2>
      <div className="tpl-grid">
        {STARTER_TEMPLATES.map((t) => <StarterCard key={t.id} t={t} />)}
        {featured.map((t) => <TemplateCard key={t.id} t={t} />)}
      </div>
      <h2>Personal</h2>
      {loaded && personal.length === 0 && <p className="muted">Templates you save with <b>File › Save As › ReflectDesign Template</b> appear here.</p>}
      {[...byCategory.entries()].map(([cat, list]) => (
        <div key={cat}>
          <h3>{cat}</h3>
          <div className="tpl-grid">{list.map((t) => <TemplateCard key={t.id} t={t} />)}</div>
        </div>
      ))}
    </div>
  )
}

function thumbBox(w: number, h: number) {
  const k = 100 / Math.max(w, h)
  return { width: w * k, height: h * k, background: '#fff', border: '1px solid #bbb', boxShadow: '1px 1px 3px rgba(0,0,0,.2)' }
}

function TemplateCard({ t }: { t: TemplateInfo }) {
  return (
    <button className="tpl" title={t.description || t.name} onClick={() => cmd.newFromTemplate(t.path)}>
      <div className="tpl-thumb">{t.thumbnail ? <img src={t.thumbnail} alt="" /> : <div style={thumbBox(612, 792)} />}</div>
      <div className="tpl-name">{t.name}</div>
    </button>
  )
}
