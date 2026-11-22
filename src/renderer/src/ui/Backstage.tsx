import { useEffect, useState } from 'react'
import { ArrowLeft, FileDown, FilePlus2, FileText, FolderOpen, Info, LayoutTemplate, Printer, Save, SaveAll, X } from 'lucide-react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { PAGE_PRESETS, formatLength } from '@core/model/units'
import type { RecentFile, TemplateInfo } from '@shared/api'
import { isDesktop, platform } from '../platform'
import { useEditor } from './useEditor'
import { useDialogs } from './dialogs/DialogHost'
import { ExportView, PrintView } from './ExportPrint'
import { STARTER_TEMPLATES, type StarterTemplate } from '@core/templates/starters'
import { CARD_PRESETS, isQuarterFold, isTopFold } from '@core/model/card'
import { CALENDAR_DESIGNS, buildCalendarDocument, suggestedStart, type CalendarDesign } from '@core/calendar/build'
import { HOLIDAY_SETS, makeEvent } from '@core/calendar/dates'

const starterThumbs = new Map<string, string>()

/** File › New › Calendars: a design, previewed with next year's first month and US holidays. */
function CalendarDesignCard({ d }: { d: CalendarDesign }) {
  const dialogs = useDialogs()
  const key = `calendar:${d.id}`
  const [src, setSrc] = useState(starterThumbs.get(key))
  useEffect(() => {
    if (src) return
    const start = suggestedStart()
    const doc = buildCalendarDocument({
      design: d.id, themeId: d.theme, ...start, months: 1, weekStart: 0, cover: false,
      events: d.id === 'birthdays' ? SAMPLE_BIRTHDAYS() : HOLIDAY_SETS[0].events()
    })
    cmd.pageThumbnail(doc, 0, 220).then((png) => {
      if (!png) return
      const url = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }))
      starterThumbs.set(key, url)
      setSrc(url)
    })
  }, [d, src])
  return (
    <button className="tpl" title={d.description} onClick={() => dialogs.open('newCalendar', d.id)}>
      <div className="tpl-thumb">{src ? <img src={src} alt="" /> : <div style={thumbBox(d.width, d.height)} />}</div>
      <div className="tpl-name">{d.name}</div>
    </button>
  )
}

/** Made-up names, only for the Birthday Board preview picture. */
const SAMPLE_BIRTHDAYS = () => [
  ['Ava', 1, 9], ['Liam', 2, 14], ['Noah', 3, 3], ['Mia', 4, 22], ['Ella', 5, 30], ['Leo', 6, 8], ['Zoe', 7, 19],
  ['Max', 8, 2], ['Ivy', 9, 25], ['Sam', 10, 11], ['Ruby', 11, 6], ['Owen', 12, 17], ['Lily', 3, 21], ['Eli', 9, 9]
].map(([title, month, day]) => makeEvent({ title: title as string, kind: 'birthday', month: month as number, day: day as number }))

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
        <NavItem icon={FolderOpen} label="Open" active={view === 'open'} onClick={() => go('open')} />
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
        {view === 'open' && <OpenView />}
      </main>
    </div>
  )
}

/** File › Open: Recent publications plus Browse, like Publisher's Open screen. */
function OpenView() {
  const [recent, setRecent] = useState<RecentFile[] | null>(null)
  const refresh = () => { platform.listRecent().then(setRecent).catch(() => setRecent([])) }
  useEffect(refresh, [])
  return (
    <div>
      <h1>Open</h1>
      <button className="btn primary" onClick={() => cmd.openDocument()}>
        <FolderOpen size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Browse…
      </button>
      <h2>Recent</h2>
      {!isDesktop && <p className="muted">The recent list is available in the desktop app.</p>}
      {isDesktop && recent && recent.length === 0 && (
        <p className="muted">Publications you open or save will appear here so you can get back to them quickly.</p>
      )}
      {recent && recent.length > 0 && (
        <>
          <ul className="recent-list">
            {recent.map((r) => (
              <li key={r.path}>
                <button className="recent-item" title={r.path} onClick={() => cmd.openRecent(r.path)}>
                  <div className="recent-thumb">{r.thumbnail ? <img src={r.thumbnail} alt="" /> : <FileText size={26} />}</div>
                  <div className="recent-text">
                    <b>{r.name.replace(/\.(rdx|rdt)$/i, '')}{/\.rdt$/i.test(r.name) ? ' (template)' : ''}</b>
                    <span className="muted">{r.folder}</span>
                  </div>
                  <span className="recent-date muted">{friendlyDate(r.opened)}</span>
                </button>
                <button className="recent-remove" title="Remove from list" aria-label={`Remove ${r.name} from the recent list`}
                  onClick={() => { platform.removeRecent(r.path).then(refresh) }}><X size={14} /></button>
              </li>
            ))}
          </ul>
          <button className="btn" onClick={() => { platform.removeRecent(null).then(refresh) }}>Clear Recent List</button>
        </>
      )}
    </div>
  )
}

function friendlyDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  return d.toLocaleDateString()
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
  const dialogs = useDialogs()
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
      <h2>Calendars</h2>
      <div className="tpl-grid">
        {CALENDAR_DESIGNS.map((d) => <CalendarDesignCard key={d.id} d={d} />)}
      </div>
      <h2>Greeting Cards</h2>
      <div className="tpl-grid">
        {STARTER_TEMPLATES.filter((t) => t.category === 'Greeting Cards').map((t) => <StarterCard key={t.id} t={t} />)}
        {CARD_PRESETS.map((c) => (
          <button key={c.id} className="tpl" title={`${c.description}. Four pages: Front, Inside, Inside, Back.`} onClick={() => cmd.newCard(c)}>
            <div className="tpl-thumb blank card">
              <div style={{
                ...thumbBox(c.width, c.height),
                ...(isTopFold(c.fold) ? { borderTop: '3px solid #a9a9a9' } : { borderLeft: '3px solid #a9a9a9' })
              }} />
            </div>
            <div className="tpl-name">{c.name}</div>
            <div className="tpl-sub">{isQuarterFold(c.fold) ? 'Prints on one side' : 'Prints on both sides'} · {c.sheet.name}</div>
          </button>
        ))}
      </div>
      <h2>Featured</h2>
      <div className="tpl-grid">
        {STARTER_TEMPLATES.filter((t) => t.category !== 'Greeting Cards').map((t) => <StarterCard key={t.id} t={t} />)}
        {featured.map((t) => <TemplateCard key={t.id} t={t} />)}
      </div>
      <h2>Personal</h2>
      <div className="tpl-grid">
        <button className="tpl" title="Start a blank design that is saved as one of your templates" onClick={() => dialogs.open('newTemplate')}>
          <div className="tpl-thumb more"><LayoutTemplate size={34} /></div>
          <div className="tpl-name">New Blank Template</div>
        </button>
      </div>
      {loaded && personal.length === 0 && <p className="muted">Templates you make here, or save with <b>File › Save As › ReflectDesign Template</b>, appear here.</p>}
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
