// Calendar dialogs: Calendar Dates (birthdays, holidays and events, with
// loading and saving), New Calendar, and Change Year.

import { useEffect, useMemo, useRef, useState } from 'react'
import { editor as ed } from '@core/editor'
import * as cal from '@core/calendarCommands'
import {
  EVENT_KINDS, HOLIDAY_SETS, KIND_COLORS, KIND_LABELS, KIND_PLURALS, MONTHS, WEEKDAYS, daysInMonth, describeWhen, mergeEvents, sortEvents,
  type CalendarEvent, type DateRule, type EventKind
} from '@core/calendar/dates'
import { loadDatesFile, freshCopies } from '@core/calendar/files'
import { CALENDAR_DESIGNS, buildCalendarDocument, suggestedStart, type CalendarDesignId } from '@core/calendar/build'
import { CALENDAR_THEMES } from '@core/calendar/themes'
import { renderPage } from '@core/render/canvas'
import { TextEngine } from '@core/text/engine'
import { AssetStore } from '@core/assets'
import { platform } from '../../platform'
import { useEditor } from '../useEditor'
import { Dialog } from './DialogHost'
import { MenuItem, MenuSeparator, Popup } from '../ribbon/controls'

// ---------- Calendar Dates ----------

type WhenKind = 'date' | 'weekday' | 'easter'

interface Draft {
  title: string
  kind: EventKind
  when: WhenKind
  month: number
  day: number
  nth: 1 | 2 | 3 | 4 | 5 | -1
  weekday: number
  easterOffset: number
  repeat: 'yearly' | 'once'
  year: string
  showAge: boolean
  note: string
}

const thisYear = new Date().getFullYear()

const emptyDraft = (): Draft => ({
  title: '', kind: 'birthday', when: 'date', month: new Date().getMonth() + 1, day: 1, nth: 1, weekday: 0,
  easterOffset: 0, repeat: 'yearly', year: '', showAge: false, note: ''
})

function draftOf(ev: CalendarEvent): Draft {
  return {
    title: ev.title, kind: ev.kind,
    when: ev.rule?.type === 'easter' ? 'easter' : ev.rule?.type === 'nthWeekday' ? 'weekday' : 'date',
    month: ev.month, day: ev.day,
    nth: ev.rule?.type === 'nthWeekday' ? ev.rule.nth : 1,
    weekday: ev.rule?.type === 'nthWeekday' ? ev.rule.weekday : 0,
    easterOffset: ev.rule?.type === 'easter' ? ev.rule.offset : 0,
    repeat: ev.repeat, year: ev.year ? String(ev.year) : '', showAge: !!ev.showAge, note: ev.note ?? ''
  }
}

/** Turn the form into a date, or explain what's missing. */
function eventFromDraft(d: Draft): Omit<CalendarEvent, 'id'> | string {
  const title = d.title.trim()
  if (!title) return 'Type a name for the date (for example "Grandma’s birthday").'
  const year = d.year.trim() ? Math.round(Number(d.year)) : null
  if (year !== null && !(year >= 1 && year <= 9999)) return 'Enter a year such as 2015, or leave it empty.'
  if (d.repeat === 'once' && year === null) return 'A date that happens once needs a year.'
  let rule: DateRule | undefined
  if (d.when === 'weekday') rule = { type: 'nthWeekday', nth: d.nth, weekday: d.weekday }
  if (d.when === 'easter') rule = { type: 'easter', offset: Math.round(d.easterOffset) || 0 }
  if (rule && d.repeat === 'once') return 'Dates like “the 4th Thursday” repeat every year: choose Every year.'
  const day = Math.min(d.day, daysInMonth(year ?? 2024, d.month))
  const ev: Omit<CalendarEvent, 'id'> = { title, kind: d.kind, month: d.when === 'easter' ? 3 : d.month, day: rule ? 1 : day, repeat: d.repeat, year }
  if (rule) ev.rule = rule
  if (d.showAge && year && d.repeat === 'yearly') ev.showAge = true
  if (d.note.trim()) ev.note = d.note.trim()
  return ev
}

/** Calendar Dates: every birthday, holiday and event the publication's calendars show. */
export function CalendarDatesDialog({ onClose }: { onClose: () => void }) {
  useEditor()
  const events = cal.calendarEvents()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<EventKind | ''>('')
  const [message, setMessage] = useState<string[]>([])
  const [menu, setMenu] = useState<{ which: 'holidays' | 'load' | 'save'; el: HTMLElement } | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  // (The dates list is changed in place, so this is worked out on every render.)
  const listed = sortEvents(events).filter((e) =>
    (!kindFilter || e.kind === kindFilter) && (!search.trim() || e.title.toLowerCase().includes(search.trim().toLowerCase())))
  const set = (p: Partial<Draft>) => { setDraft({ ...draft, ...p }); setError('') }

  const startNew = () => { setEditing(null); setDraft({ ...emptyDraft(), kind: draft.kind, month: draft.month }); setError(''); nameRef.current?.focus() }
  const save = () => {
    const ev = eventFromDraft(draft)
    if (typeof ev === 'string') return setError(ev)
    if (editing) cal.updateEvent(editing, ev)
    else cal.addEvent(ev)
    setMessage([`${editing ? 'Saved' : 'Added'} “${ev.title}”.`])
    startNew()
  }
  const pick = (ev: CalendarEvent) => { setEditing(ev.id); setDraft(draftOf(ev)); setError('') }
  const remove = () => {
    if (!editing) return
    const ev = events.find((e) => e.id === editing)
    cal.deleteEvents([editing])
    setMessage([`Deleted “${ev?.title ?? ''}”. (Undo with Ctrl+Z after closing.)`])
    startNew()
  }
  const load = async (mode: 'add' | 'replace') => {
    setMenu(null)
    if (mode === 'replace' && events.length && !window.confirm(`Replace all ${events.length} dates with the dates in the file?`)) return
    try {
      const r = await cal.loadDates(mode)
      if (!r) return
      setMessage([
        r.total === 0 ? `No dates were found in ${r.fileName}.` : `Loaded ${r.added} date${r.added === 1 ? '' : 's'} from ${r.fileName}${r.added < r.total ? ` (${r.total - r.added} were already here)` : ''}.`,
        ...r.notes
      ])
    } catch (e) {
      setMessage([`Couldn’t read that file: ${(e as Error).message}`])
    }
  }
  const saveAs = async (format: cal.DatesFormat) => {
    setMenu(null)
    const path = await cal.saveDates(format)
    if (path) setMessage([`Saved ${events.length} dates to ${path}.`, format === 'rdcal' ? 'Next year, use Load Dates in the new calendar to bring them all back.' : ''].filter(Boolean))
  }
  const holidays = (id: string) => {
    setMenu(null)
    const set = HOLIDAY_SETS.find((s) => s.id === id)!
    const n = cal.addHolidaySet(id)
    setMessage([n ? `Added ${n} date${n === 1 ? '' : 's'}: ${set.name}.` : `${set.name} are already in the list.`])
  }

  // Enter in the form adds/saves the date instead of closing the dialog.
  const formKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') { e.stopPropagation(); e.preventDefault(); save() }
  }
  const days = daysInMonth(draft.repeat === 'once' && Number(draft.year) ? Number(draft.year) : 2024, draft.month)

  return (
    <Dialog title="Calendar Dates" okLabel="Close" onOk={onClose} onClose={onClose} width={860}>
      <div className="caldates-toolbar">
        <button className="btn" onClick={(e) => setMenu({ which: 'holidays', el: e.currentTarget })}>Add Holidays ▾</button>
        <button className="btn" onClick={(e) => setMenu({ which: 'load', el: e.currentTarget })}>Load Dates ▾</button>
        <button className="btn" disabled={!events.length} onClick={(e) => setMenu({ which: 'save', el: e.currentTarget })}>Save Dates ▾</button>
        <span className="muted caldates-count">{events.length} date{events.length === 1 ? '' : 's'} · every calendar in this publication shows them</span>
      </div>
      {menu && (
        <Popup anchor={menu.el} onClose={() => setMenu(null)}>
          {menu.which === 'holidays' && HOLIDAY_SETS.map((s) => <MenuItem key={s.id} label={`${s.name} — ${s.description}`} onClick={() => holidays(s.id)} />)}
          {menu.which === 'load' && (
            <>
              <MenuItem label="Add dates from a file…" onClick={() => load('add')} />
              <MenuItem label="Replace all dates with a file…" onClick={() => load('replace')} />
              <MenuSeparator />
              <div className="menu-note">Reads ReflectDesign dates (.rdcal), last year’s calendar (.rdx), iCalendar (.ics) from Google, Outlook or Apple Calendar, and spreadsheets (.csv) with a name and a date column.</div>
            </>
          )}
          {menu.which === 'save' && (Object.keys(cal.DATES_FORMATS) as cal.DatesFormat[]).map((f) => (
            <MenuItem key={f} label={cal.DATES_FORMATS[f].label} onClick={() => saveAs(f)} />
          ))}
        </Popup>
      )}
      {message.length > 0 && <div className="caldates-message">{message.map((m) => <div key={m}>{m}</div>)}</div>}
      <div className="caldates">
        <div className="caldates-list">
          <div className="caldates-filter">
            <input placeholder="Search names" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as EventKind | '')}>
              <option value="">All kinds</option>
              {EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_PLURALS[k]}</option>)}
            </select>
          </div>
          <div className="caldates-rows" role="listbox" aria-label="Dates">
            {listed.length === 0 && (
              <div className="caldates-empty muted">
                {events.length ? 'No dates match.' : <>No dates yet. Add birthdays and events on the right, use <b>Add Holidays</b>, or <b>Load Dates</b> from last year’s calendar.</>}
              </div>
            )}
            {listed.map((ev) => (
              <button key={ev.id} role="option" aria-selected={editing === ev.id} className={`caldates-row ${editing === ev.id ? 'sel' : ''}`} onClick={() => pick(ev)}>
                <span className="dot" style={{ background: ev.color || KIND_COLORS[ev.kind] }} />
                <span className="when">{describeWhen(ev)}</span>
                <span className="name">{ev.title}</span>
                <span className="kind muted">{KIND_LABELS[ev.kind]}{ev.repeat === 'once' ? ', once' : ''}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="caldates-form" onKeyDown={formKeys}>
          <h3>{editing ? 'Edit date' : 'Add a date'}</h3>
          <label className="field wide"><span>Name:</span><input ref={nameRef} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Grandma’s birthday" autoFocus /></label>
          <label className="field wide"><span>Kind:</span>
            <select value={draft.kind} onChange={(e) => {
              const kind = e.target.value as EventKind
              set({ kind, repeat: kind === 'event' || kind === 'reminder' ? draft.repeat : 'yearly' })
            }}>
              {EVENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="field wide"><span>Happens:</span>
            <select value={draft.when} onChange={(e) => set({ when: e.target.value as WhenKind, repeat: e.target.value === 'date' ? draft.repeat : 'yearly' })}>
              <option value="date">On a date</option>
              <option value="weekday">On a weekday of the month (e.g. 4th Thursday)</option>
              <option value="easter">Around Easter</option>
            </select>
          </label>
          {draft.when === 'date' && (
            <div className="field wide"><span>Date:</span>
              <select value={draft.month} onChange={(e) => set({ month: Number(e.target.value) })} aria-label="Month">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={Math.min(draft.day, days)} onChange={(e) => set({ day: Number(e.target.value) })} aria-label="Day" style={{ flex: '0 0 64px' }}>
                {Array.from({ length: days }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
          )}
          {draft.when === 'weekday' && (
            <div className="field wide"><span>The:</span>
              <select value={draft.nth} onChange={(e) => set({ nth: Number(e.target.value) as Draft['nth'] })} aria-label="Which" style={{ flex: '0 0 70px' }}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{['1st', '2nd', '3rd', '4th', '5th'][n - 1]}</option>)}
                <option value={-1}>Last</option>
              </select>
              <select value={draft.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} aria-label="Weekday">
                {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
              </select>
              <span className="of">of</span>
              <select value={draft.month} onChange={(e) => set({ month: Number(e.target.value) })} aria-label="Month">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          {draft.when === 'easter' && (
            <div className="field wide"><span>Days:</span>
              <input type="number" value={Math.abs(draft.easterOffset)} min={0} max={100} style={{ flex: '0 0 64px' }}
                onChange={(e) => set({ easterOffset: (draft.easterOffset < 0 ? -1 : 1) * Math.abs(Number(e.target.value) || 0) })} aria-label="Days" />
              <select value={draft.easterOffset < 0 ? 'before' : 'after'} onChange={(e) => set({ easterOffset: Math.abs(draft.easterOffset) * (e.target.value === 'before' ? -1 : 1) })}>
                <option value="before">before Easter Sunday</option>
                <option value="after">after Easter Sunday (0 = Easter)</option>
              </select>
            </div>
          )}
          <div className="field wide"><span>Repeats:</span>
            <label className="inline"><input type="radio" checked={draft.repeat === 'yearly'} onChange={() => set({ repeat: 'yearly' })} /> Every year</label>
            <label className="inline"><input type="radio" disabled={draft.when !== 'date'} checked={draft.repeat === 'once'} onChange={() => set({ repeat: 'once', year: draft.year || String(thisYear + 1) })} /> Only once</label>
          </div>
          <label className="field wide"><span>{draft.repeat === 'once' ? 'Year:' : draft.kind === 'birthday' ? 'Born in:' : 'Since:'}</span>
            <input value={draft.year} onChange={(e) => set({ year: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })} placeholder={draft.repeat === 'once' ? String(thisYear + 1) : 'optional'} style={{ flex: '0 0 90px' }} />
            {draft.repeat === 'yearly' && (draft.kind === 'birthday' || draft.kind === 'anniversary') && (
              <label className="inline"><input type="checkbox" checked={draft.showAge} disabled={!draft.year} onChange={(e) => set({ showAge: e.target.checked })} />
                {draft.kind === 'birthday' ? ' Show age (“turns 9”)' : ' Show years (“10 years”)'}</label>
            )}
          </label>
          <label className="field wide"><span>Note:</span><input value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="optional, not printed" /></label>
          {error && <div className="error">{error}</div>}
          <div className="caldates-actions">
            <button className="btn primary" onClick={save}>{editing ? 'Save Changes' : 'Add Date'}</button>
            {editing && <button className="btn" onClick={startNew}>New Date</button>}
            {editing && <button className="btn" onClick={remove}>Delete</button>}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ---------- New Calendar ----------

/** File › New › Calendars: pick a design, start month, look and dates. */
export function NewCalendarDialog({ onClose, design: initialDesign }: { onClose: () => void; design?: CalendarDesignId }) {
  const start = suggestedStart()
  const [design, setDesign] = useState<CalendarDesignId>(initialDesign ?? 'wall')
  const info = CALENDAR_DESIGNS.find((d) => d.id === design)!
  const [themeId, setThemeId] = useState(info.theme)
  const [year, setYear] = useState(String(start.year))
  const [month, setMonth] = useState(start.month)
  const [months, setMonths] = useState(12)
  const [weekStart, setWeekStart] = useState<0 | 1>(0)
  const [cover, setCover] = useState(true)
  const [sets, setSets] = useState<string[]>(design === 'birthdays' ? [] : ['us-federal'])
  const openDates = ed.doc.calendarData?.events ?? []
  const [useOpen, setUseOpen] = useState(openDates.length > 0)
  const [fileDates, setFileDates] = useState<{ name: string; events: CalendarEvent[]; notes: string[] } | null>(null)
  const [error, setError] = useState('')
  const y = Number(year)

  const events = useMemo(() => {
    const list: CalendarEvent[] = []
    if (useOpen) mergeEvents(list, openDates)
    if (fileDates) mergeEvents(list, fileDates.events)
    for (const id of sets) mergeEvents(list, HOLIDAY_SETS.find((s) => s.id === id)!.events())
    return list
  }, [useOpen, fileDates, sets])

  const opts = { design, themeId, year: y >= 1 && y <= 9999 ? y : start.year, month, months, weekStart, cover, events }
  const pickDesign = (d: CalendarDesignId) => {
    setDesign(d)
    setThemeId(CALENDAR_DESIGNS.find((x) => x.id === d)!.theme)
    if (d === 'birthdays') setSets([])
  }
  const loadFile = async () => {
    try {
      const f = await platform.openDatesFile()
      if (!f) return
      const r = await loadDatesFile(f.name, f.bytes)
      setFileDates({ name: f.name, events: freshCopies(r.events), notes: r.notes })
    } catch (e) {
      setError(`Couldn’t read that file: ${(e as Error).message}`)
    }
  }
  const ok = async () => {
    if (!(y >= 1 && y <= 9999)) return setError('Enter a year such as 2027.')
    onClose()
    await cal.newCalendarPublication(opts)
  }
  return (
    <Dialog title="New Calendar" okLabel="Create" onOk={ok} onClose={onClose} width={860}>
      <div className="newcal">
        <div className="newcal-options">
          <div className="newcal-designs" role="radiogroup" aria-label="Design">
            {CALENDAR_DESIGNS.map((d) => (
              <button key={d.id} role="radio" aria-checked={design === d.id} className={`newcal-design ${design === d.id ? 'sel' : ''}`} onClick={() => pickDesign(d.id)} title={d.description}>
                <b>{d.name}</b>
                <span className="muted">{d.description}</span>
              </button>
            ))}
          </div>
          <label className="field wide"><span>Colors:</span>
            <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              {CALENDAR_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="field wide"><span>{info.monthly ? 'Starts:' : design === 'birthdays' ? 'Ages in:' : 'Starts:'}</span>
            {design !== 'birthdays' && (
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Start month">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            )}
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} aria-label="Year" style={{ flex: '0 0 70px' }} />
          </div>
          {info.monthly && (
            <label className="field wide"><span>Months:</span>
              <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {[1, 3, 6, 12, 13, 18, 24].map((n) => <option key={n} value={n}>{n === 1 ? '1 month' : `${n} months`}</option>)}
              </select>
            </label>
          )}
          {design !== 'birthdays' && (
            <label className="field wide"><span>Week starts:</span>
              <select value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value) as 0 | 1)}>
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
              </select>
            </label>
          )}
          {design === 'wall' && <label className="check-line"><input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} /> Cover page</label>}
          <h3>Dates to show</h3>
          {openDates.length > 0 && (
            <label className="check-line"><input type="checkbox" checked={useOpen} onChange={(e) => setUseOpen(e.target.checked)} /> The {openDates.length} dates in the open publication</label>
          )}
          <div className="check-line">
            <button className="btn nowrap" onClick={loadFile}>Load Dates…</button>
            <span className="muted">{fileDates ? `${fileDates.events.length} dates from ${fileDates.name}` : 'From last year’s calendar, a dates file, a .ics calendar or a spreadsheet'}</span>
          </div>
          {fileDates?.notes.map((n) => <div key={n} className="warn">{n}</div>)}
          {HOLIDAY_SETS.map((s) => (
            <label key={s.id} className="check-line" title={s.description}>
              <input type="checkbox" checked={sets.includes(s.id)} onChange={(e) => setSets(e.target.checked ? [...sets, s.id] : sets.filter((x) => x !== s.id))} /> {s.name}
            </label>
          ))}
          <p className="muted">You can add birthdays and other dates any time: double-click a calendar.</p>
          {error && <div className="error">{error}</div>}
        </div>
        <CalendarPreview opts={opts} />
      </div>
    </Dialog>
  )
}

/** A live picture of the first page of the calendar being set up. */
function CalendarPreview({ opts }: { opts: Parameters<typeof buildCalendarDocument>[0] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify({ ...opts, events: opts.events.length })
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const doc = buildCalendarDocument({ ...opts, cover: false })
    const page = doc.pages[0]
    const { width, height } = doc.pageSetup
    const s = 340 / Math.max(width, height)
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(width * s * dpr)
    c.height = Math.round(height * s * dpr)
    c.style.width = `${Math.round(width * s)}px`
    c.style.height = `${Math.round(height * s)}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0)
    const text = new TextEngine(ed.measurer)
    renderPage(ctx, { doc, assets: new AssetStore(), text, pxPerPt: s * dpr, forOutput: true }, page)
  }, [key])
  return (
    <div className="newcal-preview">
      <canvas ref={ref} />
      <div className="muted">{opts.events.length} date{opts.events.length === 1 ? '' : 's'} included</div>
    </div>
  )
}

// ---------- Change Year ----------

export function ChangeCalendarDatesDialog({ onClose }: { onClose: () => void }) {
  const cals = cal.allCalendars()
  const first = cals.reduce<{ year: number; month: number } | null>((a, c) =>
    !a || c.year * 12 + c.month < a.year * 12 + a.month ? { year: c.year, month: c.month } : a, null) ?? suggestedStart()
  const [month, setMonth] = useState(first.month)
  const [year, setYear] = useState(String(first.year + 1))
  const [error, setError] = useState('')
  const ok = () => {
    const y = Number(year)
    if (!(y >= 1 && y <= 9999)) return setError('Enter a year such as 2027.')
    cal.changeCalendarDates(y, month)
    onClose()
  }
  return (
    <Dialog title="Change Calendar Dates" onOk={ok} onClose={onClose} width={460}>
      <p className="muted">Moves all {cals.length} calendar{cals.length === 1 ? '' : 's'} in this publication together. Birthdays and other yearly dates move with them; a cover title named “Calendar Year” is updated too.</p>
      <div className="field wide"><span>First month:</span>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input value={year} onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} aria-label="Year" style={{ flex: '0 0 70px' }} autoFocus />
      </div>
      {error && <div className="error">{error}</div>}
    </Dialog>
  )
}
