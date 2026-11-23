// Printing big designs on smaller paper: the sheets must cover the whole
// design and fit back together exactly.

import { describe, expect, it } from 'vitest'
import { DEFAULT_POSTER, MARK_BAND, PAPER_SIZES, lowestPictureDpi, paperById, planPoster, rowLetter, type PosterSettings } from '@core/poster'
import { posterSheets } from '@core/render/svg'

const IN = 72
const letter = paperById('letter')!
const settings = (p: Partial<PosterSettings> = {}): PosterSettings => ({ ...DEFAULT_POSTER, paper: { width: letter.width, height: letter.height }, ...p })
const page = (w: number, h: number) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="red"/></svg>`, width: w, height: h })
const info = { title: 'Test poster', fmt: (pt: number) => `${(pt / 72).toFixed(2)} in`, paperName: 'Letter' }

describe('paper sizes', () => {
  it('has the common sizes, portrait, with correct dimensions', () => {
    const ids = PAPER_SIZES.map((p) => p.id)
    for (const id of ['letter', 'legal', 'tabloid', '12x18', 'super-b', 'a4', 'a3', 'a5', '18x24', '24x36', '36x48']) expect(ids).toContain(id)
    expect([paperById('tabloid')!.width, paperById('tabloid')!.height]).toEqual([11 * IN, 17 * IN])
    expect(paperById('a3')!.width).toBeCloseTo(841.89, 1)
    for (const p of PAPER_SIZES) expect(p.width).toBeLessThanOrEqual(p.height)
  })
})

describe('splitting a design into sheets', () => {
  it('a 24 × 36" poster on Letter: covers everything with as few sheets as possible', () => {
    const plan = planPoster(24 * IN, 36 * IN, settings())!
    expect(plan.scale).toBe(1)
    expect(plan.inset).toBeCloseTo(0.25 * IN + MARK_BAND)
    // Covers the whole poster…
    expect((plan.cols - 1) * plan.stepX + plan.pieceWidth).toBeGreaterThanOrEqual(plan.posterWidth)
    expect((plan.rows - 1) * plan.stepY + plan.pieceHeight).toBeGreaterThanOrEqual(plan.posterHeight)
    // …and one column or row fewer would not.
    expect((plan.cols - 2) * plan.stepX + plan.pieceWidth).toBeLessThan(plan.posterWidth)
    expect((plan.rows - 2) * plan.stepY + plan.pieceHeight).toBeLessThan(plan.posterHeight)
    // Automatic orientation picks the one with fewer sheets.
    const p = planPoster(24 * IN, 36 * IN, settings({ orientation: 'portrait' }))!
    const l = planPoster(24 * IN, 36 * IN, settings({ orientation: 'landscape' }))!
    expect(plan.cols * plan.rows).toBe(Math.min(p.cols * p.rows, l.cols * l.rows))
    expect(plan.sheetCount).toBe(plan.cols * plan.rows + 1) // + guide page
  })

  it('scales to a finished width, height or percentage', () => {
    expect(planPoster(8.5 * IN, 11 * IN, settings({ scale: { mode: 'width', width: 34 * IN } }))!.scale).toBeCloseTo(4)
    const h = planPoster(8.5 * IN, 11 * IN, settings({ scale: { mode: 'height', height: 22 * IN } }))!
    expect([h.posterWidth / IN, h.posterHeight / IN]).toEqual([17, 22])
    expect(planPoster(10 * IN, 10 * IN, settings({ scale: { mode: 'percent', percent: 250 } }))!.posterWidth).toBeCloseTo(25 * IN)
  })

  it('a design that fits needs one sheet, centred, with no marks or guide', () => {
    const plan = planPoster(5 * IN, 7 * IN, settings())!
    expect([plan.cols, plan.rows, plan.sheetCount]).toEqual([1, 1, 1])
    const [sheet] = posterSheets(page(5 * IN, 7 * IN), plan, settings(), info)
    expect(sheet.svg).toContain(`x="${(letter.width - 5 * IN) / 2}"`)
    expect(sheet.svg).not.toContain('<line')
  })

  it('bigger paper means fewer sheets', () => {
    const count = (id: string, margin = 0.25 * IN) => { const p = paperById(id)!; const plan = planPoster(36 * IN, 48 * IN, settings({ paper: p, margin }))!; return plan.cols * plan.rows }
    expect(count('letter')).toBeGreaterThan(count('tabloid'))
    expect(count('tabloid')).toBeGreaterThan(count('24x36'))
    // A design the same size as the paper prints on one sheet, the normal way.
    expect(count('36x48')).toBe(1)
    const letterOnLetter = planPoster(8.5 * IN, 11 * IN, settings())!
    expect([letterOnLetter.cols, letterOnLetter.rows, letterOnLetter.sheetCount]).toEqual([1, 1, 1])
    // A little bigger than the paper is split.
    expect(planPoster(8.5 * IN, 11.5 * IN, settings())!.cols * planPoster(8.5 * IN, 11.5 * IN, settings())!.rows).toBe(2)
  })

  it('returns null when the paper is too small for the margins', () => {
    expect(planPoster(100, 100, settings({ paper: { width: 50, height: 50 } }))).toBeNull()
  })
})

/** The poster area a sheet shows (from its picture area's viewBox). */
function shown(svg: string) {
  const m = svg.match(/<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" viewBox="([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+)" overflow="hidden">/)!
  return { sheetX: +m[1], sheetY: +m[2], w: +m[3], h: +m[4], posterX: +m[5], posterY: +m[6] }
}
/** Line-up triangle tips: [x] of the down-pointing ones (top band), [y] of the right-pointing ones (left band). */
function triangles(svg: string) {
  const polys = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1].split(' ').map((p) => p.split(',').map(Number)))
  return polys
}

describe('the sheets fit back together exactly', () => {
  for (const overlap of [0.5 * IN, 0]) {
    it(`overlap ${overlap / IN}": every neighbour starts exactly at the line-up mark`, () => {
      const s = settings({ overlap, scale: { mode: 'percent', percent: 100 } })
      const plan = planPoster(30 * IN, 30 * IN, s)!
      const sheets = posterSheets(page(30 * IN, 30 * IN), plan, s, info)
      expect(sheets).toHaveLength(plan.cols * plan.rows + 1)
      const tiles = sheets.slice(1)
      expect(sheets[0].svg).toContain('How to put this poster together')
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
        const svg = tiles[r * plan.cols + c].svg
        const a = shown(svg)
        // Each sheet shows its own piece; pieces step by exactly stepX / stepY.
        expect(a.posterX).toBeCloseTo(c * plan.stepX, 3)
        expect(a.posterY).toBeCloseTo(r * plan.stepY, 3)
        expect(svg).toContain(`>${rowLetter(r)}${c + 1}<`)
        if (overlap > 0 && c < plan.cols - 1) {
          // The triangle tips point at where the next sheet's piece begins.
          const right = tiles[r * plan.cols + c + 1].svg
          const tipX = triangles(svg).find((pts) => pts[0][1] === pts[1][1] && pts[2][0] === (pts[0][0] + pts[1][0]) / 2)![2][0]
          expect(a.posterX + (tipX - a.sheetX)).toBeCloseTo(shown(right).posterX, 3)
        }
        if (overlap > 0 && r < plan.rows - 1) {
          const below = tiles[(r + 1) * plan.cols + c].svg
          const tipY = triangles(svg).find((pts) => pts[0][0] === pts[1][0])![2][1]
          expect(a.posterY + (tipY - a.sheetY)).toBeCloseTo(shown(below).posterY, 3)
        }
        if (overlap === 0 && c < plan.cols - 1) {
          // Butt joins: pieces meet edge to edge, and there are no triangles.
          expect(a.posterX + a.w).toBeCloseTo(shown(tiles[r * plan.cols + c + 1].svg).posterX, 3)
          expect(triangles(svg)).toHaveLength(0)
        }
      }
    })
  }

  it('without marks, the picture uses the whole printable area', () => {
    const plan = planPoster(30 * IN, 30 * IN, settings({ marks: false }))!
    expect(plan.inset).toBe(0.25 * IN)
    const sheets = posterSheets(page(30 * IN, 30 * IN), plan, settings({ marks: false, guide: false }), info)
    expect(sheets).toHaveLength(plan.cols * plan.rows)
    expect(sheets[0].svg).not.toContain('<line')
  })

  it('names rows A–Z, then AA', () => {
    expect([rowLetter(0), rowLetter(25), rowLetter(26), rowLetter(27)]).toEqual(['A', 'Z', 'AA', 'AB'])
  })

  it('warns about soft pictures when enlarging', () => {
    // A 1200-pixel-wide photo, 4" wide in the design: 300 dpi; at 400% it is 75 dpi.
    expect(lowestPictureDpi([{ pixelWidth: 1200, widthPt: 4 * IN, cropLeft: 0, cropRight: 0 }], 1)).toBeCloseTo(300)
    expect(lowestPictureDpi([{ pixelWidth: 1200, widthPt: 4 * IN, cropLeft: 0, cropRight: 0 }], 4)).toBeCloseTo(75)
    expect(lowestPictureDpi([], 4)).toBeNull()
  })
})
