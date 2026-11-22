// Draws pages and objects onto a Canvas 2D context, in page coordinates
// (points). The caller sets up the zoom/scroll transform first.

import type {
  CalendarObject, Fill, Page, PictureObject, RDocument, SceneObject, ShapeObject, Shadow, Stroke, TextBoxObject
} from '../model/types'
import { layoutCalendar, type CalPiece } from '../calendar/layout'
import type { AssetStore } from '../assets'
import { tracePath } from '../geometry/path'
import { shapePath } from '../geometry/shapes'
import type { TextEngine } from '../text/engine'
import type { LaidLine, Measurer, StoryLayout } from '../text/layout'
import { displayText } from '../text/layout'
import { applyFont, cssFont, effectiveSize } from '../text/canvasMeasurer'

type Ctx = CanvasRenderingContext2D

export interface RenderEnv {
  doc: RDocument
  assets: AssetStore
  text: TextEngine
  /** Device pixels per point (zoom × devicePixelRatio). Needed for shadows. */
  pxPerPt: number
  /** Skip things that never print (placeholders' hints etc.). */
  forOutput: boolean
  /** Object ids not to draw (e.g. the text box being edited draws its own caret). */
  hidden?: Set<string>
}

export function rgba(hex: string, opacity = 1): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0')
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

function paint(ctx: Ctx, fill: Fill, w: number, h: number, ox = 0, oy = 0): string | CanvasGradient | null {
  switch (fill.type) {
    case 'none': return null
    case 'solid': return rgba(fill.color, fill.opacity)
    case 'linear': {
      const a = (fill.angle * Math.PI) / 180
      const dx = Math.cos(a), dy = Math.sin(a)
      const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2
      const g = ctx.createLinearGradient(ox + w / 2 - dx * half, oy + h / 2 - dy * half, ox + w / 2 + dx * half, oy + h / 2 + dy * half)
      for (const s of fill.stops) g.addColorStop(s.offset, rgba(s.color, s.opacity))
      return g
    }
    case 'radial': {
      const g = ctx.createRadialGradient(ox + w / 2, oy + h / 2, 0, ox + w / 2, oy + h / 2, Math.hypot(w, h) / 2)
      for (const s of fill.stops) g.addColorStop(s.offset, rgba(s.color, s.opacity))
      return g
    }
  }
}

const DASHES: Record<Stroke['dash'], number[]> = {
  solid: [],
  dash: [4, 3],
  dot: [1, 2],
  dashDot: [4, 2, 1, 2],
  longDash: [8, 3]
}

function setStroke(ctx: Ctx, s: Stroke): boolean {
  if (s.width <= 0) return false
  ctx.strokeStyle = rgba(s.color, s.opacity)
  ctx.lineWidth = s.width
  ctx.setLineDash(DASHES[s.dash].map((d) => d * Math.max(1, s.width)))
  ctx.lineJoin = 'miter'
  ctx.lineCap = s.dash === 'dot' ? 'round' : 'butt'
  return true
}

function setShadow(ctx: Ctx, s: Shadow | null, env: RenderEnv): void {
  if (!s) {
    ctx.shadowColor = 'transparent'
    return
  }
  // Canvas shadows ignore the transform, so convert to device pixels.
  ctx.shadowColor = rgba(s.color, s.opacity)
  ctx.shadowBlur = s.blur * env.pxPerPt
  ctx.shadowOffsetX = s.offsetX * env.pxPerPt
  ctx.shadowOffsetY = s.offsetY * env.pxPerPt
}

/** Enter an object's local space: origin at its top-left, rotated and flipped. */
export function withObjectTransform(ctx: Ctx, o: SceneObject, fn: () => void): void {
  ctx.save()
  ctx.translate(o.x + o.width / 2, o.y + o.height / 2)
  if (o.rotation) ctx.rotate((o.rotation * Math.PI) / 180)
  if (o.flipH || o.flipV) ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1)
  ctx.translate(-o.width / 2, -o.height / 2)
  fn()
  ctx.restore()
}

export function drawPageBackground(ctx: Ctx, env: RenderEnv, page: Page): void {
  const { width, height } = env.doc.pageSetup
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  const bg = page.background
  if (bg.type === 'picture') {
    const img = env.assets.image(bg.assetId)
    if (img) {
      if (bg.mode === 'tile') {
        const pat = ctx.createPattern(img, 'repeat')
        if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, width, height) }
      } else ctx.drawImage(img, 0, 0, width, height)
    }
  } else {
    const p = paint(ctx, bg, width, height)
    if (p) { ctx.fillStyle = p; ctx.fillRect(0, 0, width, height) }
  }
  ctx.restore()
}

export function drawObjects(ctx: Ctx, env: RenderEnv, objects: SceneObject[]): void {
  for (const o of objects) drawObject(ctx, env, o)
}

export function drawObject(ctx: Ctx, env: RenderEnv, o: SceneObject): void {
  if (env.hidden?.has(o.id)) return
  switch (o.type) {
    case 'group': drawObjects(ctx, env, o.children); break
    case 'shape': withObjectTransform(ctx, o, () => drawShape(ctx, env, o)); break
    case 'picture': withObjectTransform(ctx, o, () => drawPicture(ctx, env, o)); break
    case 'text': withObjectTransform(ctx, o, () => drawTextBox(ctx, env, o)); break
    case 'calendar': withObjectTransform(ctx, o, () => drawCalendar(ctx, env, o)); break
  }
}

/** Recent calendar layouts, so redrawing while dragging doesn't lay them out again. */
const calendarCache = new Map<string, CalPiece[]>()

export function calendarPieces(env: { doc: RDocument; text: { measurer: Measurer } }, o: CalendarObject): CalPiece[] {
  const events = env.doc.calendarData?.events ?? []
  const key = JSON.stringify([o.layout, o.year, o.month, o.weekStart, o.showTitle, o.title, o.showEvents, o.eventKinds, o.style, o.width, o.height, events])
  let pieces = calendarCache.get(key)
  if (!pieces) {
    pieces = layoutCalendar(o, events, env.text.measurer)
    if (calendarCache.size > 80) calendarCache.delete(calendarCache.keys().next().value!)
    calendarCache.set(key, pieces)
  }
  return pieces
}

/** Fonts finished loading: lay calendars out again with the real widths. */
export function clearCalendarCache(): void {
  calendarCache.clear()
}

function drawCalendar(ctx: Ctx, env: RenderEnv, o: CalendarObject): void {
  ctx.save()
  for (const p of calendarPieces(env, o)) {
    switch (p.t) {
      case 'rect': {
        ctx.beginPath()
        if (p.r) ctx.roundRect(p.x, p.y, p.w, p.h, p.r)
        else ctx.rect(p.x, p.y, p.w, p.h)
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fill() }
        if (p.stroke && p.sw > 0) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw; ctx.stroke() }
        break
      }
      case 'line':
        ctx.beginPath()
        ctx.moveTo(p.x1, p.y1)
        ctx.lineTo(p.x2, p.y2)
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.w
        ctx.lineCap = 'square'
        ctx.stroke()
        break
      case 'dot':
        ctx.globalAlpha = p.opacity
        ctx.beginPath()
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.fill
        ctx.fill()
        ctx.globalAlpha = 1
        break
      case 'text':
        ctx.font = cssFont(p.style, 1)
        ctx.fillStyle = p.style.color
        ctx.textAlign = p.align
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(p.text, p.x, p.y)
        break
    }
  }
  ctx.restore()
}

function drawShape(ctx: Ctx, env: RenderEnv, o: ShapeObject): void {
  const path = new Path2D()
  tracePath(path, shapePath(o.shape, o.width, o.height, o.adjust))
  ctx.save()
  setShadow(ctx, o.effects.shadow, env)
  const p = paint(ctx, o.fill, o.width, o.height)
  if (p && o.shape !== 'line') {
    ctx.fillStyle = p
    ctx.fill(path, 'nonzero')
    setShadow(ctx, null, env)
  }
  if (setStroke(ctx, o.stroke)) ctx.stroke(path)
  ctx.restore()
}

function boxFillAndLine(ctx: Ctx, env: RenderEnv, o: TextBoxObject | PictureObject): void {
  const p = paint(ctx, o.fill, o.width, o.height)
  ctx.save()
  setShadow(ctx, o.effects.shadow, env)
  if (p) {
    ctx.fillStyle = p
    ctx.fillRect(0, 0, o.width, o.height)
    setShadow(ctx, null, env)
  }
  if (setStroke(ctx, o.stroke)) ctx.strokeRect(0, 0, o.width, o.height)
  ctx.restore()
}

function drawPicture(ctx: Ctx, env: RenderEnv, o: PictureObject): void {
  const img = o.assetId ? env.assets.image(o.assetId) : undefined
  if (!img) {
    boxFillAndLine(ctx, env, o)
    if (!env.forOutput) drawPlaceholder(ctx, o.width, o.height)
    return
  }
  const iw = (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width
  const ih = (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height
  const { left, top, right, bottom } = o.crop
  const sx = left * iw, sy = top * ih
  const sw = Math.max(1, (1 - left - right) * iw), sh = Math.max(1, (1 - top - bottom) * ih)
  ctx.save()
  if (o.fill.type !== 'none') {
    const p = paint(ctx, o.fill, o.width, o.height)
    if (p) { ctx.fillStyle = p; ctx.fillRect(0, 0, o.width, o.height) }
  }
  // Shadows on transparent PNGs follow the picture's shape, like Publisher.
  setShadow(ctx, o.effects.shadow, env)
  const filters: string[] = []
  if (o.brightness) filters.push(`brightness(${1 + o.brightness})`)
  if (o.contrast) filters.push(`contrast(${1 + o.contrast})`)
  if (o.grayscale) filters.push('grayscale(1)')
  if (filters.length) ctx.filter = filters.join(' ')
  ctx.globalAlpha = o.opacity
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, o.width, o.height)
  ctx.restore()
  ctx.save()
  if (setStroke(ctx, o.stroke)) ctx.strokeRect(0, 0, o.width, o.height)
  ctx.restore()
}

function drawPlaceholder(ctx: Ctx, w: number, h: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(230,230,230,0.6)'
  ctx.fillRect(0, 0, w, h)
  const s = Math.min(w, h) * 0.25
  ctx.translate(w / 2 - s / 2, h / 2 - s / 2)
  ctx.strokeStyle = '#8a8a8a'
  ctx.lineWidth = Math.max(0.5, s / 20)
  ctx.strokeRect(0, 0, s, s * 0.8)
  ctx.beginPath()
  ctx.moveTo(s * 0.1, s * 0.7); ctx.lineTo(s * 0.4, s * 0.35); ctx.lineTo(s * 0.6, s * 0.55)
  ctx.lineTo(s * 0.72, s * 0.45); ctx.lineTo(s * 0.9, s * 0.7)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(s * 0.72, s * 0.22, s * 0.08, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawTextBox(ctx: Ctx, env: RenderEnv, o: TextBoxObject): void {
  boxFillAndLine(ctx, env, o)
  const layout = env.text.layout(env.doc, o.storyId)
  if (!layout) return
  const box = layout.boxes.find((b) => b.boxId === o.id)
  if (!box) return
  for (const line of box.lines) drawLine(ctx, env, line, layout)
}

function drawLine(ctx: Ctx, env: RenderEnv, line: LaidLine, layout: StoryLayout): void {
  const f = layout.sizeFactor
  for (const run of line.runs) {
    const s = run.style
    const size = effectiveSize(s, f)
    const shift = s.baseline === 'superscript' ? -s.size * f * 0.33 : s.baseline === 'subscript' ? s.size * f * 0.14 : 0
    const x = line.x + run.x
    const y = line.baseline + shift + (run.dy ?? 0)
    const text = displayText(run.text, s)
    ctx.save()
    // Text transparency applies to the whole run: fill, outline, glow and underline together.
    ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity))
    if (s.highlight && run.dy === undefined) {
      ctx.fillStyle = rgba(s.highlight, 1)
      ctx.fillRect(x, line.top, run.width, line.height)
    }
    applyFont(ctx, s, f)
    ctx.textBaseline = 'alphabetic'
    const fillPaint = s.textFill ? paint(ctx, s.textFill, run.width, line.height) : rgba(s.color, 1)
    const drawText = (mode: 'fill' | 'stroke') => {
      if (line.spaceExtra) {
        // Justified: draw word by word so spaces can stretch.
        let cx = 0
        for (const part of text.split(/( )/)) {
          if (part === ' ') { cx += ctxWidth(ctx, ' ', s.scale) + line.spaceExtra; continue }
          if (!part) continue
          draw(part, cx, mode)
          cx += ctxWidth(ctx, part, s.scale)
        }
      } else draw(text, 0, mode)
    }
    const draw = (t: string, dx: number, mode: 'fill' | 'stroke') => {
      ctx.save()
      ctx.translate(x + dx, y)
      const sc = s.scale / 100
      if (sc !== 1) ctx.scale(sc, 1)
      if (mode === 'fill' && s.textFill && s.textFill.type !== 'solid' && s.textFill.type !== 'none') {
        // Gradients are defined in the current (translated, scaled) space.
        const g = paint(ctx, s.textFill, run.width / sc, line.height, -dx / sc, line.top - y)
        if (g) ctx.fillStyle = g
      }
      if (mode === 'fill') ctx.fillText(t, 0, 0)
      else ctx.strokeText(t, 0, 0)
      ctx.restore()
    }
    if (s.textGlow) {
      ctx.save()
      ctx.shadowColor = rgba(s.textGlow.color, s.textGlow.opacity)
      ctx.shadowBlur = s.textGlow.size * env.pxPerPt
      ctx.fillStyle = rgba(s.textGlow.color, s.textGlow.opacity)
      drawText('fill')
      ctx.restore()
    }
    setShadow(ctx, s.textShadow, env)
    if (fillPaint) {
      ctx.fillStyle = fillPaint
      drawText('fill')
    }
    setShadow(ctx, null, env)
    if (s.textOutline && s.textOutline.width > 0) {
      setStroke(ctx, s.textOutline)
      ctx.setLineDash([])
      ctx.lineJoin = 'round'
      drawText('stroke')
    }
    // Underline / strikethrough
    const thick = Math.max(0.5, size / 16)
    ctx.fillStyle = rgba(s.color, 1)
    const ulWidth = run.width - (line.last ? 0 : trailingSpaceWidth(ctx, run.text, s.scale, line.spaceExtra))
    if (s.underline !== 'none' && ulWidth > 0) {
      const uy = y + size * 0.12
      const t = s.underline === 'thick' ? thick * 2 : thick
      if (s.underline === 'double') {
        ctx.fillRect(x, uy, ulWidth, t)
        ctx.fillRect(x, uy + t * 2, ulWidth, t)
      } else if (s.underline === 'dotted' || s.underline === 'dash') {
        const seg = s.underline === 'dotted' ? t : t * 4
        for (let ux = 0; ux < ulWidth; ux += seg * 2) ctx.fillRect(x + ux, uy, Math.min(seg, ulWidth - ux), t)
      } else if (s.underline === 'wave') {
        ctx.save()
        ctx.strokeStyle = rgba(s.color, 1)
        ctx.lineWidth = t
        ctx.beginPath()
        for (let ux = 0; ux <= ulWidth; ux += t) {
          const wy = uy + Math.sin((ux / (t * 3)) * Math.PI) * t
          if (ux === 0) ctx.moveTo(x, wy); else ctx.lineTo(x + ux, wy)
        }
        ctx.stroke()
        ctx.restore()
      } else ctx.fillRect(x, uy, ulWidth, t)
    }
    if (s.strike && ulWidth > 0) ctx.fillRect(x, y - size * 0.3, ulWidth, thick)
    ctx.restore()
  }
}

function ctxWidth(ctx: Ctx, t: string, scale: number): number {
  return ctx.measureText(t).width * (scale / 100)
}

function trailingSpaceWidth(ctx: Ctx, text: string, scale: number, extra: number): number {
  const m = text.match(/\s+$/)
  if (!m) return 0
  return ctxWidth(ctx, m[0], scale) + m[0].length * extra
}

/** Render a whole page (background + objects) for output (PNG, thumbnails). */
export function renderPage(ctx: Ctx, env: RenderEnv, page: Page, opts: { transparent?: boolean } = {}): void {
  const { width, height } = env.doc.pageSetup
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.clip()
  if (!opts.transparent) drawPageBackground(ctx, env, page)
  if (page.masterId) {
    const master = env.doc.masters.find((m) => m.id === page.masterId)
    if (master) drawObjects(ctx, env, master.objects)
  }
  drawObjects(ctx, env, page.objects)
  ctx.restore()
}
