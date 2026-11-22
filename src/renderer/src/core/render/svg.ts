// SVG renderer used for PDF export and printing. Chromium turns SVG <text>
// into real, selectable PDF text with embedded fonts, and paths into vector
// shapes, so print shops get sharp output at any size. Layout positions come
// from the same text engine as the screen, so line breaks match exactly.

import type { CalendarObject, CharStyle, Fill, Page, PictureObject, RDocument, SceneObject, Shadow, ShapeObject, Stroke, TextBoxObject } from '../model/types'
import { calendarPieces } from './canvas'
import type { AssetStore } from '../assets'
import type { CardPlan } from '../model/card'
import type { TextEngine } from '../text/engine'
import { displayText, type LaidLine } from '../text/layout'
import { cssFont, effectiveSize, trackingPx } from '../text/canvasMeasurer'
import { shapePath } from '../geometry/shapes'
import { toSvgPath } from '../geometry/path'

export interface SvgEnv {
  doc: RDocument
  assets: AssetStore
  text: TextEngine
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
/** A number for an attribute. Anything that isn't a finite number becomes 0. */
const n = (v: number) => { const x = Number(v); return Number.isFinite(x) ? Number(x.toFixed(3)) : 0 }
/**
 * A colour for an attribute. Colours come from the document file, so anything
 * that isn't a plain colour value is replaced rather than written into the SVG.
 */
export const col = (c: string | null | undefined, fallback = '#000000') => {
  const v = String(c ?? '')
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^[a-z]{3,20}$/i.test(v) || /^rgba?\([\d.,\s%]+\)$/i.test(v) ? v : fallback
}
const mimeOf = (m: string) => (/^image\/[a-z0-9.+-]+$/i.test(m) ? m : 'application/octet-stream')

/** Every page gets its own id prefix, so pages in one PDF never share gradients or filters. */
let pageCounter = 0

class Defs {
  private items: string[] = []
  private count = 0
  constructor(private readonly prefix = `p${++pageCounter}`) {}
  id(prefix: string): string {
    return `${this.prefix}${prefix}${++this.count}`
  }
  add(s: string): void {
    this.items.push(s)
  }
  toString(): string {
    return this.items.length ? `<defs>${this.items.join('')}</defs>` : ''
  }
}

function base64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}

function paintAttr(defs: Defs, fill: Fill, x: number, y: number, w: number, h: number): { paint: string; opacity: number } {
  switch (fill.type) {
    case 'none': return { paint: 'none', opacity: 1 }
    case 'solid': return { paint: col(fill.color), opacity: n(fill.opacity) }
    case 'linear': {
      const id = defs.id('g')
      const a = (fill.angle * Math.PI) / 180
      const dx = Math.cos(a), dy = Math.sin(a)
      const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2
      const cx = x + w / 2, cy = y + h / 2
      defs.add(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(cx - dx * half)}" y1="${n(cy - dy * half)}" x2="${n(cx + dx * half)}" y2="${n(cy + dy * half)}">${stops(fill.stops)}</linearGradient>`)
      return { paint: `url(#${id})`, opacity: 1 }
    }
    case 'radial': {
      const id = defs.id('g')
      defs.add(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" r="${n(Math.hypot(w, h) / 2)}">${stops(fill.stops)}</radialGradient>`)
      return { paint: `url(#${id})`, opacity: 1 }
    }
  }
}

function stops(s: Array<{ offset: number; color: string; opacity: number }>): string {
  return s.map((st) => `<stop offset="${n(st.offset)}" stop-color="${col(st.color)}" stop-opacity="${n(st.opacity)}"/>`).join('')
}

const DASH: Record<Stroke['dash'], number[]> = { solid: [], dash: [4, 3], dot: [1, 2], dashDot: [4, 2, 1, 2], longDash: [8, 3] }

function strokeAttrs(s: Stroke): string {
  if (s.width <= 0) return 'stroke="none"'
  const dash = DASH[s.dash].map((d) => d * Math.max(1, s.width))
  return `stroke="${col(s.color)}" stroke-opacity="${n(s.opacity)}" stroke-width="${n(s.width)}"${dash.length ? ` stroke-dasharray="${dash.join(' ')}"` : ''}${s.dash === 'dot' ? ' stroke-linecap="round"' : ''}`
}

function shadowFilter(defs: Defs, s: Shadow | null): string {
  if (!s) return ''
  const id = defs.id('f')
  // Canvas shadowBlur ≈ 2 × Gaussian sigma.
  defs.add(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${n(s.offsetX)}" dy="${n(s.offsetY)}" stdDeviation="${n(s.blur / 2)}" flood-color="${col(s.color)}" flood-opacity="${n(s.opacity)}"/></filter>`)
  return ` filter="url(#${id})"`
}

function transformOf(o: SceneObject): string {
  const parts = [`translate(${n(o.x + o.width / 2)} ${n(o.y + o.height / 2)})`]
  if (o.rotation) parts.push(`rotate(${n(o.rotation)})`)
  if (o.flipH || o.flipV) parts.push(`scale(${o.flipH ? -1 : 1} ${o.flipV ? -1 : 1})`)
  parts.push(`translate(${n(-o.width / 2)} ${n(-o.height / 2)})`)
  return parts.join(' ')
}

function objectSvg(env: SvgEnv, defs: Defs, o: SceneObject): string {
  switch (o.type) {
    case 'group': return o.children.map((c) => objectSvg(env, defs, c)).join('')
    case 'shape': return `<g transform="${transformOf(o)}">${shapeSvg(defs, o)}</g>`
    case 'picture': return `<g transform="${transformOf(o)}">${pictureSvg(env, defs, o)}</g>`
    case 'text': return `<g transform="${transformOf(o)}">${textBoxSvg(env, defs, o)}</g>`
    case 'calendar': return `<g transform="${transformOf(o)}">${calendarSvg(env, o)}</g>`
  }
}

/** A calendar, drawn from the same pieces as the screen (render/canvas.ts). */
function calendarSvg(env: SvgEnv, o: CalendarObject): string {
  let out = ''
  for (const p of calendarPieces(env, o)) {
    switch (p.t) {
      case 'rect':
        out += `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.r ? ` rx="${n(p.r)}"` : ''} fill="${p.fill ? col(p.fill) : 'none'}"${p.stroke && p.sw > 0 ? ` stroke="${col(p.stroke)}" stroke-width="${n(p.sw)}"` : ''}/>`
        break
      case 'line':
        out += `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${col(p.color)}" stroke-width="${n(p.w)}" stroke-linecap="square"/>`
        break
      case 'dot':
        out += `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${col(p.fill)}" fill-opacity="${n(p.opacity)}"/>`
        break
      case 'text': {
        const anchor = p.align === 'left' ? 'start' : p.align === 'right' ? 'end' : 'middle'
        out += `<text x="${n(p.x)}" y="${n(p.y)}" text-anchor="${anchor}" ${fontAttrs(p.style, 1)} fill="${col(p.style.color)}" xml:space="preserve">${esc(p.text)}</text>`
        break
      }
    }
  }
  return out
}

function shapeSvg(defs: Defs, o: ShapeObject): string {
  const d = toSvgPath(shapePath(o.shape, o.width, o.height, o.adjust))
  const fill = o.shape === 'line' ? { paint: 'none', opacity: 1 } : paintAttr(defs, o.fill, 0, 0, o.width, o.height)
  const filter = shadowFilter(defs, o.effects.shadow)
  return `<path d="${d}" fill="${fill.paint}" fill-opacity="${fill.opacity}" ${strokeAttrs(o.stroke)} stroke-linejoin="miter"${filter}/>`
}

function boxFrame(defs: Defs, o: TextBoxObject | PictureObject): string {
  const fill = paintAttr(defs, o.fill, 0, 0, o.width, o.height)
  if (fill.paint === 'none' && o.stroke.width <= 0) return ''
  return `<rect width="${n(o.width)}" height="${n(o.height)}" fill="${fill.paint}" fill-opacity="${fill.opacity}" ${strokeAttrs(o.stroke)}${shadowFilter(defs, o.effects.shadow)}/>`
}

function pictureSvg(env: SvgEnv, defs: Defs, o: PictureObject): string {
  if (!o.assetId) return boxFrame(defs, o)
  const a = env.assets.get(o.assetId)
  if (!a) return boxFrame(defs, o)
  const iw = n(a.info.pixelWidth) || 1, ih = n(a.info.pixelHeight) || 1
  const { left, top, right, bottom } = o.crop
  const vb = `${n(left * iw)} ${n(top * ih)} ${n((1 - left - right) * iw)} ${n((1 - top - bottom) * ih)}`
  const filters: string[] = []
  if (o.brightness) filters.push(`brightness(${n(1 + o.brightness)})`)
  if (o.contrast) filters.push(`contrast(${n(1 + o.contrast)})`)
  if (o.grayscale) filters.push('grayscale(1)')
  const style = filters.length ? ` style="filter:${filters.join(' ')}"` : ''
  const fill = o.fill.type !== 'none' ? (() => { const p = paintAttr(defs, o.fill, 0, 0, o.width, o.height); return `<rect width="${n(o.width)}" height="${n(o.height)}" fill="${p.paint}" fill-opacity="${p.opacity}"/>` })() : ''
  const img = `<svg width="${n(o.width)}" height="${n(o.height)}" viewBox="${vb}" preserveAspectRatio="none" overflow="hidden"><image width="${iw}" height="${ih}" href="data:${mimeOf(a.info.mime)};base64,${base64(a.bytes)}" opacity="${n(o.opacity)}"${style}/></svg>`
  const border = o.stroke.width > 0 ? `<rect width="${n(o.width)}" height="${n(o.height)}" fill="none" ${strokeAttrs(o.stroke)}/>` : ''
  return `${fill}<g${shadowFilter(defs, o.effects.shadow)}>${img}</g>${border}`
}

function textBoxSvg(env: SvgEnv, defs: Defs, o: TextBoxObject): string {
  let out = boxFrame(defs, o)
  const layout = env.text.layout(env.doc, o.storyId)
  const box = layout?.boxes.find((b) => b.boxId === o.id)
  if (!layout || !box) return out
  for (const line of box.lines) out += lineSvg(defs, line, layout.sizeFactor)
  return out
}

function fontAttrs(style: CharStyle, f: number): string {
  // Reuse the canvas font string so SVG picks exactly the same font and fallbacks.
  const font = cssFont(style, f)
  const m = font.match(/^(italic )?(\d+) ([\d.]+)px (.*)$/)
  const family = m ? m[4] : `"${style.font}"`
  return `font-family='${family.replace(/'/g, '')}' font-size="${n(effectiveSize(style, f))}" font-weight="${style.bold ? 700 : 400}" font-style="${style.italic ? 'italic' : 'normal'}"${style.caps === 'smallCaps' ? ' font-variant="small-caps"' : ''}${style.tracking ? ` letter-spacing="${n(trackingPx(style, f))}"` : ''}${style.kerning ? '' : ' style="font-kerning:none"'}`
}

function lineSvg(defs: Defs, line: LaidLine, f: number): string {
  let out = ''
  for (const run of line.runs) {
    const s = run.style
    const size = effectiveSize(s, f)
    const shift = s.baseline === 'superscript' ? -s.size * f * 0.33 : s.baseline === 'subscript' ? s.size * f * 0.14 : 0
    const x = line.x + run.x
    const y = line.baseline + shift + (run.dy ?? 0)
    const text = displayText(run.text, s)
    // (No highlight behind a drop cap, same as the screen.)
    if (s.highlight && run.dy === undefined) out += `<rect x="${n(x)}" y="${n(line.top)}" width="${n(run.width)}" height="${n(line.height)}" fill="${col(s.highlight, '#ffff00')}"/>`
    // Text transparency: one group so fill, outline and underline fade together.
    const groupStart = out.length
    const runOpacity = Math.max(0, Math.min(1, s.opacity))
    const sc = s.scale / 100
    const tf = `translate(${n(x)} ${n(y)})${sc !== 1 ? ` scale(${n(sc)} 1)` : ''}`
    const ws = line.spaceExtra && !run.marker ? ` word-spacing="${n(line.spaceExtra / sc)}"` : ''
    let fill = `fill="${col(s.color)}"`
    if (s.textFill && s.textFill.type !== 'none') {
      const p = paintAttr(defs, s.textFill, 0, line.top - y, run.width / sc, line.height)
      fill = `fill="${p.paint}" fill-opacity="${p.opacity}"`
    }
    const outline = s.textOutline && s.textOutline.width > 0
      ? ` stroke="${col(s.textOutline.color)}" stroke-opacity="${n(s.textOutline.opacity)}" stroke-width="${n(s.textOutline.width)}" stroke-linejoin="round"${s.textOutline.dash !== 'solid' ? ` stroke-dasharray="${DASH[s.textOutline.dash].map((d) => d * Math.max(1, s.textOutline!.width)).join(' ')}"` : ''}`
      : ''
    const attrs = `${fontAttrs(s, f)}${ws} xml:space="preserve"`
    if (s.textGlow) {
      const id = defs.id('f')
      defs.add(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="${n(s.textGlow.size / 2)}"/><feFlood flood-color="${col(s.textGlow.color)}" flood-opacity="${n(s.textGlow.opacity)}"/><feComposite operator="in" in2="SourceGraphic"/><feComposite operator="in"/></filter>`)
      out += `<text transform="${tf}" ${attrs} fill="${col(s.textGlow.color)}" filter="url(#${id})">${esc(text)}</text>`
    }
    out += `<text transform="${tf}" ${attrs} ${fill}${outline}${shadowFilter(defs, s.textShadow)}>${esc(text)}</text>`
    // Underline and strikethrough as rectangles, like the screen renderer.
    const thick = Math.max(0.5, size / 16)
    const trailing = (run.text.match(/\s+$/)?.[0].length ?? 0)
    const ulW = run.marker ? 0 : run.width - (line.last ? 0 : trailing * (size * 0.25 + line.spaceExtra))
    if (s.underline !== 'none' && ulW > 0) out += underlineSvg(s.underline, x, y + size * 0.12, ulW, thick, col(s.color))
    if (s.strike && ulW > 0) out += `<rect x="${n(x)}" y="${n(y - size * 0.3)}" width="${n(ulW)}" height="${n(thick)}" fill="${col(s.color)}"/>`
    if (runOpacity < 1) out = `${out.slice(0, groupStart)}<g opacity="${n(runOpacity)}">${out.slice(groupStart)}</g>`
  }
  return out
}

/** Underline shapes, drawn exactly like the screen renderer (render/canvas.ts). */
export function underlineSvg(kind: CharStyle['underline'], x: number, uy: number, w: number, thick: number, color: string): string {
  const t = kind === 'thick' ? thick * 2 : thick
  const rect = (rx: number, ry: number, rw: number) => `<rect x="${n(rx)}" y="${n(ry)}" width="${n(rw)}" height="${n(t)}" fill="${color}"/>`
  switch (kind) {
    case 'none': return ''
    case 'double': return rect(x, uy, w) + rect(x, uy + t * 2, w)
    case 'dotted':
    case 'dash': {
      const seg = kind === 'dotted' ? t : t * 4
      let out = ''
      for (let ux = 0; ux < w; ux += seg * 2) out += rect(x + ux, uy, Math.min(seg, w - ux))
      return out
    }
    case 'wave': {
      const pts: string[] = []
      for (let ux = 0; ux <= w; ux += t) pts.push(`${n(x + ux)},${n(uy + Math.sin((ux / (t * 3)) * Math.PI) * t)}`)
      return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${n(t)}"/>`
    }
    default: return rect(x, uy, w)
  }
}

function backgroundSvg(env: SvgEnv, defs: Defs, page: Page, x: number, y: number, w: number, h: number): string {
  const bg = page.background
  if (bg.type === 'picture') {
    const a = env.assets.get(bg.assetId)
    if (!a) return ''
    const href = `data:${mimeOf(a.info.mime)};base64,${base64(a.bytes)}`
    if (bg.mode === 'tile') {
      const id = defs.id('p')
      const pw = (a.info.pixelWidth || 100) * 0.75, ph = (a.info.pixelHeight || 100) * 0.75
      defs.add(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n(pw)}" height="${n(ph)}"><image width="${n(pw)}" height="${n(ph)}" href="${href}"/></pattern>`)
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${id})"/>`
    }
    return `<image x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" href="${href}"/>`
  }
  const p = paintAttr(defs, bg, x, y, w, h)
  if (p.paint === 'none') return ''
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${p.paint}" fill-opacity="${p.opacity}"/>`
}

export interface PageSvgOptions {
  /** Points of bleed to include around the trim (objects past the edge print into it). */
  bleed?: number
  /** Extra margin around the bleed for crop marks (points). */
  marks?: boolean
  transparent?: boolean
}

/** One page as a standalone SVG string, sized in points. */
export function pageToSvg(env: SvgEnv, page: Page, opts: PageSvgOptions = {}): { svg: string; width: number; height: number } {
  const { width, height } = env.doc.pageSetup
  const bleed = opts.bleed ?? 0
  const slug = opts.marks ? 27 : 0 // 0.375" for crop marks
  const off = bleed + slug
  const W = width + off * 2, H = height + off * 2
  const defs = new Defs()
  const clip = defs.id('c')
  defs.add(`<clipPath id="${clip}"><rect x="${n(-bleed)}" y="${n(-bleed)}" width="${n(width + bleed * 2)}" height="${n(height + bleed * 2)}"/></clipPath>`)
  let body = ''
  if (!opts.transparent) {
    body += `<rect x="${n(-bleed)}" y="${n(-bleed)}" width="${n(width + bleed * 2)}" height="${n(height + bleed * 2)}" fill="#ffffff"/>`
    body += backgroundSvg(env, defs, page, -bleed, -bleed, width + bleed * 2, height + bleed * 2)
  }
  if (page.masterId) {
    const master = env.doc.masters.find((m) => m.id === page.masterId)
    if (master) body += master.objects.map((o) => objectSvg(env, defs, o)).join('')
  }
  body += page.objects.map((o) => objectSvg(env, defs, o)).join('')
  let marks = ''
  if (opts.marks) {
    const len = 18, gap = bleed + 4.5
    const lines: Array<[number, number, number, number]> = []
    for (const [cx, sx] of [[0, -1], [width, 1]] as const) {
      for (const [cy, sy] of [[0, -1], [height, 1]] as const) {
        lines.push([cx + sx * gap, cy, cx + sx * (gap + len), cy])
        lines.push([cx, cy + sy * gap, cx, cy + sy * (gap + len)])
      }
    }
    marks = lines.map(([x1, y1, x2, y2]) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#000" stroke-width="0.25"/>`).join('')
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}pt" height="${n(H)}pt" viewBox="${n(-off)} ${n(-off)} ${n(W)} ${n(H)}">${defs}<g clip-path="url(#${clip})">${body}</g>${marks}</svg>`
  return { svg, width: W, height: H }
}

/** Re-root a standalone page SVG at a position/size inside another SVG (user units). */
function placeSvg(svg: string, x: number, y: number, w: number, h: number): string {
  return svg.replace(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="[^"]+" height="[^"]+"/, `<svg x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"`)
}

export interface PrintSheet {
  svg: string
  /** Sheet size in points. */
  width: number
  height: number
}

/** Wrap sheets into one HTML document for Chromium's PDF/print engine. */
export function sheetsToHtml(sheets: PrintSheet[], fontCss = ''): string {
  const first = sheets[0]
  const css = `${fontCss}
@page { size: ${n(first.width)}pt ${n(first.height)}pt; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff; }
.sheet { width: ${n(first.width)}pt; height: ${n(first.height)}pt; overflow: hidden; position: relative; page-break-after: always; break-after: page; }
.sheet:last-child { page-break-after: auto; break-after: auto; }
.sheet > svg { position: absolute; left: 0; top: 0; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`
  // Pages are pure drawing: no script may run in the print/PDF window, even
  // if a damaged or hostile file managed to smuggle markup in.
  const csp = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; connect-src 'none'; frame-src 'none'">`
  return `<!doctype html><html><head><meta charset="utf-8">${csp}<style>${css}</style></head><body>${sheets.map((s) => `<div class="sheet">${s.svg}</div>`).join('')}</body></html>`
}

export interface TileOptions {
  paperWidth: number
  paperHeight: number
  /** Unprintable printer margin kept clear on each sheet. */
  margin: number
  /** Overlap between neighbouring tiles so they can be trimmed and taped. */
  overlap: number
}

/** Split a large page into sheets of paper for home printing (Publisher's tiling). */
export function tilePage(page: { svg: string; width: number; height: number }, t: TileOptions, label: string): PrintSheet[] {
  const usableW = t.paperWidth - t.margin * 2
  const usableH = t.paperHeight - t.margin * 2
  const stepX = usableW - t.overlap, stepY = usableH - t.overlap
  const cols = Math.max(1, Math.ceil((page.width - t.overlap) / stepX))
  const rows = Math.max(1, Math.ceil((page.height - t.overlap) / stepY))
  const sheets: PrintSheet[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = c * stepX, oy = r * stepY
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(t.paperWidth)}pt" height="${n(t.paperHeight)}pt" viewBox="0 0 ${n(t.paperWidth)} ${n(t.paperHeight)}">
<svg x="${n(t.margin)}" y="${n(t.margin)}" width="${n(usableW)}" height="${n(usableH)}" viewBox="${n(ox)} ${n(oy)} ${n(usableW)} ${n(usableH)}" overflow="hidden">${placeSvg(page.svg, 0, 0, page.width, page.height)}</svg>
<rect x="${n(t.margin)}" y="${n(t.margin)}" width="${n(usableW)}" height="${n(usableH)}" fill="none" stroke="#bbbbbb" stroke-width="0.3" stroke-dasharray="2 2"/>
<text x="${n(t.margin)}" y="${n(t.paperHeight - t.margin / 2 + 3)}" font-family="sans-serif" font-size="7" fill="#888">${esc(label)} — row ${r + 1} of ${rows}, column ${c + 1} of ${cols}</text>
</svg>`
      sheets.push({ svg, width: t.paperWidth, height: t.paperHeight })
    }
  }
  return sheets
}

export interface CardSheetOptions {
  /** Paper size, already turned to the right orientation (points). */
  paperWidth: number
  paperHeight: number
  /** Turn the inside sheet upside down (for printers that flip the other way). */
  insideUpsideDown: boolean
  /** Trim and fold marks outside the card, when the paper is bigger than the card. */
  marks: boolean
}

/**
 * Lay out a folded greeting card on printer sheets (one sheet side per entry).
 * `pages` holds the rendered card pages by slot (Front, Inside 1, Inside 2,
 * Back); a missing page leaves its panel blank.
 */
export function cardSheets(pages: Array<{ svg: string; width: number; height: number } | null>, plan: CardPlan,
  pw: number, ph: number, o: CardSheetOptions): PrintSheet[] {
  const W = o.paperWidth, H = o.paperHeight
  // Shrink only if the card doesn't fit on the paper at all.
  const k = Math.min(1, W / plan.width, H / plan.height)
  const sw = plan.width * k, sh = plan.height * k
  const ox = (W - sw) / 2, oy = (H - sh) / 2
  return plan.sides.map((side, sideIndex) => {
    let body = ''
    for (const pl of side.panels) {
      const pg = pages[pl.slot]
      if (!pg) continue
      const x = ox + pl.x * k, y = oy + pl.y * k, w = pw * k, h = ph * k
      // Each panel is clipped to its own area so nothing spills onto the next one.
      const inner = placeSvg(pg.svg, x, y, w, h).replace(/^<svg /, '<svg overflow="hidden" ')
      body += pl.rotate === 180 ? `<g transform="rotate(180 ${n(x + w / 2)} ${n(y + h / 2)})">${inner}</g>` : inner
    }
    if (o.marks) body += cardMarks(plan, ox, oy, sw, sh, k)
    if (sideIndex > 0 && o.insideUpsideDown) body = `<g transform="rotate(180 ${n(W / 2)} ${n(H / 2)})">${body}</g>`
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}pt" height="${n(H)}pt" viewBox="0 0 ${n(W)} ${n(H)}">${body}</svg>`,
      width: W,
      height: H
    }
  })
}

/** Trim marks at the corners and dashed fold marks, drawn outside the card only. */
function cardMarks(plan: CardPlan, ox: number, oy: number, sw: number, sh: number, k: number): string {
  const gapX = ox, gapY = oy
  const line = (x1: number, y1: number, x2: number, y2: number, dash = '') =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#000" stroke-width="0.5"${dash}/>`
  let out = ''
  const len = (gap: number) => Math.min(18, gap - 4)
  if (gapX >= 10) {
    const L = len(gapX)
    for (const y of [oy, oy + sh]) out += line(ox - 3 - L, y, ox - 3, y) + line(ox + sw + 3, y, ox + sw + 3 + L, y)
  }
  if (gapY >= 10) {
    const L = len(gapY)
    for (const x of [ox, ox + sw]) out += line(x, oy - 3 - L, x, oy - 3) + line(x, oy + sh + 3, x, oy + sh + 3 + L)
  }
  for (const f of plan.folds) {
    const dash = ' stroke-dasharray="2 2"'
    if (f.orientation === 'v' && gapY >= 10) {
      const x = ox + f.pos * k, L = len(gapY)
      out += line(x, oy - 3 - L, x, oy - 3, dash) + line(x, oy + sh + 3, x, oy + sh + 3 + L, dash)
    }
    if (f.orientation === 'h' && gapX >= 10) {
      const y = oy + f.pos * k, L = len(gapX)
      out += line(ox - 3 - L, y, ox - 3, y, dash) + line(ox + sw + 3, y, ox + sw + 3 + L, y, dash)
    }
  }
  return out
}

/** Scale a page to fit one sheet of paper, centred. */
export function fitPageToSheet(page: { svg: string; width: number; height: number }, paperWidth: number, paperHeight: number, margin: number): PrintSheet {
  const k = Math.min((paperWidth - margin * 2) / page.width, (paperHeight - margin * 2) / page.height)
  const w = page.width * k, h = page.height * k
  const x = (paperWidth - w) / 2, y = (paperHeight - h) / 2
  const inner = placeSvg(page.svg, x, y, w, h)
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${n(paperWidth)}pt" height="${n(paperHeight)}pt" viewBox="0 0 ${n(paperWidth)} ${n(paperHeight)}">${inner}</svg>`,
    width: paperWidth,
    height: paperHeight
  }
}
