import type { RDocument } from '../model/types'
import { DOC_VERSION } from '../model/types'
import { makeDocument } from '../model/factory'
import { FOLD_KINDS } from '../model/card'
import { cleanEvent, EVENT_KINDS } from '../calendar/dates'
import { CALENDAR_THEMES } from '../calendar/themes'
import type { CalendarObject, SceneObject } from '../model/types'

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
  // Calendar dates: keep the ones that make sense.
  if (doc.calendarData !== undefined) {
    const events = Array.isArray((doc.calendarData as any)?.events) ? (doc.calendarData as any).events : []
    doc.calendarData = { events: events.map(cleanEvent).filter((e: unknown) => e !== null) }
  }
  // Calendar objects: fill in anything missing.
  const walk = (list: SceneObject[]) => list.forEach((o) => {
    if (o.type === 'calendar') fixCalendar(o)
    else if (o.type === 'group') walk(o.children)
  })
  for (const p of [...doc.pages, ...doc.masters]) walk(p.objects)
  walk(doc.scratch)
  doc.version = DOC_VERSION
  return doc
}

function fixCalendar(o: CalendarObject): void {
  const now = new Date()
  if (!['month', 'year', 'list'].includes(o.layout)) o.layout = 'month'
  o.year = Number.isInteger(o.year) && o.year >= 1 && o.year <= 9999 ? o.year : now.getFullYear()
  o.month = Number.isInteger(o.month) && o.month >= 1 && o.month <= 12 ? o.month : 1
  o.weekStart = o.weekStart === 1 ? 1 : 0
  o.showTitle = o.showTitle !== false
  o.title = typeof o.title === 'string' ? o.title : ''
  o.showEvents = o.showEvents !== false
  o.eventKinds = Array.isArray(o.eventKinds) ? o.eventKinds.filter((k) => EVENT_KINDS.includes(k)) : []
  o.style = { ...CALENDAR_THEMES[0].style, ...(o.style ?? {}) }
}
