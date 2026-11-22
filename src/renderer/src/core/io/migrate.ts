import type { RDocument } from '../model/types'
import { DOC_VERSION } from '../model/types'
import { makeDocument } from '../model/factory'
import { FOLD_KINDS } from '../model/card'

/**
 * Bring an older document up to the current format and fill in any fields
 * that are missing, so files keep opening as the app grows.
 */
export function migrate(raw: any): RDocument {
  const base = makeDocument()
  const doc: RDocument = {
    ...base,
    ...raw,
    info: { ...base.info, ...(raw.info ?? {}) },
    pageSetup: { ...base.pageSetup, ...(raw.pageSetup ?? {}) },
    pages: Array.isArray(raw.pages) && raw.pages.length ? raw.pages : base.pages,
    masters: raw.masters ?? [],
    scratch: raw.scratch ?? [],
    stories: raw.stories ?? {},
    assets: raw.assets ?? {},
    styles: raw.styles ?? base.styles,
    recentColors: raw.recentColors ?? []
  }
  for (const p of doc.pages) {
    p.guides ??= []
    p.objects ??= []
    p.background ??= { type: 'none' }
    p.masterId ??= null
  }
  // Greeting card setup: keep it only if it is complete and sensible.
  const card = doc.pageSetup.card as any
  if (card !== undefined) {
    const ok = card && FOLD_KINDS.includes(card.fold) &&
      Number.isFinite(card.sheetWidth) && Number.isFinite(card.sheetHeight) && card.sheetWidth > 0 && card.sheetHeight > 0
    if (ok) doc.pageSetup.card = { fold: card.fold, sheetWidth: Number(card.sheetWidth), sheetHeight: Number(card.sheetHeight) }
    else delete doc.pageSetup.card
  }
  doc.version = DOC_VERSION
  return doc
}
