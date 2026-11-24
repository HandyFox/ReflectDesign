// Regression tests for the fixes listed in CHANGELOG.md (2026-11-21).

import { describe, expect, it } from 'vitest'
import { makeDocument, makeGroup, makeShape, makeStory, makeTextBox } from '@core/model/factory'
import { chainOf, cloneObjects, deletePage, duplicatePage, insertPage } from '@core/model/ops'
import type { TextBoxObject } from '@core/model/types'
import { buildWrapFn } from '@core/text/wrap'
import { layoutStory, type Measurer } from '@core/text/layout'
import { TextEngine } from '@core/text/engine'
import { pageToSvg, sheetsToHtml } from '@core/render/svg'
import { migrate } from '@core/io/migrate'
import { safeFileName } from '../src/main/atomic'

const mono: Measurer = {
  measure: (t, s, f) => t.length * s.size * f * 0.5,
  metrics: (s, f) => ({ ascent: s.size * f * 0.8, descent: s.size * f * 0.2 })
}

const noAssets = { get: () => undefined } as any

function linkedPair() {
  const doc = makeDocument()
  const story = makeStory('one two three four five six seven eight nine ten eleven twelve')
  doc.stories[story.id] = story
  const a = makeTextBox({ x: 0, y: 0, width: 60, height: 30 }, story.id)
  const b = makeTextBox({ x: 100, y: 0, width: 60, height: 300 }, story.id)
  a.nextId = b.id
  doc.pages[0].objects.push(a, b)
  return { doc, story, a, b }
}

describe('copying linked text boxes', () => {
  it('Duplicate Page keeps the copied boxes linked, sharing one new story', () => {
    const { doc, story } = linkedPair()
    duplicatePage(doc, 0)
    const [a2, b2] = doc.pages[1].objects as TextBoxObject[]
    expect(a2.nextId).toBe(b2.id)
    expect(a2.storyId).toBe(b2.storyId)
    expect(a2.storyId).not.toBe(story.id)
    // The second copy continues the text instead of starting it again.
    const l = new TextEngine(mono).layout(doc, a2.storyId)!
    expect(l.boxes[1].lines[0].start).toBeGreaterThan(0)
  })

  it('a box copied without its neighbours gets its own unlinked story', () => {
    const { doc, story, b } = linkedPair()
    const [copy] = cloneObjects(doc, [b]) as TextBoxObject[]
    expect(copy.nextId).toBeNull()
    expect(copy.storyId).not.toBe(story.id)
  })

  it('reads text from the given source and never writes to it', () => {
    const { doc, a } = linkedPair()
    const clip = { [a.storyId]: structuredClone(doc.stories[a.storyId]) }
    clip[a.storyId].paragraphs[0].runs[0].text = 'FROM CLIPBOARD'
    const before = doc.stories[a.storyId].paragraphs[0].runs[0].text
    const [copy] = cloneObjects(doc, [a], clip) as TextBoxObject[]
    expect(doc.stories[copy.storyId].paragraphs[0].runs[0].text).toBe('FROM CLIPBOARD')
    expect(doc.stories[a.storyId].paragraphs[0].runs[0].text).toBe(before)
  })
})

describe('Delete Page', () => {
  it('joins a chain around the deleted page', () => {
    const { doc, story, a, b } = linkedPair()
    doc.pages[0].objects.pop()
    insertPage(doc, 1); insertPage(doc, 2)
    doc.pages[1].objects.push(b)
    const c = makeTextBox({ x: 0, y: 0, width: 60, height: 300 }, story.id)
    b.nextId = c.id
    doc.pages[2].objects.push(c)
    deletePage(doc, 1)
    expect(a.nextId).toBe(c.id)
    expect(chainOf(doc, story.id)).toEqual([a.id, c.id])
  })
})

describe('text wrap', () => {
  it('a picture grouped with the text box still wraps the text', () => {
    const doc = makeDocument()
    const story = makeStory('x')
    doc.stories[story.id] = story
    const box = makeTextBox({ x: 0, y: 0, width: 200, height: 200 }, story.id)
    const pic = makeShape({ x: 0, y: 0, width: 100, height: 100 }, 'rect')
    pic.wrap.mode = 'square'
    doc.pages[0].objects = [makeGroup([box, pic])]
    expect(buildWrapFn(doc, [box], undefined)).toBeDefined()
  })

  it('an object grouped *behind* the text box does not wrap it', () => {
    const doc = makeDocument()
    const story = makeStory('x')
    doc.stories[story.id] = story
    const box = makeTextBox({ x: 0, y: 0, width: 200, height: 200 }, story.id)
    const pic = makeShape({ x: 0, y: 0, width: 100, height: 100 }, 'rect')
    pic.wrap.mode = 'square'
    doc.pages[0].objects = [makeGroup([pic, box])]
    expect(buildWrapFn(doc, [box], undefined)).toBeUndefined()
  })

  it('Middle vertical alignment still works with a wrapping object on the box', () => {
    const doc = makeDocument()
    const story = makeStory('hi')
    doc.stories[story.id] = story
    const box = makeTextBox({ x: 0, y: 0, width: 300, height: 300 }, story.id)
    box.vAlign = 'middle'
    doc.pages[0].objects.push(box)
    const plain = layoutStory(story, [box], mono).boxes[0].lines[0].top
    const far = makeShape({ x: 250, y: 250, width: 40, height: 40 }, 'rect')
    far.wrap.mode = 'square'
    doc.pages[0].objects.push(far)
    const wrapped = layoutStory(story, [box], mono, buildWrapFn(doc, [box], undefined)).boxes[0].lines[0].top
    expect(wrapped).toBeCloseTo(plain, 1)
  })
})

describe('PDF / print SVG', () => {
  function twoPagesWithGradients() {
    const doc = makeDocument()
    insertPage(doc, 1)
    for (const [i, color] of [[0, '#ff0000'], [1, '#0000ff']] as const) {
      const s = makeShape({ x: 0, y: 0, width: 50, height: 50 }, 'rect')
      s.fill = { type: 'linear', angle: 0, stops: [{ offset: 0, color, opacity: 1 }, { offset: 1, color: '#ffffff', opacity: 1 }] }
      doc.pages[i].objects.push(s)
    }
    return doc
  }

  it('pages never share gradient/filter ids', () => {
    const doc = twoPagesWithGradients()
    const env = { doc, assets: noAssets, text: new TextEngine(mono) }
    const ids = doc.pages.flatMap((p) => [...pageToSvg(env, p).svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('values from the file cannot inject markup', () => {
    const doc = makeDocument()
    const s = makeShape({ x: 0, y: 0, width: 50, height: 50 }, 'rect')
    s.fill = { type: 'solid', color: '"/><script>alert(1)</script><x a="', opacity: '"><b>' as any }
    s.stroke.color = '"><script>x</script>'
    doc.pages[0].objects.push(s)
    const d2 = migrate(JSON.parse(JSON.stringify(doc)))
    const env = { doc: d2, assets: noAssets, text: new TextEngine(mono) }
    const svg = pageToSvg(env, d2.pages[0]).svg
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('<b>')
  })

  it('print pages block scripts', () => {
    expect(sheetsToHtml([{ svg: '<svg/>', width: 10, height: 10 }])).toContain("script-src 'none'")
  })

  it('dotted, dash and wave underlines print as they look on screen', () => {
    for (const underline of ['dotted', 'dash', 'wave'] as const) {
      const doc = makeDocument()
      const story = makeStory('underlined words here', { underline, size: 20 })
      doc.stories[story.id] = story
      doc.pages[0].objects.push(makeTextBox({ x: 0, y: 0, width: 400, height: 100 }, story.id))
      const svg = pageToSvg({ doc, assets: noAssets, text: new TextEngine(mono) }, doc.pages[0]).svg
      if (underline === 'wave') expect(svg).toContain('<polyline')
      else expect((svg.match(/<rect /g) ?? []).length).toBeGreaterThan(5)
    }
  })
})

describe('export file names', () => {
  it('turns slashes into dashes, so "Tabloid / Ledger" is not read as a folder', () => {
    expect(safeFileName('Publication1 (5 sheets, Tabloid / Ledger).pdf')).toBe('Publication1 (5 sheets, Tabloid-Ledger).pdf')
    expect(safeFileName('a\\b:c?.png')).toBe('a-b-c-.png')
    expect(safeFileName('Birthday Card (two-sided, fold in half).pdf')).toBe('Birthday Card (two-sided, fold in half).pdf')
    expect(safeFileName('..')).toBe('Untitled')
  })
})
