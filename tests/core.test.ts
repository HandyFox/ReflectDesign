import { describe, expect, it } from 'vitest'
import { makeDocument, makeShape, makeStory, makeTextBox } from '@core/model/factory'
import { bringForward, bringToFront, chainOf, group, sendBackward, sendToBack, setFrame, settleScratch, ungroup } from '@core/model/ops'
import { deleteBackward, deleteRange, insertText, splitParagraph, applyCharStyle, textOfRange } from '@core/text/edit'
import { layoutStory, paragraphText, type Measurer } from '@core/text/layout'
import { readPackage, writePackage } from '@core/io/rdx'
import { parseLength, formatLength } from '@core/model/units'

// Monospace fake: every char is 0.5em wide, ascent 0.8em, descent 0.2em.
const mono: Measurer = {
  measure: (t, s, f) => t.length * s.size * f * 0.5,
  metrics: (s, f) => ({ ascent: s.size * f * 0.8, descent: s.size * f * 0.2 })
}

function docWithShapes(n: number) {
  const doc = makeDocument()
  const ids = []
  for (let i = 0; i < n; i++) {
    const s = makeShape({ x: i * 10, y: 0, width: 10, height: 10 }, 'rect')
    doc.pages[0].objects.push(s)
    ids.push(s.id)
  }
  return { doc, ids }
}

describe('stacking order', () => {
  it('brings forward and sends backward one step', () => {
    const { doc, ids } = docWithShapes(3)
    bringForward(doc, [ids[0]])
    expect(doc.pages[0].objects.map((o) => o.id)).toEqual([ids[1], ids[0], ids[2]])
    sendBackward(doc, [ids[0]])
    expect(doc.pages[0].objects.map((o) => o.id)).toEqual(ids)
  })
  it('brings to front and sends to back', () => {
    const { doc, ids } = docWithShapes(3)
    bringToFront(doc, [ids[0]])
    expect(doc.pages[0].objects.at(-1)!.id).toBe(ids[0])
    sendToBack(doc, [ids[2]])
    expect(doc.pages[0].objects[0].id).toBe(ids[2])
  })
})

describe('groups', () => {
  it('groups and ungroups keeping order', () => {
    const { doc, ids } = docWithShapes(3)
    const g = group(doc, [ids[0], ids[1]])!
    expect(doc.pages[0].objects.map((o) => o.id)).toEqual([g.id, ids[2]])
    expect(g.width).toBe(20)
    ungroup(doc, g.id)
    expect(doc.pages[0].objects.map((o) => o.id)).toEqual(ids)
  })
  it('scales children when the group is resized', () => {
    const { doc, ids } = docWithShapes(2)
    const g = group(doc, ids)!
    setFrame(g, { x: 0, y: 0, width: 40, height: 20, rotation: 0 })
    expect(g.children[1].x).toBeCloseTo(20)
    expect(g.children[1].width).toBeCloseTo(20)
  })
})

describe('scratch area', () => {
  it('parks objects that are completely off the page', () => {
    const { doc, ids } = docWithShapes(1)
    doc.pages[0].objects[0].x = -100
    settleScratch(doc, doc.pages[0], ids)
    expect(doc.scratch.length).toBe(1)
    doc.scratch[0].x = 10
    settleScratch(doc, doc.pages[0], ids)
    expect(doc.pages[0].objects.length).toBe(1)
  })
})

describe('text editing', () => {
  it('inserts, splits and deletes', () => {
    const s = makeStory('Hello')
    let p = insertText(s, { para: 0, offset: 5 }, ' world')
    expect(paragraphText(s.paragraphs[0])).toBe('Hello world')
    p = splitParagraph(s, { para: 0, offset: 5 })
    expect(s.paragraphs.length).toBe(2)
    expect(paragraphText(s.paragraphs[1])).toBe(' world')
    p = deleteBackward(s, p)
    expect(s.paragraphs.length).toBe(1)
    expect(p).toEqual({ para: 0, offset: 5 })
  })
  it('applies formatting to a range and merges runs', () => {
    const s = makeStory('Bulletin Board')
    applyCharStyle(s, { para: 0, offset: 0 }, { para: 0, offset: 8 }, { bold: true })
    expect(s.paragraphs[0].runs.length).toBe(2)
    expect(s.paragraphs[0].runs[0].style.bold).toBe(true)
    applyCharStyle(s, { para: 0, offset: 0 }, { para: 0, offset: 14 }, { bold: true })
    expect(s.paragraphs[0].runs.length).toBe(1)
  })
  it('deletes across paragraphs', () => {
    const s = makeStory('one\ntwo\nthree')
    deleteRange(s, { para: 0, offset: 1 }, { para: 2, offset: 2 })
    expect(s.paragraphs.map(paragraphText)).toEqual(['oree'])
    expect(textOfRange(s, { para: 0, offset: 0 }, { para: 0, offset: 4 })).toBe('oree')
  })
})

describe('text layout', () => {
  it('wraps words to the box width', () => {
    const s = makeStory('aaaa bbbb cccc', { size: 10 })
    // inner width 50 = 10 chars of 5pt
    const box = makeTextBox({ x: 0, y: 0, width: 50, height: 200 }, s.id)
    box.margins = { top: 0, right: 0, bottom: 0, left: 0 }
    const l = layoutStory(s, [box], mono)
    expect(l.boxes[0].lines.length).toBe(2)
    expect(l.overflow).toBe(false)
  })
  it('flows overflow into a linked box', () => {
    const s = makeStory('one\ntwo\nthree\nfour', { size: 10 }, { spaceAfter: 0, lineSpacing: { mode: 'multiple', value: 1 } })
    const a = makeTextBox({ x: 0, y: 0, width: 100, height: 20 }, s.id)
    const b = makeTextBox({ x: 0, y: 0, width: 100, height: 20 }, s.id)
    for (const x of [a, b]) x.margins = { top: 0, right: 0, bottom: 0, left: 0 }
    a.nextId = b.id
    const l = layoutStory(s, [a, b], mono)
    expect(l.boxes[0].lines.length).toBe(2)
    expect(l.boxes[1].lines.length).toBe(2)
    expect(l.overflow).toBe(false)
    const l2 = layoutStory(s, [a], mono)
    expect(l2.overflow).toBe(true)
  })
  it('Best Fit grows text to fill the box', () => {
    const s = makeStory('HI', { size: 10 }, { spaceAfter: 0, lineSpacing: { mode: 'multiple', value: 1 } })
    const box = makeTextBox({ x: 0, y: 0, width: 100, height: 100 }, s.id)
    box.margins = { top: 0, right: 0, bottom: 0, left: 0 }
    box.autofit = 'bestFit'
    const l = layoutStory(s, [box], mono)
    // 2 chars × 0.5em ≤ 100 → size ≤ 100; height 1em ≤ 100 → 100pt → factor ≈ 10
    expect(l.sizeFactor).toBeGreaterThan(9.5)
    expect(l.sizeFactor).toBeLessThanOrEqual(10.01)
  })
  it('centres lines', () => {
    const s = makeStory('ab', { size: 10 }, { align: 'center' })
    const box = makeTextBox({ x: 0, y: 0, width: 100, height: 100 }, s.id)
    box.margins = { top: 0, right: 0, bottom: 0, left: 0 }
    const l = layoutStory(s, [box], mono)
    expect(l.boxes[0].lines[0].runs[0].x).toBeCloseTo(45)
  })
})

describe('chains', () => {
  it('orders linked boxes', () => {
    const doc = makeDocument()
    const s = makeStory('x')
    doc.stories[s.id] = s
    const a = makeTextBox({ x: 0, y: 0, width: 10, height: 10 }, s.id)
    const b = makeTextBox({ x: 0, y: 0, width: 10, height: 10 }, s.id)
    b.nextId = a.id
    doc.pages[0].objects.push(a, b)
    expect(chainOf(doc, s.id)).toEqual([b.id, a.id])
  })
})

describe('files', () => {
  it('round-trips a publication with a picture', async () => {
    const doc = makeDocument(24 * 72, 36 * 72)
    doc.assets['a1'] = { id: 'a1', name: 'star.png', mime: 'image/png', pixelWidth: 1, pixelHeight: 1 }
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    const out = await writePackage({ doc, assets: new Map([['a1', { info: doc.assets['a1'], bytes }]]) })
    const r = await readPackage(out)
    expect(r.doc.pageSetup.width).toBe(24 * 72)
    expect(Array.from(r.assets.get('a1')!.bytes)).toEqual(Array.from(bytes))
  })
})

describe('units', () => {
  it('parses lengths like Publisher', () => {
    expect(parseLength('8.5"', 'in')).toBe(612)
    expect(parseLength('2.54 cm', 'in')).toBeCloseTo(72)
    expect(parseLength('12pt', 'in')).toBe(12)
    expect(parseLength('3', 'in')).toBe(216)
    expect(parseLength('abc', 'in')).toBeNull()
    expect(formatLength(612, 'in')).toBe('8.5"')
  })
})

describe('text wrap', () => {
  it('flows text on both sides of an obstacle', () => {
    const s = makeStory('aaaa bbbb cccc dddd eeee ffff gggg hhhh', { size: 10 }, { spaceAfter: 0, lineSpacing: { mode: 'multiple', value: 1 } })
    const box = makeTextBox({ x: 0, y: 0, width: 200, height: 200 }, s.id)
    box.margins = { top: 0, right: 0, bottom: 0, left: 0 }
    // Block x 80..120 for the first 20pt.
    const l = layoutStory(s, [box], mono, (_id, top) => (top < 20 ? [[80, 120]] : []))
    const first = l.boxes[0].lines.filter((ln) => ln.top === 0)
    expect(first.length).toBe(2)
    expect(first[0].x).toBe(0)
    expect(first[1].x).toBe(120)
    expect(l.overflow).toBe(false)
  })
  it('skips bands that are blocked all the way across', () => {
    const s = makeStory('aaaa', { size: 10 }, { spaceAfter: 0, lineSpacing: { mode: 'multiple', value: 1 } })
    const box = makeTextBox({ x: 0, y: 0, width: 100, height: 100 }, s.id)
    box.margins = { top: 0, right: 0, bottom: 0, left: 0 }
    const l = layoutStory(s, [box], mono, (_id, top) => (top < 30 ? [[-1e9, 1e9]] : []))
    expect(l.boxes[0].lines[0].top).toBeGreaterThanOrEqual(30)
  })
})

describe('drop caps', () => {
  it('makes the first letter span several lines and indents them', () => {
    const s = makeStory('Once upon a time there was a very long sentence that wraps over several lines of text.', { size: 10 }, { spaceAfter: 0, lineSpacing: { mode: 'multiple', value: 1 }, dropCap: { lines: 3, chars: 1 } })
    const box = makeTextBox({ x: 0, y: 0, width: 120, height: 300 }, s.id)
    box.margins = { top: 0, right: 0, bottom: 0, left: 0 }
    const l = layoutStory(s, [box], mono)
    const lines = l.boxes[0].lines
    const drop = lines[0].runs.find((r) => r.dy !== undefined)!
    expect(drop.text).toBe('O')
    expect(drop.style.size).toBeGreaterThan(20)
    expect(lines[1].x).toBeGreaterThan(0) // indented beside the cap
    expect(lines[4].x).toBe(0) // past the cap
  })
})

describe('spell check', () => {
  it('finds misspelled words and suggests fixes', async () => {
    const { loadSpeller, misspelledIn, suggestions } = await import('@core/spell')
    await loadSpeller()
    const s = makeStory('Welcom to our clasroom, NASA and 2nd grade!')
    const bad = misspelledIn(s).map((w) => w.word)
    expect(bad).toEqual(['Welcom', 'clasroom'])
    expect(suggestions('clasroom')[0]).toBe('classroom')
    expect(suggestions('Thsi')[0]).toBe('This')
  }, 30000)
})
