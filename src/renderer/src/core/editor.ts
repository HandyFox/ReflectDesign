// The editor: owns the open document, selection, view settings and undo.
// UI components subscribe to it and re-render when `version` changes.

import type { CharStyle, Id, Page, RDocument, SceneObject, ShapeKind, TextBoxObject } from './model/types'
import { makeDocument } from './model/factory'
import { getObject, locate } from './model/ops'
import { History, type Snapshot } from './history'
import { AssetStore } from './assets'
import { TextEngine } from './text/engine'
import { CanvasMeasurer } from './text/canvasMeasurer'
import type { TextPos } from './text/layout'
import type { Unit } from './model/units'

export type Tool =
  | { kind: 'select' }
  | { kind: 'textbox' }
  | { kind: 'shape'; shape: ShapeKind }
  | { kind: 'picture'; assetId: Id | null }
  | { kind: 'pan' }
  /** Create Link: the next text box clicked receives the overflow. */
  | { kind: 'link'; fromId: Id }

export interface TextEditState {
  boxId: Id
  storyId: Id
  caret: TextPos
  /** Other end of the selection (== caret when nothing is selected). */
  anchor: TextPos
  /** Formatting chosen with nothing selected; used for the next typed text. */
  pending: Partial<CharStyle> | null
  /** Remembered x for Up/Down arrow movement. */
  goalX: number | null
}

export interface ViewOptions {
  boundaries: boolean
  guides: boolean
  rulers: boolean
  pageNav: boolean
  scratch: boolean
  baselines: boolean
  snapToGuides: boolean
  snapToObjects: boolean
}

export type BackstageView = null | 'info' | 'new' | 'open' | 'save' | 'export' | 'print'

export class Editor {
  doc: RDocument = makeDocument()
  readonly assets = new AssetStore()
  readonly measurer = new CanvasMeasurer()
  readonly text = new TextEngine(this.measurer)
  readonly history = new History()

  selection: Id[] = []
  pageIndex = 0
  zoom = 0.75
  unit: Unit = 'in'
  tool: Tool = { kind: 'select' }
  editing: TextEditState | null = null
  backstage: BackstageView = null
  /** Request from a command for the canvas (e.g. 'fit-page'). */
  viewRequest: { kind: 'fit-page' | 'page-width' | 'fit-selection' | 'center'; n: number } | null = null
  view: ViewOptions = {
    boundaries: true,
    guides: true,
    rulers: true,
    pageNav: true,
    scratch: true,
    baselines: false,
    snapToGuides: true,
    snapToObjects: true
  }

  filePath: string | null = null
  fileName = 'Publication1'
  dirty = false
  /** Bumped on every change; used by React and caches. */
  version = 0
  /** Status message shown in the status bar. */
  status = ''

  private listeners = new Set<() => void>()
  private live: Snapshot | null = null
  private lastCoalesce: { key: string; time: number } | null = null

  constructor() {
    this.assets.onLoaded = () => this.touch()
  }

  // ---------- subscription ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = (): number => this.version

  /** Re-render without changing the document (selection, view, etc). */
  touch(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  // ---------- accessors ----------

  get page(): Page {
    return this.doc.pages[Math.min(this.pageIndex, this.doc.pages.length - 1)]
  }

  get selectedObjects(): SceneObject[] {
    return this.selection.map((id) => getObject(this.doc, id)).filter((o): o is SceneObject => !!o)
  }

  get single(): SceneObject | null {
    const s = this.selectedObjects
    return s.length === 1 ? s[0] : null
  }

  /** The text box whose text is being edited, or the selected text box. */
  get activeTextBox(): TextBoxObject | null {
    if (this.editing) {
      const o = getObject(this.doc, this.editing.boxId)
      return o && o.type === 'text' ? o : null
    }
    const s = this.single
    return s && s.type === 'text' ? s : null
  }

  // ---------- changes & undo ----------

  private snapshot(label: string): Snapshot {
    return { label, doc: structuredClone(this.doc), selection: [...this.selection], pageIndex: this.pageIndex }
  }

  private afterChange(): void {
    this.text.invalidate()
    if (this.text.applyGrowBoxes(this.doc)) this.text.invalidate()
    this.doc.info.modified = new Date().toISOString()
    if (!this.dirty) {
      this.dirty = true
      window.reflect?.setDirty(true)
      this.updateTitle()
    }
    this.touch()
  }

  /**
   * Make an undoable change. Changes with the same `coalesce` key within a
   * second merge into one undo step (used for typing).
   */
  change(label: string, fn: (doc: RDocument) => void, coalesce?: string): void {
    const now = Date.now()
    const merge = coalesce && this.lastCoalesce?.key === coalesce && now - this.lastCoalesce.time < 1500
    if (!merge && !this.live) this.history.push(this.snapshot(label))
    this.lastCoalesce = coalesce ? { key: coalesce, time: now } : null
    fn(this.doc)
    this.afterChange()
  }

  /** Start a live change (dragging). Call liveChange() repeatedly, then endLive(). */
  beginLive(label: string): void {
    if (this.live) this.endLive()
    this.live = this.snapshot(label)
    this.lastCoalesce = null
  }

  liveChange(fn: (doc: RDocument) => void): void {
    fn(this.doc)
    this.text.invalidate()
    this.touch()
  }

  endLive(commit = true): void {
    if (!this.live) return
    const snap = this.live
    this.live = null
    if (commit && JSON.stringify(snap.doc) !== JSON.stringify(this.doc)) {
      this.history.push(snap)
      this.afterChange()
    } else if (!commit) {
      this.restore(snap)
    }
  }

  private restore(s: Snapshot): void {
    this.doc = s.doc
    this.selection = s.selection.filter((id) => !!locate(this.doc, id))
    this.pageIndex = Math.min(s.pageIndex, this.doc.pages.length - 1)
    this.editing = null
    this.text.invalidate()
  }

  undo(): void {
    if (this.live) this.endLive()
    const s = this.history.undo(this.snapshot(''))
    if (!s) return
    this.restore(s)
    this.lastCoalesce = null
    this.afterChange()
  }

  redo(): void {
    const s = this.history.redo(this.snapshot(''))
    if (!s) return
    this.restore(s)
    this.lastCoalesce = null
    this.afterChange()
  }

  // ---------- selection ----------

  select(ids: Id[], opts: { keepEditing?: boolean } = {}): void {
    this.selection = [...new Set(ids)]
    if (!opts.keepEditing && this.editing && !ids.includes(this.editing.boxId)) this.editing = null
    this.touch()
  }

  clearSelection(): void {
    this.selection = []
    this.editing = null
    this.touch()
  }

  setTool(tool: Tool): void {
    this.tool = tool
    if (tool.kind !== 'select') this.editing = null
    this.touch()
  }

  goToPage(index: number): void {
    const i = Math.max(0, Math.min(index, this.doc.pages.length - 1))
    if (i === this.pageIndex) return
    this.pageIndex = i
    this.selection = []
    this.editing = null
    this.requestView('fit-page')
  }

  requestView(kind: NonNullable<Editor['viewRequest']>['kind']): void {
    this.viewRequest = { kind, n: (this.viewRequest?.n ?? 0) + 1 }
    this.touch()
  }

  setZoom(z: number): void {
    this.zoom = Math.max(0.1, Math.min(z, 40))
    this.touch()
  }

  setStatus(msg: string): void {
    this.status = msg
    this.touch()
  }

  // ---------- document lifecycle ----------

  load(doc: RDocument, assets: Editor['assets']['all'], path: string | null, name: string): void {
    this.doc = doc
    this.assets.replaceAll(assets)
    this.selection = []
    this.editing = null
    this.pageIndex = 0
    this.history.clear()
    this.filePath = path
    this.fileName = name.replace(/\.(rdx|rdt)$/i, '')
    this.dirty = false
    this.text.invalidate()
    window.reflect?.setDirty(false)
    this.updateTitle()
    this.requestView('fit-page')
  }

  markSaved(path: string | null, name?: string): void {
    this.filePath = path
    if (name) this.fileName = name.replace(/\.(rdx|rdt)$/i, '')
    this.dirty = false
    window.reflect?.setDirty(false)
    this.updateTitle()
    this.touch()
  }

  updateTitle(): void {
    // Electron mirrors document.title into the window title bar.
    document.title = `${this.dirty ? '*' : ''}${this.fileName} - ReflectDesign`
  }
}

export const editor = new Editor()
