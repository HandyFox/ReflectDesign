// Text wrap: works out which parts of a text box are covered by objects in
// front of it (Publisher wraps text around objects that are on top of the
// text box; use Bring Forward / Send Backward to change that).

import type { Id, PictureObject, RDocument, SceneObject, TextBoxObject, Wrap } from '../model/types'
import type { AssetStore } from '../assets'
import { shapePath } from '../geometry/shapes'
import { toLocal, toPage, type Pt } from '../geometry/hit'
import type { Interval, WrapFn } from './layout'

interface Obstacle {
  mode: Wrap['mode']
  dist: Wrap['distance']
  /** Outlines in the text box's local coordinates. */
  polys: Pt[][]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const traceCache = new Map<string, Pt[] | null>()

/**
 * Outline of the visible (non-transparent) part of a picture, in unit
 * coordinates of its box: for each row, the leftmost and rightmost opaque
 * pixel. That is exactly what horizontal text wrapping needs.
 */
export function traceAlpha(img: CanvasImageSource, crop: PictureObject['crop'], key: string): Pt[] | null {
  if (traceCache.has(key)) return traceCache.get(key)!
  const iw = (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width
  const ih = (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height
  if (!iw || !ih) return null
  const sx = crop.left * iw, sy = crop.top * ih
  const sw = Math.max(1, (1 - crop.left - crop.right) * iw), sh = Math.max(1, (1 - crop.top - crop.bottom) * ih)
  const k = 160 / Math.max(sw, sh)
  const w = Math.max(2, Math.round(sw * k)), h = Math.max(2, Math.round(sh * k))
  let data: Uint8ClampedArray
  try {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    traceCache.set(key, null)
    return null
  }
  const left: Pt[] = []
  const right: Pt[] = []
  for (let y = 0; y < h; y++) {
    let a = -1, b = -1
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) { if (a < 0) a = x; b = x }
    }
    if (a < 0) continue
    const y0 = y / h, y1 = (y + 1) / h
    left.push({ x: a / w, y: y0 }, { x: a / w, y: y1 })
    right.push({ x: (b + 1) / w, y: y0 }, { x: (b + 1) / w, y: y1 })
  }
  const poly = left.length ? [...left, ...right.reverse()] : null
  if (traceCache.size > 200) traceCache.clear()
  traceCache.set(key, poly)
  return poly
}

/** Flatten a shape outline into polygons (unit coordinates). */
function shapePolys(o: Extract<SceneObject, { type: 'shape' }>): Pt[][] {
  const w = Math.max(o.width, 1e-6), h = Math.max(o.height, 1e-6)
  if (o.shape === 'line') {
    const t = Math.max(o.stroke.width, 1) / 2
    return [[{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 1 + t / h }, { x: 0, y: t / h }]]
  }
  const polys: Pt[][] = []
  let cur: Pt[] = []
  let last: Pt = { x: 0, y: 0 }
  for (const c of shapePath(o.shape, w, h, o.adjust)) {
    if (c.c === 'M') { if (cur.length > 2) polys.push(cur); cur = [{ x: c.x / w, y: c.y / h }]; last = c }
    else if (c.c === 'L') { cur.push({ x: c.x / w, y: c.y / h }); last = c }
    else if (c.c === 'C' || c.c === 'Q') {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, u = 1 - t
        const p = c.c === 'C'
          ? { x: u * u * u * last.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, y: u * u * u * last.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y }
          : { x: u * u * last.x + 2 * u * t * c.x1 + t * t * c.x, y: u * u * last.y + 2 * u * t * c.y1 + t * t * c.y }
        cur.push({ x: p.x / w, y: p.y / h })
      }
      last = c
    } else if (c.c === 'Z') { if (cur.length > 2) polys.push(cur); cur = [] }
  }
  if (cur.length > 2) polys.push(cur)
  return polys
}

const RECT: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

function unitOutline(o: SceneObject, assets: AssetStore | undefined): Pt[][] {
  if ((o.wrap.mode === 'tight' || o.wrap.mode === 'through') && o.wrap.polygon && o.wrap.polygon.length > 2) return [o.wrap.polygon]
  if (o.wrap.mode !== 'tight' && o.wrap.mode !== 'through') return [RECT]
  if (o.type === 'shape') return shapePolys(o)
  if (o.type === 'picture' && o.assetId && assets) {
    const img = assets.image(o.assetId)
    if (img) {
      const c = o.crop
      const poly = traceAlpha(img, c, `${o.assetId}|${c.left},${c.top},${c.right},${c.bottom}`)
      if (poly) return [poly]
    }
  }
  return [RECT]
}

function obstacleFor(o: SceneObject, box: TextBoxObject, assets: AssetStore | undefined): Obstacle {
  const polys = unitOutline(o, assets).map((poly) =>
    poly.map((u) => {
      const lx = (o.flipH ? 1 - u.x : u.x) * o.width
      const ly = (o.flipV ? 1 - u.y : u.y) * o.height
      return toLocal(box, toPage(o, { x: lx, y: ly }))
    })
  )
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of polys.flat()) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  return { mode: o.wrap.mode, dist: o.wrap.distance, polys, minX, maxX, minY, maxY }
}

/** Spans where a horizontal line at y crosses the polygons. */
function scanSpans(polys: Pt[][], y: number): Interval[] {
  const out: Interval[] = []
  for (const poly of polys) {
    const xs: number[] = []
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length]
      if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]])
  }
  return out
}

function blockedBy(ob: Obstacle, top: number, bottom: number): Interval[] {
  const d = ob.dist
  if (bottom <= ob.minY - d.top || top >= ob.maxY + d.bottom) return []
  switch (ob.mode) {
    case 'topBottom':
      return [[-1e9, 1e9]]
    case 'square':
      return [[ob.minX - d.left, ob.maxX + d.right]]
    case 'tight':
    case 'through': {
      // Sample the band (grown by the top/bottom distances) at several heights.
      const y0 = Math.max(ob.minY, top - d.bottom), y1 = Math.min(ob.maxY, bottom + d.top)
      const spans: Interval[] = []
      const steps = 6
      for (let i = 0; i <= steps; i++) {
        const y = y0 + ((y1 - y0) * i) / steps
        for (const [a, b] of scanSpans(ob.polys, Math.min(y, ob.maxY - 1e-6))) spans.push([a - d.left, b + d.right])
      }
      if (!spans.length) return []
      // Publisher's Tight wrap keeps text out of the whole width the outline covers on that line.
      return [[Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))]]
    }
    default:
      return []
  }
}

/** Find the page a top-level object lives on and its stacking index. */
function pageOf(doc: RDocument, id: Id): { objects: SceneObject[]; index: number } | null {
  const contains = (o: SceneObject): boolean => o.id === id || (o.type === 'group' && o.children.some(contains))
  for (const p of doc.pages) {
    const index = p.objects.findIndex(contains)
    if (index >= 0) return { objects: p.objects, index }
  }
  return null
}

function flatten(list: SceneObject[]): SceneObject[] {
  return list.flatMap((o) => (o.type === 'group' ? flatten(o.children) : [o]))
}

/** Wrap function for a chain of text boxes, or undefined if nothing is in the way. */
export function buildWrapFn(doc: RDocument, chain: TextBoxObject[], assets: AssetStore | undefined): WrapFn | undefined {
  const perBox = new Map<Id, Obstacle[]>()
  for (const box of chain) {
    if (!box.respectWrap) continue
    const where = pageOf(doc, box.id)
    if (!where) continue
    const above = flatten(where.objects.slice(where.index + 1)).filter((o) =>
      o.wrap.mode !== 'none' && o.id !== box.id && !(o.type === 'text' && o.storyId === box.storyId))
    // Objects grouped with the box but drawn above it also count.
    const obstacles = above
      .map((o) => obstacleFor(o, box, assets))
      .filter((ob) => ob.maxX > 0 && ob.minX < box.width && ob.maxY > 0 && ob.minY < box.height)
    if (obstacles.length) perBox.set(box.id, obstacles)
  }
  if (perBox.size === 0) return undefined
  return (boxId, top, bottom) => {
    const obs = perBox.get(boxId)
    if (!obs) return []
    return obs.flatMap((ob) => blockedBy(ob, top, bottom))
  }
}
