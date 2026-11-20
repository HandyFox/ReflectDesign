// A small device-independent path format shared by the screen renderer and
// the PDF exporter, so shapes look identical everywhere.

export type PathCmd =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: 'Q'; x1: number; y1: number; x: number; y: number }
  | { c: 'Z' }

export type Path = PathCmd[]

const K = 0.5522847498 // circle bezier constant

export function rectPath(x: number, y: number, w: number, h: number): Path {
  return [{ c: 'M', x, y }, { c: 'L', x: x + w, y }, { c: 'L', x: x + w, y: y + h }, { c: 'L', x, y: y + h }, { c: 'Z' }]
}

export function roundRectPath(x: number, y: number, w: number, h: number, r: number): Path {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  if (r === 0) return rectPath(x, y, w, h)
  const k = r * K
  return [
    { c: 'M', x: x + r, y },
    { c: 'L', x: x + w - r, y },
    { c: 'C', x1: x + w - r + k, y1: y, x2: x + w, y2: y + r - k, x: x + w, y: y + r },
    { c: 'L', x: x + w, y: y + h - r },
    { c: 'C', x1: x + w, y1: y + h - r + k, x2: x + w - r + k, y2: y + h, x: x + w - r, y: y + h },
    { c: 'L', x: x + r, y: y + h },
    { c: 'C', x1: x + r - k, y1: y + h, x2: x, y2: y + h - r + k, x, y: y + h - r },
    { c: 'L', x, y: y + r },
    { c: 'C', x1: x, y1: y + r - k, x2: x + r - k, y2: y, x: x + r, y },
    { c: 'Z' }
  ]
}

export function ellipsePath(x: number, y: number, w: number, h: number): Path {
  const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry
  const kx = rx * K, ky = ry * K
  return [
    { c: 'M', x: cx + rx, y: cy },
    { c: 'C', x1: cx + rx, y1: cy + ky, x2: cx + kx, y2: cy + ry, x: cx, y: cy + ry },
    { c: 'C', x1: cx - kx, y1: cy + ry, x2: cx - rx, y2: cy + ky, x: cx - rx, y: cy },
    { c: 'C', x1: cx - rx, y1: cy - ky, x2: cx - kx, y2: cy - ry, x: cx, y: cy - ry },
    { c: 'C', x1: cx + kx, y1: cy - ry, x2: cx + rx, y2: cy - ky, x: cx + rx, y: cy },
    { c: 'Z' }
  ]
}

export function polygonPath(pts: Array<{ x: number; y: number }>, close = true): Path {
  if (pts.length === 0) return []
  const p: Path = [{ c: 'M', x: pts[0].x, y: pts[0].y }]
  for (let i = 1; i < pts.length; i++) p.push({ c: 'L', x: pts[i].x, y: pts[i].y })
  if (close) p.push({ c: 'Z' })
  return p
}

/** Draw a Path onto a Canvas 2D context (or Path2D). */
export function tracePath(ctx: CanvasRenderingContext2D | Path2D, path: Path): void {
  for (const cmd of path) {
    switch (cmd.c) {
      case 'M': ctx.moveTo(cmd.x, cmd.y); break
      case 'L': ctx.lineTo(cmd.x, cmd.y); break
      case 'C': ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y); break
      case 'Q': ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y); break
      case 'Z': ctx.closePath(); break
    }
  }
}

/** SVG path data (used by PDF export and thumbnails). */
export function toSvgPath(path: Path): string {
  const n = (v: number) => Number(v.toFixed(3))
  return path
    .map((c) => {
      switch (c.c) {
        case 'M': return `M${n(c.x)} ${n(c.y)}`
        case 'L': return `L${n(c.x)} ${n(c.y)}`
        case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`
        case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`
        case 'Z': return 'Z'
      }
    })
    .join(' ')
}
