import type {
  CharStyle, Effects, Fill, GroupObject, Id, Page, ParaStyle, Paragraph, PictureObject, RDocument,
  SceneObject, ShapeKind, ShapeObject, Story, Stroke, TextBoxObject, Wrap
} from './types'
import { DOC_VERSION } from './types'

let counter = 0
/** Short unique id. */
export function newId(prefix = 'o'): Id {
  counter = (counter + 1) % 0x7fffffff
  const rand = Math.floor(Math.random() * 0xffffff).toString(36)
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`
}

export const NO_FILL: Fill = { type: 'none' }
export const solid = (color: string, opacity = 1): Fill => ({ type: 'solid', color, opacity })

export const NO_STROKE: Stroke = { color: '#000000', opacity: 1, width: 0, dash: 'solid' }
export const stroke = (color: string, width = 0.75): Stroke => ({ color, opacity: 1, width, dash: 'solid' })

export const defaultEffects = (): Effects => ({ shadow: null, glow: null, reflection: null, softEdges: 0 })

export const defaultWrap = (mode: Wrap['mode'] = 'square'): Wrap => ({
  mode,
  distance: { top: 9, right: 9, bottom: 9, left: 9 },
  polygon: null
})

export const defaultCharStyle = (): CharStyle => ({
  font: 'Calibri',
  size: 10,
  bold: false,
  italic: false,
  underline: 'none',
  strike: false,
  caps: 'normal',
  baseline: 'normal',
  color: '#000000',
  opacity: 1,
  highlight: null,
  tracking: 0,
  scale: 100,
  kerning: true,
  features: {},
  textOutline: null,
  textFill: null,
  textShadow: null,
  textGlow: null
})

export const defaultParaStyle = (): ParaStyle => ({
  align: 'left',
  indentLeft: 0,
  indentRight: 0,
  indentFirst: 0,
  spaceBefore: 0,
  spaceAfter: 6,
  lineSpacing: { mode: 'multiple', value: 1.19 }, // Publisher 2016 default
  tabs: [],
  bullet: { kind: 'none' },
  dropCap: null,
  keepTogether: false,
  hyphenate: false,
  styleName: 'Normal'
})

export function makeParagraph(text = '', char?: Partial<CharStyle>, para?: Partial<ParaStyle>): Paragraph {
  return {
    runs: [{ text, style: { ...defaultCharStyle(), ...char } }],
    style: { ...defaultParaStyle(), ...para }
  }
}

export function makeStory(text = '', char?: Partial<CharStyle>, para?: Partial<ParaStyle>): Story {
  const lines = text.split('\n')
  return { id: newId('s'), paragraphs: lines.map((l) => makeParagraph(l, char, para)) }
}

interface Box { x: number; y: number; width: number; height: number }

function base(box: Box, name: string) {
  return {
    id: newId(),
    name,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: 0,
    flipH: false,
    flipV: false,
    locked: false,
    effects: defaultEffects()
  }
}

export function makeTextBox(box: Box, storyId: Id): TextBoxObject {
  return {
    ...base(box, 'Text Box'),
    type: 'text',
    wrap: defaultWrap('none'),
    storyId,
    nextId: null,
    // Publisher default text box margins: 0.04"
    margins: { top: 2.88, right: 2.88, bottom: 2.88, left: 2.88 },
    columns: 1,
    columnGap: 9,
    vAlign: 'top',
    autofit: 'none',
    textRotation: 0,
    transform: 'none',
    respectWrap: true,
    fill: NO_FILL,
    stroke: NO_STROKE
  }
}

export function makePicture(box: Box, assetId: Id | null): PictureObject {
  return {
    ...base(box, assetId ? 'Picture' : 'Picture Placeholder'),
    type: 'picture',
    wrap: defaultWrap('square'),
    assetId,
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    opacity: 1,
    brightness: 0,
    contrast: 0,
    recolor: null,
    grayscale: false,
    fill: NO_FILL,
    stroke: NO_STROKE
  }
}

export function makeShape(box: Box, shape: ShapeKind): ShapeObject {
  const isLine = shape === 'line'
  return {
    ...base(box, isLine ? 'Line' : 'Shape'),
    type: 'shape',
    wrap: defaultWrap('none'),
    shape,
    adjust: shape === 'roundRect' ? 0.16 : shape === 'frame' ? 0.12 : 0.5,
    // Publisher 2016 default shape style: blue fill with a darker outline
    fill: isLine ? NO_FILL : solid('#5b9bd5'),
    stroke: stroke(isLine ? '#5b9bd5' : '#41719c', isLine ? 0.75 : 1),
    arrowStart: 'none',
    arrowEnd: 'none'
  }
}

export function makeGroup(children: SceneObject[]): GroupObject {
  const b = boundsOfObjects(children)
  return {
    ...base(b, 'Group'),
    type: 'group',
    wrap: defaultWrap('none'),
    children
  }
}

/** Axis-aligned bounds of objects, including their rotation. */
export function boundsOfObjects(objs: SceneObject[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const o of objs) {
    for (const p of objectCorners(o)) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function objectCorners(o: { x: number; y: number; width: number; height: number; rotation: number }) {
  const cx = o.x + o.width / 2
  const cy = o.y + o.height / 2
  const a = (o.rotation * Math.PI) / 180
  const cos = Math.cos(a), sin = Math.sin(a)
  const pts = [
    { x: -o.width / 2, y: -o.height / 2 },
    { x: o.width / 2, y: -o.height / 2 },
    { x: o.width / 2, y: o.height / 2 },
    { x: -o.width / 2, y: o.height / 2 }
  ]
  return pts.map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }))
}

export function makePage(name = ''): Page {
  return {
    id: newId('p'),
    name,
    objects: [],
    background: NO_FILL,
    guides: [],
    masterId: null
  }
}

export function makeDocument(width = 612, height = 792): RDocument {
  const now = new Date().toISOString()
  return {
    version: DOC_VERSION,
    info: { title: '', author: '', created: now, modified: now },
    pageSetup: {
      width,
      height,
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      bleed: 9
    },
    pages: [makePage()],
    masters: [],
    scratch: [],
    stories: {},
    assets: {},
    styles: [{ name: 'Normal', para: defaultParaStyle(), char: defaultCharStyle() }],
    recentColors: []
  }
}
