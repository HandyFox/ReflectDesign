// Pure-ish document operations. They mutate the document passed in; the editor
// store snapshots the document before each change for undo.

import type { GroupObject, Id, Page, RDocument, SceneObject, Story, TextBoxObject } from './types'
import { boundsOfObjects, makeGroup, makePage, newId } from './factory'

export interface Frame {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface Location {
  list: SceneObject[]
  index: number
  /** Where the list lives. */
  owner: { kind: 'page'; page: Page } | { kind: 'scratch' } | { kind: 'group'; group: GroupObject }
}

// ---------- lookup ----------

function findIn(list: SceneObject[], id: Id, owner: Location['owner']): Location | null {
  for (let i = 0; i < list.length; i++) {
    const o = list[i]
    if (o.id === id) return { list, index: i, owner }
    if (o.type === 'group') {
      const r = findIn(o.children, id, { kind: 'group', group: o })
      if (r) return r
    }
  }
  return null
}

export function locate(doc: RDocument, id: Id): Location | null {
  for (const page of doc.pages) {
    const r = findIn(page.objects, id, { kind: 'page', page })
    if (r) return r
  }
  for (const page of doc.masters) {
    const r = findIn(page.objects, id, { kind: 'page', page })
    if (r) return r
  }
  return findIn(doc.scratch, id, { kind: 'scratch' })
}

export function getObject(doc: RDocument, id: Id): SceneObject | null {
  const loc = locate(doc, id)
  return loc ? loc.list[loc.index] : null
}

/** Visit every object (including group children). */
export function forEachObject(doc: RDocument, fn: (o: SceneObject) => void): void {
  const walk = (list: SceneObject[]) => {
    for (const o of list) {
      fn(o)
      if (o.type === 'group') walk(o.children)
    }
  }
  for (const p of doc.pages) walk(p.objects)
  for (const p of doc.masters) walk(p.objects)
  walk(doc.scratch)
}

// ---------- geometry of whole objects ----------

export function frameOf(o: SceneObject): Frame {
  return { x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation }
}

function rot(x: number, y: number, deg: number) {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a), s = Math.sin(a)
  return { x: x * c - y * s, y: x * s + y * c }
}

/** Move an object (and group children) by dx, dy. */
export function translate(o: SceneObject, dx: number, dy: number): void {
  o.x += dx
  o.y += dy
  if (o.type === 'group') for (const c of o.children) translate(c, dx, dy)
}

/**
 * Give an object a new frame. Groups map their children from the old frame
 * to the new one so the whole group scales and rotates together.
 */
export function setFrame(o: SceneObject, to: Frame): void {
  const from = frameOf(o)
  if (o.type === 'group') {
    for (const c of o.children) mapChild(c, from, to)
  }
  o.x = to.x
  o.y = to.y
  o.width = to.width
  o.height = to.height
  o.rotation = normalizeAngle(to.rotation)
}

function mapChild(child: SceneObject, from: Frame, to: Frame): void {
  const fcx = from.x + from.width / 2, fcy = from.y + from.height / 2
  const tcx = to.x + to.width / 2, tcy = to.y + to.height / 2
  const ccx = child.x + child.width / 2, ccy = child.y + child.height / 2
  const local = rot(ccx - fcx, ccy - fcy, -from.rotation)
  const sx = from.width ? to.width / from.width : 1
  const sy = from.height ? to.height / from.height : 1
  const mapped = rot(local.x * sx, local.y * sy, to.rotation)
  const rel = normalizeAngle(child.rotation - from.rotation)
  const sideways = Math.abs(((rel % 180) + 180) % 180 - 90) < 45
  const w = child.width * (sideways ? sy : sx)
  const h = child.height * (sideways ? sx : sy)
  const nx = tcx + mapped.x - w / 2
  const ny = tcy + mapped.y - h / 2
  // Like Publisher, font sizes stay the same when a group is resized; only boxes change.
  setFrame(child, { x: nx, y: ny, width: w, height: h, rotation: rel + to.rotation })
}

export function normalizeAngle(a: number): number {
  let r = a % 360
  if (r < 0) r += 360
  if (Math.abs(r - 360) < 1e-9) r = 0
  return Math.round(r * 1000) / 1000
}

/** Recompute a group's box from its children (after a child was edited). */
export function refreshGroupBounds(g: GroupObject): void {
  if (g.rotation !== 0) return // rotated groups keep their frame
  const b = boundsOfObjects(g.children)
  g.x = b.x; g.y = b.y; g.width = b.width; g.height = b.height
}

// ---------- stacking order ----------

/** Publisher "Bring Forward": one step toward the front. */
export function bringForward(doc: RDocument, ids: Id[]): void {
  const locs = sortedLocations(doc, ids).reverse()
  for (const loc of locs) {
    const { list, index } = loc
    const above = index + 1
    if (above >= list.length || ids.includes(list[above].id)) continue
    ;[list[index], list[above]] = [list[above], list[index]]
  }
}

/** Publisher "Send Backward": one step toward the back. */
export function sendBackward(doc: RDocument, ids: Id[]): void {
  const locs = sortedLocations(doc, ids)
  for (const loc of locs) {
    const { list, index } = loc
    const below = index - 1
    if (below < 0 || ids.includes(list[below].id)) continue
    ;[list[index], list[below]] = [list[below], list[index]]
  }
}

export function bringToFront(doc: RDocument, ids: Id[]): void {
  const locs = sortedLocations(doc, ids)
  const moved = new Map<SceneObject[], SceneObject[]>()
  for (const l of locs.reverse()) {
    const [o] = l.list.splice(l.index, 1)
    if (!moved.has(l.list)) moved.set(l.list, [])
    moved.get(l.list)!.unshift(o)
  }
  for (const [list, objs] of moved) list.push(...objs)
}

export function sendToBack(doc: RDocument, ids: Id[]): void {
  const locs = sortedLocations(doc, ids)
  const moved = new Map<SceneObject[], SceneObject[]>()
  for (const l of locs.reverse()) {
    const [o] = l.list.splice(l.index, 1)
    if (!moved.has(l.list)) moved.set(l.list, [])
    moved.get(l.list)!.unshift(o)
  }
  for (const [list, objs] of moved) list.unshift(...objs)
}

function sortedLocations(doc: RDocument, ids: Id[]): Location[] {
  return ids
    .map((id) => locate(doc, id))
    .filter((l): l is Location => l !== null)
    .sort((a, b) => a.index - b.index)
}

// ---------- add / remove ----------

export function addObject(page: Page, o: SceneObject): void {
  page.objects.push(o)
}

/** Remove objects. Linked text boxes are re-linked around the removed box. */
export function removeObjects(doc: RDocument, ids: Id[]): SceneObject[] {
  const removed: SceneObject[] = []
  for (const id of ids) {
    const loc = locate(doc, id)
    if (!loc) continue
    const o = loc.list[loc.index]
    if (o.type === 'text') unlinkBox(doc, o.id)
    loc.list.splice(loc.index, 1)
    removed.push(o)
    if (loc.owner.kind === 'group') collapseGroupIfNeeded(doc, loc.owner.group)
  }
  return removed
}

function collapseGroupIfNeeded(doc: RDocument, g: GroupObject): void {
  const loc = locate(doc, g.id)
  if (!loc) return
  if (g.children.length === 0) loc.list.splice(loc.index, 1)
  else if (g.children.length === 1) loc.list.splice(loc.index, 1, g.children[0])
  else refreshGroupBounds(g)
}

/** Remove a text box from its chain, joining its neighbours. */
export function unlinkBox(doc: RDocument, id: Id): void {
  const box = getObject(doc, id)
  if (!box || box.type !== 'text') return
  forEachObject(doc, (o) => {
    if (o.type === 'text' && o.nextId === id) o.nextId = box.type === 'text' ? box.nextId : null
  })
  box.nextId = null
}

// ---------- grouping ----------

export function group(doc: RDocument, ids: Id[]): GroupObject | null {
  const locs = sortedLocations(doc, ids)
  if (locs.length < 2) return null
  // Group into the list of the top-most selected object.
  const targetList = locs[locs.length - 1].list
  const objs = locs.map((l) => l.list[l.index])
  for (const l of [...locs].reverse()) l.list.splice(l.index, 1)
  const g = makeGroup(objs)
  const insertAt = Math.min(targetList.length, Math.max(0, locs[locs.length - 1].index - (locs.filter((l) => l.list === targetList).length - 1)))
  targetList.splice(insertAt, 0, g)
  return g
}

export function ungroup(doc: RDocument, id: Id): SceneObject[] {
  const loc = locate(doc, id)
  if (!loc) return []
  const g = loc.list[loc.index]
  if (g.type !== 'group') return []
  loc.list.splice(loc.index, 1, ...g.children)
  return g.children
}

// ---------- duplicate ----------

/**
 * Deep-copy objects with fresh ids. Text gets its own copy of the story.
 *
 * Text boxes that are linked to each other *within* the copied set stay linked
 * (and share one copy of their story), so duplicating a page with a linked
 * chain gives a working chain instead of boxes that all repeat the same text.
 *
 * `sourceStories` is where the original text lives (the clipboard when
 * pasting); it defaults to the document. The copies' stories are always added
 * to `doc` and the source is never written to.
 */
export function cloneObjects(doc: RDocument, objs: SceneObject[], sourceStories: RDocument['stories'] = doc.stories): SceneObject[] {
  // Every text box in the set, including those inside groups.
  const texts: TextBoxObject[] = []
  const walk = (l: SceneObject[]) => l.forEach((o) => { if (o.type === 'text') texts.push(o); else if (o.type === 'group') walk(o.children) })
  walk(objs)

  // Boxes joined by links inside the set form one component (union-find).
  const parent = new Map<Id, Id>(texts.map((t) => [t.id, t.id]))
  const find = (id: Id): Id => { let r = id; while (parent.get(r) !== r) r = parent.get(r)!; return r }
  for (const t of texts) {
    if (t.nextId && parent.has(t.nextId)) {
      const next = texts.find((x) => x.id === t.nextId)
      if (next && next.storyId === t.storyId) parent.set(find(t.id), find(t.nextId))
    }
  }

  const idMap = new Map<Id, Id>()
  const storyFor = new Map<Id, Id>() // component root → new story id
  const ctx: CloneCtx = {
    idMap,
    storyOf: (box) => {
      const root = find(box.id)
      let sid = storyFor.get(root)
      if (!sid) {
        const story = sourceStories[box.storyId]
        if (!story) return box.storyId
        const s: Story = structuredClone(story)
        s.id = newId('s')
        doc.stories[s.id] = s
        sid = s.id
        storyFor.set(root, sid)
      }
      return sid
    }
  }
  const copies = objs.map((o) => cloneObject(o, ctx))
  // Re-point links at the copies; links leaving the set are dropped.
  const fix = (l: SceneObject[]) => l.forEach((o) => {
    if (o.type === 'text') o.nextId = o.nextId ? idMap.get(o.nextId) ?? null : null
    else if (o.type === 'group') fix(o.children)
  })
  fix(copies)
  return copies
}

interface CloneCtx {
  idMap: Map<Id, Id>
  storyOf: (box: TextBoxObject) => Id
}

function cloneObject(o: SceneObject, ctx: CloneCtx): SceneObject {
  const c = structuredClone(o) as SceneObject
  c.id = newId()
  ctx.idMap.set(o.id, c.id)
  if (c.type === 'text' && o.type === 'text') {
    c.storyId = ctx.storyOf(o)
  } else if (c.type === 'group' && o.type === 'group') {
    c.children = o.children.map((ch) => cloneObject(ch, ctx))
  }
  return c
}

// ---------- pages ----------

export function insertPage(doc: RDocument, at: number, page?: Page): Page {
  const p = page ?? makePage()
  doc.pages.splice(Math.max(0, Math.min(at, doc.pages.length)), 0, p)
  return p
}

export function duplicatePage(doc: RDocument, index: number): Page {
  const src = doc.pages[index]
  const p: Page = structuredClone(src)
  p.id = newId('p')
  p.objects = cloneObjects(doc, src.objects)
  p.guides = p.guides.map((g) => ({ ...g, id: newId('g') }))
  doc.pages.splice(index + 1, 0, p)
  return p
}

export function deletePage(doc: RDocument, index: number): void {
  if (doc.pages.length <= 1) return
  const p = doc.pages[index]
  // Take the page's text boxes out of their chains first, joining the boxes
  // before and after (like deleting a single linked box), so a chain that
  // runs through this page keeps flowing into the following pages.
  const textIds: Id[] = []
  const walk = (l: SceneObject[]) => l.forEach((o) => { if (o.type === 'text') textIds.push(o.id); if (o.type === 'group') walk(o.children) })
  walk(p.objects)
  for (const id of textIds) unlinkBox(doc, id)
  doc.pages.splice(index, 1)
}

export function movePage(doc: RDocument, from: number, to: number): void {
  if (from === to || from < 0 || from >= doc.pages.length) return
  const [p] = doc.pages.splice(from, 1)
  doc.pages.splice(Math.max(0, Math.min(to, doc.pages.length)), 0, p)
}

// ---------- scratch area ----------

/**
 * Publisher keeps an object on the page if any part of it touches the page,
 * and parks it in the shared scratch area if it is completely off the page.
 */
export function settleScratch(doc: RDocument, page: Page, ids: Id[]): void {
  const { width, height } = doc.pageSetup
  for (const id of ids) {
    const loc = locate(doc, id)
    if (!loc || loc.owner.kind === 'group') continue
    const o = loc.list[loc.index]
    const b = boundsOfObjects([o])
    const off = b.x + b.width < 0 || b.y + b.height < 0 || b.x > width || b.y > height
    if (off && loc.owner.kind === 'page') {
      loc.list.splice(loc.index, 1)
      doc.scratch.push(o)
    } else if (!off && loc.owner.kind === 'scratch') {
      loc.list.splice(loc.index, 1)
      page.objects.push(o)
    }
  }
}

// ---------- housekeeping ----------

/** Drop stories and assets that nothing uses any more (called on save). */
export function collectGarbage(doc: RDocument): void {
  const stories = new Set<Id>()
  const assets = new Set<Id>()
  forEachObject(doc, (o) => {
    if (o.type === 'text') stories.add(o.storyId)
    if (o.type === 'picture' && o.assetId) assets.add(o.assetId)
  })
  for (const p of [...doc.pages, ...doc.masters]) {
    if (p.background.type === 'picture') assets.add(p.background.assetId)
  }
  for (const id of Object.keys(doc.stories)) if (!stories.has(id)) delete doc.stories[id]
  for (const id of Object.keys(doc.assets)) if (!assets.has(id)) delete doc.assets[id]
}

/** Text boxes in a story's chain, in flow order. */
export function chainOf(doc: RDocument, storyId: Id): Id[] {
  const boxes: Array<{ id: Id; nextId: Id | null }> = []
  forEachObject(doc, (o) => { if (o.type === 'text' && o.storyId === storyId) boxes.push({ id: o.id, nextId: o.nextId }) })
  const pointedTo = new Set(boxes.map((b) => b.nextId).filter(Boolean))
  const head = boxes.find((b) => !pointedTo.has(b.id)) ?? boxes[0]
  const out: Id[] = []
  let cur = head
  while (cur && !out.includes(cur.id)) {
    out.push(cur.id)
    cur = boxes.find((b) => b.id === cur!.nextId)!
  }
  return out
}
