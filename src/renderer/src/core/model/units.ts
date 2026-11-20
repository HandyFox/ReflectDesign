export type Unit = 'in' | 'cm' | 'mm' | 'pt' | 'pi' | 'px'

export const PT_PER: Record<Unit, number> = {
  in: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pt: 1,
  pi: 12,
  px: 0.75 // 96 px per inch
}

export const UNIT_LABEL: Record<Unit, string> = {
  in: '"',
  cm: ' cm',
  mm: ' mm',
  pt: ' pt',
  pi: ' pi',
  px: ' px'
}

export function toPt(value: number, unit: Unit): number {
  return value * PT_PER[unit]
}

export function fromPt(pt: number, unit: Unit): number {
  return pt / PT_PER[unit]
}

/** Format a length the way Publisher shows it, e.g. 8.5" or 2.54 cm. */
export function formatLength(pt: number, unit: Unit, digits = 2): string {
  const v = fromPt(pt, unit)
  const s = Number(v.toFixed(digits)).toString()
  return s + UNIT_LABEL[unit]
}

/**
 * Parse a length typed by the user. Accepts a bare number (in the default
 * unit) or a number with a unit suffix: 8.5", 8.5 in, 21cm, 12pt, 3pi, 200px.
 */
export function parseLength(text: string, defaultUnit: Unit): number | null {
  const m = text.trim().toLowerCase().match(/^(-?\d*\.?\d+)\s*(in|inch|inches|"|cm|mm|pt|pi|px)?$/)
  if (!m) return null
  const value = parseFloat(m[1])
  if (!Number.isFinite(value)) return null
  let unit: Unit = defaultUnit
  switch (m[2]) {
    case 'in': case 'inch': case 'inches': case '"': unit = 'in'; break
    case 'cm': unit = 'cm'; break
    case 'mm': unit = 'mm'; break
    case 'pt': unit = 'pt'; break
    case 'pi': unit = 'pi'; break
    case 'px': unit = 'px'; break
  }
  return toPt(value, unit)
}

export interface PagePreset {
  name: string
  group: 'Standard' | 'Posters' | 'Banners' | 'Signs & Labels'
  width: number // points
  height: number
}

const inch = (w: number, h: number) => ({ width: w * 72, height: h * 72 })
const mm = (w: number, h: number) => ({ width: w * PT_PER.mm, height: h * PT_PER.mm })

export const PAGE_PRESETS: PagePreset[] = [
  { name: 'Letter (8.5 × 11")', group: 'Standard', ...inch(8.5, 11) },
  { name: 'Legal (8.5 × 14")', group: 'Standard', ...inch(8.5, 14) },
  { name: 'Tabloid (11 × 17")', group: 'Standard', ...inch(11, 17) },
  { name: 'A4 (210 × 297 mm)', group: 'Standard', ...mm(210, 297) },
  { name: 'A3 (297 × 420 mm)', group: 'Standard', ...mm(297, 420) },
  { name: 'Poster 18 × 24"', group: 'Posters', ...inch(18, 24) },
  { name: 'Poster 24 × 36"', group: 'Posters', ...inch(24, 36) },
  { name: 'Poster 27 × 40"', group: 'Posters', ...inch(27, 40) },
  { name: 'Poster 36 × 48"', group: 'Posters', ...inch(36, 48) },
  { name: 'A2 (420 × 594 mm)', group: 'Posters', ...mm(420, 594) },
  { name: 'A1 (594 × 841 mm)', group: 'Posters', ...mm(594, 841) },
  { name: 'Banner 2 × 4 ft', group: 'Banners', ...inch(48, 24) },
  { name: 'Banner 2 × 6 ft', group: 'Banners', ...inch(72, 24) },
  { name: 'Banner 3 × 8 ft', group: 'Banners', ...inch(96, 36) },
  { name: 'Bulletin board 4 × 6 ft', group: 'Banners', ...inch(72, 48) },
  { name: 'Index card (3 × 5")', group: 'Signs & Labels', ...inch(5, 3) },
  { name: 'Half letter (5.5 × 8.5")', group: 'Signs & Labels', ...inch(5.5, 8.5) },
  { name: 'Name tag (4 × 3")', group: 'Signs & Labels', ...inch(4, 3) }
]
