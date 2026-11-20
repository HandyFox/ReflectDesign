import type { RDocument } from '../model/types'
import { DOC_VERSION } from '../model/types'
import { makeDocument } from '../model/factory'

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
  doc.version = DOC_VERSION
  return doc
}
