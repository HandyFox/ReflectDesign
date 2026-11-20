import { useEffect, useMemo, useRef, useState } from 'react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import type { Id, SceneObject } from '@core/model/types'
import { addToDictionary, ignoreAll, isMisspelled, loadSpeller, misspelledIn, suggestions, wordsOf, type WordRange } from '@core/spell'
import { paragraphText } from '@core/text/layout'
import { startEditing } from '@core/textEditing'

interface Hit { storyId: Id; word: WordRange }

/** Stories in reading order: page by page, front-to-back stacking order. */
function storyOrder(): Id[] {
  const ids: Id[] = []
  const walk = (list: SceneObject[]) => list.forEach((o) => {
    if (o.type === 'group') walk(o.children)
    else if (o.type === 'text' && !ids.includes(o.storyId)) ids.push(o.storyId)
  })
  ed.doc.pages.forEach((p) => walk(p.objects))
  walk(ed.doc.scratch)
  return ids
}

/** Review › Spelling (F7): step through misspelled words like Publisher. */
export function SpellingDialog({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState(false)
  const [hit, setHit] = useState<Hit | null>(null)
  const [done, setDone] = useState(false)
  const [change, setChange] = useState('')
  const [picked, setPicked] = useState(0)
  const skipped = useRef(new Set<string>())
  const order = useMemo(storyOrder, [])

  const keyOf = (h: Hit) => `${h.storyId}:${h.word.para}:${h.word.start}:${h.word.word}`

  const findNext = (from: Hit | null): Hit | null => {
    const startIdx = from ? order.indexOf(from.storyId) : 0
    for (let i = Math.max(0, startIdx); i < order.length; i++) {
      const story = ed.doc.stories[order[i]]
      if (!story) continue
      for (const w of misspelledIn(story)) {
        const h = { storyId: order[i], word: w }
        if (from && i === startIdx && (w.para < from.word.para || (w.para === from.word.para && w.start < from.word.start))) continue
        if (skipped.current.has(keyOf(h))) continue
        return h
      }
    }
    return null
  }

  const show = (h: Hit | null) => {
    setHit(h)
    if (!h) { setDone(true); return }
    const s = suggestions(h.word.word)
    setChange(s[0] ?? h.word.word)
    setPicked(0)
    // Select the word on the page.
    const boxId = ed.text.chain(ed.doc, h.storyId)[0]?.id
    if (boxId) {
      const pageIdx = ed.doc.pages.findIndex((p) => JSON.stringify(p.objects).includes(`"id":"${boxId}"`))
      if (pageIdx >= 0 && pageIdx !== ed.pageIndex) ed.goToPage(pageIdx)
      startEditing(boxId, { para: h.word.para, offset: h.word.end })
      if (ed.editing) ed.editing.anchor = { para: h.word.para, offset: h.word.start }
      ed.touch()
    }
  }

  useEffect(() => {
    loadSpeller().then(() => { setReady(true); show(findNext(null)) })
  }, [])

  const sugg = hit ? suggestions(hit.word.word) : []
  const context = hit ? paragraphText(ed.doc.stories[hit.storyId].paragraphs[hit.word.para]) : ''

  const next = (after: Hit) => show(findNext(after))
  const ignore = () => { if (!hit) return; skipped.current.add(keyOf(hit)); next(hit) }
  const ignoreEvery = () => { if (!hit) return; ignoreAll(hit.word.word); next(hit) }
  const add = () => { if (!hit) return; addToDictionary(hit.word.word); next(hit) }
  const doChange = () => {
    if (!hit || !change) return
    cmd.replaceText(hit.storyId, hit.word.para, hit.word.start, hit.word.end, change)
    const moved = { ...hit, word: { ...hit.word, end: hit.word.start + change.length } }
    if (isMisspelled(change)) skipped.current.add(keyOf({ ...moved, word: { ...moved.word, word: change } }))
    next(moved)
  }
  const changeAll = () => {
    if (!hit || !change) return
    const target = hit.word.word
    ed.change('Change All', (doc) => {
      for (const id of order) {
        const story = doc.stories[id]
        if (!story) continue
        // Replace from the end so offsets stay valid.
        for (const w of wordsOf(story).filter((x) => x.word === target).reverse()) {
          const p = story.paragraphs[w.para]
          let pos = 0
          for (const r of p.runs) {
            const rs = pos, re = pos + r.text.length
            if (w.start >= rs && w.end <= re) {
              r.text = r.text.slice(0, w.start - rs) + change + r.text.slice(w.end - rs)
              break
            }
            pos = re
          }
        }
      }
    })
    ignoreAll(target)
    next(hit)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog spelling" role="dialog" aria-label="Check Spelling" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <div className="dialog-title"><span>Check Spelling: English (United States)</span><button className="dialog-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dialog-body">
          {!ready && <p className="muted">Loading the dictionary…</p>}
          {ready && done && <p>The spelling check is complete.</p>}
          {ready && hit && (
            <div className="spell-grid">
              <label>Not in dictionary:</label>
              <div className="spell-context">
                {context.slice(Math.max(0, hit.word.start - 40), hit.word.start)}
                <b className="spell-bad">{context.slice(hit.word.start, hit.word.end)}</b>
                {context.slice(hit.word.end, hit.word.end + 40)}
              </div>
              <div className="spell-buttons top">
                <button className="btn" onClick={ignore}>Ignore</button>
                <button className="btn" onClick={ignoreEvery}>Ignore All</button>
                <button className="btn" onClick={add}>Add to Dictionary</button>
              </div>
              <label>Change to:</label>
              <input value={change} onChange={(e) => setChange(e.target.value)} autoFocus />
              <div />
              <label>Suggestions:</label>
              <div className="spell-list" role="listbox">
                {sugg.length === 0 && <div className="muted">(no suggestions)</div>}
                {sugg.map((s, i) => (
                  <div key={s} role="option" aria-selected={i === picked} className={i === picked ? 'on' : ''} onClick={() => { setPicked(i); setChange(s) }} onDoubleClick={() => { setChange(s); doChange() }}>{s}</div>
                ))}
              </div>
              <div className="spell-buttons">
                <button className="btn primary" onClick={doChange}>Change</button>
                <button className="btn" onClick={changeAll}>Change All</button>
              </div>
            </div>
          )}
        </div>
        <div className="dialog-buttons">
          <button className="btn" onClick={onClose}>{done ? 'OK' : 'Close'}</button>
        </div>
      </div>
    </div>
  )
}
