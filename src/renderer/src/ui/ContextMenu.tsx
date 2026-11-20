import { useEffect, useRef } from 'react'
import {
  BringToFront, ClipboardPaste, Copy, Group, Scissors, SendToBack, Trash2, Ungroup, TextCursorInput, Lock, ChevronsUp, ChevronsDown
} from 'lucide-react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { MenuItem, MenuSeparator } from './ribbon/controls'

/** Right-click menu on the page, with Publisher's usual entries. */
export function ContextMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', down, true)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key) }
  }, [onClose])
  const run = (fn: () => void) => () => { fn(); onClose() }
  const objs = ed.selectedObjects
  const single = ed.single
  const any = objs.length > 0
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - 380)
  return (
    <div className="popup context-menu" ref={ref} style={{ left, top }}>
      <MenuItem icon={Scissors} label="Cut" shortcut="Ctrl+X" disabled={!any} onClick={run(cmd.cut)} />
      <MenuItem icon={Copy} label="Copy" shortcut="Ctrl+C" disabled={!any} onClick={run(cmd.copy)} />
      <MenuItem icon={ClipboardPaste} label="Paste" shortcut="Ctrl+V" onClick={run(cmd.paste)} />
      <MenuSeparator />
      {objs.length > 1 && <MenuItem icon={Group} label="Group" shortcut="Ctrl+Shift+G" onClick={run(cmd.groupSelection)} />}
      {single?.type === 'group' && <MenuItem icon={Ungroup} label="Ungroup" shortcut="Ctrl+Shift+G" onClick={run(cmd.ungroupSelection)} />}
      {any && (
        <>
          <MenuItem icon={BringToFront} label="Bring to Front" onClick={run(cmd.arrange.bringToFront)} />
          <MenuItem icon={ChevronsUp} label="Bring Forward" onClick={run(cmd.arrange.bringForward)} />
          <MenuItem icon={ChevronsDown} label="Send Backward" onClick={run(cmd.arrange.sendBackward)} />
          <MenuItem icon={SendToBack} label="Send to Back" onClick={run(cmd.arrange.sendToBack)} />
          <MenuSeparator />
          <MenuItem icon={Lock} label={single?.locked ? 'Unlock Position' : 'Lock Position'} onClick={run(cmd.lockToggle)} />
          <MenuItem icon={Trash2} label="Delete Object" shortcut="Del" onClick={run(() => cmd.deleteSelection())} />
        </>
      )}
      {!any && (
        <MenuItem icon={TextCursorInput} label="Draw Text Box" onClick={run(() => ed.setTool({ kind: 'textbox' }))} />
      )}
    </div>
  )
}
