// Paper size and poster (tiled) settings, shared by File › Export › PDF and
// File › Print, with a preview of where the sheets join.

import { useEffect, useRef, useState } from 'react'
import { editor as ed } from '@core/editor'
import { currentPosterPlan, pictureDpi, sheetSummary, type SheetOptions } from '@core/export'
import { PAPER_GROUPS, PAPER_SIZES, assemblySteps, sheetLabel, type PosterScale } from '@core/poster'
import { formatLength, parseLength } from '@core/model/units'
import { renderPage } from '@core/render/canvas'

const IN = 72

/** Paper menu value for a paper (or 'design' / 'custom'). */
function paperValue(o: SheetOptions): string {
  if (o.layout === 'design') return 'design'
  const known = PAPER_SIZES.find((p) => p.name === o.paper.name)
  return known ? known.id : 'custom'
}

export function PaperOptions({ o, setO, forExport }: { o: SheetOptions; setO: (o: SheetOptions) => void; forExport: boolean }) {
  const u = ed.unit === 'pt' ? 'in' : ed.unit
  const f = (pt: number) => formatLength(pt, u)
  const { width: dw, height: dh } = ed.doc.pageSetup
  const [customW, setCustomW] = useState(f(o.paper.width))
  const [customH, setCustomH] = useState(f(o.paper.height))
  const scale = o.poster.scale
  const [scaleText, setScaleText] = useState(scale.mode === 'percent' ? String(scale.percent) : f(scale.mode === 'width' ? scale.width : scale.height))
  const sum = sheetSummary(o)
  const plan = sum.plan
  const dpi = o.layout === 'design' ? null : pictureDpi(o)
  const setPoster = (p: Partial<SheetOptions['poster']>) => setO({ ...o, poster: { ...o.poster, ...p } })

  const pickPaper = (v: string) => {
    if (v === 'design') return setO({ ...o, layout: 'design' })
    const layout = o.layout === 'design' ? 'poster' : o.layout
    if (v === 'custom') {
      const w = parseLength(customW, u), h = parseLength(customH, u)
      return setO({ ...o, layout, paper: { name: 'Custom', width: w && w > 72 ? w : 8.5 * IN, height: h && h > 72 ? h : 11 * IN } })
    }
    const p = PAPER_SIZES.find((x) => x.id === v)!
    setO({ ...o, layout, paper: { name: p.name, width: p.width, height: p.height } })
  }
  const setCustom = (wText: string, hText: string) => {
    setCustomW(wText); setCustomH(hText)
    const w = parseLength(wText, u), h = parseLength(hText, u)
    if (w && h && w >= 72 && h >= 72 && w <= 200 * IN && h <= 200 * IN) setO({ ...o, paper: { name: 'Custom', width: w, height: h } })
  }
  const setScaleMode = (mode: PosterScale['mode']) => {
    const cur = plan?.scale ?? 1
    const next: PosterScale = mode === 'percent' ? { mode, percent: Math.round(cur * 100) } : mode === 'width' ? { mode, width: dw * cur } : { mode, height: dh * cur }
    setScaleText(mode === 'percent' ? String(Math.round(cur * 100)) : f(mode === 'width' ? dw * cur : dh * cur))
    setPoster({ scale: next })
  }
  const typeScale = (text: string) => {
    setScaleText(text)
    if (scale.mode === 'percent') {
      const v = Number(text.replace('%', ''))
      if (v >= 1 && v <= 10000) setPoster({ scale: { mode: 'percent', percent: v } })
    } else {
      const v = parseLength(text, u)
      if (v && v > 9 && v <= 2000 * IN) setPoster({ scale: scale.mode === 'width' ? { mode: 'width', width: v } : { mode: 'height', height: v } })
    }
  }

  return (
    <div className="paper-options">
      <label className="field wide"><span>Paper</span>
        <select value={paperValue(o)} onChange={(e) => pickPaper(e.target.value)}>
          {forExport && <option value="design">Same size as the design ({f(dw)} × {f(dh)})</option>}
          {PAPER_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {PAPER_SIZES.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          ))}
          <option value="custom">Custom size…</option>
        </select>
      </label>
      {paperValue(o) === 'custom' && (
        <div className="field wide"><span>Custom</span>
          <input value={customW} onChange={(e) => setCustom(e.target.value, customH)} aria-label="Paper width" style={{ flex: '0 0 80px' }} />
          <span className="times">×</span>
          <input value={customH} onChange={(e) => setCustom(customW, e.target.value)} aria-label="Paper height" style={{ flex: '0 0 80px' }} />
        </div>
      )}

      {o.layout !== 'design' && (
        <>
          <div className="radio-col">
            <label><input type="radio" checked={o.layout === 'poster'} onChange={() => setO({ ...o, layout: 'poster' })} /> <b>Full size</b> — split across as many sheets as it needs, to put together</label>
            <label><input type="radio" checked={o.layout === 'fit'} onChange={() => setO({ ...o, layout: 'fit' })} /> <b>Fit on one sheet</b> — shrink or enlarge each page to fit</label>
          </div>
          {o.layout === 'poster' && (
            <>
              <div className="field wide"><span>Size</span>
                <select value={scale.mode} onChange={(e) => setScaleMode(e.target.value as PosterScale['mode'])}>
                  <option value="percent">Percent of the design</option>
                  <option value="width">Finished width</option>
                  <option value="height">Finished height</option>
                </select>
                <input value={scaleText} onChange={(e) => typeScale(e.target.value)} aria-label="Size" style={{ flex: '0 0 80px' }} />
                {scale.mode === 'percent' && <span className="times">%</span>}
              </div>
              <div className="size-presets">
                {[100, 150, 200, 300, 400].map((p) => (
                  <button key={p} className={`chip ${scale.mode === 'percent' && scale.percent === p ? 'on' : ''}`}
                    onClick={() => { setScaleText(String(p)); setPoster({ scale: { mode: 'percent', percent: p } }) }}>{p === 100 ? 'Actual size' : `${p}%`}</button>
                ))}
              </div>
              <label className="field wide"><span>Orientation</span>
                <select value={o.poster.orientation} onChange={(e) => setPoster({ orientation: e.target.value as SheetOptions['poster']['orientation'] })}>
                  <option value="auto">Automatic (fewest sheets)</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              <label className="field wide"><span>Overlap</span>
                <select value={o.poster.overlap} onChange={(e) => setPoster({ overlap: Number(e.target.value) })}>
                  <option value={0}>None — cut and butt the edges together</option>
                  <option value={IN / 4}>{f(IN / 4)}</option>
                  <option value={IN / 2}>{f(IN / 2)} (recommended)</option>
                  <option value={IN}>{f(IN)}</option>
                </select>
              </label>
              <label className="field wide" title="Most home printers can’t print right to the edge of the paper"><span>Printer edge</span>
                <select value={o.poster.margin} onChange={(e) => setPoster({ margin: Number(e.target.value) })}>
                  <option value={0}>None (borderless printing)</option>
                  <option value={IN / 8}>{f(IN / 8)}</option>
                  <option value={IN / 4}>{f(IN / 4)} (most printers)</option>
                  <option value={IN / 2}>{f(IN / 2)}</option>
                </select>
              </label>
              <label className="check-line"><input type="checkbox" checked={o.poster.marks} onChange={(e) => setPoster({ marks: e.target.checked })} /> Cut marks, line-up marks and sheet labels (A1, A2…)</label>
              <label className="check-line"><input type="checkbox" checked={o.poster.guide} onChange={(e) => setPoster({ guide: e.target.checked })} /> Assembly guide as the first page</label>
            </>
          )}
          {o.layout === 'fit' && (
            <label className="field wide"><span>Orientation</span>
              <select value={o.poster.orientation} onChange={(e) => setPoster({ orientation: e.target.value as SheetOptions['poster']['orientation'] })}>
                <option value="auto">Same as the design</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
          )}
        </>
      )}

      <div className="sheet-count">
        {o.layout === 'poster' && plan && (
          <>
            Finished size <b>{f(plan.posterWidth)} × {f(plan.posterHeight)}</b>{' '}
            {plan.cols * plan.rows > 1
              ? <>on <b>{plan.cols} × {plan.rows} = {plan.cols * plan.rows} sheets</b> of {o.paper.name.replace(/ \(.*\)$/, '')}, {plan.orientation}{o.poster.guide ? ', plus the guide page' : ''}.</>
              : <>— fits on one sheet of {o.paper.name.replace(/ \(.*\)$/, '')}.</>}
            {ed.doc.pages.length > 1 && o.pages === 'all' && <> For all {ed.doc.pages.length} pages: <b>{sum.sheets} sheets</b>.</>}
          </>
        )}
        {o.layout === 'poster' && !plan && <span className="warn">The paper is too small for these margins. Choose larger paper or a smaller printer edge.</span>}
        {o.layout === 'fit' && <>Each page on one sheet of {o.paper.name.replace(/ \(.*\)$/, '')}: <b>{sum.sheets} sheet{sum.sheets === 1 ? '' : 's'}</b>.</>}
      </div>
      {dpi !== null && dpi < 150 && (
        <p className="warn">At this size your pictures print at about {Math.round(dpi)} dpi, so they may look soft up close. They look fine from a few steps away, as posters usually are. For sharper results, use higher-resolution pictures.</p>
      )}
      {o.layout === 'poster' && plan && plan.cols * plan.rows > 1 && (
        <details className="assembly">
          <summary>How to put it together</summary>
          <ol>{assemblySteps(plan).map((s) => <li key={s}>{s}</li>)}</ol>
        </details>
      )}
    </div>
  )
}

/** The current page with the sheets drawn on it (poster), or the page on one sheet (fit). */
export function SheetPreview({ o }: { o: SheetOptions }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const { width, height } = ed.doc.pageSetup
    const plan = o.layout === 'poster' ? currentPosterPlan(o) : null
    const sum = sheetSummary(o)
    // What the picture shows: the page (poster/design) or the whole sheet (fit).
    const showW = o.layout === 'fit' ? sum.width : width, showH = o.layout === 'fit' ? sum.height : height
    const box = 440
    const s = box / Math.max(showW, showH)
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(showW * s * dpr)
    c.height = Math.round(showH * s * dpr)
    c.style.width = `${Math.round(showW * s)}px`
    c.style.height = `${Math.round(showH * s)}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, showW * s, showH * s)
    ed.text.sync(ed.version)
    let k = s, ox = 0, oy = 0
    if (o.layout === 'fit') {
      const m = o.poster.margin
      const fit = Math.min((sum.width - m * 2) / width, (sum.height - m * 2) / height)
      k = s * fit
      ox = (sum.width - width * fit) / 2 * s
      oy = (sum.height - height * fit) / 2 * s
    }
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(k, k)
    renderPage(ctx, { doc: ed.doc, assets: ed.assets, text: ed.text, pxPerPt: k * dpr, forOutput: true }, ed.page)
    ctx.restore()
    if (plan && plan.cols * plan.rows > 1) {
      // Seams between sheets, in design units (the poster is the design × scale).
      const toDesign = 1 / plan.scale
      ctx.strokeStyle = 'rgba(208,0,0,0.9)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      for (let col = 1; col < plan.cols; col++) {
        const x = col * plan.stepX * toDesign * s
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height * s); ctx.stroke()
      }
      for (let r = 1; r < plan.rows; r++) {
        const y = r * plan.stepY * toDesign * s
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width * s, y); ctx.stroke()
      }
      ctx.setLineDash([])
      const size = Math.max(9, Math.min(16, plan.stepX * toDesign * s * 0.2))
      ctx.font = `bold ${size}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let r = 0; r < plan.rows; r++) for (let col = 0; col < plan.cols; col++) {
        const cx = (col * plan.stepX + Math.min(plan.stepX, plan.posterWidth - col * plan.stepX) / 2) * toDesign * s
        const cy = (r * plan.stepY + Math.min(plan.stepY, plan.posterHeight - r * plan.stepY) / 2) * toDesign * s
        const l = sheetLabel(r, col)
        const bw = ctx.measureText(l).width + 10, bh = size + 6
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh)
        ctx.strokeStyle = 'rgba(208,0,0,0.9)'
        ctx.lineWidth = 1
        ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh)
        ctx.fillStyle = '#c00000'
        ctx.fillText(l, cx, cy + 1)
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, showW * s - 1, showH * s - 1)
  }, [o, ed.version, ed.pageIndex])
  return (
    <div className="print-preview">
      <canvas ref={ref} />
    </div>
  )
}

