import { useEffect, useRef, useState } from 'react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import type { Page } from '@core/model/types'
import { renderPage } from '@core/render/canvas'
import { useEditor } from './useEditor'
import { Popup, MenuItem, MenuSeparator } from './ribbon/controls'

/** Publisher's Page Navigation pane: page thumbnails on the left. */
export function PageNav() {
  const e = useEditor()
  const [menu, setMenu] = useState<{ el: HTMLElement; index: number } | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  if (!e.view.pageNav) return null
  return (
    <aside className="pagenav" aria-label="Page Navigation">
      <div className="pane-title">Pages</div>
      <div className="pagenav-list">
        {e.doc.pages.map((p, i) => (
          <div
            key={p.id}
            className={`pagenav-item ${i === e.pageIndex ? 'active' : ''}`}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={() => { if (dragFrom !== null && dragFrom !== i) { ed.goToPage(dragFrom); cmd.moveCurrentPage(i) } setDragFrom(null) }}
            onClick={() => ed.goToPage(i)}
            onContextMenu={(ev) => { ev.preventDefault(); ed.goToPage(i); setMenu({ el: ev.currentTarget as HTMLElement, index: i }) }}
          >
            <Thumb page={p} version={e.version} />
            <div className="pagenav-label">{p.name || i + 1}</div>
          </div>
        ))}
      </div>
      {menu && (
        <Popup anchor={menu.el} onClose={() => setMenu(null)}>
          <MenuItem label="Insert Page" onClick={() => { cmd.addPage(menu.index); setMenu(null) }} />
          <MenuItem label="Insert Duplicate Page" onClick={() => { cmd.duplicateCurrentPage(); setMenu(null) }} />
          <MenuSeparator />
          <MenuItem label="Move Page Up" disabled={menu.index === 0} onClick={() => { cmd.moveCurrentPage(menu.index - 1); setMenu(null) }} />
          <MenuItem label="Move Page Down" disabled={menu.index >= ed.doc.pages.length - 1} onClick={() => { cmd.moveCurrentPage(menu.index + 1); setMenu(null) }} />
          <MenuSeparator />
          <MenuItem label="Delete Page" disabled={ed.doc.pages.length < 2} onClick={() => { cmd.deleteCurrentPage(); setMenu(null) }} />
        </Popup>
      )}
    </aside>
  )
}

function Thumb({ page, version }: { page: Page; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    // Thumbnails redraw shortly after changes stop, so typing stays smooth.
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const c = ref.current
      if (!c) return
      const { width, height } = ed.doc.pageSetup
      const longest = 110
      const s = longest / Math.max(width, height)
      const dpr = window.devicePixelRatio || 1
      c.width = Math.round(width * s * dpr)
      c.height = Math.round(height * s * dpr)
      c.style.width = `${Math.round(width * s)}px`
      c.style.height = `${Math.round(height * s)}px`
      const ctx = c.getContext('2d')!
      ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0)
      ed.text.sync(ed.version)
      renderPage(ctx, { doc: ed.doc, assets: ed.assets, text: ed.text, pxPerPt: s * dpr, forOutput: true }, page)
    }, 250)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [page, version])
  return <canvas ref={ref} className="thumb" />
}
