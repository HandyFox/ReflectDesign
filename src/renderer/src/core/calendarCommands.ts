// Calendar commands: inserting calendars, changing them, and managing the
// publication's calendar dates (add, edit, load, save, holidays).

import { editor as ed } from './editor'
import type { CalendarObject, CalendarStyle, RDocument, SceneObject } from './model/types'
import { makeCalendar } from './model/factory'
import { HOLIDAY_SETS, MONTHS, mergeEvents, newEventId, type CalendarEvent } from './calendar/dates'
import { freshCopies, loadDatesFile, toCsv, toIcs, toRdcal } from './calendar/files'
import { buildCalendarDocument, type NewCalendarOptions } from './calendar/build'
import { platform } from '../platform'
import { confirmReplace } from './commands'

// ---------- the publication's dates ----------

export function calendarEvents(): CalendarEvent[] {
  return ed.doc.calendarData?.events ?? []
}

/** Change the dates (one undo step). */
export function changeEvents(label: string, fn: (events: CalendarEvent[]) => void, coalesce?: string): void {
  ed.change(label, (doc) => {
    doc.calendarData ??= { events: [] }
    fn(doc.calendarData.events)
  }, coalesce)
}

export function addEvent(ev: Omit<CalendarEvent, 'id'>): CalendarEvent {
  const full = { ...ev, id: newEventId() } as CalendarEvent
  changeEvents('Add Date', (events) => { events.push(full) })
  return full
}

export function updateEvent(id: string, ev: Omit<CalendarEvent, 'id'>): void {
  changeEvents('Edit Date', (events) => {
    const i = events.findIndex((e) => e.id === id)
    if (i >= 0) events[i] = { ...ev, id } as CalendarEvent
  })
}

export function deleteEvents(ids: string[]): void {
  changeEvents(ids.length > 1 ? 'Delete Dates' : 'Delete Date', (events) => {
    for (let i = events.length - 1; i >= 0; i--) if (ids.includes(events[i].id)) events.splice(i, 1)
  })
}

/** Add one of the ready-made holiday lists. Returns how many dates were new. */
export function addHolidaySet(id: string): number {
  const set = HOLIDAY_SETS.find((s) => s.id === id)
  if (!set) return 0
  let added = 0
  changeEvents(`Add ${set.name}`, (events) => { added = mergeEvents(events, set.events()) })
  ed.setStatus(added ? `Added ${added} date${added === 1 ? '' : 's'}: ${set.name}.` : `${set.name} are already in this calendar.`)
  return added
}

export interface LoadResult {
  added: number
  total: number
  notes: string[]
  fileName: string
}

/**
 * Calendar › Load Dates: read a dates file (ours, iCalendar, CSV, or another
 * ReflectDesign calendar) and add its dates, or use them instead of the
 * current ones. Returns null if the person cancelled.
 */
export async function loadDates(mode: 'add' | 'replace'): Promise<LoadResult | null> {
  const f = await platform.openDatesFile()
  if (!f) return null
  const loaded = await loadDatesFile(f.name, f.bytes)
  let added = 0
  changeEvents(mode === 'replace' ? 'Replace Dates' : 'Load Dates', (events) => {
    if (mode === 'replace') events.splice(0, events.length)
    added = mergeEvents(events, freshCopies(loaded.events))
  })
  ed.setStatus(`Loaded ${added} date${added === 1 ? '' : 's'} from ${f.name}.`)
  return { added, total: loaded.events.length, notes: loaded.notes, fileName: f.name }
}

export type DatesFormat = 'rdcal' | 'ics' | 'csv'

export const DATES_FORMATS: Record<DatesFormat, { label: string; filter: string }> = {
  rdcal: { label: 'ReflectDesign dates (.rdcal) — best for next year’s calendar', filter: 'ReflectDesign dates' },
  ics: { label: 'iCalendar (.ics) — for Google Calendar, Outlook or Apple Calendar', filter: 'iCalendar' },
  csv: { label: 'Spreadsheet (.csv) — for Excel, LibreOffice or Google Sheets', filter: 'CSV spreadsheet' }
}

/** Calendar › Save Dates: save the dates to a file to reuse next year or elsewhere. */
export async function saveDates(format: DatesFormat): Promise<string | null> {
  const events = calendarEvents()
  if (!events.length) {
    ed.setStatus('There are no dates to save yet.')
    return null
  }
  const name = `${ed.fileName.replace(/\.(rdx|rdt)$/i, '')} dates`
  const text = format === 'rdcal' ? toRdcal(events, name) : format === 'ics' ? toIcs(events, name) : toCsv(events)
  // A byte-order mark helps Excel open the CSV as UTF-8 (names with accents).
  const bytes = new TextEncoder().encode(format === 'csv' ? '﻿' + text : text)
  const path = await platform.saveExport(bytes, `${name}.${format}`, DATES_FORMATS[format].filter, format)
  if (path) ed.setStatus(`Saved ${events.length} date${events.length === 1 ? '' : 's'}: ${path}`)
  return path
}

// ---------- calendar objects ----------

function walkAll(doc: RDocument, fn: (o: SceneObject) => void): void {
  const walk = (list: SceneObject[]) => list.forEach((o) => { fn(o); if (o.type === 'group') walk(o.children) })
  for (const p of [...doc.pages, ...doc.masters]) walk(p.objects)
}

export function allCalendars(doc: RDocument = ed.doc): CalendarObject[] {
  const out: CalendarObject[] = []
  walkAll(doc, (o) => { if (o.type === 'calendar') out.push(o) })
  return out
}

export function selectedCalendars(): CalendarObject[] {
  const out: CalendarObject[] = []
  const walk = (o: SceneObject) => { if (o.type === 'calendar') out.push(o); else if (o.type === 'group') o.children.forEach(walk) }
  ed.selectedObjects.forEach(walk)
  return out
}

/** Change the selected calendars. `coalesce` merges quick repeated changes into one undo step. */
export function setCalendarProps(label: string, fn: (c: CalendarObject) => void, coalesce?: string): void {
  const ids = selectedCalendars().map((c) => c.id)
  if (!ids.length) return
  ed.change(label, (doc) => {
    walkAll(doc, (o) => { if (o.type === 'calendar' && ids.includes(o.id)) fn(o) })
  }, coalesce)
}

export function setCalendarStyle(label: string, patch: Partial<CalendarStyle>, coalesce?: string): void {
  setCalendarProps(label, (c) => { c.style = { ...c.style, ...patch } }, coalesce)
}

/** Show the next or previous month (or year, for Year and List layouts). */
export function stepCalendar(dir: 1 | -1): void {
  setCalendarProps(dir > 0 ? 'Next Month' : 'Previous Month', (c) => {
    if (c.layout === 'month') {
      const m = c.month - 1 + dir
      c.year += Math.floor(m / 12)
      c.month = ((m % 12) + 12) % 12 + 1
    } else c.year += dir
  })
}

/** Insert › Calendar: a calendar filling the page's margins (or a box the person drew). */
export function insertCalendar(opts: Partial<Pick<CalendarObject, 'layout' | 'year' | 'month' | 'eventKinds' | 'title'>> = {}): CalendarObject {
  const { width, height, margins } = ed.doc.pageSetup
  const box = { x: margins.left, y: margins.top, width: width - margins.left - margins.right, height: height - margins.top - margins.bottom }
  // Reuse the look of a calendar already in the publication.
  const existing = allCalendars()[0]
  const c = makeCalendar(box, { ...opts, ...(existing ? { style: existing.style, weekStart: existing.weekStart } : {}) })
  ed.change('Insert Calendar', () => { ed.page.objects.push(c) })
  ed.select([c.id])
  return c
}

/**
 * Calendar › Change Year: move every calendar in the publication so the first
 * one starts at the given month and year; the rest keep their order. Text
 * boxes named "Calendar Year" (the cover title) and page names follow.
 */
export function changeCalendarDates(year: number, month: number): void {
  const cals = allCalendars()
  if (!cals.length) return
  const index = (c: CalendarObject) => c.year * 12 + (c.month - 1)
  const first = Math.min(...cals.map(index))
  const shift = year * 12 + (month - 1) - first
  if (shift === 0) return
  const oldFirstYear = Math.floor(first / 12)
  ed.change('Change Calendar Dates', (doc) => {
    walkAll(doc, (o) => {
      if (o.type !== 'calendar') return
      const k = index(o) + shift
      o.year = Math.floor(k / 12)
      o.month = (k % 12) + 1
    })
    // Year titles on covers ("2026" → "2027", "2026–2027" → "2027–2028").
    const yearShift = Math.floor((first + shift) / 12) - oldFirstYear
    walkAll(doc, (o) => {
      if (o.type !== 'text' || o.name !== 'Calendar Year') return
      const story = doc.stories[o.storyId]
      for (const p of story?.paragraphs ?? []) for (const r of p.runs) r.text = r.text.replace(/\b(1[89]\d\d|2\d\d\d)\b/g, (y) => String(Number(y) + yearShift))
    })
    // Pages named after their month follow the calendar on them.
    for (const page of doc.pages) {
      const c = page.objects.find((o): o is CalendarObject => o.type === 'calendar' && o.layout === 'month')
      if (c && /^[A-Z][a-z]+ \d{4}$/.test(page.name) && MONTHS.includes(page.name.split(' ')[0])) page.name = `${MONTHS[c.month - 1]} ${c.year}`
    }
  })
  ed.text.invalidate()
  ed.setStatus(`Calendars now start in ${MONTHS[month - 1]} ${year}.`)
}

/** File › New › Calendars: a whole calendar publication. */
export async function newCalendarPublication(o: NewCalendarOptions): Promise<boolean> {
  if (!(await confirmReplace())) return false
  const doc = buildCalendarDocument(o)
  ed.load(doc, new Map(), null, `Calendar ${o.year}`)
  ed.backstage = null
  ed.setStatus(`${doc.pages.length} page${doc.pages.length === 1 ? '' : 's'} created. Double-click a calendar to add birthdays and other dates.`)
  ed.touch()
  return true
}
