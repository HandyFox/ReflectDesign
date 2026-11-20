// File › Export (PDF, PNG, JPEG) and File › Print.

import { editor as ed } from './editor'
import { boundsOfObjects } from './model/factory'
import type { Page, SceneObject } from './model/types'
import { drawObjects, renderPage, type RenderEnv } from './render/canvas'
import { fitPageToSheet, pageToSvg, sheetsToHtml, tilePage, type PrintSheet, type SvgEnv } from './render/svg'
import { platform } from '../platform'
import { fontFaceCss } from './fontRegistry'

function svgEnv(): SvgEnv {
  ed.text.sync(ed.version)
  return { doc: ed.doc, assets: ed.assets, text: ed.text }
}

function pagesFor(which: 'all' | 'current'): Page[] {
  return which === 'all' ? ed.doc.pages : [ed.page]
}

// ---------- PDF ----------

export interface PdfOptions {
  pages: 'all' | 'current'
  /** Add bleed and crop marks for a commercial printer. */
  bleedAndMarks: boolean
}

export async function exportPdf(opts: PdfOptions): Promise<string | null> {
  const env = svgEnv()
  const bleed = opts.bleedAndMarks ? ed.doc.pageSetup.bleed : 0
  const sheets: PrintSheet[] = pagesFor(opts.pages).map((p) => {
    const r = pageToSvg(env, p, { bleed, marks: opts.bleedAndMarks })
    return { svg: r.svg, width: r.width, height: r.height }
  })
  const path = await platform.exportPdf(sheetsToHtml(sheets, fontFaceCss(ed.doc)), `${ed.fileName}.pdf`)
  if (path) ed.setStatus(`Saved PDF: ${path}`)
  return path
}

// ---------- images ----------

export interface ImageOptions {
  format: 'png' | 'jpeg'
  dpi: number
  transparent: boolean
  selectionOnly: boolean
}

/** Largest canvas Chromium will reliably allocate. */
const MAX_SIDE = 16384
const MAX_AREA = 200_000_000

export interface ImagePlan {
  width: number
  height: number
  dpi: number
  reduced: boolean
}

export function planImage(opts: ImageOptions): ImagePlan | null {
  const area = exportArea(opts)
  if (!area) return null
  let dpi = opts.dpi
  const px = (v: number, d: number) => Math.max(1, Math.round((v / 72) * d))
  let reduced = false
  while (px(area.width, dpi) > MAX_SIDE || px(area.height, dpi) > MAX_SIDE || px(area.width, dpi) * px(area.height, dpi) > MAX_AREA) {
    dpi = Math.floor(dpi * 0.9)
    reduced = true
    if (dpi < 10) break
  }
  return { width: px(area.width, dpi), height: px(area.height, dpi), dpi, reduced }
}

function exportArea(opts: ImageOptions): { x: number; y: number; width: number; height: number; objects: SceneObject[] | null } | null {
  if (opts.selectionOnly) {
    const objs = ed.selectedObjects
    if (!objs.length) return null
    const b = boundsOfObjects(objs)
    // Leave room for shadows and outlines.
    const pad = 4
    return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2, objects: objs }
  }
  const { width, height } = ed.doc.pageSetup
  return { x: 0, y: 0, width, height, objects: null }
}

export async function renderImage(opts: ImageOptions): Promise<Uint8Array | null> {
  const area = exportArea(opts)
  const plan = planImage(opts)
  if (!area || !plan) return null
  const canvas = document.createElement('canvas')
  canvas.width = plan.width
  canvas.height = plan.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This picture is too large to create. Try a lower resolution.')
  const k = plan.dpi / 72
  const transparent = opts.transparent && opts.format === 'png'
  if (!transparent) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.scale(k, k)
  ctx.translate(-area.x, -area.y)
  ed.text.sync(ed.version)
  const env: RenderEnv = { doc: ed.doc, assets: ed.assets, text: ed.text, pxPerPt: k, forOutput: true }
  if (area.objects) drawObjects(ctx, env, area.objects)
  else renderPage(ctx, env, ed.page, { transparent })
  const mime = opts.format === 'png' ? 'image/png' : 'image/jpeg'
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, mime, 0.92))
  canvas.width = canvas.height = 0
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null
}

export async function exportImage(opts: ImageOptions): Promise<string | null> {
  const bytes = await renderImage(opts)
  if (!bytes) return null
  const ext = opts.format === 'png' ? 'png' : 'jpg'
  const page = ed.doc.pages.length > 1 ? `-page${ed.pageIndex + 1}` : ''
  const name = `${ed.fileName}${opts.selectionOnly ? '-selection' : page}.${ext}`
  const path = await platform.saveExport(bytes, name, opts.format === 'png' ? 'PNG Image' : 'JPEG Image', ext)
  if (path) ed.setStatus(`Saved picture: ${path}`)
  return path
}

// ---------- printing ----------

export interface PaperSize {
  name: string
  width: number
  height: number
}

export const PAPERS: PaperSize[] = [
  { name: 'Letter (8.5 × 11")', width: 612, height: 792 },
  { name: 'Legal (8.5 × 14")', width: 612, height: 1008 },
  { name: 'Tabloid (11 × 17")', width: 792, height: 1224 },
  { name: 'A4', width: 595.28, height: 841.89 },
  { name: 'A3', width: 841.89, height: 1190.55 }
]

export interface PrintOptions {
  pages: 'all' | 'current'
  paper: PaperSize
  orientation: 'portrait' | 'landscape'
  /** actual: print at full size (tiled if larger than the paper); fit: shrink onto one sheet. */
  layout: 'actual' | 'fit'
  overlap: number
  /** Space printers can't print on. */
  margin: number
}

function paperDims(o: PrintOptions) {
  const { width, height } = o.paper
  return o.orientation === 'landscape' ? { w: Math.max(width, height), h: Math.min(width, height) } : { w: Math.min(width, height), h: Math.max(width, height) }
}

/** How many sheets each page takes when tiled. */
export function tileCount(o: PrintOptions): { cols: number; rows: number } {
  const { w, h } = paperDims(o)
  const { width, height } = ed.doc.pageSetup
  if (o.layout === 'fit' || (width <= w - o.margin * 2 && height <= h - o.margin * 2)) return { cols: 1, rows: 1 }
  const stepX = w - o.margin * 2 - o.overlap, stepY = h - o.margin * 2 - o.overlap
  return { cols: Math.max(1, Math.ceil((width - o.overlap) / stepX)), rows: Math.max(1, Math.ceil((height - o.overlap) / stepY)) }
}

export function buildPrintSheets(o: PrintOptions): PrintSheet[] {
  const env = svgEnv()
  const { w, h } = paperDims(o)
  const sheets: PrintSheet[] = []
  pagesFor(o.pages).forEach((p, i) => {
    const page = pageToSvg(env, p)
    const fits = page.width <= w - o.margin * 2 && page.height <= h - o.margin * 2
    if (o.layout === 'fit' || fits) {
      if (fits && o.layout === 'actual') {
        // Centre at actual size.
        sheets.push(fitPageToSheetActual(page, w, h))
      } else sheets.push(fitPageToSheet(page, w, h, o.margin))
    } else {
      const label = `${ed.fileName} page ${o.pages === 'all' ? i + 1 : ed.pageIndex + 1}`
      sheets.push(...tilePage(page, { paperWidth: w, paperHeight: h, margin: o.margin, overlap: o.overlap }, label))
    }
  })
  return sheets
}

function fitPageToSheetActual(page: { svg: string; width: number; height: number }, w: number, h: number): PrintSheet {
  // fitPageToSheet with a margin that makes the scale exactly 1.
  const m = Math.min((w - page.width) / 2, (h - page.height) / 2)
  return fitPageToSheet(page, w, h, Math.max(0, m))
}

export async function printDocument(o: PrintOptions): Promise<boolean> {
  const sheets = buildPrintSheets(o)
  const { w, h } = paperDims(o)
  return platform.printHtml(sheetsToHtml(sheets, fontFaceCss(ed.doc)), w, h)
}
