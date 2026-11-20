// Text layout: flows a story through its chain of linked text boxes.
//
// Measuring is delegated to a Measurer so the same layout code runs with the
// interim Canvas measurer (M1) and the HarfBuzz shaper (M2), and in tests.

import type { CharStyle, ParaAlign, Paragraph, Story, TextBoxObject } from '../model/types'

export interface FontMetrics {
  ascent: number // points, positive
  descent: number // points, positive
}

export interface Measurer {
  /** Advance width of `text` in points, including tracking and scaling. */
  measure(text: string, style: CharStyle, sizeFactor: number): number
  metrics(style: CharStyle, sizeFactor: number): FontMetrics
}

export interface TextPos {
  para: number
  offset: number
}

export interface LaidRun {
  text: string
  style: CharStyle
  /** Bullet or number drawn in front of a paragraph; not part of the text. */
  marker?: boolean
  /** Offset of this run's first char within the paragraph. */
  start: number
  x: number // relative to the box's left edge
  width: number
}

export interface LaidLine {
  para: number
  start: number
  end: number // exclusive; includes trailing spaces
  /** Line ends the paragraph. */
  last: boolean
  align: ParaAlign
  x: number // left of the line's content box
  maxWidth: number
  width: number
  baseline: number // relative to the box's top edge
  top: number
  height: number
  ascent: number
  descent: number
  /** Extra space added to each space character (justify). */
  spaceExtra: number
  runs: LaidRun[]
}

export interface BoxLayout {
  boxId: string
  lines: LaidLine[]
}

export interface StoryLayout {
  storyId: string
  boxes: BoxLayout[]
  /** Text didn't fit in the last box of the chain. */
  overflow: boolean
  /** Font size multiplier chosen by Best Fit / Shrink On Overflow. */
  sizeFactor: number
  /** Height the content needs in the first box (for Grow Text Box to Fit). */
  neededHeight: number
}

export function paragraphText(p: Paragraph): string {
  return p.runs.map((r) => r.text).join('')
}

/**
 * Style for a caret at `offset`: the style of the character before it, like
 * Word and Publisher (at the very start, the first character's style).
 */
export function styleAt(p: Paragraph, offset: number): CharStyle {
  let pos = 0
  for (const r of p.runs) {
    if (r.text.length > 0 && offset > pos && offset <= pos + r.text.length) return r.style
    pos += r.text.length
  }
  return (p.runs.find((r) => r.text.length > 0) ?? p.runs[0]).style
}

interface Piece {
  text: string
  style: CharStyle
  start: number
  width: number
  /** A line may break after this piece. */
  breakAfter: boolean
  isSpace: boolean
  /** Line break (Shift+Enter): always ends the line. */
  hard: boolean
}

function pieces(p: Paragraph, m: Measurer, f: number): Piece[] {
  const out: Piece[] = []
  let offset = 0
  for (const run of p.runs) {
    const re = /(\u2028|[^\S\u2028]+|[^\s-]+-?|-)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(run.text))) {
      const text = match[0]
      const hard = text === '\u2028'
      const isSpace = /^\s+$/.test(text)
      out.push({
        text,
        style: run.style,
        start: offset + match.index,
        width: hard ? 0 : m.measure(displayText(text, run.style), run.style, f),
        breakAfter: isSpace || text.endsWith('-'),
        isSpace,
        hard
      })
    }
    offset += run.text.length
  }
  return out
}

export function displayText(text: string, style: CharStyle): string {
  // Tabs render as a fixed gap until tab stops arrive (M3); line breaks are invisible.
  const t = text.replace(/\u2028/g, '').replace(/\t/g, '\u2003\u2003')
  return style.caps === 'allCaps' ? t.toUpperCase() : t
}

function toRoman(n: number): string {
  const map: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let out = ''
  for (const [v, r] of map) while (n >= v) { out += r; n -= v }
  return out
}

/** Text of a paragraph's bullet or number ('' when none). */
export function markerText(story: Story, pi: number): string {
  const b = story.paragraphs[pi].style.bullet
  if (b.kind === 'none') return ''
  if (b.kind === 'bullet') return b.char
  // Count back through consecutive numbered paragraphs.
  let n = b.start
  for (let i = pi - 1; i >= 0 && story.paragraphs[i].style.bullet.kind === 'number'; i--) n++
  switch (b.format) {
    case '1.': return `${n}.`
    case 'a.': return `${String.fromCharCode(96 + (((n - 1) % 26) + 1))}.`
    case 'A.': return `${String.fromCharCode(64 + (((n - 1) % 26) + 1))}.`
    case 'i.': return `${toRoman(n)}.`
    case 'I.': return `${toRoman(n).toUpperCase()}.`
  }
}

interface Area {
  boxId: string
  left: number
  top: number
  width: number
  height: number
}

/** Column rectangles of a box, relative to the box. */
export function contentAreas(box: TextBoxObject): Area[] {
  const { margins, columns, columnGap } = box
  const innerW = Math.max(1, box.width - margins.left - margins.right)
  const innerH = Math.max(1, box.height - margins.top - margins.bottom)
  const n = Math.max(1, columns)
  const colW = Math.max(1, (innerW - columnGap * (n - 1)) / n)
  return Array.from({ length: n }, (_, i) => ({
    boxId: box.id,
    left: margins.left + i * (colW + columnGap),
    top: margins.top,
    width: colW,
    height: innerH
  }))
}

interface FlowResult {
  boxes: BoxLayout[]
  overflow: boolean
  /** A word had to be split mid-word because it was wider than the column. */
  brokeWord: boolean
  neededHeight: number
}

function flow(story: Story, chain: TextBoxObject[], m: Measurer, f: number, unlimitedFirst = false): FlowResult {
  const areas: Area[] = []
  for (const [i, b] of chain.entries()) {
    for (const a of contentAreas(b)) areas.push(unlimitedFirst && i === 0 ? { ...a, height: 1e7 } : a)
  }
  const boxes: BoxLayout[] = chain.map((b) => ({ boxId: b.id, lines: [] }))
  let areaIdx = 0
  let y = areas[0]?.top ?? 0
  let brokeWord = false
  let neededHeight = 0

  type Pending = Omit<LaidLine, 'top' | 'baseline' | 'x' | 'maxWidth'>
  const place = (line: Pending, indent: number, indentRight: number, spaceBefore: number): boolean => {
    while (areaIdx < areas.length) {
      const a = areas[areaIdx]
      const top = y === a.top ? y : y + spaceBefore
      if (top + line.height <= a.top + a.height + 0.01) {
        const boxIndex = chain.findIndex((b) => b.id === a.boxId)
        const laid: LaidLine = {
          ...line,
          x: a.left + indent,
          maxWidth: a.width - indent - indentRight,
          top,
          baseline: top + (line.height - line.ascent - line.descent) / 2 + line.ascent
        }
        boxes[boxIndex].lines.push(laid)
        y = top + line.height
        if (boxIndex === 0) neededHeight = Math.max(neededHeight, y)
        return true
      }
      areaIdx++
      y = areas[areaIdx]?.top ?? 0
    }
    return false
  }

  let overflow = false
  outer: for (let pi = 0; pi < story.paragraphs.length; pi++) {
    const para = story.paragraphs[pi]
    const ps = para.style
    const all = pieces(para, m, f)
    const firstStyle = para.runs[0]?.style
    let i = 0
    let firstLine = true
    const marker = markerText(story, pi)
    do {
      const area = areas[Math.min(areaIdx, areas.length - 1)]
      if (!area) { overflow = true; break outer }
      // With a bullet, the marker hangs at the first-line indent and text starts at the left indent.
      const indent = ps.indentLeft + (firstLine && !marker ? ps.indentFirst : 0)
      const maxW = Math.max(1, area.width - indent - ps.indentRight)
      // Greedy line fill.
      let w = 0
      let j = i
      let lastBreak = -1
      let widthAtBreak = 0
      while (j < all.length) {
        const pc = all[j]
        if (!pc.isSpace && w + pc.width > maxW && j > i) break
        if (!pc.isSpace && pc.width > maxW && j === i) {
          brokeWord = true
          const split = splitWord(pc, maxW, m, f)
          if (split.length > 1) {
            // A single word wider than the column: split it by characters.
            all.splice(j, 1, ...split)
            continue
          }
          // A single character wider than the column: place it anyway.
          w += pc.width
          j++
          break
        }
        w += pc.width
        if (pc.breakAfter) { lastBreak = j; widthAtBreak = w }
        j++
        if (pc.hard) break
      }
      let end = j
      const endedHard = all[j - 1]?.hard === true
      if (!endedHard && j < all.length && lastBreak >= i && !all[j].isSpace) {
        end = lastBreak + 1
        w = widthAtBreak
      }
      // Trailing spaces hang past the margin and don't count toward width.
      while (!endedHard && end < all.length && all[end].isSpace && !all[end].hard) { end++ }
      const linePieces = all.slice(i, end)
      let visibleW = 0
      let trailing = true
      for (let k = linePieces.length - 1; k >= 0; k--) {
        if (trailing && linePieces[k].isSpace) continue
        trailing = false
        visibleW += linePieces[k].width
      }
      const styles = linePieces.length ? linePieces.map((p) => p.style) : [firstStyle ?? styleAt(para, 0)]
      let ascent = 0, descent = 0
      for (const s of styles) {
        const mt = m.metrics(s, f)
        ascent = Math.max(ascent, mt.ascent)
        descent = Math.max(descent, mt.descent)
      }
      const natural = ascent + descent
      const height = ps.lineSpacing.mode === 'exact' ? ps.lineSpacing.value : natural * ps.lineSpacing.value
      const last = end >= all.length
      const start = linePieces[0]?.start ?? (all[i]?.start ?? 0)
      const lineEnd = last ? paragraphText(para).length : (all[end]?.start ?? paragraphText(para).length)
      const runs: LaidRun[] = []
      let x = 0
      for (const pc of linePieces) {
        const prev = runs.at(-1)
        if (prev && prev.style === pc.style && prev.start + prev.text.length === pc.start) {
          prev.text += pc.text
          prev.width += pc.width
        } else {
          runs.push({ text: pc.text, style: pc.style, start: pc.start, x, width: pc.width })
        }
        x += pc.width
      }
      if (firstLine && marker) {
        const ms = firstStyle ?? styleAt(para, 0)
        const mw = m.measure(marker, ms, f)
        // Marker sits in the hanging indent (or before the text if there is no room).
        const gap = Math.max(-ps.indentFirst, mw + ms.size * f * 0.3)
        runs.unshift({ text: marker, style: ms, start: -1, x: -gap, width: mw, marker: true })
      }
      const ok = place(
        { para: pi, start, end: lineEnd, last, align: ps.align, width: visibleW, height, ascent, descent, spaceExtra: 0, runs },
        indent,
        ps.indentRight,
        firstLine ? ps.spaceBefore : 0
      )
      if (!ok) { overflow = true; break outer }
      firstLine = false
      i = end
    } while (i < all.length)
    // space after
    y += ps.spaceAfter
  }

  // Alignment and vertical alignment.
  for (const [bi, bl] of boxes.entries()) {
    const box = chain[bi]
    for (const line of bl.lines) alignLine(line, story.paragraphs[line.para].style.align)
    if (box.vAlign !== 'top' && bl.lines.length) {
      const areasOfBox = contentAreas(box)
      const used = bl.lines.at(-1)!.top + bl.lines.at(-1)!.height - bl.lines[0].top
      const free = areasOfBox[0].height - used
      if (free > 0 && box.columns <= 1) {
        const dy = box.vAlign === 'middle' ? free / 2 : free
        for (const line of bl.lines) { line.top += dy; line.baseline += dy }
      }
    }
  }
  return { boxes, overflow, brokeWord, neededHeight: neededHeight + chain[0].margins.bottom }
}

function splitWord(pc: Piece, maxW: number, m: Measurer, f: number): Piece[] {
  const out: Piece[] = []
  let cur = ''
  let curStart = pc.start
  for (let k = 0; k < pc.text.length; k++) {
    const next = cur + pc.text[k]
    const w = m.measure(displayText(next, pc.style), pc.style, f)
    if (w > maxW && cur.length > 0) {
      out.push({ ...pc, text: cur, start: curStart, width: m.measure(displayText(cur, pc.style), pc.style, f), breakAfter: true })
      curStart = pc.start + k
      cur = pc.text[k]
    } else cur = next
  }
  if (cur) out.push({ ...pc, text: cur, start: curStart, width: m.measure(displayText(cur, pc.style), pc.style, f) })
  return out
}

function alignLine(line: LaidLine, align: Paragraph['style']['align']): void {
  const free = line.maxWidth - line.width
  let shift = 0
  if (align === 'center') shift = free / 2
  else if (align === 'right') shift = free
  else if ((align === 'justify' && !line.last) || align === 'distribute') {
    const text = line.runs.filter((r) => !r.marker).map((r) => r.text).join('').replace(/\s+$/, '')
    const spaces = (text.match(/ /g) ?? []).length
    if (spaces > 0 && free > 0) line.spaceExtra = free / spaces
  }
  if (shift) for (const r of line.runs) r.x += shift
  // Recompute run x with justification.
  if (line.spaceExtra) {
    let x = 0
    for (const r of line.runs) {
      if (r.marker) continue
      r.x = x
      const n = (r.text.match(/ /g) ?? []).length
      r.width += n * line.spaceExtra
      x += r.width
    }
  }
}

/** Lay out a story through its chain of boxes, applying Text Fit. */
export function layoutStory(story: Story, chain: TextBoxObject[], m: Measurer): StoryLayout {
  if (chain.length === 0) return { storyId: story.id, boxes: [], overflow: false, sizeFactor: 1, neededHeight: 0 }
  const mode = chain[0].autofit
  let f = 1
  if (mode === 'bestFit' || mode === 'shrinkOnOverflow') {
    const fits = (k: number) => {
      const r = flow(story, chain, m, k)
      return !r.overflow && !r.brokeWord
    }
    if (mode === 'shrinkOnOverflow' && fits(1)) f = 1
    else {
      let lo = 0.02, hi = mode === 'bestFit' ? 40 : 1
      if (mode === 'bestFit' && !fits(lo)) hi = lo
      for (let it = 0; it < 18; it++) {
        const mid = (lo + hi) / 2
        if (fits(mid)) lo = mid
        else hi = mid
      }
      f = lo
    }
  }
  const r = flow(story, chain, m, f, mode === 'growBox')
  return { storyId: story.id, boxes: r.boxes, overflow: r.overflow, sizeFactor: f, neededHeight: r.neededHeight }
}

// ---------- caret & hit testing ----------

export interface CaretRect {
  boxId: string
  x: number
  top: number
  height: number
}

function lineOf(layout: StoryLayout, pos: TextPos): { box: BoxLayout; line: LaidLine } | null {
  let best: { box: BoxLayout; line: LaidLine } | null = null
  for (const box of layout.boxes) {
    for (const line of box.lines) {
      if (line.para !== pos.para) continue
      if (pos.offset >= line.start && (pos.offset < line.end || line.last)) return { box, line }
      if (pos.offset >= line.start) best = { box, line }
    }
  }
  return best
}

export function xAtOffset(line: LaidLine, offset: number, m: Measurer, f: number): number {
  for (const r of line.runs) {
    if (r.marker) continue
    if (offset >= r.start && offset <= r.start + r.text.length) {
      const sub = r.text.slice(0, offset - r.start)
      const spaces = (sub.match(/ /g) ?? []).length
      return line.x + r.x + m.measure(displayText(sub, r.style), r.style, f) + spaces * line.spaceExtra
    }
  }
  const lastRun = line.runs.filter((r) => !r.marker).at(-1)
  if (lastRun) return line.x + lastRun.x + lastRun.width
  // Empty line: the caret sits where alignment would put text.
  if (line.align === 'center') return line.x + line.maxWidth / 2
  if (line.align === 'right') return line.x + line.maxWidth
  return line.x
}

export function caretRect(layout: StoryLayout, pos: TextPos, m: Measurer): CaretRect | null {
  const hit = lineOf(layout, pos)
  if (!hit) return null
  const { box, line } = hit
  const x = xAtOffset(line, pos.offset, m, layout.sizeFactor)
  return { boxId: box.boxId, x, top: line.top, height: line.height }
}

/** Text position nearest to a point inside a box (box-local coordinates). */
export function positionAt(layout: StoryLayout, boxId: string, x: number, y: number, m: Measurer): TextPos | null {
  const box = layout.boxes.find((b) => b.boxId === boxId)
  if (!box || box.lines.length === 0) {
    // empty box: start of the story's first unplaced text
    return null
  }
  // Nearest line by vertical distance (columns: prefer lines whose x-range contains x).
  let best = box.lines[0]
  let bestD = Infinity
  for (const line of box.lines) {
    const dy = y < line.top ? line.top - y : y > line.top + line.height ? y - line.top - line.height : 0
    const dx = x < line.x ? line.x - x : x > line.x + line.maxWidth ? x - line.x - line.maxWidth : 0
    const d = dy * 4 + dx
    if (d < bestD) { bestD = d; best = line }
  }
  const f = layout.sizeFactor
  // Walk characters to find the closest boundary.
  let bestOffset = best.start
  let bestDx = Infinity
  const endOffset = best.last ? best.end : Math.max(best.start, best.end - trailingSpaces(best))
  for (let off = best.start; off <= endOffset; off++) {
    const cx = xAtOffset(best, off, m, f)
    const d = Math.abs(cx - x)
    if (d < bestDx) { bestDx = d; bestOffset = off }
  }
  return { para: best.para, offset: bestOffset }
}

function trailingSpaces(line: LaidLine): number {
  const t = line.runs.filter((r) => !r.marker).map((r) => r.text).join('')
  const m = t.match(/\s+$/)
  return m ? m[0].length : 0
}
