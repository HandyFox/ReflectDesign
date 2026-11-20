import type { SceneObject } from '../model/types'
import type { Frame } from '../model/ops'

export interface Pt { x: number; y: number }

export function rotatePt(p: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a), s = Math.sin(a)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** Page point → frame-local point (0..w, 0..h when inside). */
export function toLocal(f: Frame, p: Pt): Pt {
  const cx = f.x + f.width / 2, cy = f.y + f.height / 2
  const r = rotatePt({ x: p.x - cx, y: p.y - cy }, -f.rotation)
  return { x: r.x + f.width / 2, y: r.y + f.height / 2 }
}

/** Frame-local point → page point. */
export function toPage(f: Frame, p: Pt): Pt {
  const cx = f.x + f.width / 2, cy = f.y + f.height / 2
  const r = rotatePt({ x: p.x - f.width / 2, y: p.y - f.height / 2 }, f.rotation)
  return { x: r.x + cx, y: r.y + cy }
}

/** Is a page point inside an object's (rotated) box, grown by `slop` points? */
export function hitObject(o: SceneObject, p: Pt, slop = 0): boolean {
  if (o.type === 'group') return o.children.some((c) => hitObject(c, p, slop))
  const l = toLocal(o, p)
  // Lines are thin: use distance to the segment.
  if (o.type === 'shape' && o.shape === 'line') {
    const len2 = o.width * o.width + o.height * o.height
    const t = len2 ? Math.max(0, Math.min(1, (l.x * o.width + l.y * o.height) / len2)) : 0
    const dx = l.x - t * o.width, dy = l.y - t * o.height
    return Math.hypot(dx, dy) <= Math.max(slop, o.stroke.width / 2 + slop)
  }
  return l.x >= -slop && l.y >= -slop && l.x <= o.width + slop && l.y <= o.height + slop
}

/** Distance (local units) from a local point to the nearest edge of the box, negative outside. */
export function edgeDistance(o: { width: number; height: number }, l: Pt): number {
  return Math.min(l.x, l.y, o.width - l.x, o.height - l.y)
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot'

/** Handle positions in frame-local coordinates. */
export function handlePoints(f: Frame, rotOffset: number): Array<{ h: Handle; p: Pt }> {
  const w = f.width, h = f.height
  return [
    { h: 'nw', p: { x: 0, y: 0 } },
    { h: 'n', p: { x: w / 2, y: 0 } },
    { h: 'ne', p: { x: w, y: 0 } },
    { h: 'e', p: { x: w, y: h / 2 } },
    { h: 'se', p: { x: w, y: h } },
    { h: 's', p: { x: w / 2, y: h } },
    { h: 'sw', p: { x: 0, y: h } },
    { h: 'w', p: { x: 0, y: h / 2 } },
    { h: 'rot', p: { x: w / 2, y: -rotOffset } }
  ]
}

/**
 * New frame when dragging a resize handle to `p` (page coordinates).
 * keepAspect: corners keep proportions. fromCenter: resize around the centre.
 */
export function resizeFrame(start: Frame, handle: Handle, p: Pt, keepAspect: boolean, fromCenter: boolean, min = 1): Frame {
  const l = toLocal(start, p)
  let left = 0, top = 0, right = start.width, bottom = start.height
  const hx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0
  const hy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0
  if (hx === 1) right = l.x
  if (hx === -1) left = l.x
  if (hy === 1) bottom = l.y
  if (hy === -1) top = l.y
  if (fromCenter) {
    if (hx === 1) left = start.width - right
    if (hx === -1) right = start.width - left
    if (hy === 1) top = start.height - bottom
    if (hy === -1) bottom = start.height - top
  }
  let w = right - left, h = bottom - top
  // Don't allow flipping through zero.
  if (w < min) { if (hx === -1) left = right - min; else right = left + min; w = min }
  if (h < min) { if (hy === -1) top = bottom - min; else bottom = top + min; h = min }
  if (keepAspect && hx !== 0 && hy !== 0 && start.width > 0 && start.height > 0) {
    const ratio = start.width / start.height
    const k = Math.max(w / start.width, h / start.height)
    w = Math.max(min, start.width * k)
    h = Math.max(min, w / ratio)
    if (fromCenter) {
      left = (start.width - w) / 2; right = left + w
      top = (start.height - h) / 2; bottom = top + h
    } else {
      if (hx === 1) right = left + w; else left = right - w
      if (hy === 1) bottom = top + h; else top = bottom - h
    }
  }
  const centerLocal = { x: (left + right) / 2, y: (top + bottom) / 2 }
  const c = toPage(start, centerLocal)
  return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h, rotation: start.rotation }
}

export interface Crop { left: number; top: number; right: number; bottom: number }

/** Points per unit of image width/height at the current frame and crop. */
export function cropScale(f: Frame, c: Crop): { kx: number; ky: number } {
  return { kx: f.width / Math.max(0.0001, 1 - c.left - c.right), ky: f.height / Math.max(0.0001, 1 - c.top - c.bottom) }
}

const MIN_VISIBLE = 0.01

/**
 * Publisher crop handles: dragging an edge hides (or reveals) part of the
 * picture without changing its size on the page. Returns the new frame and crop.
 */
export function cropDrag(start: Frame, c0: Crop, handle: Handle, p: Pt, flipH: boolean, flipV: boolean): { frame: Frame; crop: Crop } {
  const l = toLocal(start, p)
  const { kx, ky } = cropScale(start, c0)
  let left = 0, top = 0, right = start.width, bottom = start.height
  const c = { ...c0 }
  // With a flipped picture, the frame's right edge shows the image's left side.
  const L = flipH ? 'right' : 'left', R = flipH ? 'left' : 'right'
  const T = flipV ? 'bottom' : 'top', B = flipV ? 'top' : 'bottom'
  if (handle.includes('e')) {
    right = Math.max(left + 1, l.x)
    c[R] = c0[R] - (right - start.width) / kx
  }
  if (handle.includes('w')) {
    left = Math.min(right - 1, l.x)
    c[L] = c0[L] + left / kx
  }
  if (handle.includes('s')) {
    bottom = Math.max(top + 1, l.y)
    c[B] = c0[B] - (bottom - start.height) / ky
  }
  if (handle.includes('n')) {
    top = Math.min(bottom - 1, l.y)
    c[T] = c0[T] + top / ky
  }
  // Keep at least a sliver of picture visible.
  if (1 - c.left - c.right < MIN_VISIBLE || 1 - c.top - c.bottom < MIN_VISIBLE) return { frame: start, crop: c0 }
  const w = right - left, h = bottom - top
  const center = toPage(start, { x: (left + right) / 2, y: (top + bottom) / 2 })
  return { frame: { x: center.x - w / 2, y: center.y - h / 2, width: w, height: h, rotation: start.rotation }, crop: c }
}

/** Drag the picture inside its crop frame. dx, dy are page-space deltas. */
export function cropPan(start: Frame, c0: Crop, dx: number, dy: number, flipH: boolean, flipV: boolean): Crop {
  const a = (-start.rotation * Math.PI) / 180
  const lx = dx * Math.cos(a) - dy * Math.sin(a)
  const ly = dx * Math.sin(a) + dy * Math.cos(a)
  const { kx, ky } = cropScale(start, c0)
  const ux = (flipH ? -lx : lx) / kx, uy = (flipV ? -ly : ly) / ky
  return { left: c0.left - ux, right: c0.right + ux, top: c0.top - uy, bottom: c0.bottom + uy }
}
