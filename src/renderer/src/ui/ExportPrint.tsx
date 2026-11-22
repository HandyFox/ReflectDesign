import { useEffect, useRef, useState } from 'react'
import { FileDown, ImageDown, Printer } from 'lucide-react'
import { editor as ed } from '@core/editor'
import { formatLength } from '@core/model/units'
import { renderPage } from '@core/render/canvas'
import {
  PAPERS, cardSheetSize, cardsToPrint, currentCardPlan, defaultCardOptions, exportCardPdf, exportImage, exportPdf,
  planImage, printCard, printDocument, tileCount, type CardPrintOptions, type ImageOptions, type PrintOptions
} from '@core/export'
import { FOLD_NAMES, cardPageNames, sheetFor, type CardPlan } from '@core/model/card'

export function ExportView() {
  const multi = ed.doc.pages.length > 1
  const [pdfPages, setPdfPages] = useState<'all' | 'current'>('all')
  const card = ed.doc.pageSetup.card
  const [cardPdf, setCardPdf] = useState<'fold' | 'pages'>('fold')
  const [marks, setMarks] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [img, setImg] = useState<ImageOptions>({ format: 'png', dpi: 300, transparent: false, selectionOnly: false })
  const [custom, setCustom] = useState('300')
  const plan = planImage(img)
  const hasSel = ed.selection.length > 0
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    try { await fn() } catch (e) { alert((e as Error).message) } finally { setBusy(null) }
  }
  return (
    <div className="export-view">
      <h1>Export</h1>
      <section className="ex-card">
        <FileDown size={30} className="ex-icon" />
        <div className="ex-body">
          <h2>Create a PDF</h2>
          <p className="muted">Best for print shops. Text and shapes stay sharp at any size, and your fonts and pictures are included.</p>
          {card && (
            <div className="radio-row">
              <label><input type="radio" checked={cardPdf === 'fold'} onChange={() => setCardPdf('fold')} /> Ready to print and fold (the card laid out on {card.sheetWidth < 600 ? 'A4' : 'Letter'} paper)</label>
              <label><input type="radio" checked={cardPdf === 'pages'} onChange={() => setCardPdf('pages')} /> Separate pages (Front, Inside, Back)</label>
            </div>
          )}
          {multi && !(card && cardPdf === 'fold') && (
            <div className="radio-row">
              <label><input type="radio" checked={pdfPages === 'all'} onChange={() => setPdfPages('all')} /> All {ed.doc.pages.length} pages</label>
              <label><input type="radio" checked={pdfPages === 'current'} onChange={() => setPdfPages('current')} /> Current page only</label>
            </div>
          )}
          {!(card && cardPdf === 'fold') && <label className="check-line">
            <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} />
            Include bleed ({formatLength(ed.doc.pageSetup.bleed, ed.unit)}) and crop marks — only if your print shop asks for them
          </label>}
          <button className="btn primary big" disabled={!!busy} onClick={() => run('pdf', () => (card && cardPdf === 'fold'
            ? exportCardPdf(defaultCardOptions())
            : exportPdf({ pages: pdfPages, bleedAndMarks: marks })))}>
            {busy === 'pdf' ? 'Creating PDF…' : 'Create PDF'}
          </button>
        </div>
      </section>

      <section className="ex-card">
        <ImageDown size={30} className="ex-icon" />
        <div className="ex-body">
          <h2>Save as Picture</h2>
          <p className="muted">PNG or JPEG of the current page{hasSel ? ' or the selected objects' : ''}. Use PNG with a transparent background for titles and cut-outs.</p>
          <div className="radio-row">
            <label><input type="radio" checked={img.format === 'png'} onChange={() => setImg({ ...img, format: 'png' })} /> PNG</label>
            <label><input type="radio" checked={img.format === 'jpeg'} onChange={() => setImg({ ...img, format: 'jpeg', transparent: false })} /> JPEG</label>
          </div>
          <div className="radio-row">
            <span className="radio-label">Resolution:</span>
            {[[96, 'Web (96 dpi)'], [150, 'Draft print (150 dpi)'], [300, 'High quality print (300 dpi)']].map(([d, l]) => (
              <label key={d}><input type="radio" checked={img.dpi === d} onChange={() => { setImg({ ...img, dpi: d as number }); setCustom(String(d)) }} /> {l}</label>
            ))}
            <label>
              <input type="radio" checked={![96, 150, 300].includes(img.dpi)} onChange={() => setImg({ ...img, dpi: Math.max(10, Number(custom) || 200) })} /> Custom
              <input className="small-num" value={custom} onChange={(e) => { setCustom(e.target.value); const v = Number(e.target.value); if (v >= 10 && v <= 1200) setImg({ ...img, dpi: v }) }} /> dpi
            </label>
          </div>
          <label className="check-line">
            <input type="checkbox" disabled={img.format !== 'png'} checked={img.transparent} onChange={(e) => setImg({ ...img, transparent: e.target.checked })} />
            Transparent background (PNG only)
          </label>
          <label className="check-line">
            <input type="checkbox" disabled={!hasSel} checked={img.selectionOnly && hasSel} onChange={(e) => setImg({ ...img, selectionOnly: e.target.checked })} />
            Selected objects only{!hasSel && ' (select something on the page first)'}
          </label>
          {plan && (
            <p className={plan.reduced ? 'warn' : 'muted'}>
              {plan.width.toLocaleString()} × {plan.height.toLocaleString()} pixels
              {plan.reduced && ` — this page is very large, so the picture will be saved at ${plan.dpi} dpi (the most that fits in memory). Use PDF for full quality.`}
            </p>
          )}
          <button className="btn primary big" disabled={!!busy} onClick={() => run('img', () => exportImage({ ...img, selectionOnly: img.selectionOnly && hasSel }))}>
            {busy === 'img' ? 'Saving…' : `Save as ${img.format.toUpperCase()}`}
          </button>
        </div>
      </section>
    </div>
  )
}

export function PrintView() {
  if (ed.doc.pageSetup.card) return <CardPrintView />
  return <PagePrintView />
}

function PagePrintView() {
  const { width, height } = ed.doc.pageSetup
  const big = width > 612 || height > 792
  const [o, setO] = useState<PrintOptions>({
    pages: 'all',
    paper: PAPERS[0],
    orientation: width > height ? 'landscape' : 'portrait',
    layout: 'actual',
    overlap: 18,
    margin: 18
  })
  const [busy, setBusy] = useState(false)
  const t = tileCount(o)
  const sheetsPerPage = t.cols * t.rows
  const pages = o.pages === 'all' ? ed.doc.pages.length : 1
  return (
    <div className="print-view">
      <h1>Print</h1>
      <div className="print-cols">
        <div className="print-settings">
          <button className="btn primary print-btn" disabled={busy} onClick={async () => { setBusy(true); try { await printDocument(o) } finally { setBusy(false) } }}>
            <Printer size={26} /> <span>{busy ? 'Preparing…' : 'Print'}</span>
          </button>
          <p className="muted">Your printer, copies and other options are chosen in the next window.</p>
          <h3>Settings</h3>
          {ed.doc.pages.length > 1 && (
            <label className="field wide"><span>Pages</span>
              <select value={o.pages} onChange={(e) => setO({ ...o, pages: e.target.value as 'all' | 'current' })}>
                <option value="all">Print All Pages</option>
                <option value="current">Print Current Page</option>
              </select>
            </label>
          )}
          <label className="field wide"><span>Paper</span>
            <select value={o.paper.name} onChange={(e) => setO({ ...o, paper: PAPERS.find((p) => p.name === e.target.value)! })}>
              {PAPERS.map((p) => <option key={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label className="field wide"><span>Orientation</span>
            <select value={o.orientation} onChange={(e) => setO({ ...o, orientation: e.target.value as 'portrait' | 'landscape' })}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label className="field wide"><span>Size</span>
            <select value={o.layout} onChange={(e) => setO({ ...o, layout: e.target.value as 'actual' | 'fit' })}>
              <option value="actual">{big ? 'Actual size — tile across sheets' : 'Actual size'}</option>
              <option value="fit">Fit to one sheet</option>
            </select>
          </label>
          {o.layout === 'actual' && sheetsPerPage > 1 && (
            <label className="field wide"><span>Overlap</span>
              <select value={o.overlap} onChange={(e) => setO({ ...o, overlap: Number(e.target.value) })}>
                {[0, 9, 18, 36, 54].map((v) => <option key={v} value={v}>{formatLength(v, 'in')}</option>)}
              </select>
            </label>
          )}
          <p className="sheet-count">
            {sheetsPerPage > 1
              ? <>Each page prints on <b>{t.cols} × {t.rows} = {sheetsPerPage} sheets</b>. Trim along the dotted lines and tape the pieces together.</>
              : <>Prints on <b>{pages} sheet{pages > 1 ? 's' : ''}</b>.</>}
          </p>
        </div>
        <PrintPreview opts={o} cols={t.cols} rows={t.rows} />
      </div>
    </div>
  )
}

function PrintPreview({ opts, cols, rows }: { opts: PrintOptions; cols: number; rows: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const { width, height } = ed.doc.pageSetup
    const box = 420
    const s = box / Math.max(width, height)
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(width * s * dpr)
    c.height = Math.round(height * s * dpr)
    c.style.width = `${Math.round(width * s)}px`
    c.style.height = `${Math.round(height * s)}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0)
    ed.text.sync(ed.version)
    renderPage(ctx, { doc: ed.doc, assets: ed.assets, text: ed.text, pxPerPt: s * dpr, forOutput: true }, ed.page)
    if (cols * rows > 1) {
      const paper = opts.orientation === 'landscape'
        ? { w: Math.max(opts.paper.width, opts.paper.height), h: Math.min(opts.paper.width, opts.paper.height) }
        : { w: Math.min(opts.paper.width, opts.paper.height), h: Math.max(opts.paper.width, opts.paper.height) }
      const stepX = paper.w - opts.margin * 2 - opts.overlap
      const stepY = paper.h - opts.margin * 2 - opts.overlap
      ctx.strokeStyle = 'rgba(192,0,0,0.8)'
      ctx.lineWidth = 1 / s
      ctx.setLineDash([4 / s, 3 / s])
      for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
        ctx.strokeRect(col * stepX, r * stepY, paper.w - opts.margin * 2, paper.h - opts.margin * 2)
      }
    }
  }, [opts, cols, rows])
  return (
    <div className="print-preview">
      <canvas ref={ref} />
    </div>
  )
}

// ---------- greeting cards ----------

/** File › Print for a folded card: the card laid out on the sheet, ready to fold. */
function CardPrintView() {
  const plan = currentCardPlan()!
  const card = ed.doc.pageSetup.card!
  const [o, setO] = useState<CardPrintOptions>(defaultCardOptions)
  const [busy, setBusy] = useState(false)
  const cards = cardsToPrint(o)
  const totalCards = Math.ceil(ed.doc.pages.length / 4)
  const sheet = cardSheetSize(o)
  const sheetCount = cards.length * plan.sides.length
  const paperName = PAPERS.find((p) => samePaper(p, o.paper))?.name ?? 'Custom'
  const missing = ed.doc.pages.length % 4 !== 0
  return (
    <div className="print-view">
      <h1>Print</h1>
      <div className="print-cols">
        <div className="print-settings">
          <button className="btn primary print-btn" disabled={busy} onClick={async () => { setBusy(true); try { await printCard(o) } finally { setBusy(false) } }}>
            <Printer size={26} /> <span>{busy ? 'Preparing…' : 'Print'}</span>
          </button>
          <p className="muted">Your printer, copies and other options are chosen in the next window.</p>
          <h3>Settings</h3>
          <p className="card-kind"><b>{FOLD_NAMES[card.fold]}</b>, {formatLength(ed.doc.pageSetup.width, ed.unit)} × {formatLength(ed.doc.pageSetup.height, ed.unit)}</p>
          {totalCards > 1 && (
            <label className="field wide"><span>Cards</span>
              <select value={o.cards} onChange={(e) => setO({ ...o, cards: e.target.value as 'all' | 'current' })}>
                <option value="all">All {totalCards} cards</option>
                <option value="current">This card only</option>
              </select>
            </label>
          )}
          <label className="field wide"><span>Paper</span>
            <select value={paperName} onChange={(e) => { const p = PAPERS.find((x) => x.name === e.target.value); if (p) setO({ ...o, paper: p }) }}>
              {PAPERS.map((p) => <option key={p.name}>{p.name}</option>)}
              {paperName === 'Custom' && <option>Custom</option>}
            </select>
          </label>
          <label className="check-line">
            <input type="checkbox" checked={o.marks} onChange={(e) => setO({ ...o, marks: e.target.checked })} />
            Trim and fold marks (when the paper is bigger than the card)
          </label>
          {plan.twoSided && (
            <label className="check-line">
              <input type="checkbox" checked={o.insideUpsideDown} onChange={(e) => setO({ ...o, insideUpsideDown: e.target.checked })} />
              The inside came out upside down on a test print — turn it around
            </label>
          )}
          {sheet.shrinks && <p className="warn">This card is bigger than the paper when unfolded, so it will be shrunk to fit. Choose larger paper to print it full size.</p>}
          {missing && <p className="warn">Cards use pages in sets of four (Front, Inside, Inside, Back). Missing pages print blank.</p>}
          <p className="sheet-count">
            {plan.twoSided
              ? <>Prints on <b>both sides of {cards.length} sheet{cards.length > 1 ? 's' : ''}</b>. In the next window choose two-sided printing, <b>Flip on short edge</b>. No two-sided printing? Print page 1, put the sheet back in the tray, then print page 2.</>
              : <>Prints on <b>one side of {sheetCount} sheet{sheetCount > 1 ? 's' : ''}</b>.</>}
          </p>
          <h3>How to fold</h3>
          <ol className="fold-steps">
            {foldSteps(plan, o.marks && !sameSize(sheet, plan)).map((st) => <li key={st}>{st}</li>)}
          </ol>
          <p className="muted">Tip: print a test on plain paper first and fold it to check.</p>
        </div>
        <CardPreview plan={plan} opts={o} cards={cards} />
      </div>
    </div>
  )
}

/** The plan's folding steps, with trimming added before the first fold when needed. */
function foldSteps(plan: CardPlan, trim: boolean): string[] {
  if (!trim) return plan.steps
  // Cutting a flat sheet is easier and neater than cutting a folded one.
  const cut = 'Cut along the trim marks at the corners.'
  return plan.twoSided ? [plan.steps[0], cut, ...plan.steps.slice(1)] : [cut, ...plan.steps]
}

const samePaper = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  Math.abs(Math.min(a.width, a.height) - Math.min(b.width, b.height)) < 1 && Math.abs(Math.max(a.width, a.height) - Math.max(b.width, b.height)) < 1
const sameSize = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1

/** Preview of the printed sheet side(s): panels in place, upside-down ones included, with the folds dashed. */
function CardPreview({ plan, opts, cards }: { plan: CardPlan; opts: CardPrintOptions; cards: Array<Array<number | null>> }) {
  const card = cards[0]
  return (
    <div className="print-preview card-preview">
      {plan.sides.map((side, si) => (
        <figure key={side.name}>
          <CardSideCanvas plan={plan} side={si} opts={opts} card={card} />
          <figcaption>{plan.sides.length > 1 ? `${si === 0 ? 'Page 1' : 'Page 2'}: ${side.name}` : side.name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

function CardSideCanvas({ plan, side, opts, card }: { plan: CardPlan; side: number; opts: CardPrintOptions; card: Array<number | null> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const { width: pw, height: ph, card: setup } = ed.doc.pageSetup
    if (!setup) return
    const sheet = sheetFor(plan, opts.paper)
    const box = plan.sides.length > 1 ? 330 : 440
    const s = box / Math.max(sheet.width, sheet.height)
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(sheet.width * s * dpr)
    c.height = Math.round(sheet.height * s * dpr)
    c.style.width = `${Math.round(sheet.width * s)}px`
    c.style.height = `${Math.round(sheet.height * s)}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, sheet.width * s, sheet.height * s)
    const k = Math.min(1, sheet.width / plan.width, sheet.height / plan.height)
    const ox = (sheet.width - plan.width * k) / 2, oy = (sheet.height - plan.height * k) / 2
    const names = cardPageNames(setup.fold)
    ed.text.sync(ed.version)
    const turnInside = side > 0 && opts.insideUpsideDown
    if (turnInside) { ctx.translate(sheet.width * s, sheet.height * s); ctx.rotate(Math.PI) }
    for (const pl of plan.sides[side].panels) {
      const idx = card[pl.slot]
      ctx.save()
      ctx.scale(s, s)
      ctx.translate(ox + pl.x * k, oy + pl.y * k)
      if (pl.rotate === 180) { ctx.translate(pw * k, ph * k); ctx.rotate(Math.PI) }
      ctx.scale(k, k)
      ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip()
      if (idx !== null) renderPage(ctx, { doc: ed.doc, assets: ed.assets, text: ed.text, pxPerPt: s * k * dpr, forOutput: true }, ed.doc.pages[idx])
      ctx.restore()
    }
    // Folds and panel names (preview only — they are not printed).
    ctx.save()
    ctx.scale(s, s)
    ctx.strokeStyle = 'rgba(192,0,0,0.75)'
    ctx.lineWidth = 1 / s
    ctx.setLineDash([5 / s, 4 / s])
    for (const f of plan.folds) {
      ctx.beginPath()
      if (f.orientation === 'v') { ctx.moveTo(ox + f.pos * k, oy); ctx.lineTo(ox + f.pos * k, oy + plan.height * k) }
      else { ctx.moveTo(ox, oy + f.pos * k); ctx.lineTo(ox + plan.width * k, oy + f.pos * k) }
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.strokeRect(ox, oy, plan.width * k, plan.height * k)
    ctx.restore()
    for (const pl of plan.sides[side].panels) {
      const label = names[pl.slot] + (pl.rotate === 180 ? ' (upside down)' : '')
      ctx.save()
      if (turnInside) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const px = (turnInside ? sheet.width - (ox + (pl.x + pw) * k) : ox + pl.x * k) * s + 4
      const py = (turnInside ? sheet.height - (oy + (pl.y + ph) * k) : oy + pl.y * k) * s + 4
      ctx.font = '11px sans-serif'
      const w = ctx.measureText(label).width + 8
      ctx.fillStyle = 'rgba(30,30,30,0.72)'
      ctx.fillRect(px, py, w, 16)
      ctx.fillStyle = '#fff'
      ctx.fillText(label, px + 4, py + 12)
      ctx.restore()
    }
  }, [plan, side, opts, card])
  return <canvas ref={ref} />
}
