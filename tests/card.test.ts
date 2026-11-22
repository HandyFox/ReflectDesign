// Greeting card imposition: fold the printed sheet in 3D, step by step as the
// printed instructions say, and check that every card page ends up where it
// belongs, facing the right way and the right way up.

import { describe, expect, it } from 'vitest'
import { CARD_PRESETS, FOLD_KINDS, cardPlan, cardsOf, isTopFold, sheetFor, type CardPlan, type FoldKind } from '@core/model/card'

type V = [number, number, number]

/** One printed panel as a physical piece of the sheet. */
interface Piece {
  slot: number
  /** Centre of the panel. */
  p: V
  /** Direction of the printed content's "up", and the way the printed face points. */
  up: V
  normal: V
}

/** Lay the plan's panels onto a flat sheet (printed side towards the viewer, +z). */
function layOut(plan: CardPlan, fold: FoldKind, pw: number, ph: number): Piece[] {
  const pieces: Piece[] = []
  plan.sides.forEach((side, sideIndex) => {
    for (const pl of side.panels) {
      const cx = pl.x + pw / 2, cy = pl.y + ph / 2
      const upright: V = pl.rotate === 180 ? [0, 1, 0] : [0, -1, 0]
      if (sideIndex === 0) {
        pieces.push({ slot: pl.slot, p: [cx, cy, 0], up: upright, normal: [0, 0, 1] })
      } else if (!isTopFold(fold)) {
        // Second side, two-sided "flip on short edge" of a landscape sheet: the
        // sheet turns over around a vertical axis.
        pieces.push({ slot: pl.slot, p: [plan.width - cx, cy, 0], up: [-upright[0], upright[1], 0], normal: [0, 0, -1] })
      } else {
        // Portrait sheet, flip on short edge: turns over around a horizontal axis.
        pieces.push({ slot: pl.slot, p: [cx, plan.height - cy, 0], up: [upright[0], -upright[1], 0], normal: [0, 0, -1] })
      }
    }
  })
  return pieces
}

/**
 * Fold along a line: pieces on the moving side swing 180° around it, either
 * behind the rest ("back") or over the top ("front").
 */
function fold(pieces: Piece[], o: 'h' | 'v', pos: number, moving: 'before' | 'after', dir: 'back' | 'front'): void {
  const zs = pieces.map((q) => q.p[2])
  const axisZ = dir === 'back' ? Math.min(...zs) - 0.5 : Math.max(...zs) + 0.5
  for (const q of pieces) {
    const c = o === 'h' ? q.p[1] : q.p[0]
    const moves = moving === 'before' ? c < pos : c > pos
    if (!moves) continue
    if (o === 'h') {
      q.p = [q.p[0], 2 * pos - q.p[1], 2 * axisZ - q.p[2]]
      q.up = [q.up[0], -q.up[1], -q.up[2]]
      q.normal = [q.normal[0], -q.normal[1], -q.normal[2]]
    } else {
      q.p = [2 * pos - q.p[0], q.p[1], 2 * axisZ - q.p[2]]
      q.up = [-q.up[0], q.up[1], -q.up[2]]
      q.normal = [-q.normal[0], q.normal[1], -q.normal[2]]
    }
  }
}

/** The physical folds, exactly as the plan's steps describe them. */
const FOLDS: Record<FoldKind, Array<{ moving: 'before' | 'after'; dir: 'back' | 'front' }>> = {
  quarterSide: [{ moving: 'before', dir: 'back' }, { moving: 'before', dir: 'front' }], // top half back; left half over right
  quarterTop: [{ moving: 'after', dir: 'back' }, { moving: 'before', dir: 'front' }], // right half back; top half down over bottom
  halfSide: [{ moving: 'before', dir: 'back' }], // left half (back of card) behind the front
  halfTop: [{ moving: 'before', dir: 'back' }] // top half (back of card) behind the front
}

const near = (a: V, b: V) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9)
const bySlot = (pieces: Piece[], slot: number) => pieces.find((q) => q.slot === slot)!
const clone = (pieces: Piece[]) => pieces.map((q) => ({ ...q, p: [...q.p] as V, up: [...q.up] as V, normal: [...q.normal] as V }))

describe('greeting card imposition', () => {
  for (const kind of FOLD_KINDS) {
    it(`${kind}: every page ends up in the right place, the right way up`, () => {
      const pw = isTopFold(kind) ? 396 : 306, ph = isTopFold(kind) ? 306 : 396
      const plan = cardPlan(kind, pw, ph)
      const pieces = layOut(plan, kind, pw, ph)
      expect(pieces.map((q) => q.slot).sort()).toEqual([0, 1, 2, 3])

      // Fold all but the last fold: this is the card opened up.
      const steps = FOLDS[kind]
      plan.folds.slice(0, -1).forEach((f, i) => fold(pieces, f.orientation, f.pos, steps[i].moving, steps[i].dir))
      const opened = clone(pieces)
      const last = plan.folds.at(-1)!
      fold(pieces, last.orientation, last.pos, steps.at(-1)!.moving, steps.at(-1)!.dir)

      // Closed card, seen from the front: the front page is on top, facing out, upright.
      const front = bySlot(pieces, 0)
      expect(near(front.normal, [0, 0, 1])).toBe(true)
      expect(near(front.up, [0, -1, 0])).toBe(true)
      expect(front.p[2]).toBe(Math.max(...pieces.map((q) => q.p[2])))

      // Turned over (around a vertical axis): the back page is outermost, upright.
      const back = bySlot(pieces, 3)
      expect(near(back.normal, [0, 0, -1])).toBe(true)
      expect(near([-back.up[0], back.up[1], -back.up[2]], [0, -1, 0])).toBe(true)
      expect(back.p[2]).toBe(Math.min(...pieces.map((q) => q.p[2])))

      // Opened: the inside pages face the reader, upright, in reading order.
      let view = opened
      if (plan.folds.length === 1) {
        // Half-fold: opening the card is turning the flat sheet over.
        view = opened.map((q) => isTopFold(kind)
          ? { ...q, p: [q.p[0], -q.p[1], -q.p[2]] as V, up: [q.up[0], -q.up[1], -q.up[2]] as V, normal: [q.normal[0], -q.normal[1], -q.normal[2]] as V }
          : { ...q, p: [-q.p[0], q.p[1], -q.p[2]] as V, up: [-q.up[0], q.up[1], -q.up[2]] as V, normal: [-q.normal[0], q.normal[1], -q.normal[2]] as V })
      }
      const in1 = bySlot(view, 1), in2 = bySlot(view, 2)
      for (const q of [in1, in2]) {
        expect(near(q.normal, [0, 0, 1])).toBe(true)
        expect(near(q.up, [0, -1, 0])).toBe(true)
      }
      if (isTopFold(kind)) expect(in1.p[1]).toBeLessThan(in2.p[1]) // Inside Top above Inside Bottom
      else expect(in1.p[0]).toBeLessThan(in2.p[0]) // Inside Left before Inside Right
    })
  }

  it('quarter-fold cards fill the sheet exactly; trimmed cards fit on it', () => {
    for (const p of CARD_PRESETS) {
      const plan = cardPlan(p.fold, p.width, p.height)
      const sheet = sheetFor(plan, p.sheet)
      expect(plan.width).toBeLessThanOrEqual(sheet.width + 0.6)
      expect(plan.height).toBeLessThanOrEqual(sheet.height + 0.6)
      if (p.id === 'quarter-letter' || p.id === 'half-letter') {
        expect(plan.width).toBeCloseTo(sheet.width, 1)
        expect(plan.height).toBeCloseTo(sheet.height, 1)
      }
    }
  })

  it('pages are grouped into cards of four', () => {
    expect(cardsOf(4)).toEqual([[0, 1, 2, 3]])
    expect(cardsOf(6)).toEqual([[0, 1, 2, 3], [4, 5, null, null]])
    expect(cardsOf(1)).toEqual([[0, null, null, null]])
  })
})

import { applyCardLayout, makeCardDocument, removeCardLayout, renameCardPages } from '@core/model/card'
import { migrate } from '@core/io/migrate'
import { cardSheets } from '@core/render/svg'
import { STARTER_TEMPLATES } from '@core/templates/starters'
import { makeDocument, makePage } from '@core/model/factory'

describe('card publications', () => {
  it('a new card has four named pages and card margins', () => {
    const doc = makeCardDocument(CARD_PRESETS[0])
    expect(doc.pages.map((p) => p.name)).toEqual(['Front', 'Inside Left', 'Inside Right', 'Back'])
    expect(doc.pageSetup.card).toEqual({ fold: 'quarterSide', sheetWidth: 612, sheetHeight: 792 })
    expect(doc.pageSetup.width).toBe(306)
  })

  it("turning a publication into a card adds pages and keeps the person's own page names", () => {
    const doc = makeDocument()
    doc.pages[0].name = 'My cover'
    doc.pages.push(makePage('Page 2'))
    applyCardLayout(doc, 'halfTop', 612, 396, { width: 612, height: 792 })
    expect(doc.pages.map((p) => p.name)).toEqual(['My cover', 'Inside Top', 'Inside Bottom', 'Back'])
    removeCardLayout(doc)
    expect(doc.pageSetup.card).toBeUndefined()
    expect(doc.pages.map((p) => p.name)).toEqual(['My cover', '', '', ''])
  })

  it('page names follow their position, and extra pages make a second card', () => {
    const doc = makeCardDocument(CARD_PRESETS[0])
    doc.pages.splice(1, 0, doc.pages.splice(3, 1)[0]) // move Back to second place
    doc.pages.push(makePage(), makePage())
    renameCardPages(doc)
    expect(doc.pages.map((p) => p.name)).toEqual(['Front', 'Inside Left', 'Inside Right', 'Back', 'Front (card 2)', 'Inside Left (card 2)'])
  })

  it('the card setup survives saving and a damaged one is dropped', () => {
    const doc = makeCardDocument(CARD_PRESETS[2])
    expect(migrate(JSON.parse(JSON.stringify(doc))).pageSetup.card).toEqual(doc.pageSetup.card)
    const bad = JSON.parse(JSON.stringify(doc))
    bad.pageSetup.card = { fold: 'trifold', sheetWidth: 612, sheetHeight: 792 }
    expect(migrate(bad).pageSetup.card).toBeUndefined()
  })

  it('print sheets: one side for quarter-fold, two for half-fold; upside-down panels rotated; marks only with room', () => {
    const page = { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1pt" height="1pt" viewBox="0 0 10 10"><rect/></svg>', width: 306, height: 396 }
    const quarter = cardSheets([page, page, page, page], cardPlan('quarterSide', 306, 396), 306, 396, { paperWidth: 612, paperHeight: 792, insideUpsideDown: false, marks: true })
    expect(quarter).toHaveLength(1)
    expect((quarter[0].svg.match(/rotate\(180/g) ?? []).length).toBe(2)
    expect(quarter[0].svg).not.toContain('<line') // fills the sheet: no room for marks
    const p57 = { ...page, width: 360, height: 504 }
    const half = cardSheets([p57, p57, null, p57], cardPlan('halfSide', 360, 504), 360, 504, { paperWidth: 792, paperHeight: 612, insideUpsideDown: true, marks: true })
    expect(half).toHaveLength(2)
    expect(half[0].svg).toContain('<line') // trim marks around the 10 × 7" spread
    expect(half[0].svg).toContain('stroke-dasharray') // fold mark
    expect(half[1].svg).toContain('rotate(180 396 306)') // inside turned around
    expect((half[1].svg.match(/<svg x=|<svg overflow/g) ?? []).length).toBe(1) // missing page left blank
  })

  it('the card templates build complete cards', () => {
    for (const t of STARTER_TEMPLATES.filter((x) => x.category === 'Greeting Cards')) {
      const doc = t.build()
      expect(doc.pageSetup.card).toBeDefined()
      expect(doc.pages).toHaveLength(4)
      expect(doc.pages[0].objects.length).toBeGreaterThan(0)
      // Every text box's story exists, and nothing sits off the card.
      for (const p of doc.pages) for (const o of p.objects) {
        if (o.type === 'text') expect(doc.stories[o.storyId]).toBeDefined()
        expect(o.x).toBeGreaterThanOrEqual(-1)
        expect(o.y).toBeGreaterThanOrEqual(-1)
        expect(o.x + o.width).toBeLessThanOrEqual(doc.pageSetup.width + 1)
        expect(o.y + o.height).toBeLessThanOrEqual(doc.pageSetup.height + 1)
      }
    }
  })
})
