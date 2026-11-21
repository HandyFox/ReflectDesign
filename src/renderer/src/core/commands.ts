// Commands invoked from the ribbon, keyboard shortcuts and menus.

import type { AssetData, CharStyle, Id, ParaStyle, RDocument, SceneObject, ShapeKind, TextBoxObject } from './model/types'
import { boundsOfObjects, makeDocument, makePicture, makeShape, makeStory, makeTextBox, newId } from './model/factory'
import {
  bringForward, bringToFront, cloneObjects, deletePage, duplicatePage, frameOf, getObject, group, insertPage,
  locate, movePage, removeObjects, sendBackward, sendToBack, setFrame, settleScratch, translate, ungroup, collectGarbage
} from './model/ops'
import { editor, type Editor } from './editor'
import { readPackage, writePackage, type TemplateMeta } from './io/rdx'
import { applyCharStyle, applyParaStyle, commonCharStyle, deleteRange, endOfStory, insertText, textOfRange } from './text/edit'
import type { TextPos } from './text/layout'
import { renderPage, type RenderEnv } from './render/canvas'
import { platform } from '../platform'
import type { StarterTemplate } from './templates/starters'

const ed: Editor = editor

// ---------- files ----------

/**
 * Before the open publication is replaced (New, Open, Close…): if it has
 * unsaved changes, ask Save / Don't Save / Cancel. Returns false to stop.
 */
export async function confirmReplace(): Promise<boolean> {
  if (!ed.dirty) return true
  const choice = await platform.askUnsaved(ed.fileName)
  if (choice === 'cancel') return false
  if (choice === 'save') return save()
  return true
}

export async function newDocument(width = 612, height = 792): Promise<void> {
  if (!(await confirmReplace())) return
  ed.load(makeDocument(width, height), new Map(), null, nextUntitled())
  ed.backstage = null
  ed.touch()
}

let untitled = 1
function nextUntitled(): string {
  return `Publication${untitled++}`
}

export async function openDocument(): Promise<void> {
  if (!(await confirmReplace())) return
  const f = await platform.openDocument()
  if (!f) return
  await openBytes(f.bytes, f.path, f.name)
}

export async function openBytes(bytes: Uint8Array, path: string | null, name: string): Promise<void> {
  try {
    const r = await readPackage(bytes)
    const isTemplate = /\.rdt$/i.test(name)
    // Opening a template starts a new, untitled publication based on it (like Publisher).
    ed.load(r.doc, r.assets, isTemplate ? null : path, isTemplate ? nextUntitled() : name)
    ed.backstage = null
    ed.touch()
  } catch (e) {
    alert((e as Error).message)
  }
}

async function packageBytes(template?: TemplateMeta): Promise<Uint8Array> {
  const doc: RDocument = structuredClone(ed.doc)
  collectGarbage(doc)
  const thumbnail = await pageThumbnail(doc, 0, 256)
  return writePackage({ doc, assets: ed.assets.all, thumbnail, template })
}

/** Show a save/open problem instead of failing silently. */
function reportFileError(action: string, e: unknown): void {
  const msg = (e as Error)?.message ?? String(e)
  ed.setStatus(`${action} failed`)
  alert(`ReflectDesign couldn't ${action.toLowerCase()} this file.\n\n${msg}`)
}

export async function save(): Promise<boolean> {
  // Editing a template (File › New › New Blank Template): Save updates the template.
  if (ed.templateMeta) return saveTemplateInPlace()
  if (!ed.filePath) return saveAs()
  try {
    const bytes = await packageBytes()
    const path = await platform.saveDocument(bytes, ed.filePath, ed.fileName, 'rdx')
    if (!path) return false
    ed.markSaved(path)
    ed.setStatus('Saved')
    return true
  } catch (e) {
    reportFileError('Save', e)
    return false
  }
}

export async function saveAs(): Promise<boolean> {
  try {
    const bytes = await packageBytes()
    const path = await platform.saveDocument(bytes, null, `${ed.fileName}.rdx`, 'rdx')
    if (!path) return false
    // Saving as a publication ends template editing; the template stays as it was last saved.
    ed.templateMeta = null
    ed.markSaved(path, path.split(/[\\/]/).pop())
    ed.backstage = null
    ed.setStatus('Saved')
    return true
  } catch (e) {
    reportFileError('Save', e)
    return false
  }
}

export async function saveAsTemplate(meta: TemplateMeta): Promise<boolean> {
  try {
    const bytes = await packageBytes(meta)
    const path = await platform.saveTemplate(bytes, meta.name)
    if (path) ed.setStatus(`Saved template "${meta.name}"`)
    return !!path
  } catch (e) {
    reportFileError('Save', e)
    return false
  }
}

async function saveTemplateInPlace(): Promise<boolean> {
  const meta = ed.templateMeta!
  const ok = await saveAsTemplate(meta)
  if (ok) ed.markSaved(null, meta.name)
  return ok
}

/** Names of the personal templates already saved (for duplicate checks). */
export async function personalTemplateNames(): Promise<string[]> {
  try {
    return (await platform.listTemplates()).filter((t) => !t.builtIn).map((t) => t.name)
  } catch {
    return []
  }
}

/**
 * File › New › New Blank Template: start a blank design that is saved as a
 * personal template. It is saved straight away so it shows up under
 * New › Personal, and Save (Ctrl+S) keeps updating that template.
 */
export async function newBlankTemplate(meta: TemplateMeta, width: number, height: number): Promise<boolean> {
  if (!(await confirmReplace())) return false
  ed.load(makeDocument(width, height), new Map(), null, meta.name)
  ed.templateMeta = { ...meta }
  ed.updateTitle()
  const ok = await saveTemplateInPlace()
  ed.backstage = null
  ed.touch()
  return ok
}

/** File › Open › Recent: open a file from the recent list. */
export async function openRecent(path: string): Promise<void> {
  if (!(await confirmReplace())) return
  let f: Awaited<ReturnType<typeof platform.openRecent>>
  try {
    f = await platform.openRecent(path)
  } catch (e) {
    reportFileError('Open', e)
    return
  }
  if (!f) {
    alert('That file could not be found. It may have been moved, renamed or deleted, so it has been removed from the Recent list.')
    return
  }
  await openBytes(f.bytes, f.path, f.name)
}

export async function newFromStarter(t: StarterTemplate): Promise<void> {
  if (!(await confirmReplace())) return
  ed.load(t.build(), new Map(), null, nextUntitled())
  ed.backstage = null
  ed.touch()
}

export async function newFromTemplate(path: string): Promise<void> {
  if (!(await confirmReplace())) return
  const bytes = await platform.readTemplate(path)
  await openBytes(bytes, null, 'template.rdt')
}

/** Render a page to a PNG of the given longest side. */
export async function pageThumbnail(doc: RDocument, pageIndex: number, longest: number): Promise<Uint8Array | undefined> {
  const page = doc.pages[pageIndex]
  if (!page) return undefined
  const { width, height } = doc.pageSetup
  const scale = longest / Math.max(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  const env: RenderEnv = { doc, assets: ed.assets, text: ed.text, pxPerPt: scale, forOutput: true }
  ed.text.invalidate()
  renderPage(ctx, env, page)
  ed.text.invalidate()
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}

// ---------- inserting ----------

interface Rect { x: number; y: number; width: number; height: number }

export function insertTextBox(rect: Rect, text = ''): TextBoxObject {
  let box!: TextBoxObject
  ed.change('Draw Text Box', (doc) => {
    const story = makeStory(text)
    doc.stories[story.id] = story
    box = makeTextBox(rect, story.id)
    ed.page.objects.push(box)
  })
  ed.selection = [box.id]
  ed.editing = { boxId: box.id, storyId: box.storyId, caret: { para: 0, offset: 0 }, anchor: { para: 0, offset: 0 }, pending: null, goalX: null }
  ed.setTool({ kind: 'select' })
  return box
}

export function insertShape(rect: Rect, kind: ShapeKind): void {
  let id = ''
  ed.change('Insert Shape', () => {
    const s = makeShape(rect, kind)
    id = s.id
    ed.page.objects.push(s)
  })
  ed.select([id])
  ed.setTool({ kind: 'select' })
}

/** Insert > Pictures: pick files and place them on the page. */
export async function insertPictures(): Promise<void> {
  const files = await platform.pickImages()
  if (!files.length) return
  await placeImageFiles(files)
}

export async function placeImageFiles(files: Array<{ name: string; mime: string; bytes: Uint8Array }>, at?: { x: number; y: number }): Promise<void> {
  const infos: import("./model/types").AssetInfo[] = []
  for (const f of files) infos.push(await ed.assets.add(f.name, f.mime, f.bytes))
  const { width: pw, height: ph } = ed.doc.pageSetup
  const ids: Id[] = []
  // If a picture placeholder is selected, fill it (Publisher behaviour).
  const target = ed.single
  ed.change('Insert Picture', (doc) => {
    infos.forEach((info, i) => {
      doc.assets[info.id] = info
      if (i === 0 && target && target.type === 'picture' && !target.assetId) {
        const t = getObject(doc, target.id)
        if (t && t.type === 'picture') {
          t.assetId = info.id
          t.name = 'Picture'
          fitPictureInto(t, info.pixelWidth, info.pixelHeight)
          ids.push(t.id)
          return
        }
      }
      // Natural size at 96 DPI, scaled down to fit within the page margins.
      let w = (info.pixelWidth || 300) * 0.75
      let h = (info.pixelHeight || 300) * 0.75
      const maxW = pw * 0.8, maxH = ph * 0.8
      const k = Math.min(1, maxW / w, maxH / h)
      w *= k; h *= k
      const cx = at ? at.x : pw / 2
      const cy = at ? at.y : ph / 2
      const offset = i * 18
      const pic = makePicture({ x: cx - w / 2 + offset, y: cy - h / 2 + offset, width: w, height: h }, info.id)
      pic.name = info.name.replace(/\.[^.]+$/, '')
      ed.page.objects.push(pic)
      ids.push(pic.id)
    })
  })
  ed.select(ids)
}

function fitPictureInto(o: SceneObject, pw: number, ph: number): void {
  if (!pw || !ph) return
  const k = Math.min(o.width / pw, o.height / ph)
  const w = pw * k, h = ph * k
  o.x += (o.width - w) / 2
  o.y += (o.height - h) / 2
  o.width = w
  o.height = h
}

// ---------- cropping ----------

export function toggleCrop(): void {
  const pic = ed.single
  if (ed.cropping) { ed.cropping = null; ed.touch(); return }
  if (!pic || pic.type !== 'picture' || !pic.assetId) return
  ed.editing = null
  ed.cropping = pic.id
  ed.setStatus('Drag the black crop handles to crop. Drag the picture to move it inside the frame. Press Esc when done.')
}

/** Fill: crop the picture so it fills its frame. Fit: show the whole picture inside the frame. */
export function cropFitFill(mode: 'fill' | 'fit' | 'clear'): void {
  const pic = ed.single
  if (!pic || pic.type !== 'picture' || !pic.assetId) return
  const info = ed.doc.assets[pic.assetId]
  if (!info?.pixelWidth || !info.pixelHeight) return
  ed.change(mode === 'clear' ? 'Clear Crop' : mode === 'fill' ? 'Fill' : 'Fit', (doc) => {
    const o = getObject(doc, pic.id)
    if (!o || o.type !== 'picture') return
    const ia = info.pixelWidth / info.pixelHeight
    if (mode === 'clear') {
      // Keep the width, restore the picture's own proportions.
      const cx = o.x + o.width / 2, cy = o.y + o.height / 2
      o.height = o.width / ia
      o.x = cx - o.width / 2
      o.y = cy - o.height / 2
      o.crop = { left: 0, top: 0, right: 0, bottom: 0 }
      return
    }
    const fa = o.width / o.height
    let fx = 1, fy = 1
    if (mode === 'fill') { if (ia > fa) fx = fa / ia; else fy = ia / fa }
    else { if (ia > fa) fy = ia / fa; else fx = fa / ia }
    o.crop = { left: (1 - fx) / 2, right: (1 - fx) / 2, top: (1 - fy) / 2, bottom: (1 - fy) / 2 }
  })
}

export function insertPicturePlaceholder(): void {
  const { width: pw, height: ph } = ed.doc.pageSetup
  const s = Math.min(pw, ph) * 0.3
  let id = ''
  ed.change('Picture Placeholder', () => {
    const p = makePicture({ x: (pw - s) / 2, y: (ph - s) / 2, width: s, height: s }, null)
    id = p.id
    ed.page.objects.push(p)
  })
  ed.select([id])
}

// ---------- clipboard ----------

interface ClipData {
  /** Identifies this copy on the system clipboard. */
  id: string
  /** Plain text written to the system clipboard alongside it. */
  text: string
  objects: SceneObject[]
  stories: RDocument['stories']
  assets: RDocument['assets']
  /** Picture bytes, so a paste into another publication still has them. */
  assetData: Map<Id, AssetData>
}
let clipboard: ClipData | null = null
let pasteCount = 0

/** Clipboard format that marks ReflectDesign objects on the system clipboard. */
export const CLIP_MIME = 'application/x-reflectdesign-objects'

export function hasClipboard(): boolean {
  return clipboard !== null
}

/**
 * Is the system clipboard still holding the objects we copied? If the person
 * has copied something in another app since, that newer content wins.
 */
export function clipboardIsOurs(dt: DataTransfer | null | undefined): boolean {
  if (!clipboard) return false
  if (!dt) return true
  const types = Array.from(dt.types ?? [])
  if (types.includes(CLIP_MIME)) return dt.getData(CLIP_MIME) === clipboard.id
  // Our marker didn't survive (some platforms drop custom formats): compare the text.
  if (types.some((t) => t.startsWith('image/')) || (dt.files && dt.files.length > 0)) return false
  return (dt.getData('text/plain') ?? '') === clipboard.text
}

/** Put a marker (and the copied text) on the system clipboard. */
function writeSystemClipboard(text: string, id: string): void {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return
  const onCopy = (ev: ClipboardEvent) => {
    ev.clipboardData?.setData('text/plain', text)
    ev.clipboardData?.setData(CLIP_MIME, id)
    ev.preventDefault()
  }
  document.addEventListener('copy', onCopy)
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.removeEventListener('copy', onCopy)
  if (!ok) navigator.clipboard?.writeText(text).catch(() => {})
}

/** Paste plain text from another app as a new text box. */
export function pasteTextAsBox(text: string): void {
  const { width, height } = ed.doc.pageSetup
  const box = insertTextBox({ x: width / 2 - 144, y: height / 2 - 36, width: 288, height: 72 }, text)
  ed.editing = null
  ed.change('Paste', (doc) => {
    const b = getObject(doc, box.id)
    if (b && b.type === 'text') b.autofit = 'growBox'
  })
  ed.select([box.id])
}

export function copy(): void {
  const objs = ed.selectedObjects
  if (!objs.length) return
  const stories: ClipData['stories'] = {}
  const assets: ClipData['assets'] = {}
  const assetData = new Map<Id, AssetData>()
  const texts: string[] = []
  const walk = (o: SceneObject) => {
    if (o.type === 'text' && ed.doc.stories[o.storyId]) {
      if (!stories[o.storyId]) {
        const s = ed.doc.stories[o.storyId]
        texts.push(textOfRange(s, { para: 0, offset: 0 }, endOfStory(s)))
      }
      stories[o.storyId] = structuredClone(ed.doc.stories[o.storyId])
    }
    if (o.type === 'picture' && o.assetId && ed.doc.assets[o.assetId]) {
      assets[o.assetId] = structuredClone(ed.doc.assets[o.assetId])
      const data = ed.assets.get(o.assetId)
      if (data) assetData.set(o.assetId, data)
    }
    if (o.type === 'group') o.children.forEach(walk)
  }
  objs.forEach(walk)
  const text = texts.join('\n')
  clipboard = { id: newId('clip'), text, objects: structuredClone(objs), stories, assets, assetData }
  pasteCount = 0
  writeSystemClipboard(text, clipboard.id)
}

export function cut(): void {
  copy()
  deleteSelection('Cut')
}

export function paste(): void {
  if (!clipboard) return
  const clip = clipboard
  pasteCount++
  let ids: Id[] = []
  // Pictures copied from another publication: bring their bytes along.
  for (const [id, data] of clip.assetData) if (!ed.assets.get(id)) ed.assets.put(data)
  ed.change('Paste', (doc) => {
    // The copies get fresh stories made from the clipboard's text. The
    // originals' stories in the document are left alone (they may have been
    // edited since the copy).
    for (const [id, info] of Object.entries(clip.assets)) doc.assets[id] ??= structuredClone(info)
    const copies = cloneObjects(doc, clip.objects, clip.stories)
    for (const c of copies) translate(c, 12 * pasteCount, 12 * pasteCount)
    ed.page.objects.push(...copies)
    ids = copies.map((c) => c.id)
  })
  ed.select(ids)
}

export function duplicate(): void {
  const objs = ed.selectedObjects
  if (!objs.length) return
  let ids: Id[] = []
  ed.change('Duplicate', (doc) => {
    const copies = cloneObjects(doc, objs)
    for (const c of copies) translate(c, 12, 12)
    ed.page.objects.push(...copies)
    ids = copies.map((c) => c.id)
  })
  ed.select(ids)
}

export function deleteSelection(label = 'Delete Object'): void {
  if (!ed.selection.length) return
  const ids = ed.selectedObjects.filter((o) => !o.locked).map((o) => o.id)
  if (!ids.length) return
  ed.change(label, (doc) => { removeObjects(doc, ids) })
  ed.clearSelection()
}

export function selectAll(): void {
  ed.select([...ed.page.objects.map((o) => o.id)])
}

// ---------- arranging ----------

export function nudge(dx: number, dy: number): void {
  const ids = ed.selection
  if (!ids.length) return
  ed.change('Nudge', (doc) => {
    for (const id of ids) {
      const o = getObject(doc, id)
      if (o && !o.locked) translate(o, dx, dy)
    }
    settleScratch(doc, ed.page, ids)
  }, `nudge:${ids.join(',')}`)
}

export const arrange = {
  bringForward: () => ed.change('Bring Forward', (d) => bringForward(d, ed.selection)),
  bringToFront: () => ed.change('Bring to Front', (d) => bringToFront(d, ed.selection)),
  sendBackward: () => ed.change('Send Backward', (d) => sendBackward(d, ed.selection)),
  sendToBack: () => ed.change('Send to Back', (d) => sendToBack(d, ed.selection))
}

export function groupSelection(): void {
  if (ed.selection.length < 2) return
  let gid = ''
  ed.change('Group', (doc) => {
    const g = group(doc, ed.selection)
    if (g) gid = g.id
  })
  if (gid) ed.select([gid])
}

export function ungroupSelection(): void {
  const g = ed.single
  if (!g || g.type !== 'group') return
  let ids: Id[] = []
  ed.change('Ungroup', (doc) => { ids = ungroup(doc, g.id).map((o) => o.id) })
  ed.select(ids)
}

/** Ctrl+Shift+G toggles grouping, as in Publisher. */
export function toggleGroup(): void {
  const s = ed.single
  if (s && s.type === 'group') ungroupSelection()
  else groupSelection()
}

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/** Align objects. With one object (or when relativeToPage) aligns to the page/margins. */
export function align(kind: AlignKind, relativeToMargins = false): void {
  const objs = ed.selectedObjects
  if (!objs.length) return
  const { width, height, margins } = ed.doc.pageSetup
  const ref = objs.length === 1 || relativeToMargins
    ? relativeToMargins
      ? { x: margins.left, y: margins.top, width: width - margins.left - margins.right, height: height - margins.top - margins.bottom }
      : { x: 0, y: 0, width, height }
    : boundsOfObjects(objs)
  ed.change('Align', (doc) => {
    for (const s of objs) {
      const o = getObject(doc, s.id)
      if (!o || o.locked) continue
      const b = boundsOfObjects([o])
      let dx = 0, dy = 0
      if (kind === 'left') dx = ref.x - b.x
      if (kind === 'center') dx = ref.x + ref.width / 2 - (b.x + b.width / 2)
      if (kind === 'right') dx = ref.x + ref.width - (b.x + b.width)
      if (kind === 'top') dy = ref.y - b.y
      if (kind === 'middle') dy = ref.y + ref.height / 2 - (b.y + b.height / 2)
      if (kind === 'bottom') dy = ref.y + ref.height - (b.y + b.height)
      translate(o, dx, dy)
    }
  })
}

export function distribute(dir: 'h' | 'v'): void {
  // Locked objects stay where they are (like Align).
  const objs = ed.selectedObjects.filter((o) => !o.locked)
  if (objs.length < 3) return
  const items = objs.map((o) => ({ id: o.id, b: boundsOfObjects([o]) }))
  items.sort((a, b) => (dir === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y))
  const first = items[0].b, last = items.at(-1)!.b
  const total = items.reduce((s, i) => s + (dir === 'h' ? i.b.width : i.b.height), 0)
  const span = dir === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y
  const gap = (span - total) / (items.length - 1)
  ed.change('Distribute', (doc) => {
    let pos = dir === 'h' ? first.x : first.y
    for (const it of items) {
      const o = getObject(doc, it.id)!
      if (dir === 'h') translate(o, pos - it.b.x, 0)
      else translate(o, 0, pos - it.b.y)
      pos += (dir === 'h' ? it.b.width : it.b.height) + gap
    }
  })
}

export function rotateBy(deg: number): void {
  const ids = ed.selection
  if (!ids.length) return
  ed.change(deg > 0 ? 'Rotate Right 90°' : 'Rotate Left 90°', (doc) => {
    for (const id of ids) {
      const o = getObject(doc, id)
      if (o && !o.locked) setFrame(o, { ...frameOf(o), rotation: o.rotation + deg })
    }
  })
}

export function flip(axis: 'h' | 'v'): void {
  const ids = ed.selection
  if (!ids.length) return
  ed.change(axis === 'h' ? 'Flip Horizontal' : 'Flip Vertical', (doc) => {
    for (const id of ids) {
      const o = getObject(doc, id)
      if (!o || o.locked) continue
      flipObject(o, axis, o.x + o.width / 2, o.y + o.height / 2)
    }
  })
}

function flipObject(o: SceneObject, axis: 'h' | 'v', cx: number, cy: number): void {
  if (o.type === 'group') {
    for (const c of o.children) flipObject(c, axis, cx, cy)
    return
  }
  const ocx = o.x + o.width / 2, ocy = o.y + o.height / 2
  if (axis === 'h') {
    o.x = 2 * cx - ocx - o.width / 2
    if (o.type !== 'text') o.flipH = !o.flipH
  } else {
    o.y = 2 * cy - ocy - o.height / 2
    if (o.type !== 'text') o.flipV = !o.flipV
  }
  o.rotation = (360 - o.rotation) % 360
}

export function setObjectProps(label: string, patch: (o: SceneObject) => void, coalesce?: string): void {
  const ids = ed.selection
  if (!ids.length) return
  ed.change(label, (doc) => {
    for (const id of ids) {
      const o = getObject(doc, id)
      if (o) patch(o)
    }
  }, coalesce)
}

// ---------- pages ----------

export function addPage(after = ed.pageIndex): void {
  ed.change('Insert Page', (doc) => { insertPage(doc, after + 1) })
  ed.goToPage(after + 1)
}

export function duplicateCurrentPage(): void {
  const i = ed.pageIndex
  ed.change('Duplicate Page', (doc) => { duplicatePage(doc, i) })
  ed.goToPage(i + 1)
}

export function deleteCurrentPage(): void {
  if (ed.doc.pages.length <= 1) {
    ed.setStatus('A publication must have at least one page.')
    return
  }
  const i = ed.pageIndex
  ed.change('Delete Page', (doc) => { deletePage(doc, i) })
  ed.pageIndex = Math.min(i, ed.doc.pages.length - 1)
  ed.clearSelection()
}

export function moveCurrentPage(to: number): void {
  const from = ed.pageIndex
  ed.change('Move Page', (doc) => { movePage(doc, from, to) })
  ed.pageIndex = Math.max(0, Math.min(to, ed.doc.pages.length - 1))
  ed.touch()
}

export function setPageSize(width: number, height: number): void {
  ed.change('Page Size', (doc) => {
    doc.pageSetup.width = width
    doc.pageSetup.height = height
  })
  ed.requestView('fit-page')
}

export function setMargins(m: RDocument['pageSetup']['margins']): void {
  ed.change('Margins', (doc) => { doc.pageSetup.margins = { ...m } })
}

export function swapOrientation(want: 'portrait' | 'landscape'): void {
  const { width, height } = ed.doc.pageSetup
  const isLandscape = width > height
  if ((want === 'landscape') === isLandscape) return
  setPageSize(height, width)
}

// ---------- text formatting ----------

/** Range the formatting commands act on: the text selection, or whole selected boxes. */
function textTargets(): Array<{ storyId: Id; from: TextPos; to: TextPos }> {
  if (ed.editing) {
    return [{ storyId: ed.editing.storyId, from: ed.editing.anchor, to: ed.editing.caret }]
  }
  const out: Array<{ storyId: Id; from: TextPos; to: TextPos }> = []
  const walk = (o: SceneObject) => {
    if (o.type === 'text') {
      const story = ed.doc.stories[o.storyId]
      if (story && !out.some((t) => t.storyId === o.storyId)) out.push({ storyId: o.storyId, from: { para: 0, offset: 0 }, to: endOfStory(story) })
    }
    if (o.type === 'group') o.children.forEach(walk)
  }
  ed.selectedObjects.forEach(walk)
  return out
}

export function formatText(label: string, patch: Partial<CharStyle>, coalesce?: string): void {
  const targets = textTargets()
  if (!targets.length) return
  const e = ed.editing
  if (e && e.anchor.para === e.caret.para && e.anchor.offset === e.caret.offset) {
    // Nothing selected: the format applies to what is typed next. An empty
    // paragraph also takes it immediately so the caret size updates.
    e.pending = { ...(e.pending ?? {}), ...patch }
    const story = ed.doc.stories[e.storyId]
    const p = story?.paragraphs[e.caret.para]
    if (p && p.runs.every((r) => r.text === '')) {
      ed.change(label, (doc) => applyCharStyle(doc.stories[e.storyId], e.caret, e.caret, patch))
    } else ed.touch()
    return
  }
  ed.change(label, (doc) => {
    for (const t of targets) {
      const story = doc.stories[t.storyId]
      if (story) applyCharStyle(story, t.from, t.to, patch)
    }
  }, coalesce)
}

/** Formatting shared by all the text the formatting commands would act on. */
export function currentTextStyle(): Partial<CharStyle> {
  const targets = textTargets()
  const e = ed.editing
  let common: Partial<CharStyle> | null = null
  for (const t of targets) {
    const story = ed.doc.stories[t.storyId]
    if (!story) continue
    const s = commonCharStyle(story, t.from, t.to)
    if (!common) common = { ...s }
    else for (const k of Object.keys(common) as Array<keyof CharStyle>) if (JSON.stringify(common[k]) !== JSON.stringify(s[k])) delete common[k]
  }
  return { ...(common ?? {}), ...(e?.pending ?? {}) }
}

/** Ctrl+B / Ctrl+I / Ctrl+U: turn the style on, or off if all the text already has it. */
export function toggleTextStyle(prop: 'bold' | 'italic' | 'underline'): void {
  const cur = currentTextStyle()
  if (prop === 'underline') formatText('Underline', { underline: cur.underline && cur.underline !== 'none' ? 'none' : 'single' })
  else formatText(prop === 'bold' ? 'Bold' : 'Italic', { [prop]: !cur[prop] })
}

export function formatParagraph(label: string, patch: Partial<ParaStyle>): void {
  const targets = textTargets()
  if (!targets.length) return
  ed.change(label, (doc) => {
    for (const t of targets) {
      const story = doc.stories[t.storyId]
      if (story) applyParaStyle(story, t.from, t.to, patch)
    }
  })
}

/** Drop Cap: on the paragraph being edited, or the first paragraph of the selected text boxes. */
export function setDropCap(lines: number | null): void {
  const targets = textTargets()
  if (!targets.length) return
  ed.change(lines ? 'Drop Cap' : 'Remove Drop Cap', (doc) => {
    for (const t of targets) {
      const story = doc.stories[t.storyId]
      if (!story) continue
      const from = ed.editing ? Math.min(t.from.para, t.to.para) : 0
      const to = ed.editing ? Math.max(t.from.para, t.to.para) : 0
      for (let p = from; p <= to; p++) story.paragraphs[p].style.dropCap = lines ? { lines, chars: 1 } : null
    }
  })
}

/** Replace a word (spelling suggestion). */
export function replaceText(storyId: Id, para: number, start: number, end: number, text: string): void {
  ed.change('Spelling', (doc) => {
    const story = doc.stories[storyId]
    if (!story) return
    const pos = deleteRange(story, { para, offset: start }, { para, offset: end })
    const after = insertText(story, pos, text)
    if (ed.editing && ed.editing.storyId === storyId) {
      ed.editing.caret = after
      ed.editing.anchor = after
    }
  })
}

export function setTextBoxProps(label: string, patch: Partial<TextBoxObject>): void {
  const box = ed.activeTextBox
  const ids = box ? [box.id] : ed.selection
  ed.change(label, (doc) => {
    for (const id of ids) {
      const o = getObject(doc, id)
      if (o && o.type === 'text') Object.assign(o, patch)
    }
  })
}

// ---------- transparency ----------

type Filled = Extract<SceneObject, { fill: unknown }>

function hasFill(o: SceneObject): o is Filled {
  return o.type === 'text' || o.type === 'picture' || o.type === 'shape'
}

function leaves(objs: SceneObject[]): SceneObject[] {
  return objs.flatMap((o) => (o.type === 'group' ? leaves(o.children) : [o]))
}

/** Fill transparency of the selection (0 = solid, 1 = clear), null if none have a fill. */
export function fillTransparency(): number | null {
  for (const o of leaves(ed.selectedObjects)) {
    if (!hasFill(o)) continue
    if (o.fill.type === 'solid') return 1 - o.fill.opacity
    if (o.fill.type === 'linear' || o.fill.type === 'radial') return 1 - (o.fill.stops[0]?.opacity ?? 1)
  }
  return null
}

/** Publisher's Fill Transparency slider. Changes made while dragging become one undo step. */
export function setFillTransparency(t: number): void {
  const ids = ed.selection.join(',')
  ed.change('Fill Transparency', (doc) => {
    for (const s of ed.selectedObjects) {
      const o = getObject(doc, s.id)
      if (!o) continue
      for (const leaf of leaves([o])) {
        if (!hasFill(leaf)) continue
        const f = leaf.fill
        if (f.type === 'solid') f.opacity = 1 - t
        else if (f.type === 'linear' || f.type === 'radial') f.stops.forEach((st) => { st.opacity = 1 - t })
      }
    }
  }, `fillT:${ids}`)
}

export function lineTransparency(): number | null {
  for (const o of leaves(ed.selectedObjects)) if (hasFill(o) && o.stroke.width > 0) return 1 - o.stroke.opacity
  return null
}

export function setLineTransparency(t: number): void {
  const ids = ed.selection.join(',')
  ed.change('Line Transparency', (doc) => {
    for (const s of ed.selectedObjects) {
      const o = getObject(doc, s.id)
      if (o) for (const leaf of leaves([o])) if (hasFill(leaf)) leaf.stroke.opacity = 1 - t
    }
  }, `lineT:${ids}`)
}

export function pictureTransparency(): number | null {
  const p = leaves(ed.selectedObjects).find((o) => o.type === 'picture')
  return p && p.type === 'picture' ? 1 - p.opacity : null
}

export function setPictureTransparency(t: number): void {
  const ids = ed.selection.join(',')
  ed.change('Picture Transparency', (doc) => {
    for (const s of ed.selectedObjects) {
      const o = getObject(doc, s.id)
      if (o) for (const leaf of leaves([o])) if (leaf.type === 'picture') leaf.opacity = 1 - t
    }
  }, `picT:${ids}`)
}

export function setTextTransparency(t: number): void {
  formatText('Text Transparency', { opacity: 1 - t }, `textT:${ed.selection.join(',')}`)
}

// ---------- linking text boxes ----------

/** Publisher "Create Link": the next text box clicked continues this story. */
export function linkTextBoxes(fromId: Id, toId: Id): boolean {
  const from = getObject(ed.doc, fromId)
  const to = getObject(ed.doc, toId)
  if (!from || !to || from.type !== 'text' || to.type !== 'text' || from.id === to.id) return false
  const target = ed.doc.stories[to.storyId]
  const targetEmpty = target && target.paragraphs.every((p) => p.runs.every((r) => r.text === ''))
  if (!targetEmpty || to.nextId) {
    ed.setStatus('The text box you link to must be empty and not already linked.')
    return false
  }
  ed.change('Create Link', (doc) => {
    const f = getObject(doc, fromId) as TextBoxObject
    const t = getObject(doc, toId) as TextBoxObject
    // Splice into the chain after `from`.
    t.nextId = f.nextId
    f.nextId = t.id
    t.storyId = f.storyId
  })
  return true
}

export function breakLink(boxId: Id): void {
  const box = getObject(ed.doc, boxId)
  if (!box || box.type !== 'text' || !box.nextId) return
  ed.change('Break Link', (doc) => {
    const b = getObject(doc, boxId) as TextBoxObject
    // Following boxes become empty, independent boxes.
    let next = b.nextId
    b.nextId = null
    while (next) {
      const n = getObject(doc, next)
      if (!n || n.type !== 'text') break
      const s = makeStory('')
      doc.stories[s.id] = s
      n.storyId = s.id
      next = n.nextId
      n.nextId = null
    }
  })
}

// ---------- misc ----------

export function zoomBy(factor: number): void {
  ed.setZoom(ed.zoom * factor)
}

export function lockToggle(): void {
  setObjectProps('Lock', (o) => { o.locked = !o.locked })
}

export function objectIsOnPage(id: Id): boolean {
  const loc = locate(ed.doc, id)
  return !!loc && loc.owner.kind !== 'scratch'
}

export const uid = newId
