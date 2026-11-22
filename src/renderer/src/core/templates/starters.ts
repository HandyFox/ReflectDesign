// Built-in starter templates (File › New › Featured). They are built in code
// so they always match the current document format.

import type { CharStyle, ParaStyle, RDocument, SceneObject, ShapeKind, TextBoxObject } from '../model/types'
import { makeDocument, makePage, makePicture, makeShape, makeStory, makeTextBox, solid, stroke } from '../model/factory'
import { CARD_PRESETS, makeCardDocument } from '../model/card'

export interface StarterTemplate {
  id: string
  name: string
  category: string
  description: string
  build: () => RDocument
}

const IN = 72

function text(doc: RDocument, box: { x: number; y: number; width: number; height: number }, content: string,
  char: Partial<CharStyle>, para: Partial<ParaStyle> = {}, opts: Partial<TextBoxObject> = {}): TextBoxObject {
  const story = makeStory(content, char, { spaceAfter: 0, ...para })
  doc.stories[story.id] = story
  const t = makeTextBox(box, story.id)
  Object.assign(t, opts)
  return t
}

function shape(kind: ShapeKind, box: { x: number; y: number; width: number; height: number }, fill: string, line: string | null, lineWidth = 2, rotation = 0): SceneObject {
  const s = makeShape(box, kind)
  s.fill = solid(fill)
  s.stroke = line ? stroke(line, lineWidth) : { ...s.stroke, width: 0 }
  s.rotation = rotation
  return s
}

function titleBanner(): RDocument {
  const doc = makeDocument(48 * IN, 12 * IN)
  doc.pageSetup.margins = { top: 0.5 * IN, right: 0.5 * IN, bottom: 0.5 * IN, left: 0.5 * IN }
  const p = doc.pages[0]
  p.background = solid('#FFF2CC')
  p.objects.push(
    shape('banner', { x: 4 * IN, y: 1 * IN, width: 40 * IN, height: 10 * IN }, '#5B9BD5', '#1F4E79', 6),
    shape('star5', { x: 0.8 * IN, y: 2.5 * IN, width: 6 * IN, height: 6 * IN }, '#FFC000', '#7F6000', 4, -12),
    shape('star5', { x: 41.2 * IN, y: 2.5 * IN, width: 6 * IN, height: 6 * IN }, '#FFC000', '#7F6000', 4, 12),
    text(doc, { x: 9 * IN, y: 2 * IN, width: 30 * IN, height: 8 * IN }, 'Welcome to Our Class!', {
      font: 'Arial Black', size: 120, bold: true, color: '#FFFFFF',
      textOutline: { color: '#1F4E79', opacity: 1, width: 6, dash: 'solid' },
      textShadow: { color: '#000000', opacity: 0.35, blur: 8, offsetX: 6, offsetY: 6 }
    }, { align: 'center' }, { autofit: 'bestFit', vAlign: 'middle', name: 'Title' })
  )
  return doc
}

function classroomPoster(): RDocument {
  const doc = makeDocument(18 * IN, 24 * IN)
  doc.pageSetup.margins = { top: 1 * IN, right: 1 * IN, bottom: 1 * IN, left: 1 * IN }
  const p = doc.pages[0]
  const frame = makeShape({ x: 0.4 * IN, y: 0.4 * IN, width: 17.2 * IN, height: 23.2 * IN }, 'frame')
  frame.adjust = 0.035
  frame.fill = solid('#70AD47')
  frame.stroke = stroke('#385723', 3)
  p.objects.push(
    frame,
    shape('roundRect', { x: 1.5 * IN, y: 1.4 * IN, width: 15 * IN, height: 3.6 * IN }, '#E2F0D9', '#385723', 3),
    text(doc, { x: 1.8 * IN, y: 1.6 * IN, width: 14.4 * IN, height: 3.2 * IN }, 'Classroom Rules', {
      font: 'Georgia', size: 96, bold: true, color: '#385723'
    }, { align: 'center' }, { autofit: 'bestFit', vAlign: 'middle', name: 'Title' }),
    makePicture({ x: 5 * IN, y: 5.8 * IN, width: 8 * IN, height: 6 * IN }, null),
    text(doc, { x: 2 * IN, y: 12.6 * IN, width: 14 * IN, height: 8.4 * IN },
      'Be kind to everyone\nListen when others are speaking\nRaise your hand to share\nTake care of our classroom\nAlways do your best!', {
        font: 'Arial', size: 44, color: '#262626'
      }, { align: 'left', bullet: { kind: 'bullet', char: '•' }, indentLeft: 54, indentFirst: -54, spaceAfter: 18, lineSpacing: { mode: 'multiple', value: 1.1 } },
      { name: 'Rules', autofit: 'shrinkOnOverflow' }),
    text(doc, { x: 2 * IN, y: 21.3 * IN, width: 14 * IN, height: 1.3 * IN }, 'Room 12  •  Mrs. Smith', {
      font: 'Arial', size: 32, italic: true, color: '#385723'
    }, { align: 'center' }, { vAlign: 'middle', name: 'Footer' })
  )
  return doc
}

function eventFlyer(): RDocument {
  const doc = makeDocument(8.5 * IN, 11 * IN)
  const p = doc.pages[0]
  p.objects.push(
    shape('rect', { x: 0, y: 0, width: 8.5 * IN, height: 2.6 * IN }, '#C00000', null),
    text(doc, { x: 0.5 * IN, y: 0.35 * IN, width: 7.5 * IN, height: 1.9 * IN }, 'FALL FESTIVAL', {
      font: 'Impact', size: 72, color: '#FFFFFF'
    }, { align: 'center' }, { autofit: 'bestFit', vAlign: 'middle', name: 'Title' }),
    makePicture({ x: 1.25 * IN, y: 3 * IN, width: 6 * IN, height: 3.8 * IN }, null),
    shape('callout', { x: 5.6 * IN, y: 2.3 * IN, width: 2.6 * IN, height: 1.5 * IN }, '#FFC000', '#7F6000', 1.5, 6),
    text(doc, { x: 5.75 * IN, y: 2.4 * IN, width: 2.3 * IN, height: 1 * IN }, 'Free for\nfamilies!', {
      font: 'Arial', size: 20, bold: true, color: '#3B2F00'
    }, { align: 'center' }, { vAlign: 'middle', rotation: 6, name: 'Callout' }),
    text(doc, { x: 0.75 * IN, y: 7.1 * IN, width: 7 * IN, height: 1.1 * IN }, 'Saturday, October 18  •  10 AM – 2 PM', {
      font: 'Arial', size: 22, bold: true, color: '#C00000'
    }, { align: 'center' }, { autofit: 'shrinkOnOverflow', vAlign: 'middle', name: 'When' }),
    text(doc, { x: 0.75 * IN, y: 8.2 * IN, width: 7 * IN, height: 2.2 * IN },
      'Games, crafts, a pumpkin patch, and snacks for the whole family. Bring your friends and neighbors!\nSchool playground • 123 Main Street', {
        font: 'Georgia', size: 15, color: '#262626'
      }, { align: 'center', spaceAfter: 10 }, { name: 'Details' })
  )
  return doc
}

function cutOutLetters(): RDocument {
  const doc = makeDocument(8.5 * IN, 11 * IN)
  doc.pageSetup.margins = { top: 0.25 * IN, right: 0.25 * IN, bottom: 0.25 * IN, left: 0.25 * IN }
  const letters = ['A', 'B', 'C']
  doc.pages = []
  for (const L of letters) {
    const page = makePage(L)
    page.objects.push(text(doc, { x: 0.25 * IN, y: 0.25 * IN, width: 8 * IN, height: 10.5 * IN }, L, {
      font: 'Arial Black', size: 600, bold: true, color: '#FFFFFF',
      textOutline: { color: '#000000', opacity: 1, width: 3, dash: 'dash' }
    }, { align: 'center' }, { autofit: 'bestFit', vAlign: 'middle', name: `Letter ${L}` }))
    doc.pages.push(page)
  }
  return doc
}

/** A straight line from one point to another. */
function lineFrom(x1: number, y1: number, x2: number, y2: number, color: string, width = 1): SceneObject {
  const l = makeShape({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.max(1, Math.abs(x2 - x1)), height: Math.max(1, Math.abs(y2 - y1)) }, 'line')
  l.stroke = stroke(color, width)
  // The line shape runs from the box's top-left to bottom-right; flip for the other diagonal.
  l.flipH = (x2 - x1) * (y2 - y1) < 0
  return l
}

function balloon(cx: number, top: number, w: number, color: string, knotX: number, knotY: number): SceneObject[] {
  const h = w * 1.22
  const body = shape('ellipse', { x: cx - w / 2, y: top, width: w, height: h }, color, null)
  const shine = shape('ellipse', { x: cx - w * 0.28, y: top + h * 0.14, width: w * 0.18, height: h * 0.22 }, '#FFFFFF', null, 0, -20)
  if (shine.type === 'shape' && shine.fill.type === 'solid') shine.fill.opacity = 0.45
  const tie = shape('triangle', { x: cx - 5, y: top + h - 1, width: 10, height: 7 }, color, null)
  return [lineFrom(cx, top + h + 6, knotX, knotY, '#7F7F7F', 0.75), body, shine, tie]
}

/** Greeting card: quarter-fold 4.25 × 5.5" (one Letter sheet, printed on one side). */
function birthdayCard(): RDocument {
  const doc = makeCardDocument(CARD_PRESETS.find((p) => p.id === 'quarter-letter')!)
  const [front, insideL, insideR, back] = doc.pages
  const W = doc.pageSetup.width, H = doc.pageSetup.height // 306 × 396 pt
  const confetti = (n: number, seed: number, area: { x: number; y: number; w: number; h: number }): SceneObject[] => {
    const colors = ['#E74C3C', '#3498DB', '#F1C40F', '#2ECC71', '#9B59B6']
    let r = seed
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 }
    return Array.from({ length: n }, (_, i) => {
      const size = 6 + rnd() * 8
      return shape(i % 3 === 0 ? 'star5' : i % 3 === 1 ? 'ellipse' : 'diamond',
        { x: area.x + rnd() * area.w, y: area.y + rnd() * area.h, width: size, height: size }, colors[i % colors.length], null, 0, rnd() * 90)
    })
  }

  // Front: balloons, confetti and the title.
  front.background = solid('#FFF8E7')
  const knot = { x: W / 2, y: 236 }
  front.objects.push(
    ...confetti(18, 7, { x: 14, y: 14, w: W - 40, h: H - 40 }),
    ...balloon(92, 40, 74, '#E74C3C', knot.x, knot.y),
    ...balloon(214, 34, 74, '#3498DB', knot.x, knot.y),
    ...balloon(153, 18, 78, '#F1C40F', knot.x, knot.y),
    shape('rect', { x: 18, y: 262, width: W - 36, height: 104 }, '#FFFFFF', '#E74C3C', 1.5),
    text(doc, { x: 26, y: 268, width: W - 52, height: 92 }, 'Happy\nBirthday!', {
      font: 'Arial Black', size: 40, color: '#C0392B',
      textShadow: { color: '#000000', opacity: 0.2, blur: 2, offsetX: 1.5, offsetY: 1.5 }
    }, { align: 'center', lineSpacing: { mode: 'multiple', value: 0.95 } }, { autofit: 'bestFit', vAlign: 'middle', name: 'Title' })
  )

  // Inside left: a wish.
  insideL.background = solid('#FFFDF6')
  insideL.objects.push(
    ...confetti(10, 31, { x: 20, y: 20, w: W - 50, h: 90 }),
    shape('star5', { x: W / 2 - 60, y: 120, width: 120, height: 115 }, '#F1C40F', '#B7950B', 1.5),
    text(doc, { x: 30, y: 250, width: W - 60, height: 60 }, 'Make a wish!', {
      font: 'Georgia', size: 26, italic: true, color: '#B7950B'
    }, { align: 'center' }, { vAlign: 'middle', name: 'Wish' })
  )

  // Inside right: the message and signature.
  insideR.background = solid('#FFFDF6')
  insideR.objects.push(
    text(doc, { x: 30, y: 70, width: W - 60, height: 190 },
      'Wishing you a day full of fun, laughter and cake.\n\nHave a wonderful birthday!', {
        font: 'Georgia', size: 17, color: '#333333'
      }, { align: 'center', lineSpacing: { mode: 'multiple', value: 1.15 } }, { autofit: 'shrinkOnOverflow', vAlign: 'middle', name: 'Message' }),
    text(doc, { x: 30, y: 280, width: W - 60, height: 60 }, 'With love,\nYour Name', {
      font: 'Georgia', size: 15, italic: true, color: '#C0392B'
    }, { align: 'center' }, { vAlign: 'middle', name: 'Signature' }),
    ...confetti(6, 99, { x: 30, y: 352, w: W - 70, h: 20 })
  )

  // Back: a small mark, like the back of a shop-bought card.
  back.objects.push(
    shape('heart', { x: W / 2 - 11, y: H - 92, width: 22, height: 20 }, '#E74C3C', null),
    text(doc, { x: 30, y: H - 66, width: W - 60, height: 20 }, 'Handmade with love', {
      font: 'Georgia', size: 10, italic: true, color: '#7F7F7F'
    }, { align: 'center' }, { name: 'Back note' })
  )
  return doc
}

/** Greeting card: 5 × 7" half-fold, printed on both sides of Letter paper and trimmed. */
function thankYouCard(): RDocument {
  const doc = makeCardDocument(CARD_PRESETS.find((p) => p.id === 'card-5x7')!)
  const [front, insideL, insideR, back] = doc.pages
  const W = doc.pageSetup.width, H = doc.pageSetup.height // 360 × 504 pt
  const green = '#2E7D5B', blush = '#F6E7E1'

  const border = makeShape({ x: 14, y: 14, width: W - 28, height: H - 28 }, 'frame')
  border.adjust = 0.012
  border.fill = solid(green)
  border.stroke = { ...border.stroke, width: 0 }
  front.background = solid(blush)
  front.objects.push(
    border,
    // A printable design that a photo can replace: the picture frame on top
    // is only a placeholder (it doesn't print until a picture is put in it).
    shape('ellipse', { x: W / 2 - 105, y: 62, width: 210, height: 210 }, '#EBCFC4', null),
    shape('ellipse', { x: W / 2 - 118, y: 150, width: 70, height: 30 }, '#6FA78A', null, 0, -35),
    shape('ellipse', { x: W / 2 + 48, y: 150, width: 70, height: 30 }, '#6FA78A', null, 0, 35),
    shape('ellipse', { x: W / 2 - 100, y: 196, width: 56, height: 24 }, green, null, 0, -20),
    shape('ellipse', { x: W / 2 + 44, y: 196, width: 56, height: 24 }, green, null, 0, 20),
    shape('heart', { x: W / 2 - 50, y: 112, width: 100, height: 92 }, '#C97B63', null),
    shape('heart', { x: W / 2 - 78, y: 92, width: 26, height: 24 }, '#D99A86', null, 0, -15),
    shape('heart', { x: W / 2 + 52, y: 96, width: 22, height: 20 }, '#D99A86', null, 0, 15),
    makePicture({ x: 50, y: 52, width: W - 100, height: 230 }, null),
    text(doc, { x: 34, y: 300, width: W - 68, height: 100 }, 'Thank You', {
      font: 'Georgia', size: 56, italic: true, color: green
    }, { align: 'center' }, { autofit: 'bestFit', vAlign: 'middle', name: 'Title' }),
    shape('heart', { x: W / 2 - 10, y: 410, width: 20, height: 18 }, '#C97B63', null),
    text(doc, { x: 40, y: 436, width: W - 80, height: 30 }, 'for everything you do', {
      font: 'Georgia', size: 14, color: '#5F5F5F'
    }, { align: 'center' }, { vAlign: 'middle', name: 'Subtitle' })
  )

  insideL.background = solid('#FFFFFF')
  insideL.objects.push(
    shape('rect', { x: 0, y: 0, width: W, height: 18 }, green, null),
    shape('rect', { x: 0, y: H - 18, width: W, height: 18 }, green, null)
  )

  insideR.background = solid('#FFFFFF')
  insideR.objects.push(
    shape('rect', { x: 0, y: 0, width: W, height: 18 }, green, null),
    text(doc, { x: 44, y: 110, width: W - 88, height: 200 },
      'Your kindness and help meant so much to me. I am truly grateful.', {
        font: 'Georgia', size: 18, color: '#333333'
      }, { align: 'center', lineSpacing: { mode: 'multiple', value: 1.2 } }, { autofit: 'shrinkOnOverflow', vAlign: 'middle', name: 'Message' }),
    text(doc, { x: 44, y: 340, width: W - 88, height: 70 }, 'Warmly,\nYour Name', {
      font: 'Georgia', size: 16, italic: true, color: green
    }, { align: 'center' }, { vAlign: 'middle', name: 'Signature' }),
    shape('rect', { x: 0, y: H - 18, width: W, height: 18 }, green, null)
  )

  back.background = solid(blush)
  back.objects.push(
    shape('heart', { x: W / 2 - 10, y: H - 96, width: 20, height: 18 }, green, null),
    text(doc, { x: 40, y: H - 70, width: W - 80, height: 20 }, 'Handmade with love', {
      font: 'Georgia', size: 10, italic: true, color: '#7F7F7F'
    }, { align: 'center' }, { name: 'Back note' })
  )
  return doc
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { id: 'starter:title-banner', name: 'Bulletin Board Title', category: 'Bulletin Boards', description: '4 ft × 1 ft title banner with stars.', build: titleBanner },
  { id: 'starter:classroom-poster', name: 'Classroom Poster', category: 'Posters', description: '18 × 24" poster with a title, picture and bullet list.', build: classroomPoster },
  { id: 'starter:event-flyer', name: 'Event Flyer', category: 'Flyers', description: 'Letter-size flyer with a bold header and picture.', build: eventFlyer },
  { id: 'starter:birthday-card', name: 'Birthday Card', category: 'Greeting Cards', description: 'Quarter-fold 4.25 × 5.5" card with balloons. Prints on one side of a Letter sheet.', build: birthdayCard },
  { id: 'starter:thank-you-card', name: 'Thank You Card', category: 'Greeting Cards', description: '5 × 7" half-fold card with a picture. Prints on both sides of Letter paper; trim to size.', build: thankYouCard },
  { id: 'starter:cutout-letters', name: 'Cut-Out Letters', category: 'Bulletin Boards', description: 'One giant outlined letter per page, ready to print and cut out.', build: cutOutLetters }
]
