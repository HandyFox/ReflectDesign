import { useEffect, useRef, useState } from 'react'
import { FileDown, ImageDown, Printer } from 'lucide-react'
import { editor as ed } from '@core/editor'
import { formatLength } from '@core/model/units'
import { renderPage } from '@core/render/canvas'
import { PAPERS, exportImage, exportPdf, planImage, printDocument, tileCount, type ImageOptions, type PrintOptions } from '@core/export'

export function ExportView() {
  const multi = ed.doc.pages.length > 1
  const [pdfPages, setPdfPages] = useState<'all' | 'current'>('all')
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
          {multi && (
            <div className="radio-row">
              <label><input type="radio" checked={pdfPages === 'all'} onChange={() => setPdfPages('all')} /> All {ed.doc.pages.length} pages</label>
              <label><input type="radio" checked={pdfPages === 'current'} onChange={() => setPdfPages('current')} /> Current page only</label>
            </div>
          )}
          <label className="check-line">
            <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} />
            Include bleed ({formatLength(ed.doc.pageSetup.bleed, ed.unit)}) and crop marks — only if your print shop asks for them
          </label>
          <button className="btn primary big" disabled={!!busy} onClick={() => run('pdf', () => exportPdf({ pages: pdfPages, bleedAndMarks: marks }))}>
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
