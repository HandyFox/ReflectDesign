// Calendar layout: turns a calendar object and the publication's dates into
// simple drawing pieces (boxes, lines, dots and text). The screen renderer and
// the print/PDF renderer both draw these same pieces, so they always match.

import type { CalendarObject, CharStyle } from '../model/types'
import { defaultCharStyle } from '../model/factory'
import type { Measurer } from '../text/layout'
import { MONTHS, WEEKDAYS, daysInMonth, occurrencesInMonth, weekday, type CalendarEvent, type Occurrence } from './dates'

export type CalPiece =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string | null; stroke: string | null; sw: number; r?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; w: number }
  | { t: 'dot'; cx: number; cy: number; r: number; fill: string; opacity: number }
  | { t: 'text'; x: number; y: number; text: string; style: CharStyle; align: 'left' | 'center' | 'right' }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Fonts a calendar uses (for embedding in PDFs). */
export function calendarFonts(o: CalendarObject): string[] {
  return [o.style.font, o.style.titleFont]
}

function cs(font: string, size: number, color: string, bold = false, italic = false): CharStyle {
  return { ...defaultCharStyle(), font, size, color, bold, italic }
}

class Pen {
  out: CalPiece[] = []
  constructor(private m: Measurer) {}
  width(text: string, s: CharStyle): number { return this.m.measure(text, s, 1) }
  metrics(s: CharStyle) { return this.m.metrics(s, 1) }
  /** Largest size (≤ max) at which the text fits the width. */
  fit(text: string, s: CharStyle, maxSize: number, maxW: number, minSize = 3): number {
    const w = this.width(text, { ...s, size: maxSize })
    return clamp(w > maxW ? maxSize * (maxW / w) : maxSize, minSize, maxSize)
  }
  /** Text centred vertically in a band. */
  textIn(text: string, s: CharStyle, x: number, top: number, h: number, align: 'left' | 'center' | 'right'): void {
    const { ascent, descent } = this.metrics(s)
    this.out.push({ t: 'text', x, y: top + (h - (ascent + descent)) / 2 + ascent, text, style: s, align })
  }
  textAt(text: string, s: CharStyle, x: number, top: number, align: 'left' | 'center' | 'right'): void {
    this.out.push({ t: 'text', x, y: top + this.metrics(s).ascent, text, style: s, align })
  }
  /** Word-wrap text to a width; very long words are broken. */
  wrap(text: string, s: CharStyle, maxW: number): string[] {
    const lines: string[] = []
    let cur = ''
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const tryLine = cur ? `${cur} ${word}` : word
      if (this.width(tryLine, s) <= maxW) { cur = tryLine; continue }
      if (cur) lines.push(cur)
      // A word wider than the line: break it.
      let w = word
      while (this.width(w, s) > maxW && w.length > 1) {
        let k = w.length - 1
        while (k > 1 && this.width(w.slice(0, k), s) > maxW) k--
        lines.push(w.slice(0, k))
        w = w.slice(k)
      }
      cur = w
    }
    if (cur) lines.push(cur)
    return lines
  }
}

/** The automatic title, used when the title box is left empty. */
export function autoTitle(o: CalendarObject): string {
  if (o.layout === 'month') return `${MONTHS[o.month - 1]} ${o.year}`
  const lastYear = o.month === 1 ? o.year : o.year + 1
  const years = lastYear === o.year ? `${o.year}` : `${o.year}–${lastYear}`
  if (o.layout === 'year') return years
  if (o.eventKinds.length === 1 && o.eventKinds[0] === 'birthday') return 'Birthdays'
  return 'Important Dates'
}

export function titleOf(o: CalendarObject): string {
  return o.title.trim() || autoTitle(o)
}

/** The 12 months shown by Year and List layouts, starting at the object's month. */
function twelveMonths(o: CalendarObject): Array<{ year: number; month: number }> {
  return Array.from({ length: 12 }, (_, i) => {
    const m = o.month - 1 + i
    return { year: o.year + Math.floor(m / 12), month: (m % 12) + 1 }
  })
}

/** Weeks (rows) a month needs, given the first day of the week. */
export function weeksInMonth(year: number, month: number, weekStart: 0 | 1): number {
  const lead = (weekday(year, month, 1) - weekStart + 7) % 7
  return Math.ceil((lead + daysInMonth(year, month)) / 7)
}

export function layoutCalendar(o: CalendarObject, events: CalendarEvent[], m: Measurer): CalPiece[] {
  const pen = new Pen(m)
  const w = Math.max(10, o.width), h = Math.max(10, o.height)
  let top = 0
  if (o.showTitle) {
    const th = clamp(h * (o.layout === 'month' ? 0.12 : 0.09), 10, 220)
    const t = titleOf(o)
    const base = cs(o.style.titleFont, th * 0.72, o.style.titleColor, o.style.titleBold)
    const size = pen.fit(t, base, th * 0.72, w * 0.96)
    pen.textIn(t, { ...base, size }, w / 2, 0, th, 'center')
    top = th * 1.05
  }
  const area = { x: 0, y: top, w, h: h - top }
  if (area.h < 10) return pen.out
  const evs = o.showEvents ? events : []
  if (o.layout === 'month') monthGrid(pen, o, o.year, o.month, area, evs)
  else boxes(pen, o, area, evs)
  return pen.out
}

function dayName(i: number, kind: CalendarObject['style']['dayNames']): string {
  const n = WEEKDAYS[i]
  return kind === 'long' ? n : kind === 'letter' ? n[0] : n.slice(0, 3)
}

/** One month as a full grid with dates written in the boxes. */
function monthGrid(pen: Pen, o: CalendarObject, year: number, month: number, a: { x: number; y: number; w: number; h: number }, events: CalendarEvent[]): void {
  const st = o.style
  const rows = weeksInMonth(year, month, o.weekStart)
  const headerH = clamp(a.h * 0.065, 7, 64)
  const cellW = a.w / 7, cellH = (a.h - headerH) / rows
  const gridTop = a.y + headerH

  // Day names bar.
  pen.out.push({ t: 'rect', x: a.x, y: a.y, w: a.w, h: headerH, fill: st.headerFill, stroke: null, sw: 0 })
  let kind = st.dayNames
  const headStyle = cs(st.font, headerH * 0.55, st.headerColor, true)
  if (kind === 'long' && pen.width('Wednesday', headStyle) > cellW * 0.92 && pen.fit('Wednesday', headStyle, headerH * 0.55, cellW * 0.92) < 6) kind = 'short'
  const longest = kind === 'long' ? 'Wednesday' : kind === 'short' ? 'Wed' : 'W'
  const hs = { ...headStyle, size: pen.fit(longest, headStyle, headerH * 0.55, cellW * 0.92) }
  for (let c = 0; c < 7; c++) pen.textIn(dayName((c + o.weekStart) % 7, kind), hs, a.x + cellW * (c + 0.5), a.y, headerH, 'center')

  // Box fills (weekends shaded).
  const lead = (weekday(year, month, 1) - o.weekStart + 7) % 7
  for (let r = 0; r < rows; r++) for (let c = 0; c < 7; c++) {
    const wd = (c + o.weekStart) % 7
    const fill = (wd === 0 || wd === 6) && st.weekendFill ? st.weekendFill : st.cellFill
    if (fill) pen.out.push({ t: 'rect', x: a.x + c * cellW, y: gridTop + r * cellH, w: cellW, h: cellH, fill, stroke: null, sw: 0 })
  }

  // Dates and events.
  const occ = occurrencesInMonth(events, year, month, o.eventKinds)
  const numSize = clamp(Math.min(cellW, cellH) * 0.2, 4, 80)
  const pad = Math.max(1.5, numSize * 0.28)
  const numStyle = cs(st.font, numSize, st.numberColor, true)
  const faded = cs(st.font, numSize, '#B4B4B4', true)
  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  const prevDays = daysInMonth(prevMonth.y, prevMonth.m)
  for (let i = 0; i < rows * 7; i++) {
    const r = Math.floor(i / 7), c = i % 7
    const x = a.x + c * cellW, y = gridTop + r * cellH
    const day = i - lead + 1
    const inMonth = day >= 1 && day <= daysInMonth(year, month)
    let label: number
    if (inMonth) label = day
    else if (st.otherMonths === 'show') label = day < 1 ? prevDays + day : day - daysInMonth(year, month)
    else continue
    const s = inMonth ? numStyle : faded
    const nx = st.numberPosition === 'topLeft' ? x + pad : st.numberPosition === 'topRight' ? x + cellW - pad : x + cellW / 2
    const align = st.numberPosition === 'topLeft' ? 'left' : st.numberPosition === 'topRight' ? 'right' : 'center'
    pen.textAt(String(label), s, nx, y + pad * 0.7, align)
    if (inMonth && occ.has(day)) cellEvents(pen, o, occ.get(day)!, x + pad, y + pad * 0.7 + numSize * 1.2, cellW - pad * 2, y + cellH - pad * 0.6, cellW, cellH)
  }

  // Grid lines on top of the fills.
  if (st.gridWidth > 0) {
    const g = { color: st.gridColor, w: st.gridWidth }
    for (let r = 0; r <= rows; r++) pen.out.push({ t: 'line', x1: a.x, y1: gridTop + r * cellH, x2: a.x + a.w, y2: gridTop + r * cellH, ...g })
    for (let c = 0; c <= 7; c++) pen.out.push({ t: 'line', x1: a.x + c * cellW, y1: gridTop, x2: a.x + c * cellW, y2: gridTop + rows * cellH, ...g })
    pen.out.push({ t: 'rect', x: a.x, y: a.y, w: a.w, h: a.h, fill: null, stroke: st.gridColor, sw: st.gridWidth })
  }
}

/** The dates written in one box: a coloured dot and the text, wrapped; "+2 more" when they don't fit. */
function cellEvents(pen: Pen, o: CalendarObject, list: Occurrence[], x: number, top: number, maxW: number, bottom: number, cellW: number, cellH: number): void {
  const maxSize = clamp(Math.min(cellH * 0.15, cellW * 0.12), 3, 36)
  // A crowded box gets smaller text (down to 60%) before anything is left out.
  let size = maxSize
  for (let s = maxSize; s >= Math.max(3, maxSize * 0.6); s *= 0.92) {
    size = s
    const st = cs(o.style.font, s, o.style.eventColor)
    const ind = s * 0.78
    const lines = list.reduce((n, oc) => n + pen.wrap(oc.label, st, maxW - ind).length, 0)
    if (lines <= Math.floor((bottom - top) / (s * 1.18))) break
  }
  const s = cs(o.style.font, size, o.style.eventColor)
  const lineH = size * 1.18
  const maxLines = Math.floor((bottom - top) / lineH)
  if (maxLines < 1 || maxW < size * 2) return
  const dotR = size * 0.24
  const indent = dotR * 2 + size * 0.3
  type Line = { text: string; first: boolean; color: string }
  const blocks: Line[][] = list.map((oc) => pen.wrap(oc.label, s, maxW - indent).map((text, i) => ({ text, first: i === 0, color: oc.color })))
  let lines: Line[] = []
  if (blocks.reduce((n, b) => n + b.length, 0) <= maxLines) {
    lines = blocks.flat()
  } else if (maxLines === 1) {
    lines = [{ text: `${list.length} dates`, first: false, color: o.style.eventColor }]
  } else {
    // Keep the last line for "+N more"; shorten a date to one line when it won't fit whole.
    let budget = maxLines - 1, shown = 0
    for (const b of blocks) {
      if (b.length <= budget) { lines.push(...b); budget -= b.length }
      else if (budget >= 1) { lines.push({ ...b[0], text: shorten(pen, b.map((l) => l.text).join(' '), s, maxW - indent) }); budget-- }
      else break
      shown++
    }
    if (shown < blocks.length) lines.push({ text: `+${blocks.length - shown} more`, first: false, color: o.style.eventColor })
  }
  lines.forEach((l, i) => {
    const y = top + i * lineH
    if (l.first) pen.out.push({ t: 'dot', cx: x + dotR, cy: y + lineH * 0.5, r: dotR, fill: l.color, opacity: 1 })
    pen.textIn(l.text, s, x + indent, y, lineH, 'left')
  })
}

/** Cut text to fit a width, ending with "…". */
function shorten(pen: Pen, text: string, s: CharStyle, maxW: number): string {
  if (pen.width(text, s) <= maxW) return text
  let k = text.length
  while (k > 1 && pen.width(text.slice(0, k) + '…', s) > maxW) k--
  return text.slice(0, k).trimEnd() + '…'
}

/** Year at a glance (12 small months) or List (12 boxes listing each month's dates). */
function boxes(pen: Pen, o: CalendarObject, a: { x: number; y: number; w: number; h: number }, events: CalendarEvent[]): void {
  const st = o.style
  const landscape = a.w >= a.h * 1.15
  const portrait = a.h >= a.w * 1.15
  const cols = landscape ? 4 : portrait ? 3 : 4
  const rows = 12 / cols
  const gap = Math.min(a.w, a.h) * 0.022
  const bw = (a.w - gap * (cols - 1)) / cols, bh = (a.h - gap * (rows - 1)) / rows
  twelveMonths(o).forEach(({ year, month }, i) => {
    const bx = a.x + (i % cols) * (bw + gap), by = a.y + Math.floor(i / cols) * (bh + gap)
    const r = Math.min(st.corner, bw / 4, bh / 4)
    pen.out.push({ t: 'rect', x: bx, y: by, w: bw, h: bh, fill: st.cellFill, stroke: st.gridWidth > 0 ? st.gridColor : null, sw: st.gridWidth, r })
    const headH = clamp(bh * 0.15, 6, 60)
    pen.out.push({ t: 'rect', x: bx, y: by, w: bw, h: headH, fill: st.headerFill, stroke: null, sw: 0, r })
    if (r > 0) pen.out.push({ t: 'rect', x: bx, y: by + headH / 2, w: bw, h: headH / 2, fill: st.headerFill, stroke: null, sw: 0 }) // square off the bottom corners
    const name = o.layout === 'year' || year === o.year ? MONTHS[month - 1] : `${MONTHS[month - 1]} ${year}`
    const hs0 = cs(st.titleFont, headH * 0.62, st.headerColor, true)
    pen.textIn(name, { ...hs0, size: pen.fit(name, hs0, headH * 0.62, bw * 0.92) }, bx + bw / 2, by, headH, 'center')
    const inner = { x: bx + bw * 0.05, y: by + headH + bh * 0.03, w: bw * 0.9, h: bh - headH - bh * 0.06 }
    if (o.layout === 'year') miniMonth(pen, o, year, month, inner, events)
    else monthList(pen, o, year, month, inner, events)
  })
}

function miniMonth(pen: Pen, o: CalendarObject, year: number, month: number, a: { x: number; y: number; w: number; h: number }, events: CalendarEvent[]): void {
  const st = o.style
  const cw = a.w / 7, rh = a.h / 7 // day letters + up to 6 weeks
  const size = clamp(Math.min(cw * 0.5, rh * 0.62), 2.5, 40)
  const letters = cs(st.font, size * 0.9, st.numberColor, true)
  for (let c = 0; c < 7; c++) pen.textIn(dayName((c + o.weekStart) % 7, 'letter'), letters, a.x + cw * (c + 0.5), a.y, rh, 'center')
  const occ = occurrencesInMonth(events, year, month, o.eventKinds)
  const lead = (weekday(year, month, 1) - o.weekStart + 7) % 7
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const i = lead + d - 1
    const cx = a.x + cw * ((i % 7) + 0.5), y = a.y + rh * (Math.floor(i / 7) + 1)
    const has = occ.get(d)
    if (has) pen.out.push({ t: 'dot', cx, cy: y + rh / 2, r: Math.min(cw, rh) * 0.46, fill: has[0].color, opacity: 0.28 })
    pen.textIn(String(d), cs(st.font, size, st.numberColor, !!has), cx, y, rh, 'center')
  }
}

function monthList(pen: Pen, o: CalendarObject, year: number, month: number, a: { x: number; y: number; w: number; h: number }, events: CalendarEvent[]): void {
  const st = o.style
  const occ = [...occurrencesInMonth(events, year, month, o.eventKinds).values()].flat().sort((p, q) => p.day - q.day)
  if (!occ.length) return
  // Biggest size at which every entry fits the box.
  let size = clamp(Math.min(a.w * 0.085, a.h * 0.16), 3, 30)
  let lines: Array<{ day: string; text: string; color: string }> = []
  for (; size >= 3; size *= 0.92) {
    const s = cs(st.font, size, st.eventColor)
    const dayW = pen.width('30 ', { ...s, bold: true })
    lines = []
    for (const oc of occ) {
      pen.wrap(oc.label, s, a.w - dayW).forEach((text, i) => lines.push({ day: i === 0 ? String(oc.day) : '', text, color: oc.color }))
    }
    if (lines.length * size * 1.25 <= a.h) break
  }
  const s = cs(st.font, size, st.eventColor)
  const dayStyle = { ...s, bold: true }
  const dayW = pen.width('30 ', dayStyle)
  const lineH = size * 1.25
  const maxLines = Math.max(1, Math.floor(a.h / lineH))
  lines.slice(0, maxLines).forEach((l, i) => {
    const y = a.y + i * lineH
    if (l.day) pen.textIn(l.day, { ...dayStyle, color: l.color }, a.x + dayW * 0.75, y, lineH, 'right')
    pen.textIn(l.text, s, a.x + dayW, y, lineH, 'left')
  })
}
