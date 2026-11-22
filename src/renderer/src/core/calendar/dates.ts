// Calendar dates: the list of birthdays, holidays and events a calendar shows,
// and the date maths to place them in any year.
//
// Dates that repeat every year (birthdays, anniversaries, holidays) are stored
// without a year, so the same list works for next year's calendar too. A
// birthday can still keep the birth year, to show "turns 9". Holidays that move
// (Thanksgiving, Mother's Day, Easter) are stored as rules and land on the
// right day in every year.

export type EventKind = 'birthday' | 'anniversary' | 'holiday' | 'event' | 'reminder'

export const EVENT_KINDS: EventKind[] = ['birthday', 'anniversary', 'holiday', 'event', 'reminder']

export const KIND_LABELS: Record<EventKind, string> = {
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  holiday: 'Holiday',
  event: 'Event',
  reminder: 'Reminder'
}

export const KIND_PLURALS: Record<EventKind, string> = {
  birthday: 'Birthdays',
  anniversary: 'Anniversaries',
  holiday: 'Holidays',
  event: 'Events',
  reminder: 'Reminders'
}

/** Default colour for each kind (the dot next to the date's text). */
export const KIND_COLORS: Record<EventKind, string> = {
  birthday: '#C2185B',
  anniversary: '#7B1FA2',
  holiday: '#2E7D32',
  event: '#1565C0',
  reminder: '#E65100'
}

/** A date that moves: "the 4th Thursday of November", or "2 days before Easter". */
export type DateRule =
  | { type: 'nthWeekday'; nth: 1 | 2 | 3 | 4 | 5 | -1; weekday: number }
  | { type: 'easter'; offset: number }

export interface CalendarEvent {
  id: string
  title: string
  kind: EventKind
  /** 1–12. */
  month: number
  /** 1–31 (ignored when there is a rule). */
  day: number
  /**
   * 'yearly' repeats every year (year, if set, is the birth/start year and is
   * used for ages); 'once' happens only in `year`.
   */
  repeat: 'yearly' | 'once'
  year: number | null
  rule?: DateRule
  /** Show "turns 9" / "10 years" when the start year is known. */
  showAge?: boolean
  /** Overrides the kind's colour. */
  color?: string
  note?: string
}

/** The calendar dates stored in a publication. */
export interface CalendarData {
  events: CalendarEvent[]
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

/** Day of the week, 0 = Sunday. */
export function weekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** The nth (1–5, or -1 for last) given weekday of a month; null if there isn't one (5th). */
export function nthWeekday(year: number, month: number, nth: number, wd: number): number | null {
  if (nth === -1) {
    const last = daysInMonth(year, month)
    return last - ((weekday(year, month, last) - wd + 7) % 7)
  }
  const first = 1 + ((wd - weekday(year, month, 1) + 7) % 7)
  const d = first + (nth - 1) * 7
  return d <= daysInMonth(year, month) ? d : null
}

/** Easter Sunday (Western), as [month, day]. Anonymous Gregorian algorithm. */
export function easter(year: number): [number, number] {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return [month, day]
}

/** Where an event falls in a given year, as [month, day], or null if not that year. */
export function dateIn(ev: CalendarEvent, year: number): [number, number] | null {
  if (ev.repeat === 'once' && ev.year !== year) return null
  if (ev.rule?.type === 'easter') {
    const [m, d] = easter(year)
    const t = new Date(Date.UTC(year, m - 1, d + ev.rule.offset))
    return t.getUTCFullYear() === year ? [t.getUTCMonth() + 1, t.getUTCDate()] : null
  }
  if (ev.rule?.type === 'nthWeekday') {
    const d = nthWeekday(year, ev.month, ev.rule.nth, ev.rule.weekday)
    return d === null ? null : [ev.month, d]
  }
  // 29 February birthdays show on the 28th in other years.
  const day = Math.min(ev.day, daysInMonth(year, ev.month))
  return [ev.month, day]
}

/** Text shown on the calendar: the title, plus the age when asked for. */
export function eventLabel(ev: CalendarEvent, year: number): string {
  if (ev.showAge && ev.repeat === 'yearly' && ev.year && year > ev.year) {
    const n = year - ev.year
    if (ev.kind === 'birthday') return `${ev.title} (turns ${n})`
    return `${ev.title} (${n} year${n === 1 ? '' : 's'})`
  }
  return ev.title
}

export interface Occurrence {
  event: CalendarEvent
  day: number
  label: string
  color: string
}

/** Every event in a month, by day, in a steady order (holidays first, then by title). */
export function occurrencesInMonth(events: CalendarEvent[], year: number, month: number, kinds?: EventKind[]): Map<number, Occurrence[]> {
  const out = new Map<number, Occurrence[]>()
  const order: Record<EventKind, number> = { holiday: 0, birthday: 1, anniversary: 2, event: 3, reminder: 4 }
  for (const ev of events) {
    if (kinds && kinds.length && !kinds.includes(ev.kind)) continue
    const at = dateIn(ev, year)
    if (!at || at[0] !== month) continue
    const list = out.get(at[1]) ?? []
    list.push({ event: ev, day: at[1], label: eventLabel(ev, year), color: ev.color || KIND_COLORS[ev.kind] })
    out.set(at[1], list)
  }
  for (const list of out.values()) list.sort((a, b) => order[a.event.kind] - order[b.event.kind] || a.label.localeCompare(b.label))
  return out
}

/** A plain description of when an event happens ("March 14", "4th Thursday of November"). */
export function describeWhen(ev: CalendarEvent): string {
  if (ev.rule?.type === 'easter') {
    const o = ev.rule.offset
    return o === 0 ? 'Easter Sunday' : `${Math.abs(o)} day${Math.abs(o) === 1 ? '' : 's'} ${o < 0 ? 'before' : 'after'} Easter`
  }
  if (ev.rule?.type === 'nthWeekday') {
    const nth = ev.rule.nth === -1 ? 'Last' : ['1st', '2nd', '3rd', '4th', '5th'][ev.rule.nth - 1]
    return `${nth} ${WEEKDAYS[ev.rule.weekday]} of ${MONTHS[ev.month - 1]}`
  }
  const base = `${MONTHS[ev.month - 1]} ${ev.day}`
  if (ev.repeat === 'once') return `${base}, ${ev.year}`
  if (!ev.year) return base
  return ev.kind === 'birthday' ? `${base} (born ${ev.year})` : `${base} (since ${ev.year})`
}

let idCounter = 0
export function newEventId(): string {
  return `ev${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function makeEvent(p: Partial<CalendarEvent> & Pick<CalendarEvent, 'title' | 'month'>): CalendarEvent {
  return { id: newEventId(), kind: 'event', day: 1, repeat: 'yearly', year: null, ...p }
}

/** Key that identifies "the same date" when merging lists, so nothing is added twice. */
function sameKey(ev: CalendarEvent): string {
  const when = ev.rule ? JSON.stringify(ev.rule) + ev.month : `${ev.month}/${ev.day}`
  return `${ev.title.trim().toLowerCase()}|${when}|${ev.repeat}|${ev.repeat === 'once' ? ev.year : ''}`
}

/** Add dates to a list, skipping ones that are already there. Returns how many were added. */
export function mergeEvents(into: CalendarEvent[], add: CalendarEvent[]): number {
  const seen = new Set(into.map(sameKey))
  let added = 0
  for (const ev of add) {
    const k = sameKey(ev)
    if (seen.has(k)) continue
    seen.add(k)
    into.push({ ...ev, id: newEventId() })
    added++
  }
  return added
}

/** Sort for lists: by month and day (rules placed in a typical year). */
export function sortEvents(events: CalendarEvent[], year = new Date().getFullYear()): CalendarEvent[] {
  const key = (ev: CalendarEvent) => {
    const at = dateIn({ ...ev, repeat: 'yearly' }, ev.repeat === 'once' && ev.year ? ev.year : year) ?? [ev.month, ev.day]
    return (ev.repeat === 'once' && ev.year ? ev.year - year : 0) * 1000 + at[0] * 40 + at[1]
  }
  return [...events].sort((a, b) => key(a) - key(b) || a.title.localeCompare(b.title))
}

/** Check and tidy an event from a file. Returns null if it can't be used. */
export function cleanEvent(raw: any): CalendarEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title ?? '').trim().slice(0, 200)
  const month = Math.round(Number(raw.month))
  if (!title || !(month >= 1 && month <= 12)) return null
  const kind: EventKind = EVENT_KINDS.includes(raw.kind) ? raw.kind : 'event'
  const repeat = raw.repeat === 'once' ? 'once' : 'yearly'
  const year = raw.year === null || raw.year === undefined || raw.year === '' ? null : Math.round(Number(raw.year))
  if (year !== null && !(year >= 1 && year <= 9999)) return null
  if (repeat === 'once' && year === null) return null
  let rule: DateRule | undefined
  if (raw.rule?.type === 'nthWeekday') {
    const nth = Number(raw.rule.nth), wd = Number(raw.rule.weekday)
    if ([1, 2, 3, 4, 5, -1].includes(nth) && wd >= 0 && wd <= 6) rule = { type: 'nthWeekday', nth: nth as 1, weekday: Math.round(wd) }
  } else if (raw.rule?.type === 'easter') {
    const off = Math.round(Number(raw.rule.offset))
    if (Number.isFinite(off) && Math.abs(off) <= 100) rule = { type: 'easter', offset: off }
  }
  const day = Math.round(Number(raw.day))
  if (!rule && !(day >= 1 && day <= daysInMonth(2024, month))) return null
  const ev: CalendarEvent = { id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 60) : newEventId(), title, kind, month, day: rule ? 1 : day, repeat, year }
  if (rule) ev.rule = rule
  if (raw.showAge) ev.showAge = true
  if (typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)) ev.color = raw.color
  if (typeof raw.note === 'string' && raw.note.trim()) ev.note = raw.note.trim().slice(0, 500)
  return ev
}

// ---------- ready-made holiday lists ----------

const yearly = (title: string, month: number, day: number, kind: EventKind = 'holiday'): CalendarEvent =>
  ({ id: '', title, kind, month, day, repeat: 'yearly', year: null })
const nth = (title: string, month: number, n: 1 | 2 | 3 | 4 | 5 | -1, wd: number): CalendarEvent =>
  ({ id: '', title, kind: 'holiday', month, day: 1, repeat: 'yearly', year: null, rule: { type: 'nthWeekday', nth: n, weekday: wd } })
const fromEaster = (title: string, offset: number): CalendarEvent =>
  ({ id: '', title, kind: 'holiday', month: 3, day: 1, repeat: 'yearly', year: null, rule: { type: 'easter', offset } })

export interface HolidaySet {
  id: string
  name: string
  description: string
  events: () => CalendarEvent[]
}

export const HOLIDAY_SETS: HolidaySet[] = [
  {
    id: 'us-federal',
    name: 'US federal holidays',
    description: 'The 11 federal holidays, on the right day every year.',
    events: () => [
      yearly("New Year's Day", 1, 1),
      nth('Martin Luther King Jr. Day', 1, 3, 1),
      nth("Presidents' Day", 2, 3, 1),
      nth('Memorial Day', 5, -1, 1),
      yearly('Juneteenth', 6, 19),
      yearly('Independence Day', 7, 4),
      nth('Labor Day', 9, 1, 1),
      nth('Columbus Day', 10, 2, 1),
      yearly('Veterans Day', 11, 11),
      nth('Thanksgiving', 11, 4, 4),
      yearly('Christmas Day', 12, 25)
    ]
  },
  {
    id: 'us-observances',
    name: 'Popular US days',
    description: "Valentine's Day, Easter, Mother's Day, Halloween and more.",
    events: () => [
      yearly('Groundhog Day', 2, 2),
      yearly("Valentine's Day", 2, 14),
      yearly("St. Patrick's Day", 3, 17),
      fromEaster('Easter', 0),
      yearly('Earth Day', 4, 22),
      yearly('Cinco de Mayo', 5, 5),
      nth("Mother's Day", 5, 2, 0),
      yearly('Flag Day', 6, 14),
      nth("Father's Day", 6, 3, 0),
      yearly('Halloween', 10, 31),
      yearly('Christmas Eve', 12, 24),
      yearly("New Year's Eve", 12, 31)
    ]
  },
  {
    id: 'school',
    name: 'Classroom days',
    description: 'Days classrooms often celebrate, such as Pi Day and Read Across America Day.',
    events: () => [
      yearly('Read Across America Day', 3, 2),
      yearly('Pi Day', 3, 14),
      yearly('Constitution Day', 9, 17),
      yearly('World Kindness Day', 11, 13)
    ]
  }
]

