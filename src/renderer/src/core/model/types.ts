// ReflectDesign document model.
//
// All lengths are in points (1/72 inch). Angles are in degrees, clockwise.
// Object x/y/width/height describe the *unrotated* box; rotation turns it
// around its centre. The order of a page's `objects` array is the stacking
// order: index 0 is at the back, the last item is at the front.

export type Id = string

export const DOC_VERSION = 1

// ---------- paint ----------

export interface GradientStop {
  offset: number // 0..1
  color: string // #rrggbb
  opacity: number // 0..1
}

export type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: string; opacity: number }
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  | { type: 'radial'; stops: GradientStop[] }

export type DashStyle = 'solid' | 'dash' | 'dot' | 'dashDot' | 'longDash'

export interface Stroke {
  color: string
  opacity: number
  width: number // points; 0 = no line
  dash: DashStyle
}

export interface Shadow {
  color: string
  opacity: number
  blur: number
  offsetX: number
  offsetY: number
}

export interface Effects {
  shadow: Shadow | null
  glow: { color: string; opacity: number; size: number } | null
  reflection: { opacity: number; size: number; distance: number } | null
  softEdges: number // points, 0 = off
}

// ---------- wrapping ----------

/** Publisher 2016 Wrap Text options. */
export type WrapMode = 'none' | 'square' | 'tight' | 'through' | 'topBottom'

export interface Wrap {
  mode: WrapMode
  /** Distance from text (points). */
  distance: { top: number; right: number; bottom: number; left: number }
  /**
   * Wrap points for Tight/Through, in the object's local unit space
   * (0..1 × 0..1 of its box). Generated from the picture's alpha channel and
   * editable with Edit Wrap Points. null = use the object's box/outline.
   */
  polygon: Array<{ x: number; y: number }> | null
}

// ---------- text ----------

export type UnderlineStyle = 'none' | 'single' | 'double' | 'thick' | 'dotted' | 'dash' | 'wave'
export type CapsStyle = 'normal' | 'allCaps' | 'smallCaps'
export type BaselineShift = 'normal' | 'superscript' | 'subscript'

/** Character formatting. Every run carries a full set (no inheritance). */
export interface CharStyle {
  font: string // family name
  size: number // points
  bold: boolean
  italic: boolean
  underline: UnderlineStyle
  strike: boolean
  caps: CapsStyle
  baseline: BaselineShift
  color: string
  opacity: number
  highlight: string | null
  /** Character spacing / tracking, in 1/1000 em (Publisher "Tracking"). */
  tracking: number
  /** Horizontal scaling, percent (Publisher "Scaling"). */
  scale: number
  kerning: boolean
  /** OpenType features, e.g. { liga: 1, swsh: 1, ss01: 1 }. */
  features: Record<string, number>
  /** WordArt-style effects applied to the glyphs. */
  textOutline: Stroke | null
  textFill: Fill | null // overrides color when set (gradients)
  textShadow: Shadow | null
  textGlow: { color: string; opacity: number; size: number } | null
}

export interface Run {
  text: string
  style: CharStyle
}

export type ParaAlign = 'left' | 'center' | 'right' | 'justify' | 'distribute'

export interface TabStop {
  pos: number
  align: 'left' | 'center' | 'right' | 'decimal'
  leader: 'none' | 'dot' | 'dash' | 'line'
}

export interface ParaStyle {
  align: ParaAlign
  indentLeft: number
  indentRight: number
  indentFirst: number // negative = hanging
  spaceBefore: number
  spaceAfter: number
  /** 'multiple' = factor × single line; 'exact' = points. */
  lineSpacing: { mode: 'multiple' | 'exact'; value: number }
  tabs: TabStop[]
  bullet: { kind: 'none' } | { kind: 'bullet'; char: string } | { kind: 'number'; format: '1.' | 'a.' | 'A.' | 'i.' | 'I.'; start: number }
  dropCap: { lines: number; chars: number } | null
  keepTogether: boolean
  hyphenate: boolean
  styleName: string | null
}

export interface Paragraph {
  runs: Run[]
  style: ParaStyle
}

/** The text that flows through one chain of linked text boxes. */
export interface Story {
  id: Id
  paragraphs: Paragraph[]
}

export type VAlign = 'top' | 'middle' | 'bottom'

/** Publisher Text Fit options. */
export type Autofit = 'none' | 'bestFit' | 'shrinkOnOverflow' | 'growBox'

export type TextTransform =
  | 'none' | 'arch' | 'archDown' | 'circle' | 'wave' | 'wave2' | 'inflate' | 'deflate' | 'slantUp' | 'slantDown'

// ---------- objects ----------

export interface ObjectBase {
  id: Id
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
  locked: boolean
  wrap: Wrap
  effects: Effects
}

export interface TextBoxObject extends ObjectBase {
  type: 'text'
  storyId: Id
  /** Next box in the linked chain (Create Link), or null. */
  nextId: Id | null
  margins: { top: number; right: number; bottom: number; left: number }
  columns: number
  columnGap: number
  vAlign: VAlign
  autofit: Autofit
  /** Text direction: 0 normal, 90 / 270 rotated. */
  textRotation: 0 | 90 | 270
  transform: TextTransform
  /** When false, other objects' wrap settings are ignored by this box. */
  respectWrap: boolean
  fill: Fill
  stroke: Stroke
}

export interface PictureObject extends ObjectBase {
  type: 'picture'
  assetId: Id | null // null = empty picture placeholder
  /** Crop as fractions of the original image (0..1) removed from each side. Negative = padding. */
  crop: { left: number; top: number; right: number; bottom: number }
  opacity: number
  brightness: number // -1..1
  contrast: number // -1..1
  recolor: { color: string; amount: number } | null
  grayscale: boolean
  fill: Fill
  stroke: Stroke
}

export type ShapeKind =
  | 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'rightTriangle' | 'diamond' | 'pentagon' | 'hexagon'
  | 'octagon' | 'star4' | 'star5' | 'star6' | 'star8' | 'heart' | 'arrowRight' | 'arrowLeft' | 'arrowUp'
  | 'arrowDown' | 'line' | 'cloud' | 'lightning' | 'moon' | 'sun' | 'banner' | 'callout' | 'frame' | 'plus'

export interface ShapeObject extends ObjectBase {
  type: 'shape'
  shape: ShapeKind
  /** Shape adjustment (e.g. corner radius as fraction of the short side). */
  adjust: number
  fill: Fill
  stroke: Stroke
  arrowStart: 'none' | 'arrow' | 'open' | 'circle'
  arrowEnd: 'none' | 'arrow' | 'open' | 'circle'
}

export interface GroupObject extends ObjectBase {
  type: 'group'
  /** Children use page coordinates. The group's box is kept as their bounds. */
  children: SceneObject[]
}

/** How a calendar object is laid out. */
export type CalendarLayout = 'month' | 'year' | 'list'

export interface CalendarStyle {
  /** Font for dates, day names and events. */
  font: string
  titleFont: string
  titleColor: string
  titleBold: boolean
  /** Bar behind the day names (and month names in Year/List layouts). */
  headerFill: string
  headerColor: string
  numberColor: string
  gridColor: string
  gridWidth: number
  cellFill: string | null
  weekendFill: string | null
  /** Dates from the previous/next month in the first and last week. */
  otherMonths: 'hide' | 'show'
  dayNames: 'short' | 'long' | 'letter'
  numberPosition: 'topLeft' | 'topRight' | 'center'
  eventColor: string
  /** Rounded corners for Year and List boxes (points). */
  corner: number
}

/**
 * A calendar that draws itself: a month grid, a year at a glance, or a list
 * of each month's dates (a birthday board). Dates come from the publication's
 * calendar dates (doc.calendarData), so they update everywhere at once.
 */
export interface CalendarObject extends ObjectBase {
  type: 'calendar'
  layout: CalendarLayout
  year: number
  /** 1–12: the month shown (Month layout) or the first month (Year/List). */
  month: number
  /** 0 = Sunday, 1 = Monday. */
  weekStart: 0 | 1
  showTitle: boolean
  /** Title text; empty shows the automatic title ("March 2027", "2027", "Birthdays"). */
  title: string
  showEvents: boolean
  /** Kinds of dates to show; empty shows all. */
  eventKinds: Array<'birthday' | 'anniversary' | 'holiday' | 'event' | 'reminder'>
  style: CalendarStyle
}

export type SceneObject = TextBoxObject | PictureObject | ShapeObject | GroupObject | CalendarObject
export type ObjectType = SceneObject['type']

// ---------- pages & document ----------

export interface Guide {
  id: Id
  orientation: 'h' | 'v'
  pos: number
}

import type { CardSetup } from './card'
import type { CalendarData } from '../calendar/dates'

export interface Page {
  id: Id
  name: string
  objects: SceneObject[]
  background: Fill | { type: 'picture'; assetId: Id; mode: 'stretch' | 'tile' }
  guides: Guide[]
  masterId: Id | null
}

export interface PageSetup {
  width: number
  height: number
  margins: { top: number; right: number; bottom: number; left: number }
  /** Extra area beyond the trim for PDF bleed (points). */
  bleed: number
  /** Set when the publication is a folded greeting card (pages are card panels). */
  card?: CardSetup
}

export interface AssetInfo {
  id: Id
  name: string
  mime: string
  /** Pixel size of the image (for low-resolution warnings). */
  pixelWidth: number
  pixelHeight: number
}

export interface NamedParaStyle {
  name: string
  para: ParaStyle
  char: CharStyle
}

export interface DocumentInfo {
  title: string
  author: string
  created: string
  modified: string
}

export interface RDocument {
  version: number
  info: DocumentInfo
  pageSetup: PageSetup
  pages: Page[]
  masters: Page[]
  /** Objects parked in the gray scratch area (shared by all pages, never printed). */
  scratch: SceneObject[]
  stories: Record<Id, Story>
  assets: Record<Id, AssetInfo>
  styles: NamedParaStyle[]
  /** Colours the user has used recently (Recent Colors in colour pickers). */
  recentColors: string[]
  /** Birthdays, holidays and events shown on the publication's calendars. */
  calendarData?: CalendarData
}

/** Binary data for assets lives outside the JSON document. */
export interface AssetData {
  info: AssetInfo
  bytes: Uint8Array
}
