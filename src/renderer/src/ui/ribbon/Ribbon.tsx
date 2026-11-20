import { useEffect, useState } from 'react'
import { Redo2, Save, Undo2, ChevronUp, ChevronDown } from 'lucide-react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { useEditor } from '../useEditor'
import { DrawingFormatTab, HomeTab, InsertTab, PageDesignTab, PictureFormatTab, ReviewTab, TextBoxFormatTab, ViewTab } from './tabs'

type TabId = 'home' | 'insert' | 'design' | 'review' | 'view' | 'fmt-text' | 'fmt-picture' | 'fmt-drawing'

const MAIN_TABS: Array<[TabId, string]> = [
  ['home', 'Home'],
  ['insert', 'Insert'],
  ['design', 'Page Design'],
  ['review', 'Review'],
  ['view', 'View']
]

function contextualTab(): { id: TabId; group: string; color: string } | null {
  const objs = ed.selectedObjects
  if (ed.editing || (objs.length && objs.every((o) => o.type === 'text'))) return { id: 'fmt-text', group: 'Text Box Tools', color: '#8e4fa3' }
  if (objs.length && objs.every((o) => o.type === 'picture')) return { id: 'fmt-picture', group: 'Picture Tools', color: '#b3730d' }
  if (objs.length) return { id: 'fmt-drawing', group: 'Drawing Tools', color: '#c0504d' }
  return null
}

export function Ribbon() {
  const e = useEditor()
  const [tab, setTab] = useState<TabId>('home')
  const [collapsed, setCollapsed] = useState(false)
  const ctxTab = contextualTab()

  // If the contextual tab disappears, fall back to Home (like Publisher).
  useEffect(() => {
    if (tab.startsWith('fmt-') && (!ctxTab || ctxTab.id !== tab)) setTab(ctxTab ? ctxTab.id : 'home')
  }, [ctxTab?.id, tab])

  const body = (() => {
    switch (tab) {
      case 'home': return <HomeTab />
      case 'insert': return <InsertTab />
      case 'design': return <PageDesignTab />
      case 'review': return <ReviewTab />
      case 'view': return <ViewTab />
      case 'fmt-text': return <TextBoxFormatTab />
      case 'fmt-picture': return <PictureFormatTab />
      case 'fmt-drawing': return <DrawingFormatTab />
    }
  })()

  return (
    <div className="ribbon-wrap">
      <div className="titlebar">
        <div className="qat">
          <button title="Save (Ctrl+S)" onClick={() => cmd.save()} aria-label="Save"><Save size={14} /></button>
          <button title={e.history.undoLabel ? `Undo ${e.history.undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'} disabled={!e.history.canUndo} onClick={() => ed.undo()} aria-label="Undo"><Undo2 size={14} /></button>
          <button title={e.history.redoLabel ? `Redo ${e.history.redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)'} disabled={!e.history.canRedo} onClick={() => ed.redo()} aria-label="Redo"><Redo2 size={14} /></button>
        </div>
        <div className="title-text">{e.dirty ? '*' : ''}{e.fileName} - ReflectDesign</div>
        <div className="ctx-headers">
          {ctxTab && <div className="ctx-header" style={{ background: ctxTab.color }}>{ctxTab.group}</div>}
        </div>
      </div>
      <div className="tabbar">
        <button className="tab file-tab" onClick={() => { ed.backstage = 'info'; ed.touch() }}>File</button>
        {MAIN_TABS.map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); if (collapsed) setCollapsed(false) }}>
            {label}
          </button>
        ))}
        {ctxTab && (
          <button className={`tab ctx ${tab === ctxTab.id ? 'active' : ''}`} style={{ ['--ctx' as string]: ctxTab.color }} onClick={() => setTab(ctxTab.id)}>
            Format
          </button>
        )}
        <div className="tab-spacer" />
        <button className="collapse-btn" title={collapsed ? 'Pin the ribbon' : 'Collapse the Ribbon (Ctrl+F1)'} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {!collapsed && <div className="ribbon" onMouseDown={(ev) => { if ((ev.target as HTMLElement).tagName !== 'INPUT') ev.preventDefault() }}>{body}</div>}
    </div>
  )
}
