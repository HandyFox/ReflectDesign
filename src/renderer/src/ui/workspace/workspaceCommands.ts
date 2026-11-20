import { editor as ed } from '@core/editor'
import type { Id, ShapeKind } from '@core/model/types'
import { cloneObjects, getObject } from '@core/model/ops'
import { makeShape } from '@core/model/factory'
export { insertTextBox, linkTextBoxes, placeImageFiles } from '@core/commands'

interface Rect { x: number; y: number; width: number; height: number }

/** Draw a shape. Lines drawn right-to-left or bottom-to-top keep their direction with flips. */
export function insertShape(rect: Rect, kind: ShapeKind, flipH = false, flipV = false): void {
  let id = ''
  ed.change(kind === 'line' ? 'Draw Line' : 'Insert Shape', () => {
    const s = makeShape(rect, kind)
    s.flipH = flipH
    s.flipV = flipV
    id = s.id
    ed.page.objects.push(s)
  })
  ed.select([id])
  ed.setTool({ kind: 'select' })
}

/** Ctrl+drag: copy the objects in place (inside the current live change) and return the copies' ids. */
export function cloneSelectionForDrag(ids: Id[]): Id[] {
  const objs = ids.map((id) => getObject(ed.doc, id)).filter((o) => !!o)
  let out: Id[] = []
  ed.liveChange((doc) => {
    const copies = cloneObjects(doc, objs as any)
    ed.page.objects.push(...copies)
    out = copies.map((c) => c.id)
  })
  return out
}
