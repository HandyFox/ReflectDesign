// Publisher's "Format Text Box / Format Picture / Format AutoShape" dialog.
// Changes preview live on the page; Cancel puts everything back.

import { useEffect, useRef, useState } from 'react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import type { DashStyle, SceneObject, VAlign, WrapMode, Autofit } from '@core/model/types'
import { formatLength, parseLength } from '@core/model/units'
import { frameOf, getObject, setFrame } from '@core/model/ops'
import { endOfStory, commonCharStyle } from '@core/text/edit'
import { Popup } from '../ribbon/controls'
import { ColorGrid } from '../ribbon/ColorPicker'
import { TransparencySlider } from '../ribbon/Transparency'
import { useEditor } from '../useEditor'

type Tab = 'colors' | 'size' | 'picture' | 'textbox' | 'layout'

function leaves(objs: SceneObject[]): SceneObject[] {
  return objs.flatMap((o) => (o.type === 'group' ? leaves(o.children) : [o]))
}

function titleFor(objs: SceneObject[]): string {
  const kinds = new Set(leaves(objs).map((o) => o.type))
  if (kinds.size === 1 && kinds.has('text')) return 'Format Text Box'
  if (kinds.size === 1 && kinds.has('picture')) return 'Format Picture'
  if (kinds.size === 1 && kinds.has('shape')) return 'Format AutoShape'
  return 'Format Object'
}

export function FormatDialog({ onClose, initialTab }: { onClose: () => void; initialTab?: Tab }) {
  useEditor()
  const started = useRef(false)
  if (!started.current) {
    started.current = true
    ed.beginLive('Format Object')
  }
  const objs = ed.selectedObjects
  const all = leaves(objs)
  const isText = all.some((o) => o.type === 'text')
  const isPic = all.some((o) => o.type === 'picture')
  const [tab, setTab] = useState<Tab>(initialTab ?? 'colors')
  useEffect(() => { if (!objs.length) { ed.endLive(false); onClose() } }, [objs.length])

  const finish = (ok: boolean) => {
    ed.endLive(ok)
    onClose()
  }

  const tabs: Array<[Tab, string, boolean]> = [
    ['colors', 'Colors and Lines', true],
    ['size', 'Size', objs.length === 1],
    ['layout', 'Layout', true],
    ['picture', 'Picture', isPic],
    ['textbox', 'Text Box', isText]
  ]
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) finish(false) }}>
      <div className="dialog format-dialog" role="dialog" aria-label={titleFor(objs)}
        onKeyDown={(e) => { if (e.key === 'Escape') finish(false); if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'INPUT') finish(true) }}>
        <div className="dialog-title"><span>{titleFor(objs)}</span><button className="dialog-x" onClick={() => finish(false)} aria-label="Close">✕</button></div>
        <div className="dialog-tabs" role="tablist">
          {tabs.filter((t) => t[2]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`dtab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="dialog-body format-body">
          {tab === 'colors' && <ColorsTab isText={isText} isPic={isPic} />}
          {tab === 'size' && objs.length === 1 && <SizeTab o={objs[0]} />}
          {tab === 'layout' && <LayoutTab />}
          {tab === 'picture' && <PictureTab />}
          {tab === 'textbox' && <TextBoxTab />}
        </div>
        <div className="dialog-buttons">
          <button className="btn primary" onClick={() => finish(true)}>OK</button>
          <button className="btn" onClick={() => finish(false)}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function ColorPick({ color, onPick, onNone, noneLabel }: { color: string | null; onPick: (c: string) => void; onNone?: () => void; noneLabel?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ref} className="color-pick" onClick={() => setOpen(true)} aria-label="Choose color">
        <span className={`swatch ${color ? '' : 'none'}`} style={{ background: color ?? undefined }} />
        <span>{color ?? noneLabel ?? 'No Color'}</span>
        <span className="caret">▾</span>
      </button>
      {open && ref.current && (
        <Popup anchor={ref.current} onClose={() => setOpen(false)}>
          <ColorGrid onPick={onPick} onNone={onNone} noneLabel={noneLabel} close={() => setOpen(false)} />
        </Popup>
      )}
    </>
  )
}

function ColorsTab({ isText, isPic }: { isText: boolean; isPic: boolean }) {
  const all = leaves(ed.selectedObjects)
  const first = all.find((o) => o.type !== 'group' && o.type !== 'calendar') as Extract<SceneObject, { fill: unknown }> | undefined
  const fillColor = first && first.fill.type === 'solid' ? first.fill.color : first && first.fill.type !== 'none' ? (first.fill as { stops: Array<{ color: string }> }).stops[0]?.color ?? null : null
  const line = first?.stroke
  const set = cmd.setObjectProps
  const textStyle = (() => {
    const box = all.find((o) => o.type === 'text')
    if (!box || box.type !== 'text') return null
    const story = ed.doc.stories[box.storyId]
    return story ? commonCharStyle(story, { para: 0, offset: 0 }, endOfStory(story)) : null
  })()
  return (
    <div className="ftab">
      <fieldset>
        <legend>Fill</legend>
        <div className="frow">
          <span className="flabel">Color:</span>
          <ColorPick color={fillColor} noneLabel="No Fill"
            onPick={(c) => set('Fill Color', (o) => {
              for (const l of leaves([o])) if ('fill' in l) {
                const t = cmd.fillTransparency() ?? 0
                l.fill = { type: 'solid', color: c, opacity: l.fill.type === 'solid' ? l.fill.opacity : 1 - t }
              }
            })}
            onNone={() => set('Fill Color', (o) => { for (const l of leaves([o])) if ('fill' in l) l.fill = { type: 'none' } })} />
        </div>
        <TransparencySlider label="Transparency" value={cmd.fillTransparency()} onChange={cmd.setFillTransparency}
          hint={isPic ? 'This is the background behind the picture. Pick a fill color to use it.' : 'Pick a fill color first. "No Fill" is already fully see-through.'} />
      </fieldset>
      <fieldset>
        <legend>Line</legend>
        <div className="frow">
          <span className="flabel">Color:</span>
          <ColorPick color={line && line.width > 0 ? line.color : null} noneLabel="No Line"
            onPick={(c) => set('Line Color', (o) => { for (const l of leaves([o])) if ('stroke' in l) l.stroke = { ...l.stroke, color: c, width: l.stroke.width || 0.75 } })}
            onNone={() => set('Line Color', (o) => { for (const l of leaves([o])) if ('stroke' in l) l.stroke = { ...l.stroke, width: 0 } })} />
          <span className="flabel">Dash:</span>
          <select value={line?.dash ?? 'solid'} onChange={(e) => set('Dash', (o) => { for (const l of leaves([o])) if ('stroke' in l) l.stroke = { ...l.stroke, dash: e.target.value as DashStyle } })}>
            {(['solid', 'dash', 'dot', 'dashDot', 'longDash'] as DashStyle[]).map((d) => <option key={d} value={d}>{d === 'dashDot' ? 'Dash Dot' : d === 'longDash' ? 'Long Dash' : d[0].toUpperCase() + d.slice(1)}</option>)}
          </select>
          <span className="flabel">Weight:</span>
          <select value={line?.width ?? 0} onChange={(e) => set('Line Weight', (o) => { for (const l of leaves([o])) if ('stroke' in l) l.stroke = { ...l.stroke, width: Number(e.target.value) } })}>
            {[0, 0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6, 9, 12, 18].map((w) => <option key={w} value={w}>{w === 0 ? 'None' : `${w} pt`}</option>)}
          </select>
        </div>
        <TransparencySlider label="Transparency" value={cmd.lineTransparency()} onChange={cmd.setLineTransparency} hint="Pick a line color first." />
      </fieldset>
      {isText && (
        <fieldset>
          <legend>Text</legend>
          <TransparencySlider label="Text transparency" value={textStyle?.opacity !== undefined ? 1 - textStyle.opacity : 0} onChange={cmd.setTextTransparency} />
        </fieldset>
      )}
      {isPic && (
        <fieldset>
          <legend>Picture</legend>
          <TransparencySlider label="Picture transparency" value={cmd.pictureTransparency()} onChange={cmd.setPictureTransparency} />
        </fieldset>
      )}
    </div>
  )
}

function SizeTab({ o }: { o: SceneObject }) {
  const u = ed.unit
  const f = (v: number) => formatLength(v, u)
  const commit = (dim: 'width' | 'height' | 'rotation', text: string) => {
    const cur = getObject(ed.doc, o.id)
    if (!cur) return
    const fr = frameOf(cur)
    if (dim === 'rotation') {
      const r = parseFloat(text)
      if (Number.isFinite(r)) cmd.setObjectProps('Rotate', (x) => setFrame(x, { ...frameOf(x), rotation: r }))
      return
    }
    const v = parseLength(text, u)
    if (!v || v < 1) return
    const cx = fr.x + fr.width / 2, cy = fr.y + fr.height / 2
    const w = dim === 'width' ? v : fr.width, h = dim === 'height' ? v : fr.height
    cmd.setObjectProps('Size', (x) => setFrame(x, { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rotation: fr.rotation }))
  }
  return (
    <div className="ftab">
      <fieldset>
        <legend>Size and rotate</legend>
        <Field label="Height:" initial={f(o.height)} onCommit={(t) => commit('height', t)} />
        <Field label="Width:" initial={f(o.width)} onCommit={(t) => commit('width', t)} />
        <Field label="Rotation:" initial={`${Math.round(o.rotation * 10) / 10}°`} onCommit={(t) => commit('rotation', t.replace('°', ''))} />
      </fieldset>
    </div>
  )
}

function Field({ label, initial, onCommit }: { label: string; initial: string; onCommit: (t: string) => void }) {
  const [v, setV] = useState(initial)
  useEffect(() => setV(initial), [initial])
  return (
    <label className="field">
      <span>{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCommit(v) } }} />
    </label>
  )
}

function LayoutTab() {
  const first = ed.selectedObjects[0]
  const modes: Array<[WrapMode, string]> = [['square', 'Square'], ['tight', 'Tight'], ['through', 'Through'], ['topBottom', 'Top and Bottom'], ['none', 'None']]
  const d = first?.wrap.distance
  const u = ed.unit
  return (
    <div className="ftab">
      <fieldset>
        <legend>Wrapping style</legend>
        <div className="wrap-modes">
          {modes.map(([m, l]) => (
            <label key={m}><input type="radio" checked={first?.wrap.mode === m} onChange={() => cmd.setObjectProps('Wrap Text', (o) => { o.wrap.mode = m })} /> {l}</label>
          ))}
        </div>
        <p className="muted">Text wraps around objects that are in front of the text box. Use Bring Forward / Send Backward to change which is in front.</p>
      </fieldset>
      {d && (
        <fieldset>
          <legend>Distance from text</legend>
          <div className="grid2">
            {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
              <Field key={side} label={`${side[0].toUpperCase()}${side.slice(1)}:`} initial={formatLength(d[side], u)}
                onCommit={(t) => { const v = parseLength(t, u); if (v !== null && v >= 0) cmd.setObjectProps('Wrap Distance', (o) => { o.wrap.distance = { ...o.wrap.distance, [side]: v } }) }} />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}

function PictureTab() {
  const pic = leaves(ed.selectedObjects).find((o) => o.type === 'picture')
  if (!pic || pic.type !== 'picture') return null
  const set = cmd.setObjectProps
  const slider = (label: string, value: number, apply: (v: number) => void) => (
    <div className="frow">
      <span className="flabel wide">{label}</span>
      <input type="range" min={-100} max={100} value={Math.round(value * 100)} onChange={(e) => apply(Number(e.target.value) / 100)} />
      <span className="fval">{Math.round(value * 100)}%</span>
    </div>
  )
  return (
    <div className="ftab">
      <fieldset>
        <legend>Image control</legend>
        <TransparencySlider label="Transparency" value={1 - pic.opacity} onChange={cmd.setPictureTransparency} />
        {slider('Brightness:', pic.brightness, (v) => set('Brightness', (o) => { if (o.type === 'picture') o.brightness = v }, `bright:${pic.id}`))}
        {slider('Contrast:', pic.contrast, (v) => set('Contrast', (o) => { if (o.type === 'picture') o.contrast = v }, `contrast:${pic.id}`))}
        <label className="check-line"><input type="checkbox" checked={pic.grayscale} onChange={(e) => set('Recolor', (o) => { if (o.type === 'picture') o.grayscale = e.target.checked })} /> Grayscale</label>
      </fieldset>
    </div>
  )
}

function TextBoxTab() {
  const box = leaves(ed.selectedObjects).find((o) => o.type === 'text')
  if (!box || box.type !== 'text') return null
  const u = ed.unit
  return (
    <div className="ftab">
      <fieldset>
        <legend>Vertical alignment and text fit</legend>
        <label className="field"><span>Vertical:</span>
          <select value={box.vAlign} onChange={(e) => cmd.setObjectProps('Text Alignment', (o) => { if (o.type === 'text') o.vAlign = e.target.value as VAlign })}>
            <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
          </select>
        </label>
        <label className="field"><span>Text fit:</span>
          <select value={box.autofit} onChange={(e) => cmd.setObjectProps('Text Fit', (o) => { if (o.type === 'text') o.autofit = e.target.value as Autofit })}>
            <option value="none">Do Not Autofit</option><option value="bestFit">Best Fit</option>
            <option value="shrinkOnOverflow">Shrink Text On Overflow</option><option value="growBox">Grow Text Box to Fit</option>
          </select>
        </label>
        <label className="field"><span>Columns:</span>
          <select value={box.columns} onChange={(e) => cmd.setObjectProps('Columns', (o) => { if (o.type === 'text') o.columns = Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Text box margins</legend>
        <div className="grid2">
          {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
            <Field key={side} label={`${side[0].toUpperCase()}${side.slice(1)}:`} initial={formatLength(box.margins[side], u)}
              onCommit={(t) => { const v = parseLength(t, u); if (v !== null && v >= 0) cmd.setObjectProps('Text Box Margins', (o) => { if (o.type === 'text') o.margins = { ...o.margins, [side]: v } }) }} />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
