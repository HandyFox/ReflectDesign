import { Minus, Plus, Maximize } from 'lucide-react'
import { editor as ed } from '@core/editor'
import { boundsOfObjects } from '@core/model/factory'
import { formatLength } from '@core/model/units'
import { useEditor } from './useEditor'

// Zoom slider is logarithmic between 10% and 1000%, like Office.
const MIN = Math.log(0.1), MAX = Math.log(10)

export function StatusBar() {
  const e = useEditor()
  const objs = e.selectedObjects
  const b = objs.length ? boundsOfObjects(objs) : null
  const u = e.unit
  return (
    <footer className="statusbar">
      <span className="sb-item">Page: {e.pageIndex + 1} of {e.doc.pages.length}</span>
      {b && (
        <span className="sb-item" title="Object position and size">
          {formatLength(b.x, u)}, {formatLength(b.y, u)} &nbsp;·&nbsp; {formatLength(b.width, u)} × {formatLength(b.height, u)}
        </span>
      )}
      <span className="sb-item sb-status">{e.status}</span>
      <span className="sb-spacer" />
      <button className="sb-btn" title="Whole Page" onClick={() => ed.requestView('fit-page')} aria-label="Whole Page"><Maximize size={13} /></button>
      <button className="sb-btn" title="Zoom Out" onClick={() => ed.setZoom(e.zoom / 1.1)} aria-label="Zoom Out"><Minus size={13} /></button>
      <input
        className="zoom-slider"
        type="range"
        min={0}
        max={1000}
        value={Math.round(((Math.log(e.zoom) - MIN) / (MAX - MIN)) * 1000)}
        onChange={(ev) => ed.setZoom(Math.exp(MIN + (Number(ev.target.value) / 1000) * (MAX - MIN)))}
        aria-label="Zoom"
      />
      <button className="sb-btn" title="Zoom In" onClick={() => ed.setZoom(e.zoom * 1.1)} aria-label="Zoom In"><Plus size={13} /></button>
      <span className="sb-zoom">{Math.round(e.zoom * 100)}%</span>
    </footer>
  )
}
