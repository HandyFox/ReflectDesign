// Printing big designs on smaller paper ("poster" or "tiled" printing): which
// paper sizes are offered, and how a design is split into sheets that fit
// back together.
//
// Each sheet has three zones, from the paper edge inwards:
//   1. the printer's margin — most printers can't print there;
//   2. a narrow band with the cut marks, line-up marks and the sheet's label
//      (A1, A2, B1…), so they are always printed;
//   3. the picture area: one piece of the design.
// Neighbouring pieces overlap. To join two sheets, trim the left (or top)
// edge of one sheet along its cut marks and lay it over its neighbour, with
// the cut edge on the neighbour's line-up marks. The overlap hides small
// cutting errors. With no overlap, trim both edges and butt them together.

export interface PaperSize {
  id: string
  name: string
  group: 'Home and office printers' | 'Large-format printers and print shops' | 'Poster printers and plotters'
  /** Points (1/72"). Portrait: width ≤ height. */
  width: number
  height: number
}

const IN = 72
const MM = 72 / 25.4

export const PAPER_SIZES: PaperSize[] = [
  { id: 'letter', name: 'Letter (8.5 × 11")', group: 'Home and office printers', width: 8.5 * IN, height: 11 * IN },
  { id: 'legal', name: 'Legal (8.5 × 14")', group: 'Home and office printers', width: 8.5 * IN, height: 14 * IN },
  { id: 'half-letter', name: 'Half Letter (5.5 × 8.5")', group: 'Home and office printers', width: 5.5 * IN, height: 8.5 * IN },
  { id: 'a4', name: 'A4 (210 × 297 mm)', group: 'Home and office printers', width: 210 * MM, height: 297 * MM },
  { id: 'a5', name: 'A5 (148 × 210 mm)', group: 'Home and office printers', width: 148 * MM, height: 210 * MM },
  { id: 'tabloid', name: 'Tabloid / Ledger (11 × 17")', group: 'Large-format printers and print shops', width: 11 * IN, height: 17 * IN },
  { id: '12x18', name: 'Arch B / 12 × 18"', group: 'Large-format printers and print shops', width: 12 * IN, height: 18 * IN },
  { id: 'super-b', name: 'Super B / A3+ (13 × 19")', group: 'Large-format printers and print shops', width: 13 * IN, height: 19 * IN },
  { id: 'a3', name: 'A3 (297 × 420 mm)', group: 'Large-format printers and print shops', width: 297 * MM, height: 420 * MM },
  { id: '18x24', name: 'Arch C / 18 × 24"', group: 'Poster printers and plotters', width: 18 * IN, height: 24 * IN },
  { id: '24x36', name: 'Arch D / 24 × 36"', group: 'Poster printers and plotters', width: 24 * IN, height: 36 * IN },
  { id: '36x48', name: 'Arch E / 36 × 48"', group: 'Poster printers and plotters', width: 36 * IN, height: 48 * IN },
  { id: 'a2', name: 'A2 (420 × 594 mm)', group: 'Poster printers and plotters', width: 420 * MM, height: 594 * MM },
  { id: 'a1', name: 'A1 (594 × 841 mm)', group: 'Poster printers and plotters', width: 594 * MM, height: 841 * MM },
  { id: 'a0', name: 'A0 (841 × 1189 mm)', group: 'Poster printers and plotters', width: 841 * MM, height: 1189 * MM }
]

export const PAPER_GROUPS = ['Home and office printers', 'Large-format printers and print shops', 'Poster printers and plotters'] as const

export function paperById(id: string): PaperSize | undefined {
  return PAPER_SIZES.find((p) => p.id === id)
}

/** How big the design comes out: a percentage, or a finished width or height (the other side follows). */
export type PosterScale =
  | { mode: 'percent'; percent: number }
  | { mode: 'width'; width: number }
  | { mode: 'height'; height: number }

export interface PosterSettings {
  /** Paper in points, either orientation (it is turned as chosen below). */
  paper: { width: number; height: number }
  orientation: 'auto' | 'portrait' | 'landscape'
  scale: PosterScale
  /** How much neighbouring pieces overlap (points). 0 = cut both edges and butt them together. */
  overlap: number
  /** Edge of the paper the printer can't print on (points). */
  margin: number
  /** Cut marks, line-up marks and sheet labels. */
  marks: boolean
  /** A first page showing how the sheets go together. */
  guide: boolean
}

export const DEFAULT_POSTER: Omit<PosterSettings, 'paper'> = {
  orientation: 'auto',
  scale: { mode: 'percent', percent: 100 },
  overlap: 0.5 * IN,
  margin: 0.25 * IN,
  marks: true,
  guide: true
}

/** Width of the band for marks and labels, inside the printable area. */
export const MARK_BAND = 0.3 * IN

export interface PosterPlan {
  /** Design → finished poster scale (1 = actual size). */
  scale: number
  /** Finished size (points). */
  posterWidth: number
  posterHeight: number
  /** Paper as it goes through the printer. */
  sheetWidth: number
  sheetHeight: number
  orientation: 'portrait' | 'landscape'
  cols: number
  rows: number
  /** Picture area on each sheet. */
  pieceWidth: number
  pieceHeight: number
  /** Where the picture area starts on the sheet (printer margin + mark band). */
  inset: number
  /** Distance from one piece to the next (piece size minus the overlap). */
  stepX: number
  stepY: number
  overlap: number
  /** Total sheets, including the guide page. */
  sheetCount: number
}

export function posterScale(designW: number, designH: number, s: PosterScale): number {
  const v = s.mode === 'percent' ? s.percent / 100 : s.mode === 'width' ? s.width / designW : s.height / designH
  return Number.isFinite(v) && v > 0 ? v : 1
}

function planFor(posterW: number, posterH: number, sheetW: number, sheetH: number, s: PosterSettings) {
  // Fits on the paper: one sheet, printed the normal way (a Letter flyer on
  // Letter paper). The design's own margins keep it clear of the printer's edge.
  if (posterW <= sheetW + 0.01 && posterH <= sheetH + 0.01) {
    return { inset: 0, pieceW: sheetW, pieceH: sheetH, overlap: 0, stepX: sheetW, stepY: sheetH, cols: 1, rows: 1 }
  }
  const inset = s.margin + (s.marks ? MARK_BAND : 0)
  const pieceW = sheetW - inset * 2, pieceH = sheetH - inset * 2
  if (pieceW <= 0 || pieceH <= 0) return null
  // The overlap can't be more than a third of a piece.
  const overlap = Math.max(0, Math.min(s.overlap, pieceW / 3, pieceH / 3))
  const stepX = pieceW - overlap, stepY = pieceH - overlap
  const cols = posterW <= pieceW + 0.01 ? 1 : Math.ceil((posterW - overlap - 0.01) / stepX)
  const rows = posterH <= pieceH + 0.01 ? 1 : Math.ceil((posterH - overlap - 0.01) / stepY)
  return { inset, pieceW, pieceH, overlap, stepX, stepY, cols, rows }
}

/** Split a design into sheets of paper. Returns null if the settings can't work (paper too small). */
export function planPoster(designW: number, designH: number, s: PosterSettings): PosterPlan | null {
  const scale = posterScale(designW, designH, s.scale)
  const posterW = designW * scale, posterH = designH * scale
  const short = Math.min(s.paper.width, s.paper.height), long = Math.max(s.paper.width, s.paper.height)
  const options = (['portrait', 'landscape'] as const)
    .filter((o) => s.orientation === 'auto' || s.orientation === o)
    .map((o) => {
      const [w, h] = o === 'portrait' ? [short, long] : [long, short]
      const p = planFor(posterW, posterH, w, h, s)
      return p ? { o, w, h, p } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  if (!options.length) return null
  // Fewest sheets; on a tie, the orientation that matches the design.
  const matches = (o: 'portrait' | 'landscape') => (o === 'landscape') === (posterW > posterH)
  options.sort((a, b) => a.p.cols * a.p.rows - b.p.cols * b.p.rows || Number(matches(b.o)) - Number(matches(a.o)))
  const best = options[0]
  return {
    scale, posterWidth: posterW, posterHeight: posterH,
    sheetWidth: best.w, sheetHeight: best.h, orientation: best.o,
    cols: best.p.cols, rows: best.p.rows,
    pieceWidth: best.p.pieceW, pieceHeight: best.p.pieceH, inset: best.p.inset,
    stepX: best.p.stepX, stepY: best.p.stepY, overlap: best.p.overlap,
    sheetCount: best.p.cols * best.p.rows + (s.guide && best.p.cols * best.p.rows > 1 ? 1 : 0)
  }
}

/** Row letters: A, B, … Z, AA, AB… */
export function rowLetter(r: number): string {
  let s = ''
  let n = r + 1
  while (n > 0) { const k = (n - 1) % 26; s = String.fromCharCode(65 + k) + s; n = Math.floor((n - 1) / 26) }
  return s
}

export function sheetLabel(r: number, c: number): string {
  return `${rowLetter(r)}${c + 1}`
}

/**
 * The part of the finished poster a sheet shows, in poster points.
 * (The last row and column may run past the poster's edge; that part is blank.)
 */
export function pieceArea(plan: PosterPlan, r: number, c: number): { x: number; y: number; width: number; height: number } {
  return { x: c * plan.stepX, y: r * plan.stepY, width: plan.pieceWidth, height: plan.pieceHeight }
}

/** Plain-language assembly steps for the guide page and the screen. */
export function assemblySteps(plan: PosterPlan): string[] {
  if (plan.cols * plan.rows === 1) return []
  const order = `Lay the sheets out in order: row A along the top (A1, A2…), then row B underneath, and so on.`
  if (plan.overlap > 0.5) {
    return [
      order,
      'On every sheet except those in column 1, cut off the left edge along the cut marks. On every sheet except those in row A, cut off the top edge too.',
      'Work along each row: lay A2 over A1 so its cut edge sits on the small black triangles near the right edge of A1. The pictures line up exactly. Tape or glue it from the back, then add A3 the same way, and so on.',
      'Join the rows the same way: lay row B over row A so its cut edge sits on the triangles near the bottom of row A.',
      'Finally, trim the white border around the outside.'
    ]
  }
  return [
    order,
    'Cut each sheet along its cut marks on every side that meets another sheet.',
    'Butt the cut edges together so the pictures meet, and tape them from the back.',
    'Finally, trim the white border around the outside.'
  ]
}

/** Lowest print resolution of the pictures at this scale (dots per inch), or null if there are none. */
export function lowestPictureDpi(pictures: Array<{ pixelWidth: number; widthPt: number; cropLeft: number; cropRight: number }>, scale: number): number | null {
  let lowest: number | null = null
  for (const p of pictures) {
    const visible = p.pixelWidth * Math.max(0.01, 1 - Math.max(0, p.cropLeft) - Math.max(0, p.cropRight))
    const inches = (p.widthPt * scale) / 72
    if (inches <= 0 || p.pixelWidth <= 0) continue
    const dpi = visible / inches
    if (lowest === null || dpi < lowest) lowest = dpi
  }
  return lowest
}
