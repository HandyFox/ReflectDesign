// Interim measurer built on the browser's Canvas text. The HarfBuzz shaper
// (milestone M2) implements the same Measurer interface.

import type { CharStyle } from '../model/types'
import type { FontMetrics, Measurer } from './layout'

export function effectiveSize(style: CharStyle, f: number): number {
  const s = style.size * f
  return style.baseline === 'normal' ? s : s * 0.65
}

/**
 * Metric-compatible stand-ins, so designs made with Windows fonts keep their
 * line breaks on Ubuntu (and vice versa).
 */
const FALLBACKS: Record<string, string[]> = {
  calibri: ['Carlito'],
  cambria: ['Caladea'],
  arial: ['Liberation Sans', 'Arimo', 'Helvetica'],
  helvetica: ['Liberation Sans', 'Arial'],
  'times new roman': ['Liberation Serif', 'Tinos', 'Times'],
  'courier new': ['Liberation Mono', 'Cousine', 'Courier'],
  'arial narrow': ['Liberation Sans Narrow'],
  georgia: ['Gelasio'],
  'comic sans ms': ['Comic Neue', 'Comic Relief'],
  impact: ['Anton', 'Oswald'],
  'arial black': ['Archivo Black'],
  verdana: ['DejaVu Sans'],
  carlito: ['Calibri'],
  'liberation sans': ['Arial']
}

export function cssFont(style: CharStyle, f: number): string {
  const size = effectiveSize(style, f)
  const quote = (n: string) => `"${n.replace(/"/g, '')}"`
  const chain = [style.font, ...(FALLBACKS[style.font.toLowerCase()] ?? []), 'Carlito', 'Liberation Sans', 'DejaVu Sans']
  return `${style.italic ? 'italic ' : ''}${style.bold ? '700' : '400'} ${size}px ${chain.map(quote).join(', ')}, sans-serif`
}

export function trackingPx(style: CharStyle, f: number): number {
  return (style.tracking / 1000) * effectiveSize(style, f)
}

/** Configure a context for drawing/measuring a style (without colour). */
export function applyFont(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, style: CharStyle, f: number): void {
  ctx.font = cssFont(style, f)
  const anyCtx = ctx as any
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = `${trackingPx(style, f)}px`
  if ('fontKerning' in anyCtx) anyCtx.fontKerning = style.kerning ? 'normal' : 'none'
  if ('fontVariantCaps' in anyCtx) anyCtx.fontVariantCaps = style.caps === 'smallCaps' ? 'small-caps' : 'normal'
}

export class CanvasMeasurer implements Measurer {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  private widthCache = new Map<string, number>()
  private metricCache = new Map<string, FontMetrics>()

  constructor() {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')
    this.ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  }

  /** Call when fonts finish loading so cached widths are recomputed. */
  reset(): void {
    this.widthCache.clear()
    this.metricCache.clear()
  }

  private key(style: CharStyle, f: number): string {
    return `${style.font}|${style.size * f}|${style.bold}|${style.italic}|${style.caps}|${style.baseline}|${style.tracking}|${style.scale}|${style.kerning}`
  }

  measure(text: string, style: CharStyle, f: number): number {
    if (!text) return 0
    const k = this.key(style, f) + '|' + text
    let w = this.widthCache.get(k)
    if (w === undefined) {
      applyFont(this.ctx, style, f)
      w = this.ctx.measureText(text).width * (style.scale / 100)
      if (this.widthCache.size > 50000) this.widthCache.clear()
      this.widthCache.set(k, w)
    }
    return w
  }

  metrics(style: CharStyle, f: number): FontMetrics {
    const k = this.key(style, f)
    let m = this.metricCache.get(k)
    if (!m) {
      // Line height comes from the full-size font even for super/subscript.
      const base = { ...style, baseline: 'normal' as const }
      applyFont(this.ctx, base, f)
      const tm = this.ctx.measureText('Hg')
      const size = style.size * f
      const ascent = tm.fontBoundingBoxAscent ?? size * 0.8
      const descent = tm.fontBoundingBoxDescent ?? size * 0.2
      m = { ascent, descent }
      this.metricCache.set(k, m)
    }
    return m
  }
}
