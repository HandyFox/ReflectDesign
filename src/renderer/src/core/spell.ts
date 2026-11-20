// Spell check with Hunspell dictionaries (nspell). Works offline and the same
// on every platform. The English dictionary loads the first time it's needed.

import type { Story } from './model/types'
import { paragraphText } from './text/layout'

interface Speller {
  correct(word: string): boolean
  suggest(word: string): string[]
  add(word: string): void
}

let speller: Speller | null = null
let loading: Promise<void> | null = null
let readyListeners: Array<() => void> = []
const cache = new Map<string, boolean>()
const ignored = new Set<string>()
const PERSONAL_KEY = 'reflectdesign.personalDictionary'

function personal(): string[] {
  try { return JSON.parse(localStorage.getItem(PERSONAL_KEY) ?? '[]') } catch { return [] }
}

export function loadSpeller(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const [{ default: nspell }, { default: aff }, { default: dic }] = await Promise.all([
        import('nspell'),
        import('dictionary-en-files/index.aff?raw'),
        import('dictionary-en-files/index.dic?raw')
      ])
      const s = nspell(aff, dic) as Speller
      for (const w of personal()) s.add(w)
      speller = s
      cache.clear()
      readyListeners.forEach((l) => l())
      readyListeners = []
    })().catch((e) => { console.error('Spell check unavailable', e) })
  }
  return loading
}

export function onSpellReady(fn: () => void): void {
  if (speller) fn()
  else readyListeners.push(fn)
}

export const spellReady = () => speller !== null

/** Words Publisher skips by default: numbers, ALL CAPS, internet addresses. */
function skip(word: string): boolean {
  return word.length < 2 || /\d/.test(word) || (word === word.toUpperCase() && word.length > 1)
}

export function isMisspelled(word: string): boolean {
  if (!speller || skip(word)) return false
  const w = word.replace(/[’]/g, "'").replace(/^'+|'+$/g, '')
  if (!w || ignored.has(w.toLowerCase())) return false
  let bad = cache.get(w)
  if (bad === undefined) {
    bad = !speller.correct(w)
    if (cache.size > 20000) cache.clear()
    cache.set(w, bad)
  }
  return bad
}

/** Damerau-Levenshtein distance (a swapped pair of letters counts as one typo). */
function typoDistance(a: string, b: string): number {
  a = a.toLowerCase(); b = b.toLowerCase()
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

export function suggestions(word: string): string[] {
  if (!speller) return []
  const w = word.replace(/[’]/g, "'")
  const sameLetters = (x: string) => [...x.toLowerCase()].sort().join('') === [...w.toLowerCase()].sort().join('')
  // Rank the closest typos first; swapped letters ("Thsi" → "This") beat other one-letter changes.
  return speller.suggest(w)
    .map((s, i) => ({ s, i, d: typoDistance(w, s), same: sameLetters(s) ? 0 : 1 }))
    .sort((a, b) => a.d - b.d || a.same - b.same || a.i - b.i)
    .map((x) => x.s)
    .slice(0, 6)
}

export function ignoreAll(word: string): void {
  ignored.add(word.toLowerCase())
}

export function addToDictionary(word: string): void {
  const list = personal()
  if (!list.includes(word)) {
    list.push(word)
    try { localStorage.setItem(PERSONAL_KEY, JSON.stringify(list)) } catch { /* storage unavailable */ }
  }
  speller?.add(word)
  cache.delete(word)
}

export interface WordRange {
  para: number
  start: number
  end: number
  word: string
}

// Letters and digits together, so "2nd" is one word (and skipped for having a digit).
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu

export function wordsOf(story: Story): WordRange[] {
  const out: WordRange[] = []
  story.paragraphs.forEach((p, para) => {
    const t = paragraphText(p)
    for (const m of t.matchAll(WORD)) {
      const word = m[0].replace(/['’]+$/, '')
      out.push({ para, start: m.index!, end: m.index! + word.length, word })
    }
  })
  return out
}

export function misspelledIn(story: Story): WordRange[] {
  if (!speller) return []
  return wordsOf(story).filter((w) => isMisspelled(w.word))
}

/** The word at a text position, if any. */
export function wordAt(story: Story, para: number, offset: number): WordRange | null {
  return wordsOf(story).find((w) => w.para === para && offset >= w.start && offset <= w.end) ?? null
}
