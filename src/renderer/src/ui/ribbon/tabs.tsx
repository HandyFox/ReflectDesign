import {
  ClipboardPaste, Copy, FilePlus2, Image, ImagePlus, Paintbrush, Scissors, Shapes, SquareDashed, TextCursorInput,
  Search, Replace, MousePointer2, FileText, Ruler, Columns3, Scaling, PanelsTopLeft, StretchHorizontal, Trash2,
  ArrowLeftRight, Palette, LayoutTemplate, ZoomIn, Maximize, MoveHorizontal as PageWidthIcon, Square, SpellCheck,
  BookOpen, Languages, Link2, Unlink, ChevronLeft, ChevronRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd, PaintBucket, PenLine, Sparkles, CaseUpper, Calendar, Omega, BookImage, Frame, RotateCcw,
  Sun, Contrast, SquareStack, Crop, Replace as ChangePicture, TypeOutline, Layers, Grid3x3
} from 'lucide-react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { PAGE_PRESETS, formatLength } from '@core/model/units'
import type { Autofit, SceneObject, ShapeKind, TextBoxObject, VAlign } from '@core/model/types'
import { SHAPE_GALLERY, SHAPE_NAMES } from '@core/geometry/shapes'
import { shapePath } from '@core/geometry/shapes'
import { toSvgPath } from '@core/geometry/path'
import { makeStory } from '@core/model/factory'
import { BigButton, Check, Col, MenuHeader, MenuItem, MenuSeparator, RibbonGroup, SmallButton } from './controls'
import { ColorButton } from './ColorPicker'
import { ArrangeGroup, FontGroup, ParagraphGroup, SizeGroup, currentParaStyle, hasText } from './groups'
import { useDialogs } from '../dialogs/DialogHost'
import { typeText } from '@core/textEditing'

const soon = 'Coming in a later milestone'

function ShapeIcon({ kind, size = 20 }: { kind: ShapeKind; size?: number }) {
  const d = toSvgPath(shapePath(kind, 20, kind === 'line' ? 20 : 20))
  return (
    <svg width={size} height={size} viewBox="-1 -1 22 22">
      <path d={d} fill={kind === 'line' ? 'none' : '#dbe8f7'} stroke="#41719c" strokeWidth={1.2} fillRule="nonzero" />
    </svg>
  )
}

export function ShapesGallery({ close }: { close: () => void }) {
  return (
    <div className="shape-gallery">
      {SHAPE_GALLERY.map((g) => (
        <div key={g.group}>
          <MenuHeader>{g.group}</MenuHeader>
          <div className="shape-grid">
            {g.kinds.map((k) => (
              <button key={k} className="shape-btn" title={SHAPE_NAMES[k]} onClick={() => { ed.setTool({ kind: 'shape', shape: k }); ed.setStatus('Click and drag on the page to draw the shape.'); close() }}>
                <ShapeIcon kind={k} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function drawTextBoxTool() {
  ed.setTool({ kind: 'textbox' })
  ed.setStatus('Click and drag on the page to draw a text box.')
}

// ---------- HOME ----------

export function HomeTab() {
  const any = ed.selection.length > 0
  return (
    <>
      <RibbonGroup label="Clipboard">
        <BigButton icon={ClipboardPaste} label="Paste" color="#7b5a2e" shortcut="Ctrl+V" onClick={cmd.paste} />
        <Col>
          <SmallButton icon={Scissors} label="Cut" shortcut="Ctrl+X" disabled={!any} onClick={cmd.cut} />
          <SmallButton icon={Copy} label="Copy" shortcut="Ctrl+C" disabled={!any} onClick={cmd.copy} />
          <SmallButton icon={Paintbrush} label="Format Painter" disabled title={soon} />
        </Col>
      </RibbonGroup>
      <FontGroup />
      <ParagraphGroup />
      <RibbonGroup label="Objects">
        <BigButton icon={TextCursorInput} label="Draw Text Box" color="#1f5fa8" active={ed.tool.kind === 'textbox'} onClick={drawTextBoxTool} />
        <BigButton icon={Image} label="Pictures" color="#2e7d32" onClick={cmd.insertPictures} />
      </RibbonGroup>
      <ArrangeGroup />
      <RibbonGroup label="Editing">
        <Col>
          <SmallButton icon={Search} label="Find" disabled title={soon} />
          <SmallButton icon={Replace} label="Replace" disabled title={soon} />
          <SmallButton icon={MousePointer2} label="Select"
            menu={(close) => (
              <>
                <MenuItem label="Select All Objects" shortcut="Ctrl+A" onClick={() => { cmd.selectAll(); close() }} />
                <MenuItem label="Select Objects (arrow)" onClick={() => { ed.setTool({ kind: 'select' }); close() }} />
              </>
            )} />
        </Col>
      </RibbonGroup>
    </>
  )
}

// ---------- INSERT ----------

export function InsertTab() {
  return (
    <>
      <RibbonGroup label="Pages">
        <BigButton icon={FilePlus2} label="Page" color="#1f5fa8" split onClick={() => cmd.addPage()}
          menu={(close) => (
            <>
              <MenuItem label="Insert Blank Page" onClick={() => { cmd.addPage(); close() }} />
              <MenuItem label="Insert Duplicate Page" onClick={() => { cmd.duplicateCurrentPage(); close() }} />
            </>
          )} />
      </RibbonGroup>
      <RibbonGroup label="Illustrations">
        <BigButton icon={ImagePlus} label="Pictures" color="#2e7d32" onClick={cmd.insertPictures} />
        <BigButton icon={Shapes} label="Shapes" color="#c55a11" menu={(close) => <ShapesGallery close={close} />} />
        <BigButton icon={SquareDashed} label="Picture Placeholder" color="#666" onClick={cmd.insertPicturePlaceholder} />
      </RibbonGroup>
      <RibbonGroup label="Building Blocks">
        <BigButton icon={Frame} label="Borders & Accents" disabled title={soon} />
        <BigButton icon={BookImage} label="Page Parts" disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Text">
        <BigButton icon={TextCursorInput} label="Draw Text Box" color="#1f5fa8" active={ed.tool.kind === 'textbox'} onClick={drawTextBoxTool} />
        <BigButton icon={CaseUpper} label="WordArt" color="#c00000" menu={(close) => <WordArtGallery close={close} />} />
        <Col>
          <SmallButton icon={Omega} label="Symbol" disabled title={soon} />
          <SmallButton icon={Calendar} label="Date & Time" onClick={insertDate} />
        </Col>
      </RibbonGroup>
    </>
  )
}

function insertDate() {
  const text = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  if (ed.editing) {
    typeText(text)
    return
  }
  const { width, height } = ed.doc.pageSetup
  cmd.insertTextBox({ x: width / 2 - 108, y: height / 2 - 18, width: 216, height: 36 }, text)
}

/** Interim WordArt: big styled title text boxes (full WordArt effects arrive in M5). */
const WORDART: Array<{ name: string; color: string; outline: string | null; shadow: boolean; font: string; bold: boolean; italic?: boolean }> = [
  { name: 'Blue Outline', color: '#5B9BD5', outline: '#1F4E79', shadow: false, font: 'Arial Black', bold: true },
  { name: 'Red Shadow', color: '#C00000', outline: null, shadow: true, font: 'Impact', bold: false },
  { name: 'Gold Fill', color: '#FFC000', outline: '#7F6000', shadow: true, font: 'Georgia', bold: true },
  { name: 'Green Bold', color: '#70AD47', outline: '#385723', shadow: false, font: 'Verdana', bold: true },
  { name: 'Black White Outline', color: '#000000', outline: null, shadow: true, font: 'Arial', bold: true },
  { name: 'Purple Script', color: '#7030A0', outline: null, shadow: true, font: 'Comic Sans MS', bold: true, italic: true }
]

function WordArtGallery({ close }: { close: () => void }) {
  return (
    <div className="wordart-grid">
      {WORDART.map((w) => (
        <button key={w.name} className="wordart-btn" title={w.name} onClick={() => { insertWordArt(w); close() }}
          style={{ fontFamily: `"${w.font}"`, color: w.color, fontWeight: w.bold ? 700 : 400, fontStyle: w.italic ? 'italic' : 'normal', WebkitTextStroke: w.outline ? `0.6px ${w.outline}` : undefined, textShadow: w.shadow ? '2px 2px 2px rgba(0,0,0,0.35)' : undefined }}>
          A
        </button>
      ))}
    </div>
  )
}

function insertWordArt(w: (typeof WORDART)[number]) {
  const { width, height } = ed.doc.pageSetup
  const bw = Math.min(width * 0.7, 6 * 72), bh = 1.2 * 72
  const box = cmd.insertTextBox({ x: (width - bw) / 2, y: (height - bh) / 2, width: bw, height: bh }, 'Your Text Here')
  ed.change('WordArt', (doc) => {
    const story = doc.stories[box.storyId]
    const s = makeStory('Your Text Here', {
      font: w.font, size: 36, bold: w.bold, italic: !!w.italic, color: w.color,
      textOutline: w.outline ? { color: w.outline, opacity: 1, width: 1, dash: 'solid' } : null,
      textShadow: w.shadow ? { color: '#000000', opacity: 0.35, blur: 3, offsetX: 2, offsetY: 2 } : null
    }, { align: 'center', spaceAfter: 0 })
    story.paragraphs = s.paragraphs
    const b = doc.pages[ed.pageIndex].objects.find((o) => o.id === box.id) as TextBoxObject
    if (b) { b.autofit = 'bestFit'; b.vAlign = 'middle'; b.name = 'WordArt' }
  })
  ed.editing = null
  ed.select([box.id])
}

// ---------- PAGE DESIGN ----------

export function PageDesignTab() {
  const dialogs = useDialogs()
  const { width, height, margins } = ed.doc.pageSetup
  const landscape = width > height
  const marginPresets: Array<[string, number]> = [['None', 0], ['Narrow', 0.25 * 72], ['Moderate', 0.5 * 72], ['Wide', 1 * 72]]
  return (
    <>
      <RibbonGroup label="Template">
        <BigButton icon={LayoutTemplate} label="Change Template" color="#1f5fa8" onClick={() => { ed.backstage = 'new'; ed.touch() }} />
      </RibbonGroup>
      <RibbonGroup label="Page Setup" launcher={() => dialogs.open('pageSetup')}>
        <BigButton icon={Ruler} label="Margins"
          menu={(close) => (
            <>
              {marginPresets.map(([name, m]) => (
                <MenuItem key={name} label={`${name}  (${formatLength(m, ed.unit)} all sides)`} checked={margins.top === m && margins.left === m && margins.right === m && margins.bottom === m}
                  onClick={() => { cmd.setMargins({ top: m, right: m, bottom: m, left: m }); close() }} />
              ))}
              <MenuSeparator />
              <MenuItem label="Custom Margins..." onClick={() => { dialogs.open('pageSetup'); close() }} />
            </>
          )} />
        <BigButton icon={StretchHorizontal} label="Orientation"
          menu={(close) => (
            <>
              <MenuItem label="Portrait" checked={!landscape} onClick={() => { cmd.swapOrientation('portrait'); close() }} />
              <MenuItem label="Landscape" checked={landscape} onClick={() => { cmd.swapOrientation('landscape'); close() }} />
            </>
          )} />
        <BigButton icon={Scaling} label="Size"
          menu={(close) => (
            <div className="size-menu">
              {(['Standard', 'Posters', 'Banners', 'Signs & Labels'] as const).map((g) => (
                <div key={g}>
                  <MenuHeader>{g}</MenuHeader>
                  {PAGE_PRESETS.filter((p) => p.group === g).map((p) => (
                    <MenuItem key={p.name} label={p.name}
                      checked={Math.abs(p.width - width) < 0.5 && Math.abs(p.height - height) < 0.5}
                      onClick={() => { cmd.setPageSize(p.width, p.height); close() }} />
                  ))}
                </div>
              ))}
              <MenuSeparator />
              <MenuItem label="Create New Page Size..." onClick={() => { dialogs.open('pageSetup'); close() }} />
              <MenuItem label="More Preset Page Sizes..." onClick={() => { dialogs.open('pageSetup'); close() }} />
            </div>
          )} />
      </RibbonGroup>
      <RibbonGroup label="Layout">
        <BigButton icon={Grid3x3} label="Guides"
          menu={(close) => (
            <>
              <MenuItem label="No Ruler Guides" onClick={() => { ed.change('Clear Guides', () => { ed.page.guides = [] }); close() }} />
              <MenuItem label="Add Horizontal Ruler Guide" onClick={() => { ed.change('Add Guide', () => { ed.page.guides.push({ id: cmd.uid('g'), orientation: 'h', pos: height / 2 }) }); close() }} />
              <MenuItem label="Add Vertical Ruler Guide" onClick={() => { ed.change('Add Guide', () => { ed.page.guides.push({ id: cmd.uid('g'), orientation: 'v', pos: width / 2 }) }); close() }} />
              <MenuSeparator />
              <MenuItem label="Snap to Guides" checked={ed.view.snapToGuides} onClick={() => { ed.view.snapToGuides = !ed.view.snapToGuides; ed.touch(); close() }} />
              <MenuItem label="Snap to Objects" checked={ed.view.snapToObjects} onClick={() => { ed.view.snapToObjects = !ed.view.snapToObjects; ed.touch(); close() }} />
            </>
          )} />
      </RibbonGroup>
      <RibbonGroup label="Pages">
        <Col>
          <SmallButton icon={Trash2} label="Delete" disabled={ed.doc.pages.length < 2} onClick={cmd.deleteCurrentPage} />
          <SmallButton icon={ArrowLeftRight} label="Move"
            menu={(close) => (
              <>
                <MenuItem label="Move Page Earlier" disabled={ed.pageIndex === 0} onClick={() => { cmd.moveCurrentPage(ed.pageIndex - 1); close() }} />
                <MenuItem label="Move Page Later" disabled={ed.pageIndex >= ed.doc.pages.length - 1} onClick={() => { cmd.moveCurrentPage(ed.pageIndex + 1); close() }} />
              </>
            )} />
          <SmallButton icon={FileText} label="Rename" onClick={() => dialogs.open('renamePage')} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Page Background">
        <BackgroundButton />
        <BigButton icon={PanelsTopLeft} label="Master Pages" disabled title={soon} />
      </RibbonGroup>
    </>
  )
}

function BackgroundButton() {
  const bg = ed.page.background
  return (
    <div className="rbig-colorwrap">
      <ColorButton
        icon={<Palette size={16} />}
        label="Background"
        title="Page Background"
        color={bg.type === 'solid' ? bg.color : '#FFFFFF'}
        onPick={(c) => ed.change('Page Background', () => { ed.page.background = { type: 'solid', color: c, opacity: 1 } })}
        onNone={() => ed.change('Page Background', () => { ed.page.background = { type: 'none' } })}
        noneLabel="No Background"
      />
    </div>
  )
}

// ---------- REVIEW ----------

export function ReviewTab() {
  const dialogs = useDialogs()
  return (
    <>
      <RibbonGroup label="Proofing">
        <BigButton icon={SpellCheck} label="Spelling" color="#1f5fa8" shortcut="F7" split onClick={() => dialogs.open('spelling')}
          menu={(close) => (
            <>
              <MenuItem label="Spelling..." shortcut="F7" onClick={() => { dialogs.open('spelling'); close() }} />
              <MenuItem label="Check Spelling As You Type" checked={ed.view.spelling} onClick={() => { ed.view.spelling = !ed.view.spelling; ed.touch(); close() }} />
            </>
          )} />
        <Col>
          <SmallButton icon={BookOpen} label="Research" disabled title={soon} />
          <SmallButton icon={BookOpen} label="Thesaurus" disabled title={soon} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Language">
        <BigButton icon={Languages} label="Language" disabled title={soon} />
      </RibbonGroup>
    </>
  )
}

// ---------- VIEW ----------

export function ViewTab() {
  const v = ed.view
  const set = (k: keyof typeof v) => (val: boolean) => { v[k] = val; ed.touch() }
  return (
    <>
      <RibbonGroup label="Views">
        <BigButton icon={Square} label="Normal" active />
        <BigButton icon={PanelsTopLeft} label="Master Page" disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Show">
        <Col>
          <Check label="Boundaries" checked={v.boundaries} onChange={set('boundaries')} />
          <Check label="Guides" checked={v.guides} onChange={set('guides')} />
          <Check label="Rulers" checked={v.rulers} onChange={set('rulers')} />
        </Col>
        <Col>
          <Check label="Page Navigation" checked={v.pageNav} onChange={set('pageNav')} />
          <Check label="Scratch Area" checked={v.scratch} onChange={set('scratch')} />
          <Check label="Baselines" checked={v.baselines} onChange={set('baselines')} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Zoom">
        <BigButton icon={ZoomIn} label="100%" onClick={() => ed.setZoom(1)} />
        <BigButton icon={Maximize} label="Whole Page" onClick={() => ed.requestView('fit-page')} />
        <Col>
          <SmallButton icon={PageWidthIcon} label="Page Width" onClick={() => ed.requestView('page-width')} />
          <SmallButton icon={SquareStack} label="Selected Objects" disabled={!ed.selection.length} onClick={() => ed.requestView('fit-selection')} />
        </Col>
      </RibbonGroup>
    </>
  )
}

// ---------- CONTEXTUAL: TEXT BOX TOOLS ----------

export function TextBoxFormatTab() {
  const box = ed.activeTextBox
  const set = cmd.setTextBoxProps
  const fit = box?.autofit
  return (
    <>
      <RibbonGroup label="Text">
        <BigButton icon={Columns3} label="Text Fit" disabled={!box}
          menu={(close) => (
            <>
              {([['bestFit', 'Best Fit'], ['shrinkOnOverflow', 'Shrink Text On Overflow'], ['growBox', 'Grow Text Box to Fit'], ['none', 'Do Not Autofit']] as Array<[Autofit, string]>).map(([k, l]) => (
                <MenuItem key={k} label={l} checked={fit === k} onClick={() => { set('Text Fit', { autofit: k }); close() }} />
              ))}
            </>
          )} />
        <BigButton icon={RotateCcw} label="Text Direction" disabled={!box} active={!!box && box.textRotation !== 0} title={soon} />
      </RibbonGroup>
      <FontGroup />
      <RibbonGroup label="Alignment">
        <AlignmentGrid box={box} />
        <Col>
          <SmallButton icon={Columns3} label="Columns" disabled={!box}
            menu={(close) => (
              <>
                {[1, 2, 3, 4].map((n) => (
                  <MenuItem key={n} label={`${n} Column${n > 1 ? 's' : ''}`} checked={box?.columns === n} onClick={() => { set('Columns', { columns: n }); close() }} />
                ))}
              </>
            )} />
          <SmallButton icon={Ruler} label="Margins" disabled={!box}
            menu={(close) => (
              <>
                {([['None', 0], ['Narrow', 2.88], ['Moderate', 7.2], ['Wide', 14.4]] as Array<[string, number]>).map(([n, m]) => (
                  <MenuItem key={n} label={`${n} (${formatLength(m, ed.unit)})`} checked={box?.margins.top === m && box?.margins.left === m}
                    onClick={() => { set('Text Box Margins', { margins: { top: m, right: m, bottom: m, left: m } }); close() }} />
                ))}
              </>
            )} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Linking">
        <BigButton icon={Link2} label="Create Link" disabled={!box || !!box.nextId}
          onClick={() => { if (box) { ed.setTool({ kind: 'link', fromId: box.id }); ed.editing = null; ed.setStatus('Click an empty text box to continue the text there.') } }} />
        <Col>
          <SmallButton icon={Unlink} label="Break" disabled={!box?.nextId} onClick={() => box && cmd.breakLink(box.id)} />
          <SmallButton icon={ChevronLeft} label="Previous" disabled={!box || !hasPrev(box)} onClick={() => box && goLinked(box, -1)} />
          <SmallButton icon={ChevronRight} label="Next" disabled={!box?.nextId} onClick={() => box && goLinked(box, 1)} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Effects">
        <TextEffectButtons enabled={hasText()} />
      </RibbonGroup>
      <RibbonGroup label="Typography">
        <BigButton icon={TypeOutline} label="Drop Cap" disabled={!hasText()}
          menu={(close) => <DropCapGallery close={close} />} />
        <Col>
          <SmallButton label="Ligatures" iconNode={<span className="typo">ﬁ</span>} disabled title={soon} />
          <SmallButton label="Stylistic Sets" iconNode={<span className="typo">𝒶</span>} disabled title={soon} />
          <SmallButton label="Swash" iconNode={<span className="typo">𝓈</span>} disabled title={soon} />
        </Col>
      </RibbonGroup>
      <ArrangeGroup wrap />
      <SizeGroup />
    </>
  )
}

function DropCapGallery({ close }: { close: () => void }) {
  const current = currentParaStyle()?.dropCap?.lines ?? 0
  return (
    <div className="dropcap-grid">
      {[0, 2, 3, 4, 5].map((n) => (
        <button key={n} className={`dropcap-btn ${current === n ? 'on' : ''}`} title={n ? `Dropped ${n} lines` : 'No Drop Cap'}
          onClick={() => { cmd.setDropCap(n || null); close() }}>
          {n ? (
            <svg width="54" height="46" viewBox="0 0 54 46">
              <text x="2" y={n * 9 + 1} fontSize={n * 9 + 2} fontFamily="Georgia, serif" fontWeight="bold" fill="#1f5fa8">A</text>
              {Array.from({ length: 5 }, (_, i) => <rect key={i} x={i < n ? 2 + (n * 9 + 2) * 0.72 + 2 : 2} y={2 + i * 9} width={i < n ? 50 - (n * 9 + 2) * 0.72 - 2 : 50} height="3" fill="#9a9a9a" />)}
            </svg>
          ) : <span className="dropcap-none">None</span>}
        </button>
      ))}
    </div>
  )
}

function hasPrev(box: TextBoxObject): boolean {
  const chain = ed.text.chain(ed.doc, box.storyId)
  return chain[0]?.id !== box.id
}

function goLinked(box: TextBoxObject, dir: 1 | -1) {
  const chain = ed.text.chain(ed.doc, box.storyId)
  const i = chain.findIndex((b) => b.id === box.id)
  const target = chain[i + dir]
  if (!target) return
  const pageIdx = ed.doc.pages.findIndex((p) => p.objects.some((o) => o.id === target.id))
  if (pageIdx >= 0) ed.goToPage(pageIdx)
  ed.editing = null
  ed.select([target.id])
}

function AlignmentGrid({ box }: { box: TextBoxObject | null }) {
  const cells: Array<[VAlign, 'left' | 'center' | 'right', typeof AlignVerticalJustifyStart]> = []
  const icons = { top: AlignVerticalJustifyStart, middle: AlignVerticalJustifyCenter, bottom: AlignVerticalJustifyEnd }
  for (const v of ['top', 'middle', 'bottom'] as VAlign[]) for (const h of ['left', 'center', 'right'] as const) cells.push([v, h, icons[v]])
  return (
    <div className="align-grid">
      {cells.map(([v, h, Icon]) => (
        <button key={v + h} className={`align-cell ${box?.vAlign === v ? 'v-on' : ''}`} disabled={!box} title={`Align ${v === 'middle' ? 'Center' : v[0].toUpperCase() + v.slice(1)} ${h === 'center' ? 'Center' : h[0].toUpperCase() + h.slice(1)}`}
          onClick={() => {
            cmd.setTextBoxProps('Text Alignment', { vAlign: v })
            cmd.formatParagraph('Align Text', { align: h })
          }}>
          <Icon size={14} style={{ transform: h === 'left' ? 'translateX(-2px)' : h === 'right' ? 'translateX(2px)' : undefined }} />
        </button>
      ))}
    </div>
  )
}

function TextEffectButtons({ enabled }: { enabled: boolean }) {
  const fmt = cmd.formatText
  return (
    <Col>
      <ColorButton icon={<PaintBucket size={15} />} label="Text Fill" title="Text Fill" color="#000000"
        onPick={(c) => fmt('Text Fill', { color: c, textFill: null })} />
      <ColorButton icon={<PenLine size={15} />} label="Text Outline" title="Text Outline" color="#1F4E79"
        onPick={(c) => fmt('Text Outline', { textOutline: { color: c, opacity: 1, width: 1, dash: 'solid' } })}
        onNone={() => fmt('Text Outline', { textOutline: null })} noneLabel="No Outline" />
      <SmallButton icon={Sparkles} label="Text Effects" disabled={!enabled}
        menu={(close) => (
          <>
            <MenuHeader>Shadow</MenuHeader>
            <MenuItem label="No Shadow" onClick={() => { fmt('Text Shadow', { textShadow: null }); close() }} />
            <MenuItem label="Offset Bottom Right" onClick={() => { fmt('Text Shadow', { textShadow: { color: '#000000', opacity: 0.4, blur: 3, offsetX: 2, offsetY: 2 } }); close() }} />
            <MenuItem label="Soft Shadow" onClick={() => { fmt('Text Shadow', { textShadow: { color: '#000000', opacity: 0.35, blur: 8, offsetX: 0, offsetY: 3 } }); close() }} />
            <MenuHeader>Glow</MenuHeader>
            <MenuItem label="No Glow" onClick={() => { fmt('Text Glow', { textGlow: null }); close() }} />
            <MenuItem label="Gold Glow" onClick={() => { fmt('Text Glow', { textGlow: { color: '#FFC000', opacity: 0.8, size: 8 } }); close() }} />
            <MenuItem label="Blue Glow" onClick={() => { fmt('Text Glow', { textGlow: { color: '#5B9BD5', opacity: 0.8, size: 8 } }); close() }} />
            <MenuItem label="White Glow" onClick={() => { fmt('Text Glow', { textGlow: { color: '#FFFFFF', opacity: 0.9, size: 6 } }); close() }} />
          </>
        )} />
    </Col>
  )
}

// ---------- CONTEXTUAL: PICTURE TOOLS ----------

export function PictureFormatTab() {
  const pic = ed.single && ed.single.type === 'picture' ? ed.single : null
  const set = cmd.setObjectProps
  return (
    <>
      <RibbonGroup label="Insert">
        <BigButton icon={ChangePicture} label="Change Picture" color="#2e7d32" disabled={!pic} onClick={cmd.insertPictures} />
      </RibbonGroup>
      <RibbonGroup label="Adjust">
        <Col>
          <SmallButton icon={Sun} label="Corrections" disabled={!pic}
            menu={(close) => (
              <>
                <MenuHeader>Brightness</MenuHeader>
                {[-0.4, -0.2, 0, 0.2, 0.4].map((b) => (
                  <MenuItem key={b} label={`${b > 0 ? '+' : ''}${Math.round(b * 100)}%`} checked={pic?.brightness === b} onClick={() => { set('Brightness', (o) => { if (o.type === 'picture') o.brightness = b }); close() }} />
                ))}
                <MenuHeader>Contrast</MenuHeader>
                {[-0.4, -0.2, 0, 0.2, 0.4].map((c) => (
                  <MenuItem key={c} label={`${c > 0 ? '+' : ''}${Math.round(c * 100)}%`} checked={pic?.contrast === c} onClick={() => { set('Contrast', (o) => { if (o.type === 'picture') o.contrast = c }); close() }} />
                ))}
              </>
            )} />
          <SmallButton icon={Contrast} label="Recolor" disabled={!pic}
            menu={(close) => (
              <>
                <MenuItem label="No Recolor" checked={!pic?.grayscale} onClick={() => { set('Recolor', (o) => { if (o.type === 'picture') o.grayscale = false }); close() }} />
                <MenuItem label="Grayscale" checked={!!pic?.grayscale} onClick={() => { set('Recolor', (o) => { if (o.type === 'picture') o.grayscale = true }); close() }} />
              </>
            )} />
          <SmallButton icon={RotateCcw} label="Reset Picture" disabled={!pic}
            onClick={() => set('Reset Picture', (o) => { if (o.type === 'picture') { o.brightness = 0; o.contrast = 0; o.grayscale = false; o.recolor = null; o.opacity = 1; o.crop = { left: 0, top: 0, right: 0, bottom: 0 } } })} />
        </Col>
      </RibbonGroup>
      <RibbonGroup label="Picture Styles">
        <Col>
          <ColorButton icon={<Square size={15} />} label="Picture Border" title="Picture Border" color="#000000"
            onPick={(c) => set('Picture Border', (o) => { if (o.type === 'picture') o.stroke = { ...o.stroke, color: c, width: o.stroke.width || 1 } })}
            onNone={() => set('Picture Border', (o) => { if (o.type === 'picture') o.stroke = { ...o.stroke, width: 0 } })} noneLabel="No Outline" />
          <ShadowButton label="Picture Effects" />
          <SmallButton icon={Layers} label="Transparency" disabled={!pic}
            menu={(close) => (
              <>
                {[0, 0.25, 0.5, 0.75].map((t) => (
                  <MenuItem key={t} label={`${Math.round(t * 100)}%`} checked={pic ? Math.abs(1 - pic.opacity - t) < 0.01 : false} onClick={() => { set('Transparency', (o) => { if (o.type === 'picture') o.opacity = 1 - t }); close() }} />
                ))}
              </>
            )} />
        </Col>
      </RibbonGroup>
      <ArrangeGroup wrap />
      <RibbonGroup label="Crop">
        <BigButton icon={Crop} label="Crop" split active={!!ed.cropping} disabled={!pic?.assetId} onClick={cmd.toggleCrop}
          menu={(close) => (
            <>
              <MenuItem icon={Crop} label={ed.cropping ? 'Finish Cropping' : 'Crop'} onClick={() => { cmd.toggleCrop(); close() }} />
              <MenuItem label="Fill" onClick={() => { cmd.cropFitFill('fill'); close() }} />
              <MenuItem label="Fit" onClick={() => { cmd.cropFitFill('fit'); close() }} />
              <MenuItem label="Clear Crop" onClick={() => { cmd.cropFitFill('clear'); close() }} />
            </>
          )} />
      </RibbonGroup>
      <SizeGroup />
    </>
  )
}

function ShadowButton({ label }: { label: string }) {
  const set = cmd.setObjectProps
  return (
    <SmallButton icon={Sparkles} label={label} disabled={!ed.selection.length}
      menu={(close) => (
        <>
          <MenuHeader>Shadow</MenuHeader>
          <MenuItem label="No Shadow" onClick={() => { set('Shadow', (o) => { o.effects.shadow = null }); close() }} />
          <MenuItem label="Offset Bottom Right" onClick={() => { set('Shadow', (o) => { o.effects.shadow = { color: '#000000', opacity: 0.4, blur: 4, offsetX: 3, offsetY: 3 } }); close() }} />
          <MenuItem label="Offset Bottom" onClick={() => { set('Shadow', (o) => { o.effects.shadow = { color: '#000000', opacity: 0.4, blur: 4, offsetX: 0, offsetY: 4 } }); close() }} />
          <MenuItem label="Soft Glow Shadow" onClick={() => { set('Shadow', (o) => { o.effects.shadow = { color: '#000000', opacity: 0.35, blur: 12, offsetX: 0, offsetY: 0 } }); close() }} />
        </>
      )} />
  )
}

// ---------- CONTEXTUAL: DRAWING TOOLS ----------

export function DrawingFormatTab() {
  const set = cmd.setObjectProps
  const objs = ed.selectedObjects
  const fillable = (o: SceneObject) => o.type === 'shape' || o.type === 'text' || o.type === 'picture'
  return (
    <>
      <RibbonGroup label="Insert Shapes">
        <BigButton icon={Shapes} label="Shapes" color="#c55a11" menu={(close) => <ShapesGallery close={close} />} />
        <BigButton icon={TextCursorInput} label="Draw Text Box" color="#1f5fa8" onClick={drawTextBoxTool} />
      </RibbonGroup>
      <RibbonGroup label="Shape Styles">
        <Col>
          <ColorButton icon={<PaintBucket size={15} />} label="Shape Fill" title="Shape Fill" color="#5B9BD5"
            onPick={(c) => set('Shape Fill', (o) => { if (fillable(o)) (o as any).fill = { type: 'solid', color: c, opacity: 1 } })}
            onNone={() => set('Shape Fill', (o) => { if (fillable(o)) (o as any).fill = { type: 'none' } })} noneLabel="No Fill" />
          <ColorButton icon={<PenLine size={15} />} label="Shape Outline" title="Shape Outline" color="#41719C"
            onPick={(c) => set('Shape Outline', (o) => { if (fillable(o)) { const ob = o as any; ob.stroke = { ...ob.stroke, color: c, width: ob.stroke.width || 1 } } })}
            onNone={() => set('Shape Outline', (o) => { if (fillable(o)) { const ob = o as any; ob.stroke = { ...ob.stroke, width: 0 } } })} noneLabel="No Outline" />
          <SmallButton iconNode={<span className="weight">≡</span>} label="Weight" disabled={!objs.length}
            menu={(close) => (
              <>
                {[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6, 9, 12].map((w) => (
                  <MenuItem key={w} label={`${w} pt`} onClick={() => { set('Line Weight', (o) => { if (fillable(o)) { const ob = o as any; ob.stroke = { ...ob.stroke, width: w } } }); close() }} />
                ))}
              </>
            )} />
        </Col>
        <Col>
          <ShadowButton label="Shape Effects" />
          <SmallButton iconNode={<span className="weight">┅</span>} label="Dashes" disabled={!objs.length}
            menu={(close) => (
              <>
                {(['solid', 'dash', 'dot', 'dashDot', 'longDash'] as const).map((d) => (
                  <MenuItem key={d} label={d} onClick={() => { set('Dashes', (o) => { if (fillable(o)) { const ob = o as any; ob.stroke = { ...ob.stroke, dash: d, width: ob.stroke.width || 1 } } }); close() }} />
                ))}
              </>
            )} />
        </Col>
      </RibbonGroup>
      <ArrangeGroup wrap />
      <SizeGroup />
    </>
  )
}

