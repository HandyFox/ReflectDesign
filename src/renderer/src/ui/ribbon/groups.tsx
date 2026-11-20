// Ribbon groups shared by several tabs (Font, Paragraph, Arrange, Size).

import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, BringToFront, CaseSensitive,
  ChevronsDown, ChevronsUp, Eraser, FlipHorizontal2, FlipVertical2, Group, Highlighter, IndentDecrease,
  IndentIncrease, Italic, List, ListOrdered, Lock, MoveHorizontal, MoveVertical, RotateCcw, RotateCw,
  SendToBack, Strikethrough, Subscript, Superscript, Underline, Ungroup, WrapText, AlignHorizontalJustifyCenter,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal,
  AlignEndHorizontal, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Type
} from 'lucide-react'
import { editor as ed } from '@core/editor'
import * as cmd from '@core/commands'
import { commonCharStyle, endOfStory } from '@core/text/edit'
import type { CharStyle, ParaStyle, SceneObject, WrapMode } from '@core/model/types'
import { formatLength, parseLength } from '@core/model/units'
import { frameOf, setFrame } from '@core/model/ops'
import { BigButton, Col, Combo, MeasureField, MenuItem, MenuSeparator, RibbonGroup, Row, SmallButton } from './controls'
import { ColorButton } from './ColorPicker'
import { FONT_SIZES, ensureFont, useFontFamilies } from '../fonts'

/** Formatting at the caret / selection / selected text boxes. */
export function currentCharStyle(): Partial<CharStyle> | null {
  const e = ed.editing
  if (e) {
    const story = ed.doc.stories[e.storyId]
    if (!story) return null
    const s = commonCharStyle(story, e.anchor, e.caret)
    return e.pending ? { ...s, ...e.pending } : s
  }
  const box = ed.activeTextBox
  if (box) {
    const story = ed.doc.stories[box.storyId]
    return story ? commonCharStyle(story, { para: 0, offset: 0 }, endOfStory(story)) : null
  }
  return null
}

export function currentParaStyle(): ParaStyle | null {
  const e = ed.editing
  const box = ed.activeTextBox
  const storyId = e?.storyId ?? box?.storyId
  if (!storyId) return null
  const story = ed.doc.stories[storyId]
  if (!story) return null
  return story.paragraphs[e ? e.caret.para : 0]?.style ?? null
}

export function hasText(): boolean {
  return !!ed.editing || ed.selectedObjects.some(function walk(o: SceneObject): boolean {
    return o.type === 'text' || (o.type === 'group' && o.children.some(walk))
  })
}

export function FontGroup() {
  const families = useFontFamilies()
  const cs = currentCharStyle()
  const enabled = hasText()
  const size = cs?.size
  const fmt = cmd.formatText
  return (
    <RibbonGroup label="Font">
      <Col>
        <Row>
          <Combo
            title="Font"
            value={cs?.font ?? ''}
            items={families}
            width={150}
            renderItem={(f) => <span style={{ fontFamily: `"${f}"`, fontSize: 14 }}>{f}</span>}
            onCommit={(font) => { ensureFont(font); fmt('Font', { font }) }}
          />
          <Combo
            title="Font Size"
            value={size !== undefined ? String(Math.round(size * 10) / 10) : ''}
            items={FONT_SIZES}
            width={52}
            filter={false}
            onCommit={(v) => { const n = parseFloat(v); if (n > 0 && n <= 1638) fmt('Font Size', { size: n }) }}
          />
          <SmallButton iconNode={<span className="aa">A<sup>▲</sup></span>} title="Increase Font Size" shortcut="Ctrl+Shift+>" disabled={!enabled} onClick={() => fmt('Grow Font', { size: nextSize(size ?? 10, 1) })} />
          <SmallButton iconNode={<span className="aa small">A<sup>▼</sup></span>} title="Decrease Font Size" shortcut="Ctrl+Shift+<" disabled={!enabled} onClick={() => fmt('Shrink Font', { size: nextSize(size ?? 10, -1) })} />
          <SmallButton icon={Eraser} title="Clear All Formatting" disabled={!enabled} onClick={() => fmt('Clear Formatting', { bold: false, italic: false, underline: 'none', strike: false, baseline: 'normal', caps: 'normal', highlight: null, tracking: 0, scale: 100, textOutline: null, textShadow: null, textGlow: null, textFill: null })} />
        </Row>
        <Row>
          <SmallButton icon={Bold} title="Bold" shortcut="Ctrl+B" active={cs?.bold === true} disabled={!enabled} onClick={() => fmt('Bold', { bold: !cs?.bold })} />
          <SmallButton icon={Italic} title="Italic" shortcut="Ctrl+I" active={cs?.italic === true} disabled={!enabled} onClick={() => fmt('Italic', { italic: !cs?.italic })} />
          <SmallButton
            icon={Underline}
            title="Underline"
            shortcut="Ctrl+U"
            split
            active={!!cs?.underline && cs.underline !== 'none'}
            disabled={!enabled}
            onClick={() => fmt('Underline', { underline: cs?.underline && cs.underline !== 'none' ? 'none' : 'single' })}
            menu={(close) => (
              <>
                {(['single', 'double', 'thick', 'dotted', 'dash', 'wave', 'none'] as const).map((u) => (
                  <MenuItem key={u} label={u === 'none' ? 'None' : u[0].toUpperCase() + u.slice(1)} checked={cs?.underline === u} onClick={() => { fmt('Underline', { underline: u }); close() }} />
                ))}
              </>
            )}
          />
          <SmallButton icon={Strikethrough} title="Strikethrough" active={cs?.strike === true} disabled={!enabled} onClick={() => fmt('Strikethrough', { strike: !cs?.strike })} />
          <SmallButton icon={Subscript} title="Subscript" shortcut="Ctrl+=" active={cs?.baseline === 'subscript'} disabled={!enabled} onClick={() => fmt('Subscript', { baseline: cs?.baseline === 'subscript' ? 'normal' : 'subscript' })} />
          <SmallButton icon={Superscript} title="Superscript" shortcut="Ctrl+Shift+=" active={cs?.baseline === 'superscript'} disabled={!enabled} onClick={() => fmt('Superscript', { baseline: cs?.baseline === 'superscript' ? 'normal' : 'superscript' })} />
          <SmallButton
            icon={CaseSensitive}
            title="Change Case"
            disabled={!enabled}
            menu={(close) => (
              <>
                <MenuItem label="Normal" checked={cs?.caps === 'normal'} onClick={() => { fmt('Change Case', { caps: 'normal' }); close() }} />
                <MenuItem label="UPPERCASE (All Caps)" checked={cs?.caps === 'allCaps'} onClick={() => { fmt('Change Case', { caps: 'allCaps' }); close() }} />
                <MenuItem label="Small Caps" checked={cs?.caps === 'smallCaps'} onClick={() => { fmt('Change Case', { caps: 'smallCaps' }); close() }} />
              </>
            )}
          />
          <CharacterSpacingButton cs={cs} enabled={enabled} />
          <ColorButton icon={<Highlighter size={15} />} title="Text Highlight Color" color={cs?.highlight ?? '#FFFF00'} onPick={(c) => fmt('Highlight', { highlight: c })} onNone={() => fmt('Highlight', { highlight: null })} noneLabel="No Color" />
          <ColorButton icon={<Type size={15} />} title="Font Color" color={cs?.color ?? '#FF0000'} onPick={(c) => fmt('Font Color', { color: c, textFill: null })} />
        </Row>
      </Col>
    </RibbonGroup>
  )
}

function CharacterSpacingButton({ cs, enabled }: { cs: Partial<CharStyle> | null; enabled: boolean }) {
  const fmt = cmd.formatText
  // Publisher's Character Spacing presets (tracking in 1/1000 em).
  const presets: Array<[string, number]> = [['Very Tight', -125], ['Tight', -62], ['Normal', 0], ['Loose', 62], ['Very Loose', 125]]
  return (
    <SmallButton
      icon={MoveHorizontal}
      title="Character Spacing"
      disabled={!enabled}
      menu={(close) => (
        <>
          {presets.map(([name, t]) => (
            <MenuItem key={name} label={name} checked={cs?.tracking === t} onClick={() => { fmt('Character Spacing', { tracking: t }); close() }} />
          ))}
          <MenuSeparator />
          <MenuItem label="Kern Text (on/off)" checked={cs?.kerning !== false} onClick={() => { fmt('Kerning', { kerning: !(cs?.kerning ?? true) }); close() }} />
          <MenuSeparator />
          {[50, 75, 90, 100, 110, 125, 150, 200].map((sc) => (
            <MenuItem key={sc} label={`Scaling ${sc}%`} checked={cs?.scale === sc} onClick={() => { fmt('Scaling', { scale: sc }); close() }} />
          ))}
        </>
      )}
    />
  )
}

function nextSize(size: number, dir: 1 | -1): number {
  const steps = FONT_SIZES.map(Number)
  if (dir > 0) return steps.find((s) => s > size + 0.01) ?? Math.min(1638, size + 50)
  return [...steps].reverse().find((s) => s < size - 0.01) ?? Math.max(1, size - 1)
}

export function ParagraphGroup() {
  const ps = currentParaStyle()
  const enabled = hasText()
  const para = cmd.formatParagraph
  const align = ps?.align
  return (
    <RibbonGroup label="Paragraph">
      <Col>
        <Row>
          <SmallButton icon={List} title="Bullets" active={ps?.bullet.kind === 'bullet'} disabled={!enabled} onClick={() => para('Bullets', { bullet: ps?.bullet.kind === 'bullet' ? { kind: 'none' } : { kind: 'bullet', char: '•' }, indentLeft: ps?.bullet.kind === 'bullet' ? 0 : 18, indentFirst: ps?.bullet.kind === 'bullet' ? 0 : -18 })} />
          <SmallButton icon={ListOrdered} title="Numbering" active={ps?.bullet.kind === 'number'} disabled={!enabled} onClick={() => para('Numbering', { bullet: ps?.bullet.kind === 'number' ? { kind: 'none' } : { kind: 'number', format: '1.', start: 1 }, indentLeft: ps?.bullet.kind === 'number' ? 0 : 18, indentFirst: ps?.bullet.kind === 'number' ? 0 : -18 })} />
          <SmallButton icon={IndentDecrease} title="Decrease Indent" disabled={!enabled} onClick={() => para('Decrease Indent', { indentLeft: Math.max(0, (ps?.indentLeft ?? 0) - 36) })} />
          <SmallButton icon={IndentIncrease} title="Increase Indent" disabled={!enabled} onClick={() => para('Increase Indent', { indentLeft: (ps?.indentLeft ?? 0) + 36 })} />
          <SmallButton
            iconNode={<span className="linespace">↕≡</span>}
            title="Line Spacing"
            disabled={!enabled}
            menu={(close) => (
              <>
                {[0.8, 1, 1.19, 1.5, 2, 2.5, 3].map((v) => (
                  <MenuItem key={v} label={v.toString()} checked={ps?.lineSpacing.mode === 'multiple' && Math.abs(ps.lineSpacing.value - v) < 0.01} onClick={() => { para('Line Spacing', { lineSpacing: { mode: 'multiple', value: v } }); close() }} />
                ))}
                <MenuSeparator />
                <MenuItem label="Add Space Before Paragraph" onClick={() => { para('Space Before', { spaceBefore: (ps?.spaceBefore ?? 0) + 12 }); close() }} />
                <MenuItem label="Remove Space After Paragraph" onClick={() => { para('Space After', { spaceAfter: 0 }); close() }} />
              </>
            )}
          />
        </Row>
        <Row>
          <SmallButton icon={AlignLeft} title="Align Left" shortcut="Ctrl+L" active={align === 'left'} disabled={!enabled} onClick={() => para('Align Left', { align: 'left' })} />
          <SmallButton icon={AlignCenter} title="Center" shortcut="Ctrl+E" active={align === 'center'} disabled={!enabled} onClick={() => para('Center', { align: 'center' })} />
          <SmallButton icon={AlignRight} title="Align Right" shortcut="Ctrl+R" active={align === 'right'} disabled={!enabled} onClick={() => para('Align Right', { align: 'right' })} />
          <SmallButton icon={AlignJustify} title="Justify" shortcut="Ctrl+J" active={align === 'justify'} disabled={!enabled} onClick={() => para('Justify', { align: 'justify' })} />
          <SmallButton icon={AlignHorizontalJustifyCenter} title="Distribute" active={align === 'distribute'} disabled={!enabled} onClick={() => para('Distribute', { align: 'distribute' })} />
        </Row>
      </Col>
    </RibbonGroup>
  )
}

export function ArrangeGroup({ wrap = false }: { wrap?: boolean }) {
  const sel = ed.selectedObjects
  const any = sel.length > 0
  const single = ed.single
  return (
    <RibbonGroup label="Arrange">
      {wrap && <WrapTextButton />}
      <Col>
        <SmallButton icon={BringToFront} label="Bring Forward" split disabled={!any} onClick={cmd.arrange.bringForward}
          menu={(close) => (
            <>
              <MenuItem icon={BringToFront} label="Bring to Front" onClick={() => { cmd.arrange.bringToFront(); close() }} />
              <MenuItem icon={ChevronsUp} label="Bring Forward" onClick={() => { cmd.arrange.bringForward(); close() }} />
            </>
          )} />
        <SmallButton icon={SendToBack} label="Send Backward" split disabled={!any} onClick={cmd.arrange.sendBackward}
          menu={(close) => (
            <>
              <MenuItem icon={SendToBack} label="Send to Back" onClick={() => { cmd.arrange.sendToBack(); close() }} />
              <MenuItem icon={ChevronsDown} label="Send Backward" onClick={() => { cmd.arrange.sendBackward(); close() }} />
            </>
          )} />
        <AlignButton />
      </Col>
      <Col>
        <SmallButton icon={Group} label="Group" shortcut="Ctrl+Shift+G" disabled={sel.length < 2} onClick={cmd.groupSelection} />
        <SmallButton icon={Ungroup} label="Ungroup" shortcut="Ctrl+Shift+G" disabled={!single || single.type !== 'group'} onClick={cmd.ungroupSelection} />
        <SmallButton icon={RotateCw} label="Rotate" disabled={!any}
          menu={(close) => (
            <>
              <MenuItem icon={RotateCw} label="Rotate Right 90°" onClick={() => { cmd.rotateBy(90); close() }} />
              <MenuItem icon={RotateCcw} label="Rotate Left 90°" onClick={() => { cmd.rotateBy(-90); close() }} />
              <MenuItem icon={FlipVertical2} label="Flip Vertical" onClick={() => { cmd.flip('v'); close() }} />
              <MenuItem icon={FlipHorizontal2} label="Flip Horizontal" onClick={() => { cmd.flip('h'); close() }} />
              <MenuSeparator />
              <MenuItem icon={Lock} label={single?.locked ? 'Unlock Position' : 'Lock Position'} onClick={() => { cmd.lockToggle(); close() }} />
            </>
          )} />
      </Col>
    </RibbonGroup>
  )
}

function AlignButton() {
  const n = ed.selection.length
  return (
    <SmallButton icon={AlignStartVertical} label="Align" disabled={n === 0}
      menu={(close) => (
        <>
          <MenuItem icon={AlignStartVertical} label="Align Left" onClick={() => { cmd.align('left'); close() }} />
          <MenuItem icon={AlignCenterVertical} label="Align Center" onClick={() => { cmd.align('center'); close() }} />
          <MenuItem icon={AlignEndVertical} label="Align Right" onClick={() => { cmd.align('right'); close() }} />
          <MenuSeparator />
          <MenuItem icon={AlignStartHorizontal} label="Align Top" onClick={() => { cmd.align('top'); close() }} />
          <MenuItem icon={AlignCenterHorizontal} label="Align Middle" onClick={() => { cmd.align('middle'); close() }} />
          <MenuItem icon={AlignEndHorizontal} label="Align Bottom" onClick={() => { cmd.align('bottom'); close() }} />
          <MenuSeparator />
          <MenuItem icon={AlignHorizontalDistributeCenter} label="Distribute Horizontally" disabled={n < 3} onClick={() => { cmd.distribute('h'); close() }} />
          <MenuItem icon={AlignVerticalDistributeCenter} label="Distribute Vertically" disabled={n < 3} onClick={() => { cmd.distribute('v'); close() }} />
          <MenuSeparator />
          <MenuItem label="Align to Margin Guides: Center" onClick={() => { cmd.align('center', true); close() }} />
          <MenuItem label="Align to Margin Guides: Middle" onClick={() => { cmd.align('middle', true); close() }} />
        </>
      )} />
  )
}

const WRAP_LABELS: Array<[WrapMode, string]> = [
  ['none', 'None'],
  ['square', 'Square'],
  ['tight', 'Tight'],
  ['through', 'Through'],
  ['topBottom', 'Top and Bottom']
]

export function WrapTextButton() {
  const single = ed.single
  const mode = single?.wrap.mode
  return (
    <BigButton icon={WrapText} label="Wrap Text" disabled={!ed.selection.length}
      menu={(close) => (
        <>
          {WRAP_LABELS.map(([m, l]) => (
            <MenuItem key={m} label={l} checked={mode === m} onClick={() => { cmd.setObjectProps('Wrap Text', (o) => { o.wrap.mode = m }); close() }} />
          ))}
          <MenuSeparator />
          <MenuItem label="Edit Wrap Points" disabled />
          <MenuItem label="More Layout Options..." disabled />
        </>
      )} />
  )
}

export function SizeGroup() {
  const single = ed.single
  const unit = ed.unit
  const f = (v: number) => formatLength(v, unit)
  const p = (s: string) => parseLength(s, unit)
  const resize = (dim: 'width' | 'height', v: number) => {
    if (v < 1) return
    cmd.setObjectProps(dim === 'width' ? 'Shape Width' : 'Shape Height', (o) => {
      const fr = frameOf(o)
      const cx = fr.x + fr.width / 2, cy = fr.y + fr.height / 2
      const nw = dim === 'width' ? v : fr.width
      const nh = dim === 'height' ? v : fr.height
      setFrame(o, { x: cx - nw / 2, y: cy - nh / 2, width: nw, height: nh, rotation: fr.rotation })
    })
  }
  return (
    <RibbonGroup label="Size">
      <Col>
        <MeasureField icon={MoveVertical} title="Shape Height" value={single ? single.height : null} format={f} parse={p} onCommit={(v) => resize('height', v)} />
        <MeasureField icon={MoveHorizontal} title="Shape Width" value={single ? single.width : null} format={f} parse={p} onCommit={(v) => resize('width', v)} />
      </Col>
    </RibbonGroup>
  )
}

