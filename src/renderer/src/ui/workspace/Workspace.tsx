import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { editor as ed } from '@core/editor'
import type { GroupObject, Id, PictureObject, SceneObject, TextBoxObject } from '@core/model/types'
import { boundsOfObjects, makeGroup, newId, objectCorners } from '@core/model/factory'
import { frameOf, getObject, locate, setFrame, settleScratch, translate, type Frame } from '@core/model/ops'
import { drawObjects, drawPageBackground, withObjectTransform, type RenderEnv } from '@core/render/canvas'
import { cropDrag, cropPan, cropScale, edgeDistance, handlePoints, hitObject, resizeFrame, toLocal, toPage, type Crop, type Handle, type Pt } from '@core/geometry/hit'
import { insertShape, insertTextBox, linkTextBoxes, placeImageFiles, cloneSelectionForDrag } from './workspaceCommands'
import {
  handleTextKey, pasteText, placeCaret, selectParagraphAt, selectWordAt, startEditing, stopEditing, textPosAt, typeText
} from '@core/textEditing'
import { caretRect, xAtOffset } from '@core/text/layout'
import { orderRange, comparePos } from '@core/text/edit'
import { PT_PER } from '@core/model/units'
import { useEditor } from '../useEditor'
import { isMisspelled, misspelledIn, spellReady, wordAt, type WordRange } from '@core/spell'

const misspelledCache = new Map<string, { version: number; words: WordRange[] }>()

const RULER = 22 // px
const HANDLE = 7 // px
const ROT_OFFSET = 22 // px above the top edge
const BORDER_GRAB = 6 // px band along a text box edge that selects instead of typing
const SNAP_PX = 6

const SCRATCH_COLOR = '#c8c8c8'
const MARGIN_GUIDE = '#3f9fd8'
const RULER_GUIDE = '#00a651'
const SELECT_COLOR = '#5c5c5c'

type Drag =
  | { kind: 'none' }
  | { kind: 'move'; start: Pt; applied: Pt; ids: Id[]; moved: boolean; startBounds: Frame }
  | { kind: 'resize'; handle: Handle; start: Frame; ids: Id[]; startFrames: Map<Id, Frame>; aspect: boolean }
  | { kind: 'rotate'; center: Pt; startAngle: number; startRotation: number; ids: Id[]; startFrames: Map<Id, Frame> }
  | { kind: 'marquee'; start: Pt; cur: Pt; additive: boolean }
  | { kind: 'draw'; start: Pt; cur: Pt }
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'text'; boxId: Id }
  | { kind: 'guide'; id: Id | null; orientation: 'h' | 'v'; pos: number }
  | { kind: 'crop'; id: Id; handle: Handle; start: Frame; crop0: Crop; flipH: boolean; flipV: boolean }
  | { kind: 'cropPan'; id: Id; startPt: Pt; start: Frame; crop0: Crop; flipH: boolean; flipV: boolean }

interface View { ox: number; oy: number }

export interface SpellTarget {
  storyId: Id
  word: WordRange
}

export function Workspace({ onContextMenu }: { onContextMenu: (x: number, y: number, spell: SpellTarget | null) => void }) {
  const e = useEditor()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hRulerRef = useRef<HTMLCanvasElement>(null)
  const vRulerRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const view = useRef<View>({ ox: 40, oy: 40 })
  const drag = useRef<Drag>({ kind: 'none' })
  const snapLines = useRef<Array<{ o: 'h' | 'v'; pos: number }>>([])
  const size = useRef({ w: 800, h: 600 })
  const lastViewReq = useRef(0)
  const spaceDown = useRef(false)
  const caretBlink = useRef(true)

  const scale = () => (ed.zoom * 96) / 72 // CSS px per point

  // ---------- coordinate conversion ----------
  const toPt = (sx: number, sy: number): Pt => {
    const s = scale()
    return { x: (sx - view.current.ox) / s, y: (sy - view.current.oy) / s }
  }
  const toScr = (p: Pt): Pt => {
    const s = scale()
    return { x: view.current.ox + p.x * s, y: view.current.oy + p.y * s }
  }
  const eventPt = (ev: { clientX: number; clientY: number }): { sx: number; sy: number } => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { sx: ev.clientX - r.left, sy: ev.clientY - r.top }
  }

  // ---------- view requests (fit page etc.) ----------
  const fit = useCallback((kind: 'fit-page' | 'page-width' | 'fit-selection' | 'center') => {
    const { w, h } = size.current
    const pad = 30
    const { width: pw, height: ph } = ed.doc.pageSetup
    if (kind === 'fit-page' || kind === 'page-width') {
      const s = kind === 'fit-page' ? Math.min((w - pad * 2) / pw, (h - pad * 2) / ph) : (w - pad * 2) / pw
      ed.zoom = Math.max(0.1, (s * 72) / 96)
      view.current = { ox: (w - pw * s) / 2, oy: kind === 'fit-page' ? (h - ph * s) / 2 : pad }
    } else if (kind === 'fit-selection') {
      const objs = ed.selectedObjects
      if (!objs.length) return fit('fit-page')
      const b = boundsOfObjects(objs)
      const s = Math.min((w - pad * 2) / Math.max(b.width, 10), (h - pad * 2) / Math.max(b.height, 10))
      ed.zoom = Math.max(0.1, Math.min(40, (s * 72) / 96))
      const ss = scale()
      view.current = { ox: w / 2 - (b.x + b.width / 2) * ss, oy: h / 2 - (b.y + b.height / 2) * ss }
    } else {
      const s = scale()
      view.current = { ox: (w - pw * s) / 2, oy: Math.max(pad, (h - ph * s) / 2) }
    }
    lastZoom.current = ed.zoom
  }, [])

  // Zoom changed from outside (status bar slider): keep the centre still.
  const lastZoom = useRef(ed.zoom)
  if (lastZoom.current !== ed.zoom && drag.current.kind === 'none') {
    const { w, h } = size.current
    const before = (lastZoom.current * 96) / 72
    const after = scale()
    const cx = (w / 2 - view.current.ox) / before
    const cy = (h / 2 - view.current.oy) / before
    view.current = { ox: w / 2 - cx * after, oy: h / 2 - cy * after }
  }
  lastZoom.current = ed.zoom

  // ---------- drawing ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const { w, h } = size.current
    const s = scale()
    const { ox, oy } = view.current
    const doc = ed.doc
    const page = ed.page
    const { width: pw, height: ph, margins } = doc.pageSetup
    ed.text.sync(ed.version)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = SCRATCH_COLOR
    ctx.fillRect(0, 0, w, h)

    // Page shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(ox + 3, oy + 3, pw * s, ph * s)

    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(s, s)
    const env: RenderEnv = { doc, assets: ed.assets, text: ed.text, pxPerPt: s * dpr, forOutput: false }
    drawPageBackground(ctx, env, page)
    if (page.masterId) {
      const master = doc.masters.find((m) => m.id === page.masterId)
      if (master) drawObjects(ctx, env, master.objects)
    }
    drawObjects(ctx, env, page.objects)
    if (ed.view.scratch) drawObjects(ctx, env, doc.scratch)
    ctx.restore()

    // Page edge
    ctx.strokeStyle = '#9a9a9a'
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(pw * s) + 1, Math.round(ph * s) + 1)

    // Margin guides (Publisher: blue dashed)
    if (ed.view.guides) {
      ctx.save()
      ctx.strokeStyle = MARGIN_GUIDE
      ctx.setLineDash([4, 3])
      const mx = ox + margins.left * s, my = oy + margins.top * s
      ctx.strokeRect(Math.round(mx) + 0.5, Math.round(my) + 0.5, Math.round((pw - margins.left - margins.right) * s), Math.round((ph - margins.top - margins.bottom) * s))
      ctx.setLineDash([])
      ctx.strokeStyle = RULER_GUIDE
      for (const g of page.guides) {
        ctx.beginPath()
        if (g.orientation === 'v') { const x = Math.round(ox + g.pos * s) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h) }
        else { const y = Math.round(oy + g.pos * s) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y) }
        ctx.stroke()
      }
      ctx.restore()
    }

    // Object boundaries (View > Boundaries)
    if (ed.view.boundaries) {
      ctx.save()
      ctx.strokeStyle = 'rgba(120,120,120,0.8)'
      ctx.setLineDash([2, 2])
      const walk = (list: SceneObject[]) => {
        for (const o of list) {
          if (o.type === 'group') { walk(o.children); continue }
          if (o.type === 'shape') continue
          polygon(ctx, objectCorners(o).map(toScr))
          ctx.stroke()
        }
      }
      walk(page.objects)
      if (ed.view.scratch) walk(doc.scratch)
      ctx.restore()
    }

    // Text overflow indicators
    drawOverflowMarkers(ctx)

    // Red squiggles under misspelled words
    if (ed.view.spelling) drawSpelling(ctx, s)

    // Text editing: selection highlight and caret
    if (ed.editing) drawTextSelection(ctx, s)

    // Selection
    drawSelection(ctx)

    // Snap lines
    if (snapLines.current.length) {
      ctx.save()
      ctx.strokeStyle = '#e0349a'
      ctx.setLineDash([3, 2])
      for (const l of snapLines.current) {
        ctx.beginPath()
        if (l.o === 'v') { const x = Math.round(ox + l.pos * s) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h) }
        else { const y = Math.round(oy + l.pos * s) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y) }
        ctx.stroke()
      }
      ctx.restore()
    }

    // Rubber bands
    const d = drag.current
    if (d.kind === 'marquee' || d.kind === 'draw') {
      const a = toScr(d.start), b = toScr(d.cur)
      ctx.save()
      ctx.strokeStyle = d.kind === 'marquee' ? '#2b78d6' : '#333'
      ctx.fillStyle = d.kind === 'marquee' ? 'rgba(43,120,214,0.08)' : 'rgba(0,0,0,0.03)'
      ctx.setLineDash(d.kind === 'marquee' ? [] : [4, 3])
      const r = normRect(a, b)
      ctx.fillRect(r.x, r.y, r.width, r.height)
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height)
      ctx.restore()
    }
    if (d.kind === 'guide') {
      ctx.save()
      ctx.strokeStyle = RULER_GUIDE
      ctx.beginPath()
      if (d.orientation === 'v') { const x = Math.round(ox + d.pos * s) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h) }
      else { const y = Math.round(oy + d.pos * s) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y) }
      ctx.stroke()
      ctx.restore()
    }

    drawRulers()
    positionInput()
  }, [])

  function polygon(ctx: CanvasRenderingContext2D, pts: Pt[]) {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x + 0.5, p.y + 0.5) : ctx.moveTo(p.x + 0.5, p.y + 0.5)))
    ctx.closePath()
  }

  /** Frame shown with handles: the object itself, or the bounds of a multi-selection. */
  function selectionFrame(): Frame | null {
    const objs = ed.selectedObjects
    if (objs.length === 0) return null
    if (objs.length === 1) return frameOf(objs[0])
    const b = boundsOfObjects(objs)
    return { ...b, rotation: 0 }
  }

  function drawCropOverlay(ctx: CanvasRenderingContext2D, o: PictureObject) {
    const img = o.assetId ? ed.assets.image(o.assetId) : undefined
    const s = scale()
    const dpr = window.devicePixelRatio || 1
    const { kx, ky } = cropScale(o, o.crop)
    // The hidden (cropped-away) part of the picture, shown faded like Publisher.
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.translate(view.current.ox, view.current.oy)
    ctx.scale(s, s)
    withObjectTransform(ctx, o, () => {
      const fx = -o.crop.left * kx, fy = -o.crop.top * ky
      ctx.beginPath()
      ctx.rect(fx, fy, kx, ky)
      ctx.rect(o.width, 0, -o.width, o.height)
      ctx.clip('evenodd')
      ctx.globalAlpha = 0.35
      if (img) ctx.drawImage(img, fx, fy, kx, ky)
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#555'
      ctx.lineWidth = 1 / s
      ctx.setLineDash([3 / s, 3 / s])
      ctx.strokeRect(fx, fy, kx, ky)
    })
    ctx.restore()
    // Black crop handles.
    ctx.save()
    ctx.fillStyle = '#000'
    ctx.strokeStyle = '#fff'
    for (const { h, p } of handlePoints(o, 0)) {
      if (h === 'rot') continue
      const c = toScr(toPage(o, p))
      const long = 12, thick = 4
      const ang = (o.rotation * Math.PI) / 180
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(ang)
      const sx = h.includes('w') ? 1 : h.includes('e') ? -1 : 0
      const sy = h.includes('n') ? 1 : h.includes('s') ? -1 : 0
      if (sx && sy) {
        ctx.fillRect(Math.min(0, sx * long), Math.min(0, sy * thick), long, thick)
        ctx.fillRect(Math.min(0, sx * thick), Math.min(0, sy * long), thick, long)
      } else if (sx) ctx.fillRect(Math.min(0, sx * thick), -long / 2, thick, long)
      else ctx.fillRect(-long / 2, Math.min(0, sy * thick), long, thick)
      ctx.restore()
    }
    polygon(ctx, objectCorners(o).map(toScr))
    ctx.strokeStyle = '#000'
    ctx.stroke()
    ctx.restore()
  }

  function drawSelection(ctx: CanvasRenderingContext2D) {
    const objs = ed.selectedObjects
    if (!objs.length) return
    const cropping = ed.cropping ? getObject(ed.doc, ed.cropping) : null
    if (cropping && cropping.type === 'picture') { drawCropOverlay(ctx, cropping); return }
    const s = scale()
    ctx.save()
    // Outline each selected object
    ctx.strokeStyle = SELECT_COLOR
    ctx.setLineDash([])
    for (const o of objs) {
      polygon(ctx, objectCorners(o).map(toScr))
      ctx.stroke()
    }
    const f = selectionFrame()!
    const locked = objs.every((o) => o.locked)
    const isLine = objs.length === 1 && objs[0].type === 'shape' && objs[0].shape === 'line'
    {
      for (const { h, p } of handlePoints(f, ROT_OFFSET / s)) {
        if (isLine && h !== 'nw' && h !== 'se') continue
        const sp = toScr(toPage(f, p))
        if (h === 'rot') {
          if (locked || isLine) continue
          const top = toScr(toPage(f, { x: f.width / 2, y: 0 }))
          ctx.strokeStyle = SELECT_COLOR
          ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(sp.x, sp.y); ctx.stroke()
          ctx.fillStyle = '#ffffff'
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
          // little rotate arrow
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 2.8, -Math.PI * 0.9, Math.PI * 0.5); ctx.stroke()
          continue
        }
        if (f.width * s < 16 && (h === 'n' || h === 's')) continue
        if (f.height * s < 16 && (h === 'e' || h === 'w')) continue
        ctx.fillStyle = locked ? '#c9c9c9' : '#ffffff'
        ctx.strokeStyle = SELECT_COLOR
        const corner = h.length === 2
        if (corner) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, HANDLE / 2 + 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        } else {
          ctx.fillRect(sp.x - HANDLE / 2, sp.y - HANDLE / 2, HANDLE, HANDLE)
          ctx.strokeRect(sp.x - HANDLE / 2 + 0.5, sp.y - HANDLE / 2 + 0.5, HANDLE - 1, HANDLE - 1)
        }
      }
    }
    ctx.restore()
  }

  function drawOverflowMarkers(ctx: CanvasRenderingContext2D) {
    const doc = ed.doc
    const seen = new Set<string>()
    const walk = (list: SceneObject[]) => {
      for (const o of list) {
        if (o.type === 'group') { walk(o.children); continue }
        if (o.type !== 'text' || seen.has(o.storyId)) continue
        seen.add(o.storyId)
        const layout = ed.text.layout(doc, o.storyId)
        if (!layout?.overflow) continue
        const last = ed.text.chain(doc, o.storyId).at(-1)
        if (!last) continue
        // Publisher shows a small box with "..." at the bottom-right corner.
        const p = toScr(toPage(last, { x: last.width, y: last.height }))
        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = '#c0392b'
        ctx.fillRect(p.x - 10, p.y - 8, 20, 16)
        ctx.strokeRect(p.x - 9.5, p.y - 7.5, 19, 15)
        ctx.fillStyle = '#c0392b'
        for (let i = 0; i < 3; i++) ctx.fillRect(p.x - 5 + i * 4, p.y + 1, 2, 2)
        ctx.restore()
      }
    }
    walk(ed.page.objects)
    walk(doc.scratch)
  }

  function drawSpelling(ctx: CanvasRenderingContext2D, s: number) {
    if (!spellReady()) return
    const dpr = window.devicePixelRatio || 1
    const seen = new Set<string>()
    const boxes: TextBoxObject[] = []
    const walk = (list: SceneObject[]) => list.forEach((o) => { if (o.type === 'group') walk(o.children); else if (o.type === 'text') boxes.push(o) })
    walk(ed.page.objects)
    for (const box of boxes) {
      const story = ed.doc.stories[box.storyId]
      const layout = ed.text.layout(ed.doc, box.storyId)
      const bl = layout?.boxes.find((b) => b.boxId === box.id)
      if (!story || !layout || !bl) continue
      if (!seen.has(box.storyId)) seen.add(box.storyId)
      let bad = misspelledCache.get(box.storyId)
      if (!bad || bad.version !== ed.version) {
        bad = { version: ed.version, words: misspelledIn(story) }
        misspelledCache.set(box.storyId, bad)
      }
      // Don't flag the word being typed.
      const caret = ed.editing?.storyId === box.storyId ? ed.editing.caret : null
      const words = bad.words.filter((w) => !(caret && caret.para === w.para && caret.offset >= w.start && caret.offset <= w.end))
      if (!words.length) continue
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.translate(view.current.ox, view.current.oy)
      ctx.scale(s, s)
      withObjectTransform(ctx, box, () => {
        ctx.strokeStyle = '#e81123'
        ctx.lineWidth = 1 / s
        for (const line of bl.lines) {
          for (const w of words) {
            if (w.para !== line.para || w.end <= line.start || w.start >= line.end) continue
            const x1 = xAtOffset(line, Math.max(w.start, line.start), ed.measurer, layout.sizeFactor)
            const x2 = xAtOffset(line, Math.min(w.end, line.end), ed.measurer, layout.sizeFactor)
            const y = line.baseline + Math.max(1.5, line.descent * 0.4)
            const amp = 1.2 / s, step = 2.5 / s
            ctx.beginPath()
            for (let x = x1, k = 0; x <= x2; x += step, k++) {
              const yy = y + (k % 2 ? amp : -amp)
              if (k === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy)
            }
            ctx.stroke()
          }
        }
      })
      ctx.restore()
    }
  }

  function drawTextSelection(ctx: CanvasRenderingContext2D, s: number) {
    const st = ed.editing!
    const layout = ed.text.layout(ed.doc, st.storyId)
    if (!layout) return
    const [from, to] = orderRange(st.anchor, st.caret)
    const dpr = window.devicePixelRatio || 1
    if (comparePos(from, to) !== 0) {
      for (const b of layout.boxes) {
        const box = getObject(ed.doc, b.boxId) as TextBoxObject | null
        if (!box || !isOnCurrentPage(box.id)) continue
        ctx.save()
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.translate(view.current.ox, view.current.oy)
        ctx.scale(s, s)
        withObjectTransform(ctx, box, () => {
          ctx.fillStyle = 'rgba(0, 120, 215, 0.3)'
          for (const line of b.lines) {
            const ls = { para: line.para, offset: line.start }
            const le = { para: line.para, offset: line.end }
            if (comparePos(le, from) < 0 || comparePos(ls, to) > 0) continue
            const a = comparePos(from, ls) > 0 ? from.offset : line.start
            const z = comparePos(to, le) < 0 ? to.offset : line.end
            const x1 = xAtOffset(line, a, ed.measurer, layout.sizeFactor)
            let x2 = xAtOffset(line, z, ed.measurer, layout.sizeFactor)
            // Selected paragraph mark shows as a small extra block.
            if (line.last && comparePos(to, le) > 0) x2 += 4
            ctx.fillRect(x1, line.top, Math.max(0, x2 - x1), line.height)
          }
        })
        ctx.restore()
      }
    } else if (caretBlink.current) {
      const r = caretRect(layout, st.caret, ed.measurer)
      const box = r ? (getObject(ed.doc, r.boxId) as TextBoxObject | null) : null
      const fallbackBox = getObject(ed.doc, st.boxId) as TextBoxObject | null
      const target = box ?? fallbackBox
      if (!target || !isOnCurrentPage(target.id)) return
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.translate(view.current.ox, view.current.oy)
      ctx.scale(s, s)
      withObjectTransform(ctx, target, () => {
        ctx.fillStyle = '#000'
        const x = r ? r.x : target.margins.left
        const top = r ? r.top : target.margins.top
        const hgt = r ? r.height : 12
        ctx.fillRect(x - 0.5 / s, top, 1.25 / s, hgt)
      })
      ctx.restore()
    }
  }

  function isOnCurrentPage(id: Id): boolean {
    const loc = locate(ed.doc, id)
    if (!loc) return false
    let owner = loc.owner
    while (owner.kind === 'group') {
      const l = locate(ed.doc, owner.group.id)
      if (!l) return false
      owner = l.owner
    }
    return owner.kind === 'scratch' || owner.page === ed.page
  }

  function drawRulers() {
    const show = ed.view.rulers
    for (const [ref, orient] of [[hRulerRef, 'h'], [vRulerRef, 'v']] as const) {
      const c = ref.current
      if (!c || !show) continue
      const ctx = c.getContext('2d')!
      const dpr = window.devicePixelRatio || 1
      const len = orient === 'h' ? size.current.w : size.current.h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#f0f0f0'
      ctx.fillRect(0, 0, orient === 'h' ? len : RULER, orient === 'h' ? RULER : len)
      const s = scale()
      const origin = orient === 'h' ? view.current.ox : view.current.oy
      const pageLen = orient === 'h' ? ed.doc.pageSetup.width : ed.doc.pageSetup.height
      // White band over the page
      ctx.fillStyle = '#ffffff'
      if (orient === 'h') ctx.fillRect(origin, 2, pageLen * s, RULER - 4)
      else ctx.fillRect(2, origin, RULER - 4, pageLen * s)
      // Selection extent highlight
      const f = selectionFrame()
      if (f) {
        const b = boundsOfObjects(ed.selectedObjects)
        ctx.fillStyle = 'rgba(43,120,214,0.25)'
        if (orient === 'h') ctx.fillRect(origin + b.x * s, 2, b.width * s, RULER - 4)
        else ctx.fillRect(2, origin + b.y * s, RULER - 4, b.height * s)
      }
      // Ticks
      const unitPt = PT_PER[ed.unit === 'pt' || ed.unit === 'px' ? 'in' : ed.unit]
      const unitPx = unitPt * s
      let label = 1
      while (unitPx * label < 40) label *= 2
      const subdiv = unitPx * label > 160 ? 16 : unitPx * label > 80 ? 8 : unitPx * label > 40 ? 4 : 2
      ctx.strokeStyle = '#7a7a7a'
      ctx.fillStyle = '#444'
      ctx.font = '9px "Segoe UI", sans-serif'
      ctx.lineWidth = 1
      const startU = Math.floor(-origin / unitPx / label) * label
      const endU = Math.ceil((len - origin) / unitPx / label) * label
      ctx.beginPath()
      for (let u = startU; u <= endU; u += label) {
        for (let k = 0; k < subdiv; k++) {
          const pos = Math.round(origin + (u + (k * label) / subdiv) * unitPx) + 0.5
          const tick = k === 0 ? RULER - 4 : k % (subdiv / 2) === 0 ? 7 : k % (subdiv / 4 || 1) === 0 ? 5 : 3
          if (orient === 'h') { ctx.moveTo(pos, RULER); ctx.lineTo(pos, RULER - tick) }
          else { ctx.moveTo(RULER, pos); ctx.lineTo(RULER - tick, pos) }
        }
        const pos = origin + u * unitPx
        if (orient === 'h') ctx.fillText(String(u), pos + 2, 9)
        else {
          ctx.save(); ctx.translate(9, pos + 2); ctx.rotate(Math.PI / 2); ctx.fillText(String(u), 0, 0); ctx.restore()
        }
      }
      ctx.stroke()
      ctx.strokeStyle = '#b5b5b5'
      ctx.beginPath()
      if (orient === 'h') { ctx.moveTo(0, RULER - 0.5); ctx.lineTo(len, RULER - 0.5) }
      else { ctx.moveTo(RULER - 0.5, 0); ctx.lineTo(RULER - 0.5, len) }
      ctx.stroke()
    }
  }

  /** Keep the hidden text input near the caret (for input-method popups). */
  function positionInput() {
    const ta = inputRef.current
    if (!ta) return
    if (!ed.editing) return
    const layout = ed.text.layout(ed.doc, ed.editing.storyId)
    const r = layout ? caretRect(layout, ed.editing.caret, ed.measurer) : null
    const box = r ? getObject(ed.doc, r.boxId) : null
    if (r && box) {
      const p = toScr(toPage(box, { x: r.x, y: r.top + r.height }))
      ta.style.left = `${p.x}px`
      ta.style.top = `${p.y}px`
    }
  }

  // ---------- resize & redraw scheduling ----------
  useLayoutEffect(() => {
    const wrap = wrapRef.current!
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect()
      const rulers = ed.view.rulers ? RULER : 0
      const w = Math.max(50, r.width - rulers), h = Math.max(50, r.height - rulers)
      const first = size.current.w === 800 && size.current.h === 600 && lastViewReq.current === 0
      size.current = { w, h }
      const dpr = window.devicePixelRatio || 1
      const c = canvasRef.current!
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
      c.style.width = `${w}px`; c.style.height = `${h}px`
      if (hRulerRef.current) {
        hRulerRef.current.width = Math.round(w * dpr); hRulerRef.current.height = RULER * dpr
        hRulerRef.current.style.width = `${w}px`
      }
      if (vRulerRef.current) {
        vRulerRef.current.width = RULER * dpr; vRulerRef.current.height = Math.round(h * dpr)
        vRulerRef.current.style.height = `${h}px`
      }
      if (first) { fit('fit-page'); lastViewReq.current = -1; ed.touch() }
      draw()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw, fit, e.view.rulers])

  useEffect(() => {
    const req = ed.viewRequest
    if (req && req.n !== lastViewReq.current) {
      lastViewReq.current = req.n
      fit(req.kind)
      ed.touch()
      return
    }
    draw()
  })

  // Caret blink
  useEffect(() => {
    const t = setInterval(() => {
      if (!ed.editing) return
      caretBlink.current = !caretBlink.current
      draw()
    }, 530)
    return () => clearInterval(t)
  }, [draw])

  // Focus the hidden input while editing text.
  useEffect(() => {
    if (ed.editing && document.activeElement !== inputRef.current) {
      const a = document.activeElement as HTMLElement | null
      // Don't steal focus from ribbon inputs (font size box etc.) or dialogs.
      if (!a || !isTypingTarget(a)) inputRef.current?.focus({ preventScroll: true })
    }
  })

  // ---------- hit testing ----------
  function topLevelList(): SceneObject[] {
    // Front-most first: scratch objects sit above the page.
    return [...(ed.view.scratch ? [...ed.doc.scratch].reverse() : []), ...[...ed.page.objects].reverse()]
  }

  function objectAt(p: Pt): SceneObject | null {
    const slop = 3 / scale()
    // Selected objects win, so you can grab a selected object under another.
    for (const o of ed.selectedObjects) if (hitObject(o, p, slop)) return o
    for (const o of topLevelList()) if (hitObject(o, p, slop)) return o
    return null
  }

  function handleAt(sx: number, sy: number): Handle | null {
    const f = selectionFrame()
    if (!f) return null
    const objs = ed.selectedObjects
    if (objs.every((o) => o.locked)) return null
    const isLine = objs.length === 1 && objs[0].type === 'shape' && objs[0].shape === 'line'
    for (const { h, p } of handlePoints(f, ROT_OFFSET / scale())) {
      if (isLine && h !== 'nw' && h !== 'se') continue
      if (h === 'rot' && isLine) continue
      const sp = toScr(toPage(f, p))
      if (Math.abs(sp.x - sx) <= HANDLE && Math.abs(sp.y - sy) <= HANDLE) return h
    }
    return null
  }

  /** Text box (on this page) whose interior, away from its border, is under the point. */
  function textInteriorAt(p: Pt): TextBoxObject | null {
    const o = objectAt(p)
    const box = o && o.type === 'text' ? o : null
    if (!box || box.locked) return null
    const l = toLocal(box, p)
    const grab = BORDER_GRAB / scale()
    if (edgeDistance(box, l) < grab) return null
    return box
  }

  function guideAt(sx: number, sy: number) {
    if (!ed.view.guides) return null
    for (const g of ed.page.guides) {
      const sp = toScr({ x: g.pos, y: g.pos })
      if (g.orientation === 'v' && Math.abs(sp.x - sx) < 4) return g
      if (g.orientation === 'h' && Math.abs(sp.y - sy) < 4) return g
    }
    return null
  }

  // ---------- snapping ----------
  function snapTargets(exclude: Set<Id>) {
    const { width: pw, height: ph, margins } = ed.doc.pageSetup
    const xs = [0, pw / 2, pw, margins.left, pw - margins.right]
    const ys = [0, ph / 2, ph, margins.top, ph - margins.bottom]
    if (ed.view.snapToGuides) {
      for (const g of ed.page.guides) (g.orientation === 'v' ? xs : ys).push(g.pos)
    }
    if (ed.view.snapToObjects) {
      for (const o of ed.page.objects) {
        if (exclude.has(o.id)) continue
        const b = boundsOfObjects([o])
        xs.push(b.x, b.x + b.width / 2, b.x + b.width)
        ys.push(b.y, b.y + b.height / 2, b.y + b.height)
      }
    }
    return { xs, ys }
  }

  function snapBox(b: Frame, exclude: Set<Id>, edges: { x: number[]; y: number[] }): { dx: number; dy: number } {
    snapLines.current = []
    if (!ed.view.snapToGuides && !ed.view.snapToObjects) return { dx: 0, dy: 0 }
    const { xs, ys } = snapTargets(exclude)
    const th = SNAP_PX / scale()
    let best = { dx: 0, dy: 0, ax: Infinity, ay: Infinity, lx: 0, ly: 0 }
    for (const ex of edges.x) for (const t of xs) {
      const d = t - ex
      if (Math.abs(d) < th && Math.abs(d) < best.ax) best = { ...best, dx: d, ax: Math.abs(d), lx: t }
    }
    for (const ey of edges.y) for (const t of ys) {
      const d = t - ey
      if (Math.abs(d) < th && Math.abs(d) < best.ay) best = { ...best, dy: d, ay: Math.abs(d), ly: t }
    }
    if (best.ax < Infinity) snapLines.current.push({ o: 'v', pos: best.lx })
    if (best.ay < Infinity) snapLines.current.push({ o: 'h', pos: best.ly })
    void b
    return { dx: best.ax < Infinity ? best.dx : 0, dy: best.ay < Infinity ? best.dy : 0 }
  }

  function snapPoint(p: Pt): Pt {
    const th = SNAP_PX / scale()
    const { xs, ys } = snapTargets(new Set())
    let x = p.x, y = p.y
    snapLines.current = []
    const nx = xs.find((t) => Math.abs(t - p.x) < th)
    const ny = ys.find((t) => Math.abs(t - p.y) < th)
    if (nx !== undefined) { x = nx; snapLines.current.push({ o: 'v', pos: nx }) }
    if (ny !== undefined) { y = ny; snapLines.current.push({ o: 'h', pos: ny }) }
    return { x, y }
  }

  // ---------- pointer handling ----------
  const onPointerDown = (ev: React.PointerEvent) => {
    const { sx, sy } = eventPt(ev)
    const p = toPt(sx, sy)
    canvasRef.current!.setPointerCapture(ev.pointerId)
    caretBlink.current = true

    if (ev.button === 1 || (ev.button === 0 && (spaceDown.current || ed.tool.kind === 'pan'))) {
      drag.current = { kind: 'pan', sx, sy, ox: view.current.ox, oy: view.current.oy }
      return
    }
    if (ev.button === 2) {
      const hit = objectAt(p)
      if (hit && !ed.selection.includes(hit.id)) ed.select([hit.id])
      if (!hit && !ed.editing) ed.clearSelection()
      return
    }

    const tool = ed.tool
    if (tool.kind === 'textbox' || tool.kind === 'shape') {
      if (ed.editing) stopEditing()
      const sp = snapPoint(p)
      drag.current = { kind: 'draw', start: sp, cur: sp }
      return
    }
    if (tool.kind === 'link') {
      const hit = objectAt(p)
      if (hit && hit.type === 'text') linkTextBoxes(tool.fromId, hit.id)
      ed.setTool({ kind: 'select' })
      return
    }

    // Crop mode: black handles crop, dragging the picture pans it inside the frame.
    if (ed.cropping) {
      const pic = getObject(ed.doc, ed.cropping)
      if (pic && pic.type === 'picture') {
        const h = handleAt(sx, sy)
        if (h && h !== 'rot') {
          drag.current = { kind: 'crop', id: pic.id, handle: h, start: frameOf(pic), crop0: { ...pic.crop }, flipH: pic.flipH, flipV: pic.flipV }
          ed.beginLive('Crop')
          return
        }
        if (hitObject(pic, p)) {
          drag.current = { kind: 'cropPan', id: pic.id, startPt: p, start: frameOf(pic), crop0: { ...pic.crop }, flipH: pic.flipH, flipV: pic.flipV }
          ed.beginLive('Crop')
          return
        }
      }
      ed.cropping = null
    }

    // Resize / rotate handles
    const handle = ed.editing ? null : handleAt(sx, sy)
    const editingHandle = ed.editing ? handleAt(sx, sy) : null
    const h = handle ?? editingHandle
    if (h) {
      if (ed.editing) stopEditing()
      const objs = ed.selectedObjects
      const f = selectionFrame()!
      if (h === 'rot') {
        const c = { x: f.x + f.width / 2, y: f.y + f.height / 2 }
        const startFrames = new Map(objs.map((o) => [o.id, frameOf(o)]))
        drag.current = { kind: 'rotate', center: c, startAngle: Math.atan2(p.y - c.y, p.x - c.x), startRotation: f.rotation, ids: objs.map((o) => o.id), startFrames }
        ed.beginLive('Rotate')
      } else {
        const startFrames = new Map(objs.map((o) => [o.id, frameOf(o)]))
        const aspect = objs.length > 1 || objs.some((o) => o.type === 'picture' || o.type === 'group')
        drag.current = { kind: 'resize', handle: h, start: f, ids: objs.map((o) => o.id), startFrames, aspect }
        ed.beginLive('Resize Object')
      }
      return
    }

    // Guides
    const g = guideAt(sx, sy)
    if (g && !objectAt(p)) {
      drag.current = { kind: 'guide', id: g.id, orientation: g.orientation, pos: g.pos }
      return
    }

    // Clicking inside a text box types into it (Publisher behaviour).
    const textBox = textInteriorAt(p)
    if (textBox && !ev.shiftKey && !ev.ctrlKey) {
      const l = toLocal(textBox, p)
      const pos = textPosAt(textBox, l.x, l.y)
      const sameStory = ed.editing && ed.editing.storyId === textBox.storyId
      if (!sameStory) startEditing(textBox.id, pos ?? undefined)
      else if (pos) {
        ed.editing!.boxId = textBox.id
        placeCaret(pos, ev.shiftKey)
      }
      if (pos && ev.detail === 2) selectWordAt(pos)
      if (pos && ev.detail >= 3) selectParagraphAt(pos)
      drag.current = { kind: 'text', boxId: textBox.id }
      return
    }

    if (ed.editing) stopEditing()
    const hit = objectAt(p)
    if (hit) {
      if (ev.shiftKey || ev.ctrlKey) {
        if (ed.selection.includes(hit.id) && !ev.ctrlKey) {
          ed.select(ed.selection.filter((id) => id !== hit.id))
          return
        }
        if (!ed.selection.includes(hit.id)) ed.select([...ed.selection, hit.id])
      } else if (!ed.selection.includes(hit.id)) {
        ed.select([hit.id])
      }
      const objs = ed.selectedObjects
      if (objs.every((o) => o.locked)) return
      let ids = objs.filter((o) => !o.locked).map((o) => o.id)
      ed.beginLive('Move Object')
      // Ctrl+drag makes a copy, like Publisher.
      if (ev.ctrlKey) {
        ids = cloneSelectionForDrag(ids)
        ed.selection = ids
      }
      const b = boundsOfObjects(ed.selectedObjects)
      drag.current = { kind: 'move', start: p, applied: { x: 0, y: 0 }, ids, moved: false, startBounds: { ...b, rotation: 0 } }
      return
    }

    drag.current = { kind: 'marquee', start: p, cur: p, additive: ev.shiftKey || ev.ctrlKey }
    if (!ev.shiftKey && !ev.ctrlKey) ed.clearSelection()
  }

  const onPointerMove = (ev: React.PointerEvent) => {
    const { sx, sy } = eventPt(ev)
    const p = toPt(sx, sy)
    const d = drag.current
    updateCursor(sx, sy, p)
    ed.status = `${fmt(p.x)}, ${fmt(p.y)}`
    if (d.kind === 'none') {
      ed.touch()
      return
    }
    switch (d.kind) {
      case 'pan':
        view.current = { ox: d.ox + sx - d.sx, oy: d.oy + sy - d.sy }
        draw()
        return
      case 'move': {
        let dx = p.x - d.start.x, dy = p.y - d.start.y
        if (!d.moved && Math.hypot(dx * scale(), dy * scale()) < 3) return
        d.moved = true
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
        const b = d.startBounds
        const nb = { ...b, x: b.x + dx, y: b.y + dy }
        const snap = ev.altKey ? { dx: 0, dy: 0 } : snapBox(nb, new Set(d.ids), {
          x: [nb.x, nb.x + nb.width / 2, nb.x + nb.width],
          y: [nb.y, nb.y + nb.height / 2, nb.y + nb.height]
        })
        dx += snap.dx; dy += snap.dy
        const ddx = dx - d.applied.x, ddy = dy - d.applied.y
        d.applied = { x: dx, y: dy }
        ed.liveChange((doc) => {
          for (const id of d.ids) {
            const o = getObject(doc, id)
            if (o) translate(o, ddx, ddy)
          }
        })
        return
      }
      case 'resize': {
        const single = d.ids.length === 1
        let target = p
        if (!ev.altKey && d.start.rotation === 0) target = snapPoint(p)
        const keep = d.aspect ? !ev.shiftKey : ev.shiftKey
        const nf = resizeFrame(d.start, d.handle, target, keep, ev.ctrlKey, 1)
        ed.liveChange((doc) => {
          if (single) {
            const o = getObject(doc, d.ids[0])
            if (!o) return
            // Restore the start frame first (groups map children from it).
            setFrame(o, d.startFrames.get(o.id)!)
            setFrame(o, nf)
          } else {
            const objs = d.ids.map((id) => getObject(doc, id)).filter((o): o is SceneObject => !!o)
            for (const o of objs) setFrame(o, d.startFrames.get(o.id)!)
            const temp: GroupObject = { ...makeGroup([]), ...d.start, children: objs }
            setFrame(temp, nf)
          }
        })
        return
      }
      case 'rotate': {
        let ang = d.startRotation + ((Math.atan2(p.y - d.center.y, p.x - d.center.x) - d.startAngle) * 180) / Math.PI
        if (ev.shiftKey) ang = Math.round(ang / 15) * 15
        const delta = ang - d.startRotation
        ed.liveChange((doc) => {
          for (const id of d.ids) {
            const o = getObject(doc, id)
            const f0 = d.startFrames.get(id)
            if (!o || !f0) continue
            setFrame(o, f0)
            // Turn each object around the selection centre.
            const c0 = { x: f0.x + f0.width / 2, y: f0.y + f0.height / 2 }
            const r = rotateAround(c0, d.center, delta)
            setFrame(o, { ...f0, x: r.x - f0.width / 2, y: r.y - f0.height / 2, rotation: f0.rotation + delta })
          }
        })
        ed.setStatus(`Rotation ${Math.round(((ang % 360) + 360) % 360)}°`)
        return
      }
      case 'marquee':
      case 'draw':
        d.cur = d.kind === 'draw' ? snapPoint(constrainDraw(d.start, p, ev.shiftKey)) : p
        draw()
        return
      case 'text': {
        const box = getObject(ed.doc, d.boxId) as TextBoxObject | null
        if (!box || !ed.editing) return
        // Dragging into another box of the same chain extends the selection there.
        const over = objectAt(p)
        const target = over && over.type === 'text' && over.storyId === box.storyId ? over : box
        const l = toLocal(target, p)
        const pos = textPosAt(target, l.x, l.y)
        if (pos) placeCaret(pos, true)
        return
      }
      case 'guide': {
        d.pos = d.orientation === 'v' ? p.x : p.y
        draw()
        return
      }
      case 'crop': {
        const r = cropDrag(d.start, d.crop0, d.handle, p, d.flipH, d.flipV)
        ed.liveChange((doc) => {
          const o = getObject(doc, d.id)
          if (!o || o.type !== 'picture') return
          o.x = r.frame.x; o.y = r.frame.y; o.width = r.frame.width; o.height = r.frame.height
          o.crop = r.crop
        })
        return
      }
      case 'cropPan': {
        const c = cropPan(d.start, d.crop0, p.x - d.startPt.x, p.y - d.startPt.y, d.flipH, d.flipV)
        ed.liveChange((doc) => {
          const o = getObject(doc, d.id)
          if (o && o.type === 'picture') o.crop = c
        })
        return
      }
    }
  }

  const onPointerUp = (ev: React.PointerEvent) => {
    const d = drag.current
    drag.current = { kind: 'none' }
    snapLines.current = []
    const { sx, sy } = eventPt(ev)
    switch (d.kind) {
      case 'move':
        if (d.moved) {
          ed.liveChange((doc) => settleScratch(doc, ed.page, d.ids))
          ed.endLive()
        } else {
          ed.endLive(false)
          // Plain click on an already-selected object inside a multi-selection selects just it.
          if (!ev.shiftKey && !ev.ctrlKey && ed.selection.length > 1) {
            const hit = objectAt(toPt(sx, sy))
            if (hit) ed.select([hit.id])
          }
        }
        break
      case 'resize':
      case 'rotate':
      case 'crop':
      case 'cropPan':
        ed.endLive()
        break
      case 'marquee': {
        const r = normRect(d.start, d.cur)
        if (r.width > 1 || r.height > 1) {
          // Publisher selects objects completely inside the rectangle.
          const inside = [...ed.page.objects, ...ed.doc.scratch].filter((o) => {
            const b = boundsOfObjects([o])
            return b.x >= r.x && b.y >= r.y && b.x + b.width <= r.x + r.width && b.y + b.height <= r.y + r.height
          })
          ed.select(d.additive ? [...ed.selection, ...inside.map((o) => o.id)] : inside.map((o) => o.id))
        } else ed.touch()
        break
      }
      case 'draw': {
        let r = normRect(d.start, d.cur)
        const tool = ed.tool
        const small = r.width * scale() < 4 && r.height * scale() < 4
        if (tool.kind === 'textbox') {
          if (small) r = { x: d.start.x, y: d.start.y, width: 144, height: 72 }
          insertTextBox(r)
        } else if (tool.kind === 'shape') {
          if (tool.shape === 'line') {
            // Lines keep direction via flips.
            const end = d.cur
            const rect = small ? { x: d.start.x, y: d.start.y, width: 72, height: 0 } : r
            insertShape(rect, 'line', end.x < d.start.x, end.y < d.start.y)
          } else {
            if (small) r = { x: d.start.x, y: d.start.y, width: 72, height: 72 }
            insertShape(r, tool.shape)
          }
        }
        break
      }
      case 'guide': {
        if (d.pos < -1e5) break
        const overRuler = d.orientation === 'v' ? sx < 0 : sy < 0
        ed.change(d.id ? 'Move Guide' : 'Add Guide', () => {
          const guides = ed.page.guides
          const existing = d.id ? guides.find((g) => g.id === d.id) : null
          if (overRuler) {
            if (existing) guides.splice(guides.indexOf(existing), 1)
          } else if (existing) existing.pos = d.pos
          else guides.push({ id: newId('g'), orientation: d.orientation, pos: d.pos })
        })
        break
      }
    }
    draw()
  }

  function constrainDraw(start: Pt, p: Pt, shift: boolean): Pt {
    if (!shift) return p
    const dx = p.x - start.x, dy = p.y - start.y
    const m = Math.max(Math.abs(dx), Math.abs(dy))
    return { x: start.x + Math.sign(dx || 1) * m, y: start.y + Math.sign(dy || 1) * m }
  }

  function updateCursor(sx: number, sy: number, p: Pt) {
    const c = canvasRef.current!
    const d = drag.current
    let cursor = 'default'
    if (spaceDown.current || ed.tool.kind === 'pan' || d.kind === 'pan') cursor = d.kind === 'pan' ? 'grabbing' : 'grab'
    else if (ed.tool.kind === 'textbox' || ed.tool.kind === 'shape') cursor = 'crosshair'
    else if (ed.tool.kind === 'link') cursor = 'copy'
    else if (d.kind === 'move' || d.kind === 'cropPan') cursor = 'move'
    else if (ed.cropping && !handleAt(sx, sy)) {
      const pic = getObject(ed.doc, ed.cropping)
      cursor = pic && hitObject(pic, p) ? 'move' : 'default'
    }
    else if (d.kind === 'text') cursor = 'text'
    else {
      const h = handleAt(sx, sy)
      if (h) cursor = h === 'rot' ? 'alias' : cursorForHandle(h, selectionFrame()?.rotation ?? 0)
      else if (guideAt(sx, sy) && !objectAt(p)) cursor = guideCursor(guideAt(sx, sy)!.orientation)
      else if (textInteriorAt(p)) cursor = 'text'
      else if (objectAt(p)) cursor = 'move'
    }
    if (c.style.cursor !== cursor) c.style.cursor = cursor
  }

  const onWheel = (ev: React.WheelEvent) => {
    const { sx, sy } = eventPt(ev)
    if (ev.ctrlKey) {
      const before = toPt(sx, sy)
      const factor = Math.exp(-ev.deltaY * 0.0015)
      ed.zoom = Math.max(0.1, Math.min(40, ed.zoom * factor))
      lastZoom.current = ed.zoom
      const s = scale()
      view.current = { ox: sx - before.x * s, oy: sy - before.y * s }
      ed.touch()
      return
    }
    const dx = ev.shiftKey ? ev.deltaY : ev.deltaX
    const dy = ev.shiftKey ? 0 : ev.deltaY
    view.current = { ox: view.current.ox - dx, oy: view.current.oy - dy }
    draw()
  }

  // ---------- rulers: drag out guides ----------
  const onRulerDown = (orientation: 'h' | 'v') => (ev: React.PointerEvent) => {
    // Dragging from the top ruler makes a horizontal guide; from the side ruler a vertical one.
    const o = orientation === 'h' ? 'h' : 'v'
    drag.current = { kind: 'guide', id: null, orientation: o, pos: -1e6 }
    canvasRef.current!.setPointerCapture(ev.pointerId)
  }

  // ---------- keyboard (text input) ----------
  const onInputKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.nativeEvent.isComposing) return
    if (handleTextKey(ev.nativeEvent)) {
      ev.preventDefault()
      ev.stopPropagation()
      caretBlink.current = true
    }
  }
  const onInput = (ev: React.FormEvent<HTMLTextAreaElement>) => {
    const ta = ev.currentTarget
    const native = ev.nativeEvent as InputEvent
    if (native.isComposing) return
    if (ta.value) {
      const v = ta.value.replace(/[\r\n]/g, '')
      ta.value = ''
      if (v) typeText(v)
      caretBlink.current = true
    }
  }
  const onCompositionEnd = (ev: React.CompositionEvent<HTMLTextAreaElement>) => {
    const ta = ev.currentTarget
    if (ta.value) typeText(ta.value)
    ta.value = ''
  }
  const onPaste = (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    ev.preventDefault()
    pasteText(ev.clipboardData.getData('text/plain'))
  }

  // Space-bar panning (when not typing).
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.code === 'Space' && !ed.editing && !isTypingTarget(ev.target)) { spaceDown.current = true }
    }
    const up = (ev: KeyboardEvent) => { if (ev.code === 'Space') spaceDown.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Drop picture files onto the page.
  const onDrop = async (ev: React.DragEvent) => {
    ev.preventDefault()
    const files = Array.from(ev.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const { sx, sy } = eventPt(ev)
    const at = toPt(sx, sy)
    await placeImageFiles(await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }))), at)
  }

  const rulers = e.view.rulers
  return (
    <div className="workspace" ref={wrapRef}>
      {rulers && <div className="ruler-corner" />}
      {rulers && <canvas className="ruler ruler-h" ref={hRulerRef} onPointerDown={onRulerDown('h')} />}
      {rulers && <canvas className="ruler ruler-v" ref={vRulerRef} onPointerDown={onRulerDown('v')} />}
      <canvas
        ref={canvasRef}
        className="page-canvas"
        style={{ left: rulers ? RULER : 0, top: rulers ? RULER : 0 }}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={(ev) => {
          const { sx, sy } = eventPt(ev)
          const hit = objectAt(toPt(sx, sy))
          if (hit && hit.type === 'text' && !ed.editing) {
            const l = toLocal(hit, toPt(sx, sy))
            startEditing(hit.id, textPosAt(hit, l.x, l.y) ?? undefined)
          }
        }}
        onWheel={onWheel}
        onContextMenu={(ev) => {
          ev.preventDefault()
          // Right-clicking a misspelled word offers suggestions.
          let spell: SpellTarget | null = null
          const { sx, sy } = eventPt(ev)
          const p = toPt(sx, sy)
          const hit = objectAt(p)
          if (hit && hit.type === 'text' && spellReady()) {
            const l = toLocal(hit, p)
            const pos = textPosAt(hit, l.x, l.y)
            const story = ed.doc.stories[hit.storyId]
            const w = pos && story ? wordAt(story, pos.para, pos.offset) : null
            if (w && isMisspelled(w.word)) spell = { storyId: hit.storyId, word: w }
          }
          onContextMenu(ev.clientX, ev.clientY, spell)
        }}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={onDrop}
      />
      <textarea
        ref={inputRef}
        className="text-input"
        aria-label="Text editing"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        onKeyDown={onInputKeyDown}
        onInput={onInput}
        onCompositionEnd={onCompositionEnd}
        onPaste={onPaste}
        onBlur={() => { caretBlink.current = false; draw() }}
        onFocus={() => { caretBlink.current = true }}
      />
    </div>
  )
}

function rotateAround(p: Pt, c: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a), sin = Math.sin(a)
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

function normRect(a: Pt, b: Pt) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

function fmt(pt: number): string {
  return `${(pt / PT_PER[ed.unit]).toFixed(2)}${ed.unit === 'in' ? '"' : ' ' + ed.unit}`
}

function cursorForHandle(h: Handle, rotation: number): string {
  const order: Handle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  const names = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']
  const idx = order.indexOf(h)
  const step = Math.round((((rotation % 360) + 360) % 360) / 45)
  return names[(idx + step) % 4]
}

function guideCursor(o: 'h' | 'v'): string {
  return o === 'h' ? 'row-resize' : 'col-resize'
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
