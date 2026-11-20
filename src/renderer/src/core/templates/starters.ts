// Built-in starter templates (File › New › Featured). They are built in code
// so they always match the current document format.

import type { CharStyle, ParaStyle, RDocument, SceneObject, ShapeKind, TextBoxObject } from '../model/types'
import { makeDocument, makePage, makePicture, makeShape, makeStory, makeTextBox, solid, stroke } from '../model/factory'

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

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { id: 'starter:title-banner', name: 'Bulletin Board Title', category: 'Bulletin Boards', description: '4 ft × 1 ft title banner with stars.', build: titleBanner },
  { id: 'starter:classroom-poster', name: 'Classroom Poster', category: 'Posters', description: '18 × 24" poster with a title, picture and bullet list.', build: classroomPoster },
  { id: 'starter:event-flyer', name: 'Event Flyer', category: 'Flyers', description: 'Letter-size flyer with a bold header and picture.', build: eventFlyer },
  { id: 'starter:cutout-letters', name: 'Cut-Out Letters', category: 'Bulletin Boards', description: 'One giant outlined letter per page, ready to print and cut out.', build: cutOutLetters }
]
