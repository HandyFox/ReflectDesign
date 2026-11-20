import { useEffect, useState } from 'react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { Ribbon } from './ribbon/Ribbon'
import { Workspace, isTypingTarget, type SpellTarget } from './workspace/Workspace'
import { loadSpeller, onSpellReady } from '@core/spell'
import { PageNav } from './PageNav'
import { StatusBar } from './StatusBar'
import { Backstage } from './Backstage'
import { ContextMenu } from './ContextMenu'
import { DialogHost, useDialogs } from './dialogs/DialogHost'
import { platform } from '../platform'
import { useEditor } from './useEditor'
import { loadFonts } from './fonts'
import { startEditing, typeText } from '@core/textEditing'

export function App() {
  useEditor()
  return (
    <DialogHost>
      <AppBody />
    </DialogHost>
  )
}

function AppBody() {
  const dialogs = useDialogs()
  const openSpelling = () => dialogs.open('spelling')
  const [menu, setMenu] = useState<{ x: number; y: number; spell: SpellTarget | null } | null>(null)

  useEffect(() => {
    loadFonts()
    loadSpeller()
    onSpellReady(() => ed.touch())
    platform.onAppCommand(async (c, arg) => {
      if (c === 'save-and-close') {
        if (await cmd.save()) platform.forceClose()
      } else if (c === 'open-file' && arg) {
        const f = arg as { path: string; name: string; bytes: Uint8Array }
        await cmd.openBytes(f.bytes, f.path, f.name)
      }
    })
    ed.updateTitle()
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const ctrl = ev.ctrlKey || ev.metaKey
      const key = ev.key.toLowerCase()
      // These work everywhere, even while typing in a text box.
      if (ctrl && key === 's') { ev.preventDefault(); ev.shiftKey ? cmd.saveAs() : cmd.save(); return }
      if (ctrl && key === 'o') { ev.preventDefault(); cmd.openDocument(); return }
      if (ctrl && key === 'n') { ev.preventDefault(); ed.backstage = 'new'; ed.touch(); return }
      if (ctrl && key === 'p') { ev.preventDefault(); ed.backstage = 'print'; ed.touch(); return }
      if (ctrl && key === 'z' && !ev.shiftKey) { ev.preventDefault(); ed.undo(); return }
      if (ctrl && (key === 'y' || (key === 'z' && ev.shiftKey))) { ev.preventDefault(); ed.redo(); return }
      if (ev.key === 'F7') { ev.preventDefault(); openSpelling(); return }
      if (ev.key === 'F9') { ev.preventDefault(); ed.zoom === 1 ? ed.requestView('fit-page') : ed.setZoom(1); return }
      if (ed.backstage) { if (ev.key === 'Escape') { ed.backstage = null; ed.touch() } return }
      if (ed.editing || isTypingTarget(ev.target)) return

      if (ctrl && key === 'a') { ev.preventDefault(); cmd.selectAll(); return }
      if (ctrl && key === 'c') { ev.preventDefault(); cmd.copy(); return }
      if (ctrl && key === 'x') { ev.preventDefault(); cmd.cut(); return }
      if (ctrl && key === 'v') { return } // handled by the paste event (may contain an image)
      if (ctrl && key === 'd') { ev.preventDefault(); cmd.duplicate(); return }
      if (ctrl && ev.shiftKey && key === 'g') { ev.preventDefault(); cmd.toggleGroup(); return }
      if (ctrl && (key === '=' || key === '+')) { ev.preventDefault(); cmd.zoomBy(1.25); return }
      if (ctrl && key === '-') { ev.preventDefault(); cmd.zoomBy(0.8); return }
      if (ctrl && (key === 'b' || key === 'i' || key === 'u')) {
        ev.preventDefault()
        const prop = key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline'
        if (prop === 'underline') cmd.formatText('Underline', { underline: 'single' })
        else cmd.formatText(prop === 'bold' ? 'Bold' : 'Italic', { [prop]: true })
        return
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); cmd.deleteSelection(); return }
      if (ed.cropping && (ev.key === 'Escape' || ev.key === 'Enter')) { ed.cropping = null; ed.setStatus(''); return }
      if (ev.key === 'Escape') { ed.setTool({ kind: 'select' }); ed.clearSelection(); return }
      if (ev.key.startsWith('Arrow') && ed.selection.length) {
        ev.preventDefault()
        // Publisher nudges 0.13" by default; Alt nudges one screen pixel.
        const step = ev.altKey ? 72 / 96 / ed.zoom : 0.13 * 72
        const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0
        const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0
        cmd.nudge(dx, dy)
        return
      }
      if (ev.key === 'PageDown') { ev.preventDefault(); ed.goToPage(ed.pageIndex + 1); return }
      if (ev.key === 'PageUp') { ev.preventDefault(); ed.goToPage(ed.pageIndex - 1); return }
      // Typing with a single text box selected starts typing into it (replacing nothing).
      const single = ed.single
      if (single && single.type === 'text' && ev.key.length === 1 && !ctrl && !ev.altKey) {
        startEditing(single.id)
        typeText(ev.key)
        ev.preventDefault()
      }
    }
    const onPaste = async (ev: ClipboardEvent) => {
      if (ed.editing || isTypingTarget(ev.target)) return
      const items = Array.from(ev.clipboardData?.items ?? [])
      const images = items.filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f)
      ev.preventDefault()
      if (images.length) {
        await cmd.placeImageFiles(await Promise.all(images.map(async (f) => ({ name: f.name || 'Pasted picture.png', mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }))))
        return
      }
      const text = ev.clipboardData?.getData('text/plain')
      if (cmd.hasClipboard()) cmd.paste()
      else if (text) cmd.pasteTextAsBox(text)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste) }
  }, [])

  return (
    <>
      <div className="app">
        <Ribbon />
        <div className="body">
          <PageNav />
          <Workspace onContextMenu={(x, y, spell) => setMenu({ x, y, spell })} />
        </div>
        <StatusBar />
        <Backstage />
        {menu && <ContextMenu x={menu.x} y={menu.y} spell={menu.spell} onClose={() => setMenu(null)} />}
      </div>
    </>
  )
}
