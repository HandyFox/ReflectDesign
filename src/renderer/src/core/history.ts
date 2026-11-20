import type { Id, RDocument } from './model/types'

export interface Snapshot {
  label: string
  doc: RDocument
  selection: Id[]
  pageIndex: number
}

/** Snapshot-based undo/redo. Image bytes live outside the document, so snapshots stay small. */
export class History {
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  constructor(private limit = 200) {}

  push(s: Snapshot): void {
    this.undoStack.push(s)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }

  /** Give the current state, get the state to restore. */
  undo(current: Snapshot): Snapshot | null {
    const s = this.undoStack.pop()
    if (!s) return null
    this.redoStack.push({ ...current, label: s.label })
    return s
  }

  redo(current: Snapshot): Snapshot | null {
    const s = this.redoStack.pop()
    if (!s) return null
    this.undoStack.push({ ...current, label: s.label })
    return s
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }
  get undoLabel(): string | null { return this.undoStack.at(-1)?.label ?? null }
  get redoLabel(): string | null { return this.redoStack.at(-1)?.label ?? null }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
