// File › Export (PDF, PNG, JPEG) and File › Print.

import { editor as ed } from './editor'
import { boundsOfObjects } from './model/factory'
import type { Page, SceneObject } from './model/types'
import { drawObjects, renderPage, type RenderEnv } from './render/canvas'
import { cardSheets, fitPageToSheet, pageToSvg, posterSheets, sheetsToHtml, type PrintSheet, type SvgEnv } from './render/svg'
import { DEFAULT_POSTER, PAPER_SIZES, lowestPictureDpi, planPoster, type PosterPlan, type PosterSettings } from './poster'
import { formatLength } from './model/units'
import { cardPlan, cardsOf, sheetFor, type CardPlan } from './model/card'
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

/** File › Export › PDF. */
export async function exportPdf(o: SheetOptions): Promise<string | null> {
  const sheets = buildSheets(o)
  if (!sheets.length) return null
  const suffix = o.layout === 'poster' ? ` (${sheets.length} sheets, ${o.paper.name.replace(/ \(.*\)$/, '')})` : o.layout === 'fit' ? ` (${o.paper.name.replace(/ \(.*\)$/, '')})` : ''
  const path = await platform.exportPdf(sheetsToHtml(sheets, fontFaceCss(ed.doc)), `${ed.fileName}${suffix}.pdf`)
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

// ---------- printing and exporting on paper ----------

export interface PaperChoice {
  name: string
  width: number
  height: number
}

/** Paper sizes for printing (all common sizes; see core/poster.ts). */
export const PAPERS: PaperChoice[] = PAPER_SIZES.map((p) => ({ name: p.name, width: p.width, height: p.height }))

/**
 * How pages go onto paper, for both File › Print and File › Export › PDF:
 * - design: one sheet per page, at the design's own size (PDF only);
 * - fit: each page shrunk or enlarged onto one sheet;
 * - poster: each page at the chosen size, split across as many sheets as it
 *   needs, with cut marks, line-up marks, labels and an assembly guide.
 */
export interface SheetOptions {
  pages: 'all' | 'current'
  layout: 'design' | 'fit' | 'poster'
  paper: PaperChoice
  poster: Omit<PosterSettings, 'paper'>
  /** Bleed and crop marks for a commercial printer (design layout only). */
  bleedAndMarks: boolean
}

export function defaultSheetOptions(layout: SheetOptions['layout'] = 'poster'): SheetOptions {
  // Letter in the US, A4 elsewhere (by the units the person uses).
  const metric = ed.unit === 'cm' || ed.unit === 'mm'
  const paper = PAPERS.find((p) => p.name.startsWith(metric ? 'A4' : 'Letter'))!
  return { pages: 'all', layout, paper, poster: { ...DEFAULT_POSTER }, bleedAndMarks: false }
}

export function posterSettings(o: SheetOptions): PosterSettings {
  return { ...o.poster, paper: { width: o.paper.width, height: o.paper.height } }
}

/** How the open publication's pages split into sheets (all pages are the same size). */
export function currentPosterPlan(o: SheetOptions): PosterPlan | null {
  const { width, height } = ed.doc.pageSetup
  return planPoster(width, height, posterSettings(o))
}

/** Paper orientation for "fit on one sheet": as chosen, or the design's own. */
function fitSheet(o: SheetOptions): { w: number; h: number } {
  const short = Math.min(o.paper.width, o.paper.height), long = Math.max(o.paper.width, o.paper.height)
  const { width, height } = ed.doc.pageSetup
  const landscape = o.poster.orientation === 'auto' ? width > height : o.poster.orientation === 'landscape'
  return landscape ? { w: long, h: short } : { w: short, h: long }
}

/** Size of the sheets that will come out, and how many. */
export function sheetSummary(o: SheetOptions): { width: number; height: number; sheets: number; perPage: number; plan: PosterPlan | null } {
  const pages = o.pages === 'all' ? ed.doc.pages.length : 1
  if (o.layout === 'design') return { width: ed.doc.pageSetup.width, height: ed.doc.pageSetup.height, sheets: pages, perPage: 1, plan: null }
  if (o.layout === 'fit') { const f = fitSheet(o); return { width: f.w, height: f.h, sheets: pages, perPage: 1, plan: null } }
  const plan = currentPosterPlan(o)
  if (!plan) return { width: o.paper.width, height: o.paper.height, sheets: 0, perPage: 0, plan: null }
  return { width: plan.sheetWidth, height: plan.sheetHeight, sheets: plan.sheetCount * pages, perPage: plan.sheetCount, plan }
}

export function buildSheets(o: SheetOptions): PrintSheet[] {
  const env = svgEnv()
  const pages = pagesFor(o.pages)
  if (o.layout === 'design') {
    const bleed = o.bleedAndMarks ? ed.doc.pageSetup.bleed : 0
    return pages.map((p) => { const r = pageToSvg(env, p, { bleed, marks: o.bleedAndMarks }); return { svg: r.svg, width: r.width, height: r.height } })
  }
  if (o.layout === 'fit') {
    const { w, h } = fitSheet(o)
    return pages.map((p) => fitPageToSheet(pageToSvg(env, p), w, h, o.poster.margin))
  }
  const s = posterSettings(o)
  const plan = currentPosterPlan(o)
  if (!plan) throw new Error('The paper is too small for these margins. Choose larger paper or smaller margins.')
  const multi = pages.length > 1
  return pages.flatMap((p) => {
    const index = ed.doc.pages.indexOf(p) + 1
    const title = multi || o.pages === 'current' && ed.doc.pages.length > 1 ? `${ed.fileName}, page ${index}` : ed.fileName
    return posterSheets(pageToSvg(env, p), plan, s, { title, fmt: (pt) => formatLength(pt, ed.unit === 'pt' ? 'in' : ed.unit), paperName: o.paper.name.replace(/ \(.*\)$/, '') })
  })
}

export async function printSheets(o: SheetOptions): Promise<boolean> {
  const sheets = buildSheets(o)
  if (!sheets.length) return false
  return platform.printHtml(sheetsToHtml(sheets, fontFaceCss(ed.doc)), sheets[0].width, sheets[0].height)
}

/**
 * The lowest resolution the pictures will print at with these options, in
 * dots per inch (null if there are no pictures). Below about 150 they look soft.
 */
export function pictureDpi(o: SheetOptions): number | null {
  const scale = o.layout === 'poster' ? currentPosterPlan(o)?.scale ?? 1
    : o.layout === 'fit' ? (() => {
      const { w, h } = fitSheet(o)
      const { width, height } = ed.doc.pageSetup
      return Math.min((w - o.poster.margin * 2) / width, (h - o.poster.margin * 2) / height)
    })() : 1
  const pics: Array<{ pixelWidth: number; widthPt: number; cropLeft: number; cropRight: number }> = []
  const walk = (list: SceneObject[]) => list.forEach((obj) => {
    if (obj.type === 'picture' && obj.assetId && ed.doc.assets[obj.assetId]) {
      pics.push({ pixelWidth: ed.doc.assets[obj.assetId].pixelWidth, widthPt: obj.width, cropLeft: obj.crop.left, cropRight: obj.crop.right })
    } else if (obj.type === 'group') walk(obj.children)
  })
  for (const p of pagesFor(o.pages)) walk(p.objects)
  return lowestPictureDpi(pics, scale)
}

// ---------- greeting cards ----------

export interface CardPrintOptions {
  /** Every card, or only the card the current page belongs to. */
  cards: 'all' | 'current'
  /** Paper (either orientation; it is turned to fit the card). */
  paper: { width: number; height: number }
  /** Turn the inside sheet upside down (if a test print came out that way). */
  insideUpsideDown: boolean
  /** Trim and fold marks around the card when the paper is bigger than it. */
  marks: boolean
}

/** The folded-card layout of the open publication, or null if it isn't a card. */
export function currentCardPlan(): CardPlan | null {
  const ps = ed.doc.pageSetup
  return ps.card ? cardPlan(ps.card.fold, ps.width, ps.height) : null
}

/** Default print settings for the open card. */
export function defaultCardOptions(): CardPrintOptions {
  const c = ed.doc.pageSetup.card
  return {
    cards: 'all',
    paper: c ? { width: c.sheetWidth, height: c.sheetHeight } : { width: 612, height: 792 },
    insideUpsideDown: false,
    marks: true
  }
}

/** Paper size and orientation the card prints on, and whether it has to be shrunk. */
export function cardSheetSize(o: CardPrintOptions): { width: number; height: number; shrinks: boolean } {
  const plan = currentCardPlan()
  if (!plan) return { ...o.paper, shrinks: false }
  const s = sheetFor(plan, o.paper)
  return { ...s, shrinks: plan.width > s.width + 0.6 || plan.height > s.height + 0.6 }
}

/** Which cards (sets of four page indexes) the options cover. */
export function cardsToPrint(o: CardPrintOptions): Array<Array<number | null>> {
  const all = cardsOf(ed.doc.pages.length)
  return o.cards === 'all' ? all : [all[Math.floor(ed.pageIndex / 4)]]
}

/** Printer sheets for the card(s), laid out so they read correctly once folded. */
export function buildCardSheets(o: CardPrintOptions): PrintSheet[] {
  const plan = currentCardPlan()
  if (!plan) return []
  const env = svgEnv()
  const { width: pw, height: ph } = ed.doc.pageSetup
  const sheet = cardSheetSize(o)
  return cardsToPrint(o).flatMap((idx) => {
    const pages = idx.map((i) => (i === null ? null : pageToSvg(env, ed.doc.pages[i])))
    return cardSheets(pages, plan, pw, ph, { paperWidth: sheet.width, paperHeight: sheet.height, insideUpsideDown: o.insideUpsideDown, marks: o.marks })
  })
}

export async function printCard(o: CardPrintOptions): Promise<boolean> {
  const sheets = buildCardSheets(o)
  if (!sheets.length) return false
  const { width, height } = cardSheetSize(o)
  return platform.printHtml(sheetsToHtml(sheets, fontFaceCss(ed.doc)), width, height)
}

/** A print-ready PDF of the card: the unfolded sheet(s), ready to print and fold. */
export async function exportCardPdf(o: CardPrintOptions): Promise<string | null> {
  const sheets = buildCardSheets(o)
  if (!sheets.length) return null
  const path = await platform.exportPdf(sheetsToHtml(sheets, fontFaceCss(ed.doc)), `${ed.fileName} (print and fold).pdf`)
  if (path) ed.setStatus(`Saved PDF: ${path}`)
  return path
}
