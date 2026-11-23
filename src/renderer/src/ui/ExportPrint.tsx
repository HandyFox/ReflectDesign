import { useEffect, useRef, useState } from 'react'
import { FileDown, ImageDown, Printer } from 'lucide-react'
import { editor as ed } from '@core/editor'
import { formatLength } from '@core/model/units'
import { renderPage } from '@core/render/canvas'
import {
  PAPERS, cardImposition, cardSheetSize, cardsToPrint, currentCardPlan, defaultCardOptions, defaultSheetOptions, exportCardPdf, exportImage, exportPdf,
  planImage, printCard, printSheets, sheetSummary, type CardPrintOptions, type ImageOptions, type SheetOptions
} from '@core/export'
import { PaperOptions, SheetPreview } from './PaperOptions'
import { FOLD_NAMES, cardPageNames, type CardImposition, type CardPlan, type FoldKind } from '@core/model/card'

export function ExportView() {
  const multi = ed.doc.pages.length > 1
  const card = ed.doc.pageSetup.card
  const [cardPdf, setCardPdf] = useState<'fold' | 'half' | 'pages'>('fold')
  const cardSheet = cardPdf !== 'pages'
  // PDF: the design's own size by default; or any paper, fitted or split into sheets.
  const [pdf, setPdf] = useState<SheetOptions>(() => defaultSheetOptions('design'))
  const pdfPages = pdf.pages
  const setPdfPages = (pages: 'all' | 'current') => setPdf({ ...pdf, pages })
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
              <label><input type="radio" checked={cardPdf === 'fold'} onChange={() => setCardPdf('fold')} /> Ready to print and fold{isQuarter(card.fold) ? ' in fourths (one side)' : ''} — on {card.sheetWidth < 600 ? 'A4' : 'Letter'} paper</label>
              {isQuarter(card.fold) && <label><input type="radio" checked={cardPdf === 'half'} onChange={() => setCardPdf('half')} /> Ready to print on both sides and fold in half</label>}
              <label><input type="radio" checked={cardPdf === 'pages'} onChange={() => setCardPdf('pages')} /> Separate pages (Front, Inside, Back)</label>
            </div>
          )}
          {multi && !(card && cardSheet) && (
            <div className="radio-row">
              <label><input type="radio" checked={pdfPages === 'all'} onChange={() => setPdfPages('all')} /> All {ed.doc.pages.length} pages</label>
              <label><input type="radio" checked={pdfPages === 'current'} onChange={() => setPdfPages('current')} /> Current page only</label>
            </div>
          )}
          {!(card && cardSheet) && (
            <div className="pdf-paper">
              <div>
                <PaperOptions o={pdf} setO={setPdf} forExport />
                {pdf.layout === 'design' && (
                  <label className="check-line">
                    <input type="checkbox" checked={pdf.bleedAndMarks} onChange={(e) => setPdf({ ...pdf, bleedAndMarks: e.target.checked })} />
                    Include bleed ({formatLength(ed.doc.pageSetup.bleed, ed.unit)}) and crop marks — only if your print shop asks for them
                  </label>
                )}
              </div>
              {pdf.layout !== 'design' && <SheetPreview o={pdf} />}
            </div>
          )}
          <button className="btn primary big" disabled={!!busy || (pdf.layout === 'poster' && !sheetSummary(pdf).plan)} onClick={() => run('pdf', () => (card && cardSheet
            ? exportCardPdf({ ...defaultCardOptions(), fold: cardPdf === 'half' ? 'half' : 'designed' })
            : exportPdf(pdf)))}>
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
  const [o, setO] = useState<SheetOptions>(() => defaultSheetOptions('poster'))
  const [busy, setBusy] = useState(false)
  const sum = sheetSummary(o)
  return (
    <div className="print-view">
      <h1>Print</h1>
      <div className="print-cols">
        <div className="print-settings">
          <button className="btn primary print-btn" disabled={busy || sum.sheets === 0} onClick={async () => {
            setBusy(true)
            try { await printSheets(o) } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
          }}>
            <Printer size={26} /> <span>{busy ? 'Preparing…' : 'Print'}</span>
          </button>
          <p className="muted">Your printer, copies and other options are chosen in the next window. Print at 100% (“actual size”) there, so the sheets fit together.</p>
          <h3>Settings</h3>
          {ed.doc.pages.length > 1 && (
            <label className="field wide"><span>Pages</span>
              <select value={o.pages} onChange={(e) => setO({ ...o, pages: e.target.value as 'all' | 'current' })}>
                <option value="all">Print All Pages</option>
                <option value="current">Print Current Page</option>
              </select>
            </label>
          )}
          <PaperOptions o={o} setO={setO} forExport={false} />
        </div>
        <SheetPreview o={o} />
      </div>
    </div>
  )
}

// ---------- greeting cards ----------

const isQuarter = (f: FoldKind) => f === 'quarterSide' || f === 'quarterTop'

/** File › Print for a folded card: the card laid out on the sheet, ready to fold. */
function CardPrintView() {
  const card = ed.doc.pageSetup.card!
  const [o, setO] = useState<CardPrintOptions>(defaultCardOptions)
  const [busy, setBusy] = useState(false)
  const plan = currentCardPlan(o)!
  const imp = cardImposition(o)!
  const cards = cardsToPrint(o)
  const totalCards = Math.ceil(ed.doc.pages.length / 4)
  const sheet = cardSheetSize(o)
  const fitCount = cardImposition({ ...o, perSheet: 'fill' })!.cards.length
  const perSheet = imp.cards.length
  const sheetCount = cards.length * plan.sides.length
  const paperName = PAPERS.find((p) => samePaper(p, o.paper))?.name ?? 'Custom'
  const missing = ed.doc.pages.length % 4 !== 0
  const edge = imp.duplex === 'short' ? 'short' : 'long'
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
          {isQuarter(card.fold) && (
            <fieldset className="radio-col">
              <legend>Fold</legend>
              <label><input type="radio" checked={o.fold === 'designed'} onChange={() => setO({ ...o, fold: 'designed' })} /> In fourths — prints on one side of the paper, fold twice</label>
              <label><input type="radio" checked={o.fold === 'half'} onChange={() => setO({ ...o, fold: 'half' })} /> In half — prints on both sides, fold once like a store-bought card</label>
            </fieldset>
          )}
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
          {fitCount > 1 && (
            <label className="field wide"><span>Per sheet</span>
              <select value={o.perSheet} onChange={(e) => setO({ ...o, perSheet: e.target.value as 'one' | 'fill' })}>
                <option value="fill">{fitCount} copies (cut apart)</option>
                <option value="one">One card</option>
              </select>
            </label>
          )}
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
              ? <>Prints on <b>both sides of {cards.length} sheet{cards.length > 1 ? 's' : ''}</b>{perSheet > 1 ? <> ({perSheet} cards on each)</> : null}. In the next window choose two-sided printing, <b>flip on {edge} edge</b>. No two-sided printing? Print page 1 only, put the printed sheet back in the tray, then print page 2.</>
              : <>Prints on <b>one side of {sheetCount} sheet{sheetCount > 1 ? 's' : ''}</b>{perSheet > 1 ? <> ({perSheet} cards on each)</> : null}.</>}
          </p>
          <h3>How to fold</h3>
          <ol className="fold-steps">
            {foldSteps(plan, imp, o.marks && marksFit(imp)).map((st) => <li key={st}>{st}</li>)}
          </ol>
          <p className="muted">Tip: print a test on plain paper first and fold it to check.</p>
        </div>
        <CardPreview imp={imp} opts={o} cards={cards} />
      </div>
    </div>
  )
}

/** The plan's folding steps, with cutting added before the first fold when needed. */
function foldSteps(plan: CardPlan, imp: CardImposition, marks: boolean): string[] {
  // Cutting a flat sheet is easier and neater than cutting a folded one.
  const n = imp.cards.length
  const size = `${formatLength(imp.cardWidth, ed.unit)} × ${formatLength(imp.cardHeight, ed.unit)}`
  const fills = sameSize({ width: imp.sheetWidth, height: imp.sheetHeight }, { width: imp.cardWidth, height: imp.cardHeight })
  const cut = n > 1
    ? (marks ? `Cut the sheet into ${n} cards along the trim marks (each ${size}).`
      : n === 2 ? `Cut the sheet in half, into two ${size} pieces.`
      : `Cut the sheet into ${n} pieces, each ${size}.`) + ' Fold each one as below.'
    : marks ? 'Cut along the trim marks at the corners.'
    : fills ? null : `Trim the card to ${size}.`
  if (!cut) return plan.steps
  return plan.twoSided ? [plan.steps[0], cut, ...plan.steps.slice(1)] : [cut, ...plan.steps]
}

/** Trim marks are only printed in paper margins of 10 pt or more (see cardMarks). */
const marksFit = (imp: CardImposition) => {
  if (!imp.cards.length) return false
  const left = Math.min(...imp.cards.map((c) => c.x)), top = Math.min(...imp.cards.map((c) => c.y))
  return left >= 10 || top >= 10
}

const samePaper = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  Math.abs(Math.min(a.width, a.height) - Math.min(b.width, b.height)) < 1 && Math.abs(Math.max(a.width, a.height) - Math.max(b.width, b.height)) < 1
const sameSize = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1

/** Preview of the printed sheet side(s): panels in place, upside-down ones included, with the folds dashed. */
function CardPreview({ imp, opts, cards }: { imp: CardImposition; opts: CardPrintOptions; cards: Array<Array<number | null>> }) {
  const card = cards[0]
  return (
    <div className="print-preview card-preview">
      {imp.sides.map((side, si) => (
        <figure key={side.name}>
          <CardSideCanvas imp={imp} side={si} opts={opts} card={card} />
          <figcaption>{imp.sides.length > 1 ? `${si === 0 ? 'Page 1' : 'Page 2'}: ${side.name}` : side.name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

function CardSideCanvas({ imp, side, opts, card }: { imp: CardImposition; side: number; opts: CardPrintOptions; card: Array<number | null> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const { width: pw, height: ph, card: setup } = ed.doc.pageSetup
    if (!setup) return
    const W = imp.sheetWidth, H = imp.sheetHeight, k = imp.scale
    const box = imp.sides.length > 1 ? 330 : 440
    const s = box / Math.max(W, H)
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(W * s * dpr)
    c.height = Math.round(H * s * dpr)
    c.style.width = `${Math.round(W * s)}px`
    c.style.height = `${Math.round(H * s)}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W * s, H * s)
    const names = cardPageNames(setup.fold)
    ed.text.sync(ed.version)
    const turnInside = side > 0 && opts.insideUpsideDown
    // Sheet point → preview pixels (the turned-around inside is rotated about the sheet centre).
    const tx = (x: number) => (turnInside ? W - x : x) * s
    const ty = (y: number) => (turnInside ? H - y : y) * s
    const panels = imp.sides[side].panels
    for (const pl of panels) {
      const idx = card[pl.slot]
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (turnInside) { ctx.translate(W * s, H * s); ctx.rotate(Math.PI) }
      ctx.scale(s, s)
      ctx.translate(pl.x, pl.y)
      if (pl.rotate === 180) { ctx.translate(pl.width, pl.height); ctx.rotate(Math.PI) }
      ctx.scale(k, k)
      ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip()
      if (idx !== null) renderPage(ctx, { doc: ed.doc, assets: ed.assets, text: ed.text, pxPerPt: s * k * dpr, forOutput: true }, ed.doc.pages[idx])
      ctx.restore()
    }
    // Card edges (solid) and folds (dashed) — preview only, not printed.
    const plan = currentCardPlan(opts)!
    const origins = side === 0 || !imp.flip ? imp.cards : imp.cards.map((cd) => ({
      x: imp.flip === 'vertical' ? W - cd.x - imp.cardWidth : cd.x,
      y: imp.flip === 'horizontal' ? H - cd.y - imp.cardHeight : cd.y
    }))
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineWidth = 1
    for (const o of origins) {
      ctx.setLineDash([])
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      const x0 = tx(o.x), y0 = ty(o.y), x1 = tx(o.x + imp.cardWidth), y1 = ty(o.y + imp.cardHeight)
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
      ctx.strokeStyle = 'rgba(192,0,0,0.75)'
      ctx.setLineDash([5, 4])
      for (const f of plan.folds) {
        ctx.beginPath()
        if (f.orientation === 'v') { const x = tx(o.x + f.pos * k); ctx.moveTo(x, y0); ctx.lineTo(x, y1) }
        else { const y = ty(o.y + f.pos * k); ctx.moveTo(x0, y); ctx.lineTo(x1, y) }
        ctx.stroke()
      }
    }
    ctx.restore()
    // Panel names, upright, at each panel's top-left as it appears.
    for (const pl of panels) {
      const label = names[pl.slot] + (pl.rotate === 180 ? ' (upside down)' : '')
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const px = Math.min(tx(pl.x), tx(pl.x + pl.width)) + 4
      const py = Math.min(ty(pl.y), ty(pl.y + pl.height)) + 4
      ctx.font = '11px sans-serif'
      const w = ctx.measureText(label).width + 8
      ctx.fillStyle = 'rgba(30,30,30,0.72)'
      ctx.fillRect(px, py, w, 16)
      ctx.fillStyle = '#fff'
      ctx.fillText(label, px + 4, py + 12)
      ctx.restore()
    }
  }, [imp, side, opts, card])
  return <canvas ref={ref} />
}
