// Saving and loading calendar dates, so the same birthdays and holidays can go
// into next year's calendar (or come from another app):
//
// - ReflectDesign dates (.rdcal): everything, exactly. Best for year to year.
// - iCalendar (.ics): Google Calendar, Outlook and Apple Calendar import and
//   export this. Birthdays and holidays are saved as yearly repeating events.
// - CSV (.csv): spreadsheets. A simple "Name, Birthday" list works.
// - A ReflectDesign publication (.rdx/.rdt): the dates saved in a calendar.

import { readPackage } from '../io/rdx'
import {
  EVENT_KINDS, KIND_LABELS, MONTHS, WEEKDAYS, cleanEvent, dateIn, daysInMonth, newEventId,
  type CalendarEvent, type DateRule, type EventKind
} from './dates'

export const RDCAL_FORMAT = 'reflectdesign-dates'

export interface LoadedDates {
  events: CalendarEvent[]
  /** Things the person should know (rows skipped, and why). */
  notes: string[]
}

// ---------- .rdcal ----------

export function toRdcal(events: CalendarEvent[], name = 'Calendar dates'): string {
  return JSON.stringify({ format: RDCAL_FORMAT, version: 1, name, saved: new Date().toISOString(), events }, null, 1)
}

function fromRdcal(text: string): LoadedDates {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This dates file is damaged and could not be read.')
  }
  const raw: unknown[] = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : []
  const events = raw.map(cleanEvent).filter((e): e is CalendarEvent => e !== null)
  const notes = raw.length > events.length ? [`${raw.length - events.length} entr${raw.length - events.length === 1 ? 'y was' : 'ies were'} skipped because the date was not complete.`] : []
  return { events, notes }
}

// ---------- iCalendar (.ics) ----------

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const icsDate = (y: number, m: number, d: number) => `${pad(y, 4)}${pad(m)}${pad(d)}`

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** iCalendar lines are at most 75 characters; longer ones continue with a space. */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74) }
  out.push(rest)
  return out.join('\r\n')
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function lastLeapYear(y: number): number {
  while (!((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) y--
  return y
}

export function toIcs(events: CalendarEvent[], name = 'Calendar dates'): string {
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const thisYear = now.getFullYear()
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ReflectDesign//Calendar dates//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(name)}`]
  const vevent = (ev: CalendarEvent, uid: string, y: number, m: number, d: number, rrule?: string, extra: string[] = []) => {
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    lines.push('BEGIN:VEVENT', `UID:${uid}@reflectdesign`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(y, m, d)}`, `DTEND;VALUE=DATE:${icsDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())}`,
      `SUMMARY:${icsText(ev.title)}`, `CATEGORIES:${KIND_LABELS[ev.kind].toUpperCase()}`, `X-REFLECTDESIGN-KIND:${ev.kind}`, 'TRANSP:TRANSPARENT')
    if (rrule) lines.push(`RRULE:${rrule}`)
    if (ev.showAge) lines.push('X-REFLECTDESIGN-SHOWAGE:TRUE')
    lines.push(...extra)
    if (ev.note) lines.push(`DESCRIPTION:${icsText(ev.note)}`)
    lines.push('END:VEVENT')
  }
  for (const ev of events) {
    if (ev.repeat === 'once' && ev.year) {
      vevent(ev, ev.id, ev.year, ev.month, ev.day)
    } else if (ev.rule?.type === 'nthWeekday') {
      const y = ev.year ?? thisYear
      const at = dateIn({ ...ev, repeat: 'yearly' }, y)
      if (at) vevent(ev, ev.id, y, at[0], at[1], `FREQ=YEARLY;BYMONTH=${ev.month};BYDAY=${ev.rule.nth}${BYDAY[ev.rule.weekday]}`, ev.year ? [] : ['X-REFLECTDESIGN-YEAR:NONE'])
    } else if (ev.rule?.type === 'easter') {
      // iCalendar can't say "Easter", so save the next 15 years as separate dates.
      for (let y = thisYear; y < thisYear + 15; y++) {
        const at = dateIn({ ...ev, repeat: 'yearly' }, y)
        if (at) vevent(ev, `${ev.id}-${y}`, y, at[0], at[1], undefined, [`X-REFLECTDESIGN-EASTER:${ev.rule.offset}`])
      }
    } else {
      // Yearly on a fixed date: start in the birth/start year when known.
      // A leap-day date starts in a leap year so the day itself is kept.
      const y = ev.year ?? (ev.month === 2 && ev.day === 29 ? lastLeapYear(thisYear) : thisYear)
      // "Last day of February" shows on the 28th in other years in every calendar app.
      const leapDay = ev.month === 2 && ev.day === 29
      vevent(ev, ev.id, y, ev.month, Math.min(ev.day, daysInMonth(y, ev.month)), leapDay ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'FREQ=YEARLY', ev.year ? [] : ['X-REFLECTDESIGN-YEAR:NONE'])
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
}

function guessKind(title: string, categories: string): EventKind {
  const c = categories.toLowerCase(), t = title.toLowerCase()
  for (const k of EVENT_KINDS) if (c.includes(k)) return k
  if (/birthday|b-?day|\bborn\b/.test(t)) return 'birthday'
  if (/anniversary/.test(t)) return 'anniversary'
  if (/holiday/.test(c)) return 'holiday'
  return 'event'
}

function fromIcs(text: string): LoadedDates {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const events: CalendarEvent[] = []
  const easterSeen = new Set<string>()
  let skippedRepeat = 0, skippedBad = 0
  let cur: Record<string, { params: string; value: string }> | null = null
  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) { cur = {}; continue }
    if (/^END:VEVENT$/i.test(line)) {
      if (cur) {
        const r = icsEvent(cur)
        if (r === 'repeat') skippedRepeat++
        else if (!r) skippedBad++
        else if (r.rule?.type === 'easter') {
          // The 15 dated copies we export come back as one Easter-based date.
          const key = `${r.title}|${r.rule.offset}`
          if (!easterSeen.has(key)) { easterSeen.add(key); events.push(r) }
        } else events.push(r)
      }
      cur = null
      continue
    }
    if (!cur) continue
    const m = line.match(/^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/)
    if (m) cur[m[1].toUpperCase()] = { params: m[2], value: m[3] }
  }
  const notes: string[] = []
  if (skippedRepeat) notes.push(`${skippedRepeat} event${skippedRepeat === 1 ? '' : 's'} that repeat weekly, monthly or daily ${skippedRepeat === 1 ? 'was' : 'were'} skipped (calendars here show dates that happen once or once a year).`)
  if (skippedBad) notes.push(`${skippedBad} event${skippedBad === 1 ? '' : 's'} without a usable date ${skippedBad === 1 ? 'was' : 'were'} skipped.`)
  return { events, notes }
}

function icsEvent(p: Record<string, { params: string; value: string }>): CalendarEvent | null | 'repeat' {
  const title = unescapeIcs(p.SUMMARY?.value ?? '').trim()
  const start = p.DTSTART?.value.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!title || !start) return null
  const y = Number(start[1]), mo = Number(start[2]), d = Number(start[3])
  const kindRaw = p['X-REFLECTDESIGN-KIND']?.value
  const kind: EventKind = EVENT_KINDS.includes(kindRaw as EventKind) ? (kindRaw as EventKind) : guessKind(title, p.CATEGORIES?.value ?? '')
  const note = unescapeIcs(p.DESCRIPTION?.value ?? '').trim() || undefined
  const easterMark = p['X-REFLECTDESIGN-EASTER']?.value.match(/^(-?\d+)$/)
  const showAge = /TRUE/i.test(p['X-REFLECTDESIGN-SHOWAGE']?.value ?? '') || undefined
  if (easterMark) {
    return cleanEvent({ title, kind, month: 3, day: 1, repeat: 'yearly', year: null, rule: { type: 'easter', offset: Number(easterMark[1]) }, note, showAge })
  }
  const rrule = p.RRULE?.value.toUpperCase()
  if (!rrule) return cleanEvent({ title, kind, month: mo, day: d, repeat: 'once', year: y, note, showAge })
  const parts = Object.fromEntries(rrule.split(';').map((kv) => kv.split('=') as [string, string]))
  if (parts.FREQ !== 'YEARLY' || (parts.INTERVAL && parts.INTERVAL !== '1')) return 'repeat'
  let rule: DateRule | undefined
  const byday = parts.BYDAY?.match(/^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/)
  if (byday) {
    const n = byday[1] ? Number(byday[1]) : NaN
    if ([1, 2, 3, 4, 5, -1].includes(n)) rule = { type: 'nthWeekday', nth: n as 1, weekday: BYDAY.indexOf(byday[2]) }
  }
  const month = parts.BYMONTH ? Number(parts.BYMONTH) : mo
  const day = d
  // A birth/start year is kept so ages can be shown, unless the file says
  // there isn't one (ours, or Apple's X-APPLE-OMIT-YEAR / year 1604).
  const noYear = /NONE/i.test(p['X-REFLECTDESIGN-YEAR']?.value ?? '') || /X-APPLE-OMIT-YEAR/i.test(p.DTSTART?.params ?? '') || y === 1604
  const keepYear = (kind === 'birthday' || kind === 'anniversary') && !noYear ? y : null
  return cleanEvent({ title, kind, month, day, repeat: 'yearly', year: keepYear, rule, note, showAge })
}

// ---------- CSV ----------

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** When, in words a person (and the importer) can read: "March 14", "4th Thursday of November". */
function csvDate(ev: CalendarEvent): string {
  if (ev.rule?.type === 'easter') {
    const o = ev.rule.offset
    return o === 0 ? 'Easter' : `${Math.abs(o)} days ${o < 0 ? 'before' : 'after'} Easter`
  }
  if (ev.rule?.type === 'nthWeekday') {
    const nth = ev.rule.nth === -1 ? 'Last' : ['1st', '2nd', '3rd', '4th', '5th'][ev.rule.nth - 1]
    return `${nth} ${WEEKDAYS[ev.rule.weekday]} of ${MONTHS[ev.month - 1]}`
  }
  return `${MONTHS[ev.month - 1]} ${ev.day}`
}

export function toCsv(events: CalendarEvent[]): string {
  const rows = [['Name', 'Date', 'Year', 'Type', 'Repeats', 'Show age', 'Note']]
  for (const ev of events) {
    rows.push([ev.title, csvDate(ev), ev.year ? String(ev.year) : '', KIND_LABELS[ev.kind], ev.repeat === 'once' ? 'Once' : 'Every year', ev.showAge ? 'Yes' : '', ev.note ?? ''])
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Split CSV text into rows (handles quotes, commas and line breaks in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const t = text.replace(/^\uFEFF/, '')
  // Semicolon- or tab-separated files (common outside the US) are read too.
  const firstLine = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';'
    : (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ','
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const MONTH_INDEX = (s: string): number => {
  const k = s.trim().toLowerCase().slice(0, 3)
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(k)) + 1
}

/** Read a date written in many common ways. Month/day order is US (3/14) unless the first number is over 12. */
export function parseDateText(raw: string): { month: number; day: number; year: number | null; rule?: DateRule } | null {
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return null
  let m: RegExpMatchArray | null
  if ((m = s.match(/^easter$/i))) return { month: 3, day: 1, year: null, rule: { type: 'easter', offset: 0 } }
  if ((m = s.match(/^(\d+) days? (before|after) easter$/i))) return { month: 3, day: 1, year: null, rule: { type: 'easter', offset: Number(m[1]) * (m[2].toLowerCase() === 'before' ? -1 : 1) } }
  if ((m = s.match(/^(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last) (\w+?)s? (?:of|in) (\w+)$/i))) {
    const order = ['1st', '2nd', '3rd', '4th', '5th']
    const words = ['first', 'second', 'third', 'fourth', 'fifth']
    const w = m[1].toLowerCase()
    const nth = w === 'last' ? -1 : Math.max(order.indexOf(w), words.indexOf(w)) + 1
    const wd = WEEKDAYS.findIndex((d) => d.toLowerCase().startsWith(m![2].toLowerCase().slice(0, 3)))
    const month = MONTH_INDEX(m[3])
    if (nth !== 0 && wd >= 0 && month >= 1) return { month, day: 1, year: null, rule: { type: 'nthWeekday', nth: nth as 1, weekday: wd } }
    return null
  }
  const ok = (month: number, day: number, year: number | null) =>
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year ?? 2024, month) ? { month, day, year } : null
  const fullYear = (y: string | undefined): number | null => {
    if (!y) return null
    const n = Number(y)
    return y.length <= 2 ? (n + 2000 > new Date().getFullYear() ? n + 1900 : n + 2000) : n
  }
  // 2015-03-14
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ok(Number(m[2]), Number(m[3]), Number(m[1]))
  // 3/14, 3/14/2015, 14.3.2015, 3-14
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) {
    let a = Number(m[1]), b = Number(m[2])
    if (a > 12 && b <= 12) [a, b] = [b, a]
    return ok(a, b, fullYear(m[3]))
  }
  // March 14, Mar 14 2015, March 14th, 2015
  if ((m = s.match(/^([A-Za-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/))) {
    const month = MONTH_INDEX(m[1])
    return month ? ok(month, Number(m[2]), m[3] ? Number(m[3]) : null) : null
  }
  // 14 March, 14 Mar 2015
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+)\.?(?:,? (\d{4}))?$/))) {
    const month = MONTH_INDEX(m[2])
    return month ? ok(month, Number(m[1]), m[3] ? Number(m[3]) : null) : null
  }
  return null
}

function fromCsv(text: string, fileName: string): LoadedDates {
  const rows = parseCsv(text)
  if (!rows.length) return { events: [], notes: ['The file is empty.'] }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const find = (...names: RegExp[]) => head.findIndex((h) => names.some((r) => r.test(h)))
  let col = {
    title: find(/^(name|title|event|student|person|who|holiday|occasion|summary|subject)/),
    date: find(/^(date|birthday|birth ?date|dob|date of birth|when|day|anniversary)/),
    year: find(/^(year|birth ?year|since)$/),
    kind: find(/^(type|kind|category)/),
    repeat: find(/^(repeat|repeats|recurring|every)/),
    age: find(/^(show ?age|age)/),
    note: find(/^(note|notes|description|details)/)
  }
  const hasHeader = col.title >= 0 || col.date >= 0
  if (!hasHeader) col = { title: 0, date: 1, year: -1, kind: -1, repeat: -1, age: -1, note: -1 }
  if (col.title < 0) col.title = col.date === 0 ? 1 : 0
  if (col.date < 0) col.date = col.title === 0 ? 1 : 0
  // A "Birthday" column, or a file called birthdays.csv, means the dates are birthdays.
  const birthdayList = /birth/.test(head[col.date] ?? '') || /birthday/i.test(fileName)
  const events: CalendarEvent[] = []
  const bad: number[] = []
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const cell = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '')
    const title = cell(col.title)
    const when = parseDateText(cell(col.date))
    if (!title || !when) { bad.push(i + (hasHeader ? 2 : 1)); return }
    const kindText = cell(col.kind).toLowerCase()
    const kind: EventKind = EVENT_KINDS.find((k) => kindText.startsWith(k)) ?? (birthdayList ? 'birthday' : guessKind(title, kindText))
    const yearCell = Number(cell(col.year)) || null
    const year = yearCell ?? when.year
    const repeatText = cell(col.repeat).toLowerCase()
    const once = /^(once|no|one)/.test(repeatText) || (!repeatText && kind === 'event' && year !== null && !when.rule)
    const ev = cleanEvent({
      title, kind, month: when.month, day: when.day, rule: when.rule,
      repeat: once ? 'once' : 'yearly', year,
      showAge: /^(y|yes|true|1)$/i.test(cell(col.age)), note: cell(col.note)
    })
    if (ev) events.push(ev)
    else bad.push(i + (hasHeader ? 2 : 1))
  })
  const notes = bad.length ? [`${bad.length} row${bad.length === 1 ? '' : 's'} could not be read (row${bad.length === 1 ? '' : 's'} ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '…' : ''}). Each row needs a name and a date such as 3/14, March 14 or 2015-03-14.`] : []
  return { events, notes }
}

// ---------- loading any of them ----------

/** Read dates from a file the person picked, whatever its format. */
export async function loadDatesFile(name: string, bytes: Uint8Array): Promise<LoadedDates> {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (ext === 'rdx' || ext === 'rdt' || isZip) {
    const { doc } = await readPackage(bytes)
    const events = doc.calendarData?.events ?? []
    return { events, notes: events.length ? [] : ['That publication has no calendar dates saved in it.'] }
  }
  const text = new TextDecoder('utf-8').decode(bytes)
  if (ext === 'ics' || /^\s*BEGIN:VCALENDAR/i.test(text)) return fromIcs(text)
  if (ext === 'rdcal' || ext === 'json' || /^\s*[{[]/.test(text)) return fromRdcal(text)
  return fromCsv(text, name)
}

/** Copies with fresh ids, ready to add to a publication. */
export function freshCopies(events: CalendarEvent[]): CalendarEvent[] {
  return events.map((e) => ({ ...structuredClone(e), id: newEventId() }))
}
