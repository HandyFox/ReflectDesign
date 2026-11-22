// Calendar Tools (contextual tab when a calendar is selected), and the
// Insert › Calendar button.

import {
  CalendarDays, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, Download, LayoutGrid, ListOrdered, Palette, PartyPopper, Upload
} from 'lucide-react'
import * as cal from '@core/calendarCommands'
import { EVENT_KINDS, HOLIDAY_SETS, KIND_PLURALS, MONTHS } from '@core/calendar/dates'
import { CALENDAR_THEMES } from '@core/calendar/themes'
import type { CalendarObject, CalendarStyle } from '@core/model/types'
import { BigButton, Col, Combo, MenuHeader, MenuItem, MenuSeparator, RibbonGroup, Row, SmallButton } from './controls'
import { ColorButton } from './ColorPicker'
import { ensureFont, useFontFamilies } from '../fonts'
import { useDialogs } from '../dialogs/DialogHost'

const LAYOUTS: Array<[CalendarObject['layout'], string]> = [['month', 'Month'], ['year', 'Year at a Glance'], ['list', 'List of Dates by Month']]

/** Load Dates, shown with the result (or the problem) in a message. */
async function loadDatesWithMessage(mode: 'add' | 'replace') {
  try {
    const r = await cal.loadDates(mode)
    if (r && r.notes.length) alert([`Loaded ${r.added} date${r.added === 1 ? '' : 's'} from ${r.fileName}.`, ...r.notes].join('\n\n'))
  } catch (e) {
    alert(`Couldn’t read that file: ${(e as Error).message}`)
  }
}

/** The menus shared by the ribbon and the Calendar Dates dialog's toolbar. */
export function DatesMenus() {
  const dialogs = useDialogs()
  return (
    <RibbonGroup label="Dates">
      <BigButton icon={CalendarDays} label="Calendar Dates" color="#1f5fa8" title="Add birthdays, holidays and events" onClick={() => dialogs.open('calendarDates')} />
      <Col>
        <SmallButton icon={PartyPopper} label="Add Holidays" menu={(close) => (
          <>
            {HOLIDAY_SETS.map((s) => <MenuItem key={s.id} label={s.name} onClick={() => { cal.addHolidaySet(s.id); close() }} />)}
          </>
        )} />
        <SmallButton icon={Upload} label="Load Dates" title="Bring in dates from last year’s calendar, a dates file, a .ics calendar or a spreadsheet" menu={(close) => (
          <>
            <MenuItem label="Add Dates from a File..." onClick={() => { close(); loadDatesWithMessage('add') }} />
            <MenuItem label="Replace All Dates with a File..." onClick={() => {
              close()
              const n = cal.calendarEvents().length
              if (!n || window.confirm(`Replace all ${n} dates with the dates in the file?`)) loadDatesWithMessage('replace')
            }} />
          </>
        )} />
        <SmallButton icon={Download} label="Save Dates" title="Save the dates to reuse next year or in another calendar app" menu={(close) => (
          <>
            {(Object.keys(cal.DATES_FORMATS) as cal.DatesFormat[]).map((f) => (
              <MenuItem key={f} label={cal.DATES_FORMATS[f].label} onClick={() => { close(); cal.saveDates(f) }} />
            ))}
          </>
        )} />
      </Col>
    </RibbonGroup>
  )
}

export function CalendarToolsTab() {
  const dialogs = useDialogs()
  const families = useFontFamilies()
  const cals = cal.selectedCalendars()
  const c = cals[0]
  if (!c) return null
  const st = c.style
  const setStyle = (label: string, patch: Partial<CalendarStyle>) => cal.setCalendarStyle(label, patch)
  const set = (label: string, fn: (o: CalendarObject) => void) => cal.setCalendarProps(label, fn)
  const kinds = c.eventKinds
  return (
    <>
      <DatesMenus />
      <RibbonGroup label="Month">
        <Col>
          <Row>
            <SmallButton icon={ChevronLeft} title={c.layout === 'month' ? 'Previous Month' : 'Previous Year'} onClick={() => cal.stepCalendar(-1)} />
            <select className="ribbon-select" value={c.month} title={c.layout === 'month' ? 'Month' : 'First month'} onChange={(e) => set('Month', (o) => { o.month = Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <SmallButton icon={ChevronRight} title={c.layout === 'month' ? 'Next Month' : 'Next Year'} onClick={() => cal.stepCalendar(1)} />
          </Row>
          <Row>
            <span className="ribbon-label">Year</span>
            <input className="ribbon-num" defaultValue={c.year} key={`${c.id}-${c.year}`} aria-label="Year"
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onBlur={(e) => { const y = Number(e.target.value); if (y >= 1 && y <= 9999 && y !== c.year) set('Year', (o) => { o.year = y }) }} />
          </Row>
        </Col>
        <BigButton icon={CalendarRange} label="Change Year" title="Move every calendar in this publication to another year" onClick={() => dialogs.open('calendarYear')} />
      </RibbonGroup>
      <RibbonGroup label="Layout">
        <BigButton icon={c.layout === 'list' ? ListOrdered : LayoutGrid} label="Layout" menu={(close) => (
          <>
            {LAYOUTS.map(([id, label]) => <MenuItem key={id} label={label} checked={c.layout === id} onClick={() => { set('Calendar Layout', (o) => { o.layout = id }); close() }} />)}
          </>
        )} />
        <Col>
          <SmallButton label="Week Starts" menu={(close) => (
            <>
              <MenuItem label="Sunday" checked={c.weekStart === 0} onClick={() => { set('Week Starts', (o) => { o.weekStart = 0 }); close() }} />
              <MenuItem label="Monday" checked={c.weekStart === 1} onClick={() => { set('Week Starts', (o) => { o.weekStart = 1 }); close() }} />
            </>
          )} />
          <SmallButton label="Day Names" menu={(close) => (
            <>
              {([['long', 'Sunday'], ['short', 'Sun'], ['letter', 'S']] as const).map(([k, l]) => (
                <MenuItem key={k} label={l} checked={st.dayNames === k} onClick={() => { setStyle('Day Names', { dayNames: k }); close() }} />
              ))}
            </>
          )} />
          <SmallButton label="Date Position" menu={(close) => (
            <>
              {([['topLeft', 'Top Left'], ['center', 'Top Center'], ['topRight', 'Top Right']] as const).map(([k, l]) => (
                <MenuItem key={k} label={l} checked={st.numberPosition === k} onClick={() => { setStyle('Date Position', { numberPosition: k }); close() }} />
              ))}
            </>
          )} />
        </Col>
        <Col>
          <label className="ribbon-check"><input type="checkbox" checked={c.showTitle} onChange={(e) => set('Show Title', (o) => { o.showTitle = e.target.checked })} /> Title</label>
          <label className="ribbon-check"><input type="checkbox" checked={c.showEvents} onChange={(e) => set('Show Dates', (o) => { o.showEvents = e.target.checked })} /> Show dates</label>
          <label className="ribbon-check" title="Dates from the months before and after, shown faded"><input type="checkbox" checked={st.otherMonths === 'show'} onChange={(e) => setStyle('Other Months', { otherMonths: e.target.checked ? 'show' : 'hide' })} /> Other months</label>
        </Col>
        <Col>
          <SmallButton label="Which Dates" title="Choose which kinds of dates this calendar shows" menu={(close) => (
            <>
              <MenuItem label="All Dates" checked={kinds.length === 0} onClick={() => { set('Show All Dates', (o) => { o.eventKinds = [] }); close() }} />
              <MenuSeparator />
              {EVENT_KINDS.map((k) => (
                <MenuItem key={k} label={KIND_PLURALS[k]} checked={kinds.length === 0 || kinds.includes(k)} onClick={() => set('Which Dates', (o) => {
                  const cur = o.eventKinds.length ? o.eventKinds : [...EVENT_KINDS]
                  const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]
                  o.eventKinds = next.length === EVENT_KINDS.length ? [] : next
                })} />
              ))}
            </>
          )} />
          <Row>
            <span className="ribbon-label">Title</span>
            <input className="ribbon-text" defaultValue={c.title} key={`${c.id}-title-${c.title}`} placeholder="Automatic" aria-label="Title"
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onBlur={(e) => { if (e.target.value !== c.title) set('Calendar Title', (o) => { o.title = e.target.value }) }} />
          </Row>
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Style">
        <BigButton icon={Palette} label="Colors" menu={(close) => (
          <>
            <MenuHeader>Calendar Colors</MenuHeader>
            {CALENDAR_THEMES.map((t) => (
              <MenuItem key={t.id} label={t.name}
                iconNode={<span className="theme-swatch" style={{ background: t.style.headerFill, borderColor: t.style.gridColor, color: t.style.titleColor }}>A</span>}
                onClick={() => { cal.setCalendarProps('Calendar Colors', (o) => { o.style = structuredClone(t.style) }); close() }} />
            ))}
          </>
        )} />
        <Col>
          <ColorButton icon={<span className="cal-ico">▬</span>} title="Day names bar" label="Bar" color={st.headerFill} onPick={(v) => setStyle('Bar Color', { headerFill: v })} />
          <ColorButton icon={<span className="cal-ico">A</span>} title="Day names text" label="Bar Text" color={st.headerColor} onPick={(v) => setStyle('Bar Text Color', { headerColor: v })} />
          <ColorButton icon={<span className="cal-ico">T</span>} title="Title color" label="Title" color={st.titleColor} onPick={(v) => setStyle('Title Color', { titleColor: v })} />
        </Col>
        <Col>
          <ColorButton icon={<span className="cal-ico">1</span>} title="Date numbers" label="Numbers" color={st.numberColor} onPick={(v) => setStyle('Number Color', { numberColor: v })} />
          <ColorButton icon={<span className="cal-ico">#</span>} title="Grid lines" label="Lines" color={st.gridColor} onPick={(v) => setStyle('Line Color', { gridColor: v })}
            onNone={() => setStyle('No Lines', { gridWidth: 0 })} noneLabel="No Lines" />
          <ColorButton icon={<span className="cal-ico">▦</span>} title="Weekend boxes" label="Weekends" color={st.weekendFill} onPick={(v) => setStyle('Weekend Color', { weekendFill: v })}
            onNone={() => setStyle('No Weekend Color', { weekendFill: null })} noneLabel="Same as Other Days" />
        </Col>
        <Col>
          <ColorButton icon={<span className="cal-ico">□</span>} title="Box color" label="Boxes" color={st.cellFill} onPick={(v) => setStyle('Box Color', { cellFill: v })}
            onNone={() => setStyle('No Box Color', { cellFill: null })} noneLabel="No Color" />
          <ColorButton icon={<span className="cal-ico">•</span>} title="Text of birthdays and events" label="Date Text" color={st.eventColor} onPick={(v) => setStyle('Date Text Color', { eventColor: v })} />
          <SmallButton label="Line Weight" menu={(close) => (
            <>
              {[0, 0.5, 0.75, 1, 1.5, 2.25, 3].map((w) => (
                <MenuItem key={w} label={w === 0 ? 'No Lines' : `${w} pt`} checked={st.gridWidth === w} onClick={() => { setStyle('Line Weight', { gridWidth: w }); close() }} />
              ))}
            </>
          )} />
        </Col>
        <Col>
          <Row>
            <span className="ribbon-label">Title</span>
            <Combo title="Title font" value={st.titleFont} items={families} width={130}
              renderItem={(f) => <span style={{ fontFamily: `"${f}"`, fontSize: 14 }}>{f}</span>}
              onCommit={(f) => { ensureFont(f); setStyle('Title Font', { titleFont: f }) }} />
          </Row>
          <Row>
            <span className="ribbon-label">Text</span>
            <Combo title="Font for dates and day names" value={st.font} items={families} width={130}
              renderItem={(f) => <span style={{ fontFamily: `"${f}"`, fontSize: 14 }}>{f}</span>}
              onCommit={(f) => { ensureFont(f); setStyle('Calendar Font', { font: f }) }} />
          </Row>
          <label className="ribbon-check"><input type="checkbox" checked={st.titleBold} onChange={(e) => setStyle('Bold Title', { titleBold: e.target.checked })} /> Bold title</label>
        </Col>
      </RibbonGroup>
    </>
  )
}

/** Insert › Calendar. */
export function InsertCalendarButton() {
  const dialogs = useDialogs()
  const now = new Date()
  const next = now.getMonth() === 11 ? { year: now.getFullYear() + 1, month: 1 } : { year: now.getFullYear(), month: now.getMonth() + 2 }
  return (
    <BigButton icon={CalendarPlus} label="Calendar" color="#1f5fa8" menu={(close) => (
      <>
        <MenuHeader>Insert a Calendar</MenuHeader>
        <MenuItem label={`This Month (${MONTHS[now.getMonth()]})`} onClick={() => { cal.insertCalendar({ year: now.getFullYear(), month: now.getMonth() + 1 }); close() }} />
        <MenuItem label={`Next Month (${MONTHS[next.month - 1]})`} onClick={() => { cal.insertCalendar(next); close() }} />
        <MenuItem label="Year at a Glance" onClick={() => { cal.insertCalendar({ layout: 'year', year: now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear(), month: 1 }); close() }} />
        <MenuItem label="Birthdays by Month" onClick={() => { cal.insertCalendar({ layout: 'list', month: 1, eventKinds: ['birthday'], title: 'Our Birthdays' }); close() }} />
        <MenuSeparator />
        <MenuItem label="New Calendar Publication..." onClick={() => { dialogs.open('newCalendar'); close() }} />
        <MenuItem label="Calendar Dates..." onClick={() => { dialogs.open('calendarDates'); close() }} />
      </>
    )} />
  )
}

