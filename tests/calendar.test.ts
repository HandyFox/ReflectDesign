// Calendars: date maths, holiday rules, layouts, and the dates file formats.

import { describe, expect, it } from 'vitest'
import {
  HOLIDAY_SETS, dateIn, describeWhen, easter, eventLabel, makeEvent, mergeEvents, nthWeekday, occurrencesInMonth,
  weekday, type CalendarEvent
} from '@core/calendar/dates'
import { autoTitle, layoutCalendar, weeksInMonth, type CalPiece } from '@core/calendar/layout'
import { loadDatesFile, parseDateText, toCsv, toIcs, toRdcal } from '@core/calendar/files'
import { makeCalendar, makeDocument } from '@core/model/factory'
import { migrate } from '@core/io/migrate'
import { writePackage } from '@core/io/rdx'
import { pageToSvg } from '@core/render/svg'
import { TextEngine } from '@core/text/engine'
import type { Measurer } from '@core/text/layout'

const mono: Measurer = {
  measure: (t, s, f) => t.length * s.size * f * 0.5,
  metrics: (s, f) => ({ ascent: s.size * f * 0.8, descent: s.size * f * 0.2 })
}
const enc = (s: string) => new TextEncoder().encode(s)
const texts = (pieces: CalPiece[]) => pieces.filter((p): p is Extract<CalPiece, { t: 'text' }> => p.t === 'text').map((p) => p.text)

describe('date maths', () => {
  it('weekdays and moving holidays land on the right day', () => {
    expect(weekday(2026, 11, 21)).toBe(6) // Saturday
    const us = HOLIDAY_SETS.find((s) => s.id === 'us-federal')!.events()
    const on = (title: string, year: number) => dateIn(us.find((e) => e.title === title)!, year)
    // 2027 federal holidays (OPM): MLK Jan 18, Presidents' Feb 15, Memorial May 31, Labor Sep 6, Columbus Oct 11, Thanksgiving Nov 25
    expect(on('Martin Luther King Jr. Day', 2027)).toEqual([1, 18])
    expect(on("Presidents' Day", 2027)).toEqual([2, 15])
    expect(on('Memorial Day', 2027)).toEqual([5, 31])
    expect(on('Labor Day', 2027)).toEqual([9, 6])
    expect(on('Columbus Day', 2027)).toEqual([10, 11])
    expect(on('Thanksgiving', 2027)).toEqual([11, 25])
    expect(on('Thanksgiving', 2026)).toEqual([11, 26])
    expect(us).toHaveLength(11)
    expect(nthWeekday(2026, 2, 5, 0)).toBeNull() // no 5th Sunday in Feb 2026
  })

  it('Easter', () => {
    expect(easter(2024)).toEqual([3, 31])
    expect(easter(2025)).toEqual([4, 20])
    expect(easter(2026)).toEqual([4, 5])
    expect(easter(2027)).toEqual([3, 28])
    const goodFriday = makeEvent({ title: 'Good Friday', month: 3, rule: { type: 'easter', offset: -2 } })
    expect(dateIn(goodFriday, 2026)).toEqual([4, 3])
    expect(describeWhen(goodFriday)).toBe('2 days before Easter')
  })

  it('birthdays repeat every year, show ages, and 29 February falls back to the 28th', () => {
    const leap = makeEvent({ title: 'Leap kid', kind: 'birthday', month: 2, day: 29, year: 2016, showAge: true })
    expect(dateIn(leap, 2027)).toEqual([2, 28])
    expect(dateIn(leap, 2028)).toEqual([2, 29])
    expect(eventLabel(leap, 2027)).toBe('Leap kid (turns 11)')
    const wed = makeEvent({ title: 'Mom & Dad', kind: 'anniversary', month: 6, day: 2, year: 2000, showAge: true })
    expect(eventLabel(wed, 2026)).toBe('Mom & Dad (26 years)')
    const trip = makeEvent({ title: 'Field trip', month: 5, day: 8, repeat: 'once', year: 2027 })
    expect(dateIn(trip, 2027)).toEqual([5, 8])
    expect(dateIn(trip, 2028)).toBeNull()
  })

  it('merging the same dates twice adds nothing', () => {
    const list: CalendarEvent[] = []
    expect(mergeEvents(list, HOLIDAY_SETS[0].events())).toBe(11)
    expect(mergeEvents(list, HOLIDAY_SETS[0].events())).toBe(0)
    expect(new Set(list.map((e) => e.id)).size).toBe(11)
  })

  it('occurrences come sorted, holidays first', () => {
    const evs = [makeEvent({ title: 'Zoe', kind: 'birthday', month: 7, day: 4 }), ...HOLIDAY_SETS[0].events()]
    const july = occurrencesInMonth(evs, 2027, 7)
    expect(july.get(4)!.map((o) => o.label)).toEqual(['Independence Day', 'Zoe'])
    expect(occurrencesInMonth(evs, 2027, 7, ['birthday']).get(4)!.map((o) => o.label)).toEqual(['Zoe'])
  })
})

describe('calendar layout', () => {
  it('a month grid has every date, the right number of weeks, and the title', () => {
    expect(weeksInMonth(2026, 2, 0)).toBe(4) // Feb 2026 starts on a Sunday
    expect(weeksInMonth(2026, 2, 1)).toBe(5)
    expect(weeksInMonth(2026, 8, 0)).toBe(6)
    const cal = makeCalendar({ x: 0, y: 0, width: 700, height: 500 }, { year: 2026, month: 11 })
    const t = texts(layoutCalendar(cal, [], mono))
    expect(t[0]).toBe('November 2026')
    for (let d = 1; d <= 30; d++) expect(t).toContain(String(d))
    expect(t).not.toContain('31')
    expect(t).toContain('Sun')
  })

  it('dates show in their box, and a full box says "+N more"', () => {
    const evs = Array.from({ length: 8 }, (_, i) => makeEvent({ title: `Person number ${i + 1}`, kind: 'birthday', month: 11, day: 12 }))
    const big = makeCalendar({ x: 0, y: 0, width: 1400, height: 1000 }, { year: 2026, month: 11 })
    // (Long names wrap onto more than one line, so look at the text as a whole.)
    const joined = texts(layoutCalendar(big, evs.slice(0, 2), mono)).join(' ')
    expect(joined).toContain('Person number 1')
    expect(joined).toContain('Person number 2')
    const small = makeCalendar({ x: 0, y: 0, width: 500, height: 360 }, { year: 2026, month: 11 })
    const t = texts(layoutCalendar(small, evs, mono))
    expect(t.some((x) => /^\+\d+ more$/.test(x))).toBe(true)
    // Turning dates off hides them.
    expect(texts(layoutCalendar({ ...big, showEvents: false }, evs, mono)).join(' ')).not.toContain('Person')
  })

  it('every piece stays inside the calendar', () => {
    const evs = [...HOLIDAY_SETS[0].events(), ...HOLIDAY_SETS[1].events(), makeEvent({ title: 'A very long name for a birthday entry indeed', kind: 'birthday', month: 3, day: 14 })]
    for (const layout of ['month', 'year', 'list'] as const) {
      for (const [w, h] of [[612, 792], [792, 612], [200, 150], [3000, 2000]]) {
        const cal = makeCalendar({ x: 0, y: 0, width: w, height: h }, { layout, year: 2027, month: 3 })
        for (const p of layoutCalendar(cal, evs, mono)) {
          if (p.t === 'rect') { expect(p.x).toBeGreaterThanOrEqual(-0.01); expect(p.x + p.w).toBeLessThanOrEqual(w + 0.01); expect(p.y + p.h).toBeLessThanOrEqual(h + 0.01) }
          if (p.t === 'text') { expect(p.y).toBeLessThanOrEqual(h + 0.01); expect(p.style.size).toBeGreaterThan(0) }
        }
      }
    }
  })

  it('Year and List layouts show 12 months; List shows each month\'s dates', () => {
    const evs = [makeEvent({ title: 'Ava', kind: 'birthday', month: 9, day: 3 }), makeEvent({ title: 'Ben', kind: 'birthday', month: 9, day: 21 })]
    const year = makeCalendar({ x: 0, y: 0, width: 792, height: 612 }, { layout: 'year', year: 2027, month: 1 })
    const yt = texts(layoutCalendar(year, evs, mono))
    expect(yt[0]).toBe('2027')
    expect(yt).toEqual(expect.arrayContaining(['January', 'December']))
    const list = makeCalendar({ x: 0, y: 0, width: 792, height: 612 }, { layout: 'list', year: 2027, month: 1, eventKinds: ['birthday'] })
    expect(autoTitle(list)).toBe('Birthdays')
    const lt = texts(layoutCalendar(list, evs, mono))
    expect(lt).toEqual(expect.arrayContaining(['Ava', 'Ben', '3', '21']))
    const school = makeCalendar({ x: 0, y: 0, width: 792, height: 612 }, { layout: 'year', year: 2026, month: 8 })
    expect(autoTitle(school)).toBe('2026–2027')
  })

  it('prints the same calendar to PDF, with dates', () => {
    const doc = makeDocument()
    doc.calendarData = { events: [makeEvent({ title: 'Sam <3', kind: 'birthday', month: 11, day: 12 })] }
    doc.pages[0].objects.push(makeCalendar({ x: 36, y: 36, width: 540, height: 400 }, { year: 2026, month: 11 }))
    const svg = pageToSvg({ doc, assets: { get: () => undefined } as any, text: new TextEngine(mono) }, doc.pages[0]).svg
    expect(svg).toContain('November 2026')
    expect(svg).toContain('Sam &lt;3')
    expect(svg).not.toContain('<3')
  })
})

describe('dates files', () => {
  const sample = (): CalendarEvent[] => [
    makeEvent({ title: 'Grandma, "Nana"', kind: 'birthday', month: 3, day: 14, year: 1950, showAge: true }),
    makeEvent({ title: 'Leap kid', kind: 'birthday', month: 2, day: 29 }),
    makeEvent({ title: 'Thanksgiving', kind: 'holiday', month: 11, rule: { type: 'nthWeekday', nth: 4, weekday: 4 } }),
    makeEvent({ title: 'Memorial Day', kind: 'holiday', month: 5, rule: { type: 'nthWeekday', nth: -1, weekday: 1 } }),
    makeEvent({ title: 'Good Friday', kind: 'holiday', month: 3, rule: { type: 'easter', offset: -2 } }),
    makeEvent({ title: 'Field trip; bring lunch', kind: 'event', month: 5, day: 8, repeat: 'once', year: 2027, note: 'Line one\nline two' })
  ]
  const same = (a: CalendarEvent[], b: CalendarEvent[]) => {
    const strip = (l: CalendarEvent[]) => l.map(({ id: _id, ...rest }) => rest).sort((x, y) => x.title.localeCompare(y.title))
    expect(strip(b)).toEqual(strip(a))
  }

  it('ReflectDesign dates file: everything comes back exactly', async () => {
    const r = await loadDatesFile('family.rdcal', enc(toRdcal(sample())))
    same(sample(), r.events)
    expect(r.notes).toEqual([])
  })

  it('iCalendar: everything comes back, and the file is valid iCalendar', async () => {
    const ics = toIcs(sample())
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH')
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=5;BYDAY=-1MO')
    expect(ics).toContain('SUMMARY:Field trip\\; bring lunch')
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true)
    const r = await loadDatesFile('dates.ics', enc(ics))
    same(sample(), r.events)
  })

  it('iCalendar from Google Calendar: yearly birthdays keep the birth year; weekly events are skipped', async () => {
    const google = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:19900314', 'RRULE:FREQ=YEARLY', "SUMMARY:Alex's birthday", 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20270108T150000Z', 'SUMMARY:Dentist', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20270104T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'SUMMARY:Staff meeting', 'END:VEVENT',
      'END:VCALENDAR'
    ].join('\n')
    const r = await loadDatesFile('basic.ics', enc(google))
    expect(r.events.map((e) => [e.title, e.kind, e.month, e.day, e.repeat, e.year])).toEqual([
      ["Alex's birthday", 'birthday', 3, 14, 'yearly', 1990],
      ['Dentist', 'event', 1, 8, 'once', 2027]
    ])
    expect(r.notes[0]).toMatch(/1 event that repeat/)
  })

  it('CSV: round trip, and a plain "Name, Birthday" list from a spreadsheet', async () => {
    const back = await loadDatesFile('dates.csv', enc(toCsv(sample())))
    same(sample(), back.events)
    const sheet = 'Student,Birthday\nAva Smith,9/3/2016\nBen Lee,2016-09-21\n"Cruz, Maria",March 5\nNo date here,\n'
    const r = await loadDatesFile('class.csv', enc(sheet))
    expect(r.events.map((e) => [e.title, e.kind, e.month, e.day, e.year, e.repeat])).toEqual([
      ['Ava Smith', 'birthday', 9, 3, 2016, 'yearly'],
      ['Ben Lee', 'birthday', 9, 21, 2016, 'yearly'],
      ['Cruz, Maria', 'birthday', 3, 5, null, 'yearly']
    ])
    expect(r.notes[0]).toMatch(/1 row could not be read \(row 5\)/)
  })

  it('reads dates written many ways', () => {
    expect(parseDateText('3/14')).toEqual({ month: 3, day: 14, year: null })
    expect(parseDateText('14/3/2015')).toEqual({ month: 3, day: 14, year: 2015 })
    expect(parseDateText('Mar 14th, 2015')).toEqual({ month: 3, day: 14, year: 2015 })
    expect(parseDateText('14 March')).toEqual({ month: 3, day: 14, year: null })
    expect(parseDateText('4th Thursday of November')).toEqual({ month: 11, day: 1, year: null, rule: { type: 'nthWeekday', nth: 4, weekday: 4 } })
    expect(parseDateText('last monday in may')?.rule).toEqual({ type: 'nthWeekday', nth: -1, weekday: 1 })
    expect(parseDateText('2 days before Easter')?.rule).toEqual({ type: 'easter', offset: -2 })
    expect(parseDateText('2/30')).toBeNull()
    expect(parseDateText('soon')).toBeNull()
  })

  it("last year's publication: its dates can be loaded into a new calendar", async () => {
    const doc = makeDocument()
    doc.calendarData = { events: sample() }
    const bytes = await writePackage({ doc, assets: new Map() })
    same(sample(), (await loadDatesFile('Calendar 2026.rdx', bytes)).events)
  })

  it('dates and calendars survive saving; broken entries are dropped', () => {
    const doc = makeDocument()
    doc.calendarData = { events: [...sample(), { title: '', month: 13 } as any] }
    doc.pages[0].objects.push({ ...makeCalendar({ x: 0, y: 0, width: 100, height: 100 }), month: 99, style: { font: 'Georgia' } as any })
    const back = migrate(JSON.parse(JSON.stringify(doc)))
    expect(back.calendarData!.events).toHaveLength(sample().length)
    const cal = back.pages[0].objects[0]
    expect(cal.type === 'calendar' && cal.month).toBe(1)
    expect(cal.type === 'calendar' && cal.style.font).toBe('Georgia')
    expect(cal.type === 'calendar' && cal.style.headerFill).toBeTruthy()
  })
})
