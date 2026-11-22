import { useEffect, useRef } from 'react'
import {
  BringToFront, ClipboardPaste, Copy, Group, Scissors, SendToBack, Trash2, Ungroup, TextCursorInput, Lock, ChevronsUp, ChevronsDown, Blend, CalendarDays, CalendarRange } from 'lucide-react'
import type { SceneObject } from '@core/model/types'
import { useDialogs } from './dialogs/DialogHost'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { MenuItem, MenuSeparator } from './ribbon/controls'
import type { SpellTarget } from './workspace/Workspace'
import { addToDictionary, ignoreAll, suggestions } from '@core/spell'

function formatLabel(objs: SceneObject[]): string {
  const types = new Set(objs.map((o) => o.type))
  if (types.size === 1 && types.has('text')) return 'Format Text Box...'
  if (types.size === 1 && types.has('picture')) return 'Format Picture...'
  if (types.size === 1 && types.has('calendar')) return 'Format Calendar Size and Position...'
  if (types.size === 1 && types.has('shape')) return 'Format AutoShape...'
  return 'Format Object...'
}

/** Right-click menu on the page, with Publisher's usual entries. */
export function ContextMenu({ x, y, onClose, spell }: { x: number; y: number; onClose: () => void; spell: SpellTarget | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', down, true)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key) }
  }, [onClose])
  const dialogs = useDialogs()
  const run = (fn: () => void) => () => { fn(); onClose() }
  const objs = ed.selectedObjects
  const single = ed.single
  const any = objs.length > 0
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.max(4, Math.min(y, window.innerHeight - (spell ? 560 : 380)))
  const sugg = spell ? suggestions(spell.word.word) : []
  return (
    <div className="popup context-menu" ref={ref} style={{ left, top }}>
      {spell && (
        <>
          {sugg.length === 0 && <MenuItem label="(No Spelling Suggestions)" disabled />}
          {sugg.map((s) => (
            <MenuItem key={s} label={s} iconNode={<b className="sugg">✓</b>} onClick={run(() => cmd.replaceText(spell.storyId, spell.word.para, spell.word.start, spell.word.end, s))} />
          ))}
          <MenuItem label="Ignore All" onClick={run(() => { ignoreAll(spell.word.word); ed.touch() })} />
          <MenuItem label="Add to Dictionary" onClick={run(() => { addToDictionary(spell.word.word); ed.touch() })} />
          <MenuSeparator />
        </>
      )}
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
          {objs.every((o) => o.type === 'calendar') && (
            <>
              <MenuItem icon={CalendarDays} label="Calendar Dates..." onClick={run(() => dialogs.open('calendarDates'))} />
              <MenuItem icon={CalendarRange} label="Change Year..." onClick={run(() => dialogs.open('calendarYear'))} />
            </>
          )}
          <MenuItem icon={Blend} label={formatLabel(objs)} onClick={run(() => dialogs.open('format', objs.every((o) => o.type === 'calendar') ? 'size' : undefined))} />
          <MenuItem icon={Trash2} label="Delete Object" shortcut="Del" onClick={run(() => cmd.deleteSelection())} />
        </>
      )}
      {!any && (
        <MenuItem icon={TextCursorInput} label="Draw Text Box" onClick={run(() => ed.setTool({ kind: 'textbox' }))} />
      )}
    </div>
  )
}
