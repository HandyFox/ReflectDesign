// Greeting cards: folded card layouts, standard card sizes, and how the four
// card pages are arranged on the printer sheet so the card reads correctly
// once it is folded (imposition).
//
// A card is four pages, always in this order:
//   0 Front · 1 Inside Left (or Inside Top) · 2 Inside Right (or Inside Bottom) · 3 Back
// More pages make more cards (pages 5–8 are a second card, and so on).
//
// Layouts (like Publisher's folded-card page setups):
// - Quarter-fold: all four panels on ONE side of one sheet. Fold the sheet in
//   half, then in half again. Works with any printer.
// - Half-fold: the outside (back + front) on one side of the sheet and the
//   inside on the other. Fold once. Needs two-sided printing (or feeding the
//   sheet through twice).
// Each comes as a side fold (opens like a book) or a top fold (opens upward).
//
// The arrangement was worked out by folding the sheet in 3D; the test in
// tests/card.test.ts folds it again and checks every panel ends up in the
// right place, facing the right way and the right way up.

import type { RDocument } from './types'
import { PT_PER } from './units'
import { makeDocument, makePage } from './factory'

export type FoldKind = 'quarterSide' | 'quarterTop' | 'halfSide' | 'halfTop'

export const FOLD_KINDS: FoldKind[] = ['quarterSide', 'quarterTop', 'halfSide', 'halfTop']

/** Stored in the document's page setup when the publication is a folded card. */
export interface CardSetup {
  fold: FoldKind
  /** The sheet of paper the card is printed on, in points (portrait: width ≤ height). */
  sheetWidth: number
  sheetHeight: number
}

export const LETTER = { width: 612, height: 792, name: 'Letter' }
export const A4 = { width: 595.28, height: 841.89, name: 'A4' }

export const FOLD_NAMES: Record<FoldKind, string> = {
  quarterSide: 'Quarter-fold card, side fold',
  quarterTop: 'Quarter-fold card, top fold',
  halfSide: 'Half-fold card, side fold',
  halfTop: 'Half-fold card, top fold'
}

export const isTopFold = (f: FoldKind) => f === 'quarterTop' || f === 'halfTop'
export const isQuarterFold = (f: FoldKind) => f === 'quarterSide' || f === 'quarterTop'

/** Names of the four card pages. */
export function cardPageNames(fold: FoldKind): [string, string, string, string] {
  return isTopFold(fold)
    ? ['Front', 'Inside Top', 'Inside Bottom', 'Back']
    : ['Front', 'Inside Left', 'Inside Right', 'Back']
}

export interface CardPreset {
  id: string
  name: string
  /** One line for menus and the New screen. */
  description: string
  fold: FoldKind
  /** Card (folded) size in points. */
  width: number
  height: number
  sheet: { width: number; height: number; name: string }
}

const inch = (w: number, h: number) => ({ width: w * 72, height: h * 72 })
const mm = (w: number, h: number) => ({ width: w * PT_PER.mm, height: h * PT_PER.mm })

/** Standard greeting card sizes. */
export const CARD_PRESETS: CardPreset[] = [
  { id: 'quarter-letter', name: 'Quarter-fold 4.25 × 5.5"', description: 'One Letter sheet, printed on one side, folded twice', fold: 'quarterSide', ...inch(4.25, 5.5), sheet: LETTER },
  { id: 'quarter-letter-top', name: 'Quarter-fold 5.5 × 4.25" (top fold)', description: 'One Letter sheet, printed on one side, opens upward', fold: 'quarterTop', ...inch(5.5, 4.25), sheet: LETTER },
  { id: 'half-letter', name: 'Half-fold 5.5 × 8.5"', description: 'Letter sheet printed on both sides, folded once', fold: 'halfSide', ...inch(5.5, 8.5), sheet: LETTER },
  { id: 'half-letter-top', name: 'Half-fold 8.5 × 5.5" (top fold)', description: 'Letter sheet printed on both sides, opens upward', fold: 'halfTop', ...inch(8.5, 5.5), sheet: LETTER },
  { id: 'card-5x7', name: '5 × 7" card', description: 'Half-fold on Letter paper, trim to size (fits a 5¼ × 7¼" envelope)', fold: 'halfSide', ...inch(5, 7), sheet: LETTER },
  { id: 'card-4.5x6.25', name: '4.5 × 6.25" card', description: 'Half-fold on Letter paper, trim to size (fits a 4¾ × 6½" envelope)', fold: 'halfSide', ...inch(4.5, 6.25), sheet: LETTER },
  { id: 'quarter-a4', name: 'Quarter-fold A6 (105 × 148 mm)', description: 'One A4 sheet, printed on one side, folded twice', fold: 'quarterSide', ...mm(105, 148.5), sheet: A4 },
  { id: 'half-a4', name: 'Half-fold A5 (148 × 210 mm)', description: 'A4 sheet printed on both sides, folded once', fold: 'halfSide', ...mm(148.5, 210), sheet: A4 },
  { id: 'half-a6', name: 'Half-fold A6 (105 × 148 mm)', description: 'Half-fold on A4 paper, trim to size (fits a C6 envelope)', fold: 'halfSide', ...mm(105, 148), sheet: A4 }
]

export function cardPresetFor(doc: RDocument): CardPreset | undefined {
  const c = doc.pageSetup.card
  if (!c) return undefined
  const { width, height } = doc.pageSetup
  return CARD_PRESETS.find((p) => p.fold === c.fold && Math.abs(p.width - width) < 0.5 && Math.abs(p.height - height) < 0.5)
}

// ---------- imposition ----------

/** Card page slots: which of the four card pages goes in a panel. */
export type CardSlot = 0 | 1 | 2 | 3

export interface PanelPlacement {
  slot: CardSlot
  /** Position of the panel in the spread (points). */
  x: number
  y: number
  /** Printed upside down (rotated 180°) so it reads correctly after folding. */
  rotate: 0 | 180
}

export interface SpreadSide {
  /** "Outside", "Inside" or "Printed side". */
  name: string
  panels: PanelPlacement[]
}

export interface CardPlan {
  /** Size of the unfolded card (the area printed on the sheet). */
  width: number
  height: number
  sides: SpreadSide[]
  /** Fold lines in spread coordinates, in folding order. */
  folds: Array<{ orientation: 'h' | 'v'; pos: number }>
  /** How to fold, step by step. */
  steps: string[]
  /** Needs both sides of the sheet printed. */
  twoSided: boolean
}

/** Where each card page goes on the sheet for a fold and card size. */
export function cardPlan(fold: FoldKind, pw: number, ph: number): CardPlan {
  switch (fold) {
    case 'quarterSide':
      return {
        width: pw * 2, height: ph * 2, twoSided: false,
        sides: [{ name: 'Printed side', panels: [
          { slot: 0, x: 0, y: 0, rotate: 180 },
          { slot: 3, x: pw, y: 0, rotate: 180 },
          { slot: 1, x: 0, y: ph, rotate: 0 },
          { slot: 2, x: pw, y: ph, rotate: 0 }
        ] }],
        folds: [{ orientation: 'h', pos: ph }, { orientation: 'v', pos: pw }],
        steps: [
          'Hold the sheet printed side up, with the upside-down half at the top.',
          'Fold the top half down behind the bottom half, so the printing stays on the outside.',
          'Fold the left half over onto the right half. The front of the card is now on top.'
        ]
      }
    case 'quarterTop':
      return {
        width: pw * 2, height: ph * 2, twoSided: false,
        sides: [{ name: 'Printed side', panels: [
          { slot: 1, x: 0, y: 0, rotate: 0 },
          { slot: 2, x: 0, y: ph, rotate: 0 },
          { slot: 0, x: pw, y: 0, rotate: 180 },
          { slot: 3, x: pw, y: ph, rotate: 0 }
        ] }],
        folds: [{ orientation: 'v', pos: pw }, { orientation: 'h', pos: ph }],
        steps: [
          'Hold the sheet printed side up, with the inside of the card on the left.',
          'Fold the right half back behind the left half, so the printing stays on the outside.',
          'Fold the top half down over the bottom half. The front of the card is now on top.'
        ]
      }
    case 'halfSide':
      return {
        width: pw * 2, height: ph, twoSided: true,
        sides: [
          { name: 'Outside', panels: [{ slot: 3, x: 0, y: 0, rotate: 0 }, { slot: 0, x: pw, y: 0, rotate: 0 }] },
          { name: 'Inside', panels: [{ slot: 1, x: 0, y: 0, rotate: 0 }, { slot: 2, x: pw, y: 0, rotate: 0 }] }
        ],
        folds: [{ orientation: 'v', pos: pw }],
        steps: [
          'Print both sides (two-sided printing, "flip on short edge").',
          'Hold the sheet with the front of the card facing you, then fold the left half back behind it.'
        ]
      }
    case 'halfTop':
      return {
        width: pw, height: ph * 2, twoSided: true,
        sides: [
          { name: 'Outside', panels: [{ slot: 3, x: 0, y: 0, rotate: 180 }, { slot: 0, x: 0, y: ph, rotate: 0 }] },
          { name: 'Inside', panels: [{ slot: 1, x: 0, y: 0, rotate: 0 }, { slot: 2, x: 0, y: ph, rotate: 0 }] }
        ],
        folds: [{ orientation: 'h', pos: ph }],
        steps: [
          'Print both sides (two-sided printing, "flip on short edge").',
          'Hold the sheet with the front of the card facing you, then fold the top half back behind it.'
        ]
      }
  }
}

/** Paper orientation that fits the unfolded card best. */
export function sheetFor(plan: CardPlan, paper: { width: number; height: number }): { width: number; height: number } {
  const short = Math.min(paper.width, paper.height), long = Math.max(paper.width, paper.height)
  return plan.width > plan.height ? { width: long, height: short } : { width: short, height: long }
}

/** The page indexes that make up each card (sets of four; missing pages are null). */
export function cardsOf(pageCount: number): Array<Array<number | null>> {
  const cards: Array<Array<number | null>> = []
  for (let i = 0; i < Math.max(1, pageCount); i += 4) {
    cards.push([0, 1, 2, 3].map((k) => (i + k < pageCount ? i + k : null)))
  }
  return cards
}

// ---------- setting a publication up as a card ----------

/** Margin guides for cards: ¼" keeps text clear of the fold and the printer's edge. */
export const CARD_MARGIN = 18

const ALL_CARD_NAMES = new Set(['Front', 'Inside Left', 'Inside Right', 'Inside Top', 'Inside Bottom', 'Back'])
const isDefaultName = (name: string) => !name.trim() || /^Page \d+$/i.test(name.trim()) || ALL_CARD_NAMES.has(name.trim())

/**
 * Make a publication a folded card (or change its fold): set the card size,
 * make sure it has the four card pages, and name them Front, Inside…, Back.
 * Pages the person has named themselves keep their names.
 */
export function applyCardLayout(doc: RDocument, fold: FoldKind, width: number, height: number,
  sheet: { width: number; height: number }): void {
  doc.pageSetup.width = width
  doc.pageSetup.height = height
  doc.pageSetup.card = {
    fold,
    sheetWidth: Math.min(sheet.width, sheet.height),
    sheetHeight: Math.max(sheet.width, sheet.height)
  }
  while (doc.pages.length < 4) doc.pages.push(makePage())
  renameCardPages(doc)
}

/** Give card pages their names (Front, Inside Left, …) unless the person renamed them. */
export function renameCardPages(doc: RDocument): void {
  const card = doc.pageSetup.card
  if (!card) return
  const names = cardPageNames(card.fold)
  doc.pages.forEach((p, i) => {
    if (!isDefaultName(p.name)) return
    const name = names[i % 4]
    const set = Math.floor(i / 4)
    p.name = set > 0 ? `${name} (card ${set + 1})` : name
  })
}

/** Turn a card back into ordinary pages. Card page names are cleared. */
export function removeCardLayout(doc: RDocument): void {
  if (!doc.pageSetup.card) return
  delete doc.pageSetup.card
  for (const p of doc.pages) if (ALL_CARD_NAMES.has(p.name.replace(/ \(card \d+\)$/, ''))) p.name = ''
}

/** A new, blank card publication. */
export function makeCardDocument(preset: CardPreset): RDocument {
  const doc = makeDocument(preset.width, preset.height)
  doc.pageSetup.margins = { top: CARD_MARGIN, right: CARD_MARGIN, bottom: CARD_MARGIN, left: CARD_MARGIN }
  applyCardLayout(doc, preset.fold, preset.width, preset.height, preset.sheet)
  return doc
}

/** The same card turned on its side: side fold ⇄ top fold. */
export function rotatedFold(fold: FoldKind): FoldKind {
  return ({ quarterSide: 'quarterTop', quarterTop: 'quarterSide', halfSide: 'halfTop', halfTop: 'halfSide' } as const)[fold]
}
