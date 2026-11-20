import type { ShapeKind } from '../model/types'
import type { Path } from './path'
import { ellipsePath, polygonPath, rectPath, roundRectPath } from './path'

type Pt = { x: number; y: number }

function star(points: number, inner: number, w: number, h: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2
    const r = i % 2 === 0 ? 1 : inner
    out.push({ x: w / 2 + (Math.cos(a) * r * w) / 2, y: h / 2 + (Math.sin(a) * r * h) / 2 })
  }
  return out
}

function regular(n: number, w: number, h: number, offset = -Math.PI / 2): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = offset + (2 * Math.PI * i) / n
    out.push({ x: w / 2 + (Math.cos(a) * w) / 2, y: h / 2 + (Math.sin(a) * h) / 2 })
  }
  return out
}

/** Outline of a shape in its local box (0,0)-(w,h). */
export function shapePath(kind: ShapeKind, w: number, h: number, adjust = 0.5): Path {
  switch (kind) {
    case 'rect': return rectPath(0, 0, w, h)
    case 'roundRect': return roundRectPath(0, 0, w, h, Math.min(w, h) * adjust)
    case 'ellipse': return ellipsePath(0, 0, w, h)
    case 'triangle': return polygonPath([{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }])
    case 'rightTriangle': return polygonPath([{ x: 0, y: 0 }, { x: w, y: h }, { x: 0, y: h }])
    case 'diamond': return polygonPath([{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }])
    case 'pentagon': return polygonPath(regular(5, w, h))
    case 'hexagon': return polygonPath(regular(6, w, h, 0))
    case 'octagon': return polygonPath(regular(8, w, h, Math.PI / 8))
    case 'star4': return polygonPath(star(4, 0.38, w, h))
    case 'star5': return polygonPath(star(5, 0.38, w, h))
    case 'star6': return polygonPath(star(6, 0.5, w, h))
    case 'star8': return polygonPath(star(8, 0.6, w, h))
    case 'plus': {
      const t = Math.min(w, h) * 0.3
      const x1 = (w - t) / 2, x2 = (w + t) / 2, y1 = (h - t) / 2, y2 = (h + t) / 2
      return polygonPath([
        { x: x1, y: 0 }, { x: x2, y: 0 }, { x: x2, y: y1 }, { x: w, y: y1 }, { x: w, y: y2 }, { x: x2, y: y2 },
        { x: x2, y: h }, { x: x1, y: h }, { x: x1, y: y2 }, { x: 0, y: y2 }, { x: 0, y: y1 }, { x: x1, y: y1 }
      ])
    }
    case 'arrowRight': return polygonPath(arrow(w, h))
    case 'arrowLeft': return polygonPath(arrow(w, h).map((p) => ({ x: w - p.x, y: p.y })))
    case 'arrowDown': return polygonPath(arrow(h, w).map((p) => ({ x: p.y, y: p.x })))
    case 'arrowUp': return polygonPath(arrow(h, w).map((p) => ({ x: p.y, y: h - p.x })))
    case 'line': return [{ c: 'M', x: 0, y: 0 }, { c: 'L', x: w, y: h }]
    case 'heart': return [
      { c: 'M', x: w / 2, y: h * 0.28 },
      { c: 'C', x1: w * 0.5, y1: h * 0.05, x2: w * 0.05, y2: -h * 0.02, x: 0, y: h * 0.3 },
      { c: 'C', x1: -w * 0.02, y1: h * 0.6, x2: w * 0.35, y2: h * 0.78, x: w / 2, y: h },
      { c: 'C', x1: w * 0.65, y1: h * 0.78, x2: w * 1.02, y2: h * 0.6, x: w, y: h * 0.3 },
      { c: 'C', x1: w * 0.95, y1: -h * 0.02, x2: w * 0.5, y2: h * 0.05, x: w / 2, y: h * 0.28 },
      { c: 'Z' }
    ]
    case 'lightning': return polygonPath([
      { x: w * 0.39, y: 0 }, { x: w * 0.72, y: h * 0.3 }, { x: w * 0.58, y: h * 0.36 }, { x: w * 0.89, y: h * 0.63 },
      { x: w * 0.76, y: h * 0.69 }, { x: w, y: h }, { x: w * 0.42, y: h * 0.74 }, { x: w * 0.55, y: h * 0.67 },
      { x: w * 0.2, y: h * 0.48 }, { x: w * 0.36, y: h * 0.41 }, { x: 0, y: h * 0.2 }
    ])
    case 'moon': return [
      { c: 'M', x: w, y: 0 },
      { c: 'C', x1: w * 0.45, y1: 0, x2: 0, y2: h * 0.22, x: 0, y: h / 2 },
      { c: 'C', x1: 0, y1: h * 0.78, x2: w * 0.45, y2: h, x: w, y: h },
      { c: 'C', x1: w * 0.6, y1: h * 0.85, x2: w * 0.35, y2: h * 0.7, x: w * 0.35, y: h / 2 },
      { c: 'C', x1: w * 0.35, y1: h * 0.3, x2: w * 0.6, y2: h * 0.15, x: w, y: 0 },
      { c: 'Z' }
    ]
    case 'sun': {
      const p: Path = [...ellipsePath(w * 0.25, h * 0.25, w * 0.5, h * 0.5)]
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * i) / 4
        const tri = [-0.12, 0, 0.12].map((d, j) => {
          const r = j === 1 ? 0.5 : 0.31
          return { x: w / 2 + Math.cos(a + d) * r * w, y: h / 2 + Math.sin(a + d) * r * h }
        })
        p.push(...polygonPath(tri))
      }
      return p
    }
    case 'cloud': {
      const bumps = [
        [0.25, 0.6, 0.22], [0.42, 0.38, 0.24], [0.64, 0.36, 0.22], [0.8, 0.55, 0.2], [0.6, 0.7, 0.22], [0.38, 0.72, 0.2]
      ]
      const p: Path = []
      for (const [cx, cy, r] of bumps) p.push(...ellipsePath((cx - r) * w, (cy - r) * h, 2 * r * w, 2 * r * h * 1.1))
      return p
    }
    case 'banner': {
      const fold = w * 0.12
      return polygonPath([
        { x: 0, y: 0 }, { x: w, y: 0 }, { x: w - fold, y: h / 2 }, { x: w, y: h }, { x: 0, y: h }, { x: fold, y: h / 2 }
      ])
    }
    case 'callout': {
      const bh = h * 0.78
      return [
        ...roundRectPath(0, 0, w, bh, Math.min(w, bh) * 0.15).slice(0, -1),
        { c: 'Z' },
        { c: 'M', x: w * 0.2, y: bh - 1 },
        { c: 'L', x: w * 0.12, y: h },
        { c: 'L', x: w * 0.38, y: bh - 1 },
        { c: 'Z' }
      ]
    }
    case 'frame': {
      const t = Math.min(w, h) * adjust
      // Outer clockwise, inner counter-clockwise → a hole with nonzero fill.
      return [
        ...rectPath(0, 0, w, h),
        { c: 'M', x: t, y: t }, { c: 'L', x: t, y: h - t }, { c: 'L', x: w - t, y: h - t }, { c: 'L', x: w - t, y: t }, { c: 'Z' }
      ]
    }
  }
}

function arrow(w: number, h: number): Pt[] {
  const head = Math.min(w * 0.45, h)
  const shaftTop = h * 0.25, shaftBot = h * 0.75
  return [
    { x: 0, y: shaftTop }, { x: w - head, y: shaftTop }, { x: w - head, y: 0 }, { x: w, y: h / 2 },
    { x: w - head, y: h }, { x: w - head, y: shaftBot }, { x: 0, y: shaftBot }
  ]
}

export const SHAPE_GALLERY: Array<{ group: string; kinds: ShapeKind[] }> = [
  { group: 'Lines', kinds: ['line'] },
  { group: 'Basic Shapes', kinds: ['rect', 'roundRect', 'ellipse', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'plus', 'frame', 'heart', 'lightning', 'sun', 'moon', 'cloud'] },
  { group: 'Block Arrows', kinds: ['arrowRight', 'arrowLeft', 'arrowUp', 'arrowDown'] },
  { group: 'Stars and Banners', kinds: ['star4', 'star5', 'star6', 'star8', 'banner'] },
  { group: 'Callouts', kinds: ['callout'] }
]

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'Rectangle', roundRect: 'Rounded Rectangle', ellipse: 'Oval', triangle: 'Isosceles Triangle',
  rightTriangle: 'Right Triangle', diamond: 'Diamond', pentagon: 'Pentagon', hexagon: 'Hexagon', octagon: 'Octagon',
  star4: '4-Point Star', star5: '5-Point Star', star6: '6-Point Star', star8: '8-Point Star', heart: 'Heart',
  arrowRight: 'Right Arrow', arrowLeft: 'Left Arrow', arrowUp: 'Up Arrow', arrowDown: 'Down Arrow', line: 'Line',
  cloud: 'Cloud', lightning: 'Lightning Bolt', moon: 'Moon', sun: 'Sun', banner: 'Ribbon Banner',
  callout: 'Speech Bubble', frame: 'Frame', plus: 'Plus'
}
