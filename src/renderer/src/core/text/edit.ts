// Editing operations on a Story. Positions are (paragraph, character offset).

import type { CharStyle, ParaStyle, Paragraph, Run, Story } from '../model/types'
import type { TextPos } from './layout'
import { paragraphText, styleAt } from './layout'

export function comparePos(a: TextPos, b: TextPos): number {
  return a.para - b.para || a.offset - b.offset
}

export function orderRange(a: TextPos, b: TextPos): [TextPos, TextPos] {
  return comparePos(a, b) <= 0 ? [a, b] : [b, a]
}

function sameStyle(a: CharStyle, b: CharStyle): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/** Merge neighbouring runs with identical formatting and drop empty runs. */
export function normalizeParagraph(p: Paragraph): void {
  const out: Run[] = []
  for (const r of p.runs) {
    const prev = out.at(-1)
    if (r.text.length === 0) continue
    if (prev && sameStyle(prev.style, r.style)) prev.text += r.text
    else out.push(r)
  }
  // An empty paragraph keeps one empty run so it remembers its formatting.
  if (out.length === 0) out.push({ text: '', style: (p.runs[0] ?? p.runs.at(-1))!.style })
  p.runs = out
}

/** Split runs so that a run boundary exists at `offset`; returns the run index starting there. */
function splitAt(p: Paragraph, offset: number): number {
  let pos = 0
  for (let i = 0; i < p.runs.length; i++) {
    const r = p.runs[i]
    if (offset === pos) return i
    if (offset < pos + r.text.length) {
      const cut = offset - pos
      p.runs.splice(i, 1, { text: r.text.slice(0, cut), style: r.style }, { text: r.text.slice(cut), style: structuredClone(r.style) })
      return i + 1
    }
    pos += r.text.length
  }
  return p.runs.length
}

export function clampPos(story: Story, pos: TextPos): TextPos {
  const para = Math.max(0, Math.min(pos.para, story.paragraphs.length - 1))
  const len = paragraphText(story.paragraphs[para]).length
  return { para, offset: Math.max(0, Math.min(pos.offset, len)) }
}

/**
 * Insert text at pos. `style` is the formatting to type with (the caret's
 * pending style); defaults to the style at the caret. Newlines create
 * paragraphs. Returns the caret position after the inserted text.
 */
export function insertText(story: Story, pos: TextPos, text: string, style?: CharStyle): TextPos {
  pos = clampPos(story, pos)
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let cur = pos
  lines.forEach((line, i) => {
    if (i > 0) cur = splitParagraph(story, cur)
    if (line.length === 0) return
    const p = story.paragraphs[cur.para]
    const s = structuredClone(style ?? styleAt(p, cur.offset))
    const idx = splitAt(p, cur.offset)
    p.runs.splice(idx, 0, { text: line, style: s })
    normalizeParagraph(p)
    cur = { para: cur.para, offset: cur.offset + line.length }
  })
  return cur
}

/** Enter key: split the paragraph at pos. The new paragraph keeps the formatting. */
export function splitParagraph(story: Story, pos: TextPos): TextPos {
  pos = clampPos(story, pos)
  const p = story.paragraphs[pos.para]
  const caretStyle = styleAt(p, pos.offset)
  const idx = splitAt(p, pos.offset)
  const tail = p.runs.splice(idx)
  if (p.runs.length === 0) p.runs.push({ text: '', style: structuredClone(caretStyle) })
  const np: Paragraph = {
    runs: tail.length ? tail : [{ text: '', style: structuredClone(caretStyle) }],
    style: structuredClone(p.style) as ParaStyle
  }
  // A drop cap only belongs to the first paragraph.
  np.style.dropCap = null
  normalizeParagraph(p)
  normalizeParagraph(np)
  story.paragraphs.splice(pos.para + 1, 0, np)
  return { para: pos.para + 1, offset: 0 }
}

/** Delete the text between two positions. Returns the collapsed caret. */
export function deleteRange(story: Story, a: TextPos, b: TextPos): TextPos {
  let [from, to] = orderRange(clampPos(story, a), clampPos(story, b))
  if (comparePos(from, to) === 0) return from
  const first = story.paragraphs[from.para]
  const last = story.paragraphs[to.para]
  // If everything is deleted, keep the formatting of the first deleted character.
  const headStyle = styleAt(first, from.offset === 0 ? Math.min(1, paragraphText(first).length) : from.offset)
  const startIdx = splitAt(first, from.offset)
  const keepHead = first.runs.slice(0, startIdx)
  const endIdx = splitAt(last, to.offset)
  const keepTail = last.runs.slice(endIdx)
  first.runs = [...keepHead, ...keepTail]
  if (first.runs.length === 0) first.runs = [{ text: '', style: structuredClone(headStyle) }]
  story.paragraphs.splice(from.para + 1, to.para - from.para)
  normalizeParagraph(first)
  return from
}

export function deleteBackward(story: Story, pos: TextPos, byWord = false): TextPos {
  pos = clampPos(story, pos)
  if (pos.offset === 0) {
    if (pos.para === 0) return pos
    const prevLen = paragraphText(story.paragraphs[pos.para - 1]).length
    return deleteRange(story, { para: pos.para - 1, offset: prevLen }, pos)
  }
  const text = paragraphText(story.paragraphs[pos.para])
  const from = byWord ? wordStart(text, pos.offset) : prevCharBoundary(text, pos.offset)
  return deleteRange(story, { para: pos.para, offset: from }, pos)
}

export function deleteForward(story: Story, pos: TextPos, byWord = false): TextPos {
  pos = clampPos(story, pos)
  const text = paragraphText(story.paragraphs[pos.para])
  if (pos.offset >= text.length) {
    if (pos.para >= story.paragraphs.length - 1) return pos
    return deleteRange(story, pos, { para: pos.para + 1, offset: 0 })
  }
  const to = byWord ? wordEnd(text, pos.offset) : nextCharBoundary(text, pos.offset)
  return deleteRange(story, pos, { para: pos.para, offset: to })
}

// Surrogate-pair aware stepping (emoji etc.).
export function prevCharBoundary(text: string, offset: number): number {
  if (offset <= 0) return 0
  const c = text.charCodeAt(offset - 1)
  return c >= 0xdc00 && c <= 0xdfff && offset >= 2 ? offset - 2 : offset - 1
}

export function nextCharBoundary(text: string, offset: number): number {
  if (offset >= text.length) return text.length
  const c = text.charCodeAt(offset)
  return c >= 0xd800 && c <= 0xdbff ? offset + 2 : offset + 1
}

export function wordStart(text: string, offset: number): number {
  let i = offset
  while (i > 0 && /\s/.test(text[i - 1])) i--
  while (i > 0 && !/\s/.test(text[i - 1])) i--
  return i
}

export function wordEnd(text: string, offset: number): number {
  let i = offset
  while (i < text.length && !/\s/.test(text[i])) i++
  while (i < text.length && /\s/.test(text[i])) i++
  return i
}

/** Apply character formatting to a range. */
export function applyCharStyle(story: Story, a: TextPos, b: TextPos, patch: Partial<CharStyle>): void {
  const [from, to] = orderRange(clampPos(story, a), clampPos(story, b))
  for (let pi = from.para; pi <= to.para; pi++) {
    const p = story.paragraphs[pi]
    const len = paragraphText(p).length
    const s = pi === from.para ? from.offset : 0
    const e = pi === to.para ? to.offset : len
    if (len === 0) {
      // Empty paragraph: format its placeholder run so new typing uses it.
      p.runs[0].style = { ...p.runs[0].style, ...patch }
      continue
    }
    if (s >= e) continue
    const i0 = splitAt(p, s)
    const i1 = splitAt(p, e)
    for (let i = i0; i < i1; i++) p.runs[i].style = { ...p.runs[i].style, ...patch }
    normalizeParagraph(p)
  }
}

export function applyParaStyle(story: Story, a: TextPos, b: TextPos, patch: Partial<ParaStyle>): void {
  const [from, to] = orderRange(a, b)
  for (let pi = from.para; pi <= Math.min(to.para, story.paragraphs.length - 1); pi++) {
    story.paragraphs[pi].style = { ...story.paragraphs[pi].style, ...patch }
  }
}

/** Plain text of a range (for copy). */
export function textOfRange(story: Story, a: TextPos, b: TextPos): string {
  const [from, to] = orderRange(clampPos(story, a), clampPos(story, b))
  const parts: string[] = []
  for (let pi = from.para; pi <= to.para; pi++) {
    const t = paragraphText(story.paragraphs[pi])
    parts.push(t.slice(pi === from.para ? from.offset : 0, pi === to.para ? to.offset : t.length))
  }
  return parts.join('\n')
}

export function endOfStory(story: Story): TextPos {
  const para = story.paragraphs.length - 1
  return { para, offset: paragraphText(story.paragraphs[para]).length }
}

/**
 * Formatting shared by every character in a range (for showing the current
 * font/size on the ribbon). Mixed values come back as undefined.
 */
export function commonCharStyle(story: Story, a: TextPos, b: TextPos): Partial<CharStyle> {
  const [from, to] = orderRange(clampPos(story, a), clampPos(story, b))
  if (comparePos(from, to) === 0) return styleAt(story.paragraphs[from.para], from.offset)
  const styles: CharStyle[] = []
  for (let pi = from.para; pi <= to.para; pi++) {
    const p = story.paragraphs[pi]
    let pos = 0
    const s = pi === from.para ? from.offset : 0
    const e = pi === to.para ? to.offset : Infinity
    for (const r of p.runs) {
      const rs = pos, re = pos + r.text.length
      if (re > s && rs < e) styles.push(r.style)
      pos = re
    }
  }
  if (styles.length === 0) return styleAt(story.paragraphs[from.para], from.offset)
  const out: Partial<CharStyle> = { ...styles[0] }
  for (const st of styles.slice(1)) {
    for (const k of Object.keys(out) as Array<keyof CharStyle>) {
      if (JSON.stringify(out[k]) !== JSON.stringify(st[k])) delete out[k]
    }
  }
  return out
}
