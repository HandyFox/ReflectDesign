// Calendar publications (File › New › Calendars): ready-made designs built
// from the options the person picks, with their dates included.

import type { CalendarObject, CalendarStyle, RDocument } from '../model/types'
import { makeCalendar, makeDocument, makePage, makePicture, makeShape, makeStory, makeTextBox, solid } from '../model/factory'
import { MONTHS, type CalendarEvent } from './dates'
import { CALENDAR_THEMES, themeById } from './themes'

export type CalendarDesignId = 'wall' | 'planner' | 'year' | 'birthdays' | 'classroom'

export interface CalendarDesign {
  id: CalendarDesignId
  name: string
  description: string
  width: number
  height: number
  /** One page per month (otherwise one page for the whole year). */
  monthly: boolean
  theme: string
}

const IN = 72

export const CALENDAR_DESIGNS: CalendarDesign[] = [
  { id: 'wall', name: 'Picture Wall Calendar', description: 'A picture above each month, Letter size, with a cover page.', width: 8.5 * IN, height: 11 * IN, monthly: true, theme: 'classic' },
  { id: 'planner', name: 'Monthly Planner', description: 'Big boxes to write in, one month per Letter landscape page.', width: 11 * IN, height: 8.5 * IN, monthly: true, theme: 'minimal' },
  { id: 'year', name: 'Year at a Glance', description: 'All 12 months on one page, with your dates marked.', width: 11 * IN, height: 8.5 * IN, monthly: false, theme: 'classic' },
  { id: 'birthdays', name: 'Birthday Board', description: 'Everyone’s birthdays listed by month. Works every year.', width: 11 * IN, height: 8.5 * IN, monthly: false, theme: 'classroom' },
  { id: 'classroom', name: 'Classroom Wall Calendar', description: 'A big, bright month for the bulletin board, 24 × 18".', width: 24 * IN, height: 18 * IN, monthly: true, theme: 'classroom' }
]

export interface NewCalendarOptions {
  design: CalendarDesignId
  themeId: string
  year: number
  /** First month, 1–12. */
  month: number
  /** How many months (monthly designs), 1–24. */
  months: number
  weekStart: 0 | 1
  /** Cover page (Picture Wall Calendar). */
  cover: boolean
  events: CalendarEvent[]
}

/** The first month of the next calendar people usually make: next January late in the year. */
export function suggestedStart(today = new Date()): { year: number; month: number } {
  return today.getMonth() >= 8 ? { year: today.getFullYear() + 1, month: 1 } : { year: today.getFullYear(), month: today.getMonth() + 1 }
}

function textBox(doc: RDocument, box: { x: number; y: number; width: number; height: number }, content: string,
  char: { font: string; size: number; color: string; bold?: boolean; italic?: boolean }, name: string) {
  const story = makeStory(content, char, { spaceAfter: 0, align: 'center' })
  doc.stories[story.id] = story
  const t = makeTextBox(box, story.id)
  t.autofit = 'bestFit'
  t.vAlign = 'middle'
  t.name = name
  return t
}

function cal(box: { x: number; y: number; width: number; height: number }, style: CalendarStyle, p: Partial<CalendarObject>) {
  return makeCalendar(box, { style, ...p })
}

/** Name for the publication's calendar pages and title ("January 2027"). */
function monthAt(o: NewCalendarOptions, i: number): { year: number; month: number } {
  const m = o.month - 1 + i
  return { year: o.year + Math.floor(m / 12), month: (m % 12) + 1 }
}

export function buildCalendarDocument(o: NewCalendarOptions): RDocument {
  const design = CALENDAR_DESIGNS.find((d) => d.id === o.design) ?? CALENDAR_DESIGNS[0]
  const theme = themeById(o.themeId || design.theme)
  const style = structuredClone(theme.style)
  const W = design.width, H = design.height
  const doc = makeDocument(W, H)
  const m = design.id === 'classroom' ? 0.75 * IN : 0.5 * IN
  doc.pageSetup.margins = { top: m, right: m, bottom: m, left: m }
  doc.calendarData = { events: structuredClone(o.events) }
  doc.pages = []
  const inner = { x: m, y: m, width: W - 2 * m, height: H - 2 * m }
  const months = Math.max(1, Math.min(24, Math.round(o.months)))

  if (design.id === 'wall' && o.cover) {
    const cover = makePage('Cover')
    const panel = makeShape({ x: m, y: m, width: W - 2 * m, height: H * 0.5 }, 'roundRect')
    panel.adjust = 0.04
    panel.fill = { type: 'solid', color: style.headerFill, opacity: 0.14 }
    panel.stroke = { ...panel.stroke, width: 0 }
    const last = monthAt(o, months - 1)
    const yearText = last.year === o.year ? String(o.year) : `${o.year}–${last.year}`
    cover.objects.push(
      panel,
      makePicture({ x: m + 18, y: m + 18, width: W - 2 * m - 36, height: H * 0.5 - 36 }, null),
      textBox(doc, { x: m, y: H * 0.55, width: W - 2 * m, height: H * 0.14 }, yearText, { font: style.titleFont, size: 96, color: style.titleColor, bold: style.titleBold }, 'Calendar Year'),
      textBox(doc, { x: m, y: H * 0.69, width: W - 2 * m, height: H * 0.05 }, 'Family Calendar', { font: style.font, size: 28, color: style.numberColor }, 'Calendar Subtitle'),
      cal({ x: m + W * 0.12, y: H * 0.76, width: W - 2 * m - W * 0.24, height: H * 0.2 - m * 0.2 }, style, { layout: 'year', year: o.year, month: o.month, weekStart: o.weekStart, showTitle: false })
    )
    doc.pages.push(cover)
  }

  if (design.monthly) {
    for (let i = 0; i < months; i++) {
      const { year, month } = monthAt(o, i)
      const page = makePage(`${MONTHS[month - 1]} ${year}`)
      if (design.id === 'wall') {
        const ph = H * 0.36
        const panel = makeShape({ x: m, y: m, width: W - 2 * m, height: ph }, 'roundRect')
        panel.adjust = 0.04
        panel.fill = { type: 'solid', color: style.headerFill, opacity: 0.14 }
        panel.stroke = { ...panel.stroke, width: 0 }
        page.objects.push(
          panel,
          makePicture({ x: m + 12, y: m + 12, width: W - 2 * m - 24, height: ph - 24 }, null),
          cal({ x: m, y: m + ph + 14, width: W - 2 * m, height: H - 2 * m - ph - 14 }, style, { year, month, weekStart: o.weekStart })
        )
      } else if (design.id === 'classroom') {
        const s = { ...style, dayNames: 'long' as const }
        page.background = solid('#FFFDF5')
        page.objects.push(cal(inner, s, { year, month, weekStart: o.weekStart }))
      } else {
        page.objects.push(cal(inner, style, { year, month, weekStart: o.weekStart }))
      }
      doc.pages.push(page)
    }
  } else if (design.id === 'year') {
    const page = makePage('Year')
    page.objects.push(cal(inner, style, { layout: 'year', year: o.year, month: o.month, weekStart: o.weekStart }))
    doc.pages.push(page)
  } else {
    // Birthday Board: January to December, every year.
    const page = makePage('Birthdays')
    page.background = solid('#FFFDF5')
    page.objects.push(cal(inner, style, { layout: 'list', year: o.year, month: 1, eventKinds: ['birthday'], title: 'Our Birthdays' }))
    doc.pages.push(page)
  }
  return doc
}

export { CALENDAR_THEMES }
