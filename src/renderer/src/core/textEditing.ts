// Keyboard and mouse editing inside a text box.

import { editor as ed } from './editor'
import type { Id, TextBoxObject } from './model/types'
import { getObject } from './model/ops'
import {
  clampPos, comparePos, deleteBackward, deleteForward, deleteRange, endOfStory, insertText, nextCharBoundary,
  orderRange, prevCharBoundary, splitParagraph, textOfRange, wordEnd, wordStart
} from './text/edit'
import { caretRect, paragraphText, positionAt, styleAt, type TextPos } from './text/layout'
import { formatParagraph, formatText } from './commands'

export function startEditing(boxId: Id, pos?: TextPos): void {
  const box = getObject(ed.doc, boxId)
  if (!box || box.type !== 'text') return
  const story = ed.doc.stories[box.storyId]
  const caret = pos ? clampPos(story, pos) : endOfStory(story)
  ed.selection = [boxId]
  ed.editing = { boxId, storyId: box.storyId, caret, anchor: caret, pending: null, goalX: null }
  ed.touch()
}

export function stopEditing(): void {
  ed.editing = null
  ed.touch()
}

function story() {
  return ed.editing ? ed.doc.stories[ed.editing.storyId] : undefined
}

function hasRange(): boolean {
  const e = ed.editing
  return !!e && comparePos(e.anchor, e.caret) !== 0
}

function setCaret(pos: TextPos, extend: boolean, keepGoal = false): void {
  const e = ed.editing
  if (!e) return
  e.caret = pos
  if (!extend) e.anchor = pos
  if (!keepGoal) e.goalX = null
  e.pending = null
  followCaret()
  ed.touch()
}

/** When the caret moves into another linked box, that box becomes the active one. */
function followCaret(): void {
  const e = ed.editing
  if (!e) return
  const layout = ed.text.layout(ed.doc, e.storyId)
  if (!layout) return
  const r = caretRect(layout, e.caret, ed.measurer)
  if (r && r.boxId !== e.boxId) {
    e.boxId = r.boxId
    ed.selection = [r.boxId]
    // Switch pages if the box lives on another page.
    const idx = ed.doc.pages.findIndex((p) => containsId(p.objects, r.boxId))
    if (idx >= 0 && idx !== ed.pageIndex) {
      ed.pageIndex = idx
      ed.requestView('center')
    }
  }
}

function containsId(list: { id: string; type: string; children?: any[] }[], id: string): boolean {
  return list.some((o) => o.id === id || (o.type === 'group' && containsId(o.children ?? [], id)))
}

export function typeText(text: string): void {
  const e = ed.editing
  const s = story()
  if (!e || !s) return
  ed.change('Typing', (doc) => {
    const st = doc.stories[e.storyId]
    let pos = e.caret
    if (hasRange()) pos = deleteRange(st, e.anchor, e.caret)
    const base = styleAt(st.paragraphs[pos.para], pos.offset)
    const style = e.pending ? { ...base, ...e.pending } : undefined
    const after = insertText(st, pos, text, style)
    e.caret = after
    e.anchor = after
  }, `type:${e.storyId}`)
  e.goalX = null
  // Keep pending formatting for the rest of the word being typed.
  e.pending = null
  followCaret()
}

export function handleTextKey(ev: KeyboardEvent): boolean {
  const e = ed.editing
  const s = story()
  if (!e || !s) return false
  const ctrl = ev.ctrlKey || ev.metaKey
  const shift = ev.shiftKey
  const key = ev.key

  if (key === 'Escape') {
    // First Escape leaves text editing but keeps the box selected (Publisher).
    const id = e.boxId
    ed.editing = null
    ed.select([id])
    return true
  }

  if (ctrl && !ev.altKey) {
    switch (key.toLowerCase()) {
      case 'a': setRange({ para: 0, offset: 0 }, endOfStory(s)); return true
      case 'b': toggle('bold'); return true
      case 'i': toggle('italic'); return true
      case 'u': formatText('Underline', { underline: currentStyle().underline === 'none' ? 'single' : 'none' }); return true
      case 'c': copyText(); return true
      case 'x': copyText(); if (hasRange()) removeRange('Cut'); return true
      case 'v': return false // handled by the paste event
      case '=': formatText('Subscript', { baseline: currentStyle().baseline === 'subscript' ? 'normal' : 'subscript' }); return true
      case '+': formatText('Superscript', { baseline: currentStyle().baseline === 'superscript' ? 'normal' : 'superscript' }); return true
      case ']': formatText('Grow Font', { size: Math.min(1638, Math.round(currentStyle().size) + 1) }); return true
      case '[': formatText('Shrink Font', { size: Math.max(0.5, Math.round(currentStyle().size) - 1) }); return true
      case 'e': paraAlign('center'); return true
      case 'l': paraAlign('left'); return true
      case 'r': paraAlign('right'); return true
      case 'j': paraAlign('justify'); return true
    }
  }

  switch (key) {
    case 'Backspace':
      if (hasRange()) removeRange('Delete')
      else ed.change('Delete', (doc) => { const p = deleteBackward(doc.stories[e.storyId], e.caret, ctrl); e.caret = p; e.anchor = p }, `del:${e.storyId}`)
      followCaret()
      return true
    case 'Delete':
      if (hasRange()) removeRange('Delete')
      else ed.change('Delete', (doc) => { const p = deleteForward(doc.stories[e.storyId], e.caret, ctrl); e.caret = p; e.anchor = p }, `del:${e.storyId}`)
      return true
    case 'Enter':
      if (shift) { typeText(' '); return true } // line break within paragraph
      ed.change('New Paragraph', (doc) => {
        const st = doc.stories[e.storyId]
        let pos = e.caret
        if (hasRange()) pos = deleteRange(st, e.anchor, e.caret)
        const p = splitParagraph(st, pos)
        e.caret = p
        e.anchor = p
      })
      followCaret()
      return true
    case 'Tab':
      typeText('\t')
      return true
    case 'ArrowLeft': {
      if (hasRange() && !shift) { setCaret(orderRange(e.anchor, e.caret)[0], false); return true }
      setCaret(stepLeft(e.caret, ctrl), shift)
      return true
    }
    case 'ArrowRight': {
      if (hasRange() && !shift) { setCaret(orderRange(e.anchor, e.caret)[1], false); return true }
      setCaret(stepRight(e.caret, ctrl), shift)
      return true
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const p = vertical(key === 'ArrowUp' ? -1 : 1)
      if (p) setCaret(p, shift, true)
      return true
    }
    case 'Home': setCaret(ctrl ? { para: 0, offset: 0 } : lineEdge('start'), shift); return true
    case 'End': setCaret(ctrl ? endOfStory(s) : lineEdge('end'), shift); return true
  }
  return false
}

function currentStyle() {
  const e = ed.editing!
  const s = story()!
  const base = styleAt(s.paragraphs[e.caret.para], e.caret.offset)
  return { ...base, ...(e.pending ?? {}) }
}

function toggle(prop: 'bold' | 'italic'): void {
  formatText(prop === 'bold' ? 'Bold' : 'Italic', { [prop]: !currentStyle()[prop] })
}

function paraAlign(align: 'left' | 'center' | 'right' | 'justify'): void {
  formatParagraph('Align Text', { align })
}

function setRange(anchor: TextPos, caret: TextPos): void {
  const e = ed.editing!
  e.anchor = anchor
  e.caret = caret
  e.goalX = null
  ed.touch()
}

function removeRange(label: string): void {
  const e = ed.editing!
  ed.change(label, (doc) => {
    const p = deleteRange(doc.stories[e.storyId], e.anchor, e.caret)
    e.caret = p
    e.anchor = p
  })
}

function stepLeft(pos: TextPos, word: boolean): TextPos {
  const s = story()!
  if (pos.offset === 0) {
    if (pos.para === 0) return pos
    return { para: pos.para - 1, offset: paragraphText(s.paragraphs[pos.para - 1]).length }
  }
  const t = paragraphText(s.paragraphs[pos.para])
  return { para: pos.para, offset: word ? wordStart(t, pos.offset) : prevCharBoundary(t, pos.offset) }
}

function stepRight(pos: TextPos, word: boolean): TextPos {
  const s = story()!
  const t = paragraphText(s.paragraphs[pos.para])
  if (pos.offset >= t.length) {
    if (pos.para >= s.paragraphs.length - 1) return pos
    return { para: pos.para + 1, offset: 0 }
  }
  return { para: pos.para, offset: word ? wordEnd(t, pos.offset) : nextCharBoundary(t, pos.offset) }
}

function vertical(dir: -1 | 1): TextPos | null {
  const e = ed.editing!
  const layout = ed.text.layout(ed.doc, e.storyId)
  if (!layout) return null
  const r = caretRect(layout, e.caret, ed.measurer)
  if (!r) return null
  if (e.goalX === null) e.goalX = r.x
  // Find the next line in flow order (across columns and linked boxes).
  const lines = layout.boxes.flatMap((b) => b.lines.map((l) => ({ boxId: b.boxId, l })))
  const curIdx = lines.findIndex(({ boxId, l }) => boxId === r.boxId && Math.abs(l.top - r.top) < 0.01)
  const target = lines[curIdx + dir]
  if (!target) return dir < 0 ? { para: 0, offset: 0 } : endOfStory(story()!)
  return positionAt(layout, target.boxId, e.goalX, target.l.top + target.l.height / 2, ed.measurer)
}

function lineEdge(edge: 'start' | 'end'): TextPos {
  const e = ed.editing!
  const layout = ed.text.layout(ed.doc, e.storyId)
  if (!layout) return e.caret
  for (const b of layout.boxes) {
    for (const l of b.lines) {
      if (l.para === e.caret.para && e.caret.offset >= l.start && (e.caret.offset < l.end || l.last)) {
        if (edge === 'start') return { para: l.para, offset: l.start }
        const t = paragraphText(story()!.paragraphs[l.para]).slice(l.start, l.end)
        const trail = l.last ? 0 : (t.match(/\s+$/)?.[0].length ?? 0)
        return { para: l.para, offset: l.end - trail }
      }
    }
  }
  return e.caret
}

function copyText(): void {
  const e = ed.editing!
  if (!hasRange()) return
  const text = textOfRange(story()!, e.anchor, e.caret)
  navigator.clipboard?.writeText(text).catch(() => {})
}

export function pasteText(text: string): void {
  if (!ed.editing || !text) return
  typeText(text.replace(/ /g, ' '))
}

// ---------- mouse ----------

export function textPosAt(box: TextBoxObject, localX: number, localY: number): TextPos | null {
  const layout = ed.text.layout(ed.doc, box.storyId)
  if (!layout) return null
  const p = positionAt(layout, box.id, localX, localY, ed.measurer)
  if (p) return p
  // Empty box in a chain: put the caret at the end of the text so far.
  return endOfStory(ed.doc.stories[box.storyId])
}

export function selectWordAt(pos: TextPos): void {
  const e = ed.editing
  const s = story()
  if (!e || !s) return
  const t = paragraphText(s.paragraphs[pos.para])
  let a = pos.offset, b = pos.offset
  while (a > 0 && /\w/.test(t[a - 1])) a--
  while (b < t.length && /\w/.test(t[b])) b++
  while (b < t.length && t[b] === ' ') b++
  setRange({ para: pos.para, offset: a }, { para: pos.para, offset: b })
}

export function selectParagraphAt(pos: TextPos): void {
  const s = story()
  if (!s) return
  setRange({ para: pos.para, offset: 0 }, { para: pos.para, offset: paragraphText(s.paragraphs[pos.para]).length })
}

export function placeCaret(pos: TextPos, extend: boolean): void {
  setCaret(pos, extend)
}
