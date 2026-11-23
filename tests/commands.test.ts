// Editor-level regression tests (clipboard, formatting shortcuts, templates).
// The editor needs a few browser objects; minimal stand-ins are set up first.

import { beforeAll, describe, expect, it } from 'vitest'

const ctx2d = { measureText: (t: string) => ({ width: t.length * 5, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }), font: '' }
const g = globalThis as any
g.OffscreenCanvas = class { getContext() { return ctx2d } }
g.window = globalThis
// A canvas whose drawing calls do nothing (thumbnails are drawn when saving).
const noopCtx: any = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? ctx2d.measureText : () => noopCtx), set: () => true })
g.document = { title: '', createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx, toBlob: (cb: (b: Blob | null) => void) => cb(null) }) }
g.alert = (msg: string) => { throw new Error(`unexpected alert: ${msg}`) }

const saved: Array<{ name: string; bytes: Uint8Array }> = []
let unsavedAnswer: 'save' | 'discard' | 'cancel' = 'discard'
let datesFile: { name: string; bytes: Uint8Array } | null = null
const pdfs: Array<{ html: string; name: string }> = []
const exported: Array<{ name: string; bytes: Uint8Array }> = []
g.reflect = {
  platform: 'test',
  openDatesFile: async () => (datesFile ? { path: `/tmp/${datesFile.name}`, ...datesFile } : null),
  saveExport: async (bytes: Uint8Array, name: string) => { exported.push({ name, bytes }); return `/tmp/${name}` },
  exportPdf: async (html: string, name: string) => { pdfs.push({ html, name }); return `/tmp/${name}` },
  saveTemplate: async (bytes: Uint8Array, name: string) => { saved.push({ name, bytes }); return `/templates/${name}.rdt` },
  listTemplates: async () => saved.map((s) => ({ id: s.name, name: s.name, category: 'Personal', description: '', builtIn: false, path: '' })),
  askUnsaved: async () => unsavedAnswer,
  saveDocument: async () => '/tmp/x.rdx',
  setDirty: () => {},
  setTitle: () => {}
}

let ed: typeof import('@core/editor')['editor']
let cmd: typeof import('@core/commands')
let factory: typeof import('@core/model/factory')

beforeAll(async () => {
  ed = (await import('@core/editor')).editor
  cmd = await import('@core/commands')
  factory = await import('@core/model/factory')
})

/** A DataTransfer-like object for the paste checks. */
function dt(data: Record<string, string>): DataTransfer {
  return { types: Object.keys(data), getData: (t: string) => data[t] ?? '', files: [] } as unknown as DataTransfer
}

const textOf = (storyId: string) => ed.doc.stories[storyId].paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n')

describe('clipboard', () => {
  it('pasting does not undo edits made to the original box after copying', async () => {
    await cmd.newDocument()
    const box = cmd.insertTextBox({ x: 0, y: 0, width: 100, height: 50 }, 'ORIGINAL')
    ed.editing = null
    ed.select([box.id])
    cmd.copy()
    ed.change('edit', (doc) => { doc.stories[box.storyId].paragraphs[0].runs[0].text = 'EDITED' })
    cmd.paste()
    expect(textOf(box.storyId)).toBe('EDITED')
    const pasted = ed.selectedObjects[0]
    expect(pasted.type === 'text' && textOf(pasted.storyId)).toBe('ORIGINAL')
  })

  it('a picture pasted into another publication keeps its image', async () => {
    await cmd.newDocument()
    const info = { id: 'aPic1', name: 'p.png', mime: 'image/png', pixelWidth: 10, pixelHeight: 10 }
    ed.assets.put({ info, bytes: new Uint8Array([1, 2, 3]) })
    ed.change('pic', (doc) => { doc.assets[info.id] = info; ed.page.objects.push(factory.makePicture({ x: 0, y: 0, width: 10, height: 10 }, info.id)) })
    ed.select([ed.page.objects.at(-1)!.id])
    cmd.copy()
    ed.dirty = false
    await cmd.newDocument()
    expect(ed.assets.get(info.id)).toBeUndefined()
    cmd.paste()
    expect(ed.doc.assets[info.id]).toBeDefined()
    expect(ed.assets.get(info.id)?.bytes.length).toBe(3)
  })

  it('newer content copied in another app wins over our objects', async () => {
    await cmd.newDocument()
    const box = cmd.insertTextBox({ x: 0, y: 0, width: 100, height: 50 }, 'hello')
    ed.editing = null
    ed.select([box.id])
    cmd.copy()
    expect(cmd.clipboardIsOurs(dt({ 'text/plain': 'hello' }))).toBe(true)
    expect(cmd.clipboardIsOurs(dt({ 'text/plain': 'copied from the browser' }))).toBe(false)
    expect(cmd.clipboardIsOurs(dt({ [cmd.CLIP_MIME]: 'someone-else', 'text/plain': 'hello' }))).toBe(false)
    expect(cmd.clipboardIsOurs(dt({ 'image/png': '' }))).toBe(false)
  })
})

describe('formatting shortcuts', () => {
  it('Ctrl+B toggles bold on a selected text box', async () => {
    await cmd.newDocument()
    const box = cmd.insertTextBox({ x: 0, y: 0, width: 100, height: 50 }, 'bold me')
    ed.editing = null
    ed.select([box.id])
    cmd.toggleTextStyle('bold')
    expect(ed.doc.stories[box.storyId].paragraphs[0].runs[0].style.bold).toBe(true)
    cmd.toggleTextStyle('bold')
    expect(ed.doc.stories[box.storyId].paragraphs[0].runs[0].style.bold).toBe(false)
    cmd.toggleTextStyle('underline')
    cmd.toggleTextStyle('underline')
    expect(ed.doc.stories[box.storyId].paragraphs[0].runs[0].style.underline).toBe('none')
  })
})

describe('arranging', () => {
  it('Distribute leaves locked objects where they are', async () => {
    await cmd.newDocument()
    const ids: string[] = []
    ed.change('shapes', () => {
      for (const x of [0, 10, 300, 400]) {
        const s = factory.makeShape({ x, y: 0, width: 10, height: 10 }, 'rect')
        if (x === 10) s.locked = true
        ed.page.objects.push(s)
        ids.push(s.id)
      }
    })
    ed.select(ids)
    cmd.distribute('h')
    expect(ed.page.objects[1].x).toBe(10)
  })
})

describe('unsaved changes', () => {
  it('New asks first, and Cancel keeps the current publication', async () => {
    await cmd.newDocument()
    cmd.insertTextBox({ x: 0, y: 0, width: 100, height: 50 }, 'work in progress')
    const before = ed.doc
    unsavedAnswer = 'cancel'
    await cmd.newDocument()
    expect(ed.doc).toBe(before)
    unsavedAnswer = 'discard'
    await cmd.newDocument()
    expect(ed.doc).not.toBe(before)
  })
})

describe('New Blank Template', () => {
  it('creates a blank page of the chosen size, saves it as a template, and Save updates it', async () => {
    ed.dirty = false
    saved.length = 0
    const ok = await cmd.newBlankTemplate({ name: 'Spring Board', category: 'Bulletin Boards', description: '' }, 1728, 1296)
    expect(ok).toBe(true)
    expect(ed.doc.pageSetup.width).toBe(1728)
    expect(ed.templateMeta?.name).toBe('Spring Board')
    expect(saved.map((s) => s.name)).toEqual(['Spring Board'])
    expect(ed.dirty).toBe(false)
    expect(await cmd.personalTemplateNames()).toContain('Spring Board')

    cmd.insertTextBox({ x: 0, y: 0, width: 100, height: 50 }, 'Welcome')
    expect(await cmd.save()).toBe(true)
    expect(saved.length).toBe(2)
    expect(ed.filePath).toBeNull()
    expect(ed.dirty).toBe(false)

    // Opening something else leaves template mode.
    await cmd.newDocument()
    expect(ed.templateMeta).toBeNull()
  })
})

describe('greeting cards', () => {
  it('New card, turn it on its side, and back to a full page', async () => {
    const { CARD_PRESETS } = await import('@core/model/card')
    ed.dirty = false
    await cmd.newCard(CARD_PRESETS[0])
    expect(ed.doc.pages.map((p) => p.name)).toEqual(['Front', 'Inside Left', 'Inside Right', 'Back'])
    cmd.swapOrientation('landscape')
    expect(ed.doc.pageSetup.card?.fold).toBe('quarterTop')
    expect([ed.doc.pageSetup.width, ed.doc.pageSetup.height]).toEqual([396, 306])
    expect(ed.doc.pages[1].name).toBe('Inside Top')
    ed.undo()
    expect(ed.doc.pageSetup.card?.fold).toBe('quarterSide')
    ed.goToPage(3)
    cmd.deleteCurrentPage()
    cmd.addPage()
    expect(ed.doc.pages.map((p) => p.name)).toEqual(['Front', 'Inside Left', 'Inside Right', 'Back'])
    cmd.setPlainPageSize(612, 792)
    expect(ed.doc.pageSetup.card).toBeUndefined()
    expect(ed.doc.pages[0].name).toBe('')
  })
})

describe('calendars', () => {
  it('builds every calendar design with the chosen dates', async () => {
    const { CALENDAR_DESIGNS, buildCalendarDocument } = await import('@core/calendar/build')
    const { HOLIDAY_SETS } = await import('@core/calendar/dates')
    for (const d of CALENDAR_DESIGNS) {
      const doc = buildCalendarDocument({ design: d.id, themeId: d.theme, year: 2027, month: 1, months: 12, weekStart: 0, cover: true, events: HOLIDAY_SETS[0].events() })
      const cals = doc.pages.flatMap((p) => p.objects).filter((o) => o.type === 'calendar')
      expect(cals.length).toBeGreaterThan(0)
      expect(doc.calendarData!.events).toHaveLength(11)
      if (d.id === 'wall') expect(doc.pages.map((p) => p.name).slice(0, 3)).toEqual(['Cover', 'January 2027', 'February 2027'])
      if (d.monthly) expect(doc.pages.filter((p) => p.name !== 'Cover')).toHaveLength(12)
    }
  })

  it('Change Year moves every calendar, the cover year and the page names', async () => {
    const cal = await import('@core/calendarCommands')
    ed.dirty = false
    await cal.newCalendarPublication({ design: 'wall', themeId: 'classic', year: 2026, month: 9, months: 12, weekStart: 0, cover: true, events: [] })
    const cover = ed.doc.pages[0].objects.find((o) => o.name === 'Calendar Year')!
    const yearText = () => cover.type === 'text' ? ed.doc.stories[cover.storyId].paragraphs[0].runs[0].text : ''
    expect(yearText()).toBe('2026–2027')
    cal.changeCalendarDates(2027, 9)
    expect(yearText()).toBe('2027–2028')
    expect(ed.doc.pages[1].name).toBe('September 2027')
    expect(ed.doc.pages[12].name).toBe('August 2028')
    const months = cal.allCalendars().filter((c) => c.layout === 'month').map((c) => `${c.year}-${c.month}`)
    expect(months[0]).toBe('2027-9')
    expect(months[11]).toBe('2028-8')
    ed.undo()
    expect(ed.doc.pages[1].name).toBe('September 2026')
  })

  it('dates: add, edit, holidays, save to a file, load it into next year’s calendar', async () => {
    const cal = await import('@core/calendarCommands')
    ed.dirty = false
    await cmd.newDocument()
    const c = cal.insertCalendar({ year: 2026, month: 11 })
    expect(ed.selection).toEqual([c.id])
    const ev = cal.addEvent({ title: 'Grandma', kind: 'birthday', month: 11, day: 12, repeat: 'yearly', year: 1950, showAge: true })
    cal.updateEvent(ev.id, { title: 'Grandma Rose', kind: 'birthday', month: 11, day: 12, repeat: 'yearly', year: 1950, showAge: true })
    expect(cal.addHolidaySet('us-federal')).toBe(11)
    expect(cal.addHolidaySet('us-federal')).toBe(0)
    expect(cal.calendarEvents()).toHaveLength(12)
    exported.length = 0
    await cal.saveDates('rdcal')
    expect(exported[0].name).toMatch(/dates\.rdcal$/)

    // Next year: a fresh calendar loads the saved file.
    ed.dirty = false
    await cmd.newDocument()
    cal.insertCalendar({ year: 2027, month: 11 })
    datesFile = { name: 'family dates.rdcal', bytes: exported[0].bytes }
    const r = await cal.loadDates('add')
    expect(r!.added).toBe(12)
    expect(cal.calendarEvents().find((e) => e.title === 'Grandma Rose')?.year).toBe(1950)
    // Loading again adds nothing new; Replace swaps the list.
    expect((await cal.loadDates('add'))!.added).toBe(0)
    datesFile = { name: 'class.csv', bytes: new TextEncoder().encode('Name,Birthday\nAva,9/3\n') }
    await cal.loadDates('replace')
    expect(cal.calendarEvents().map((e) => e.title)).toEqual(['Ava'])
    cal.deleteEvents([cal.calendarEvents()[0].id])
    expect(cal.calendarEvents()).toHaveLength(0)
    ed.undo()
    expect(cal.calendarEvents()).toHaveLength(1)
  })

  it('calendar settings change only the selected calendars, and Next steps across the year end', async () => {
    const cal = await import('@core/calendarCommands')
    ed.dirty = false
    await cmd.newDocument()
    const a = cal.insertCalendar({ year: 2026, month: 12 })
    cal.insertCalendar({ year: 2026, month: 6 })
    ed.select([a.id])
    cal.stepCalendar(1)
    cal.setCalendarStyle('Bar Color', { headerFill: '#FF0000' })
    const [first, second] = cal.allCalendars()
    expect([first.year, first.month, first.style.headerFill]).toEqual([2027, 1, '#FF0000'])
    expect(second.style.headerFill).not.toBe('#FF0000')
  })
})

describe('exporting on smaller paper', () => {
  it('a 24 × 36" poster exports as a guide page plus one page per sheet', async () => {
    const ex = await import('@core/export')
    const { paperById } = await import('@core/poster')
    ed.dirty = false
    await cmd.newDocument(24 * 72, 36 * 72)
    cmd.insertTextBox({ x: 72, y: 72, width: 1500, height: 300 }, 'BIG TITLE')
    const tabloid = paperById('tabloid')!
    const o = { ...ex.defaultSheetOptions('poster'), paper: { name: tabloid.name, width: tabloid.width, height: tabloid.height } }
    const sum = ex.sheetSummary(o)
    pdfs.length = 0
    await ex.exportPdf(o)
    const pages = (pdfs[0].html.match(/class="sheet"/g) ?? []).length
    expect(pages).toBe(sum.sheets)
    expect(pages).toBe(sum.plan!.cols * sum.plan!.rows + 1)
    expect(pdfs[0].name).toMatch(/\(\d+ sheets, Tabloid \/ Ledger\)\.pdf$/)
    // Fit on one sheet, and the design's own size, still work.
    pdfs.length = 0
    await ex.exportPdf({ ...o, layout: 'fit' })
    await ex.exportPdf({ ...o, layout: 'design' })
    expect(pdfs.map((p) => (p.html.match(/class="sheet"/g) ?? []).length)).toEqual([1, 1])
  })
})
