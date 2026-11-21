# ReflectDesign — Build Plan

ReflectDesign is a single-page layout app for bulletin boards, posters, signs and
classroom displays. It is built for people coming from **Microsoft Publisher
2016/2019** and should feel like home on day one: same ribbon, same tab names,
same buttons in the same places, same keyboard shortcuts.

Primary platform: **Ubuntu Linux**. Also runs on Windows and macOS.

---

## 1. Guiding rules

1. **If Publisher puts it there, we put it there.** Ribbon tabs, group names,
   right-click menus, and shortcuts copy Publisher 2016/2019. When in doubt,
   match Publisher's behaviour rather than inventing something "better".
2. **What you see is what prints.** The screen, the PDF and the PNG all come
   from the same layout and drawing code, so they can't disagree.
3. **No learning curve for the basics.** Nothing should require reading a
   manual. Scribus/Inkscape-style complexity is the thing we're avoiding.
4. **Never lose work.** Autosave + crash recovery from the first release.

## 2. User profile (from planning Q&A)

| Topic | Answer |
|---|---|
| Publisher version | 2016/2019 ribbon |
| Page sizes | Varies a lot — small labels up to large posters/banners |
| Printing | PDF to a print shop (no special requirements known) |
| Extra export | PNG — for sharing online, for printing elsewhere, and with transparent backgrounds |
| Most used | Text boxes (every Publisher text box feature), custom fonts, WordArt-style titles, transparent PNGs, templates |
| Fonts | Installed system fonts + browse/add Google Fonts in-app |
| Text wrap | Exactly like Publisher (None/Square/Tight/Through/Top & Bottom/Edit Wrap Points) plus Bring Forward / Send Backward |
| Old .pub files | Nice to have |
| Clip art search | **Not needed** |
| Templates | A couple of starter templates **plus** save-your-own templates like Publisher |
| Delivery | Wait for the full version (test builds at checkpoints for feedback) |

## 3. Feature specification

### 3.1 Workspace (matches Publisher 2016/2019)
- **Ribbon tabs:** File (backstage), Home, Insert, Page Design, Review, View,
  plus contextual **Text Box Tools – Format**, **Picture Tools – Format** and
  **Drawing Tools – Format** tabs that appear when those objects are selected.
- **Quick Access Toolbar:** Save, Undo, Redo (customisable).
- **Page Navigation pane** on the left with page thumbnails (add, duplicate,
  delete, reorder pages).
- **Gray scratch area** around the page — park objects off the page, they
  stay with the file but don't print (just like Publisher).
- **Rulers** (inches/cm/points/picas), drag guides out of the rulers,
  margin guides, grid and baseline guides, snap to guides/objects.
- **Zoom:** slider in the status bar, Ctrl+scroll, Whole Page,
  Page Width, 100%, Selected Objects.
- **Status bar:** page x of y, object position & size, zoom slider.
- Right-click menus with the same entries as Publisher.

### 3.2 Pages & Page Setup
- Custom page size with live preview; preset list (Letter, Legal, Tabloid,
  A-sizes, common poster sizes 11×17, 18×24, 24×36, 36×48, banners).
- Orientation, margins, background colour/gradient/picture.
- Master pages (Publisher's "Master Pages") for repeated elements.
- Multi-page documents (each page printed/exported separately or together).

### 3.3 Text boxes — full Publisher feature set
- Draw text box, type directly, rich formatting per character.
- **Linked text boxes:** Create Link / Break, overflow indicator (the "…"
  marker), Next/Previous navigation, text flows between boxes and pages.
- **Text Fit:** Best Fit, Shrink Text On Overflow, Grow Text Box to Fit,
  Do Not Autofit.
- **Columns** with gutter, **margins** (inner padding), **9-way alignment**
  (top/middle/bottom × left/centre/right), **text direction** (rotate 90°/270°).
- **Character:** font, size, bold/italic/underline (styles)/strikethrough,
  superscript/subscript, small caps/all caps, colour (solid/gradient),
  highlight, **character spacing** (tracking), **kerning**, **scaling**
  (horizontal stretch), baseline shift.
- **Paragraph:** alignment incl. justify & distributed, indents (first line /
  hanging), line spacing (multiple or exact), space before/after, tabs and tab
  leaders, bullets & numbering, keep-together options, hyphenation.
- **Drop caps** (preset + custom).
- **Typography (OpenType):** ligatures, stylistic sets, swashes, stylistic
  alternates, number styles — important for decorative fonts.
- **Text effects (WordArt-style):** outline (colour/width), shadow, glow,
  reflection, bevel, gradient & picture fill, text transform shapes
  (Arch, Circle, Wave, Inflate, Slant…).
- **Styles:** paragraph/character styles, Import Styles, format painter.
- **Find & Replace**, **spell check** (Hunspell dictionaries).
- Text box fill, line/border (incl. dashes), shadow, rotation.

### 3.4 Pictures
- Insert PNG (full alpha transparency), JPEG, GIF, WebP, SVG, BMP, TIFF.
- Picture placeholders, Change/Swap Picture.
- **Crop**, crop to shape, fit/fill, reset.
- **Corrections:** brightness, contrast; **Recolor**; transparency;
  set transparent colour.
- Picture border, shadow, glow, reflection, soft edges.
- Images stored at full resolution inside the file; low-res warning on export.

### 3.5 Text wrapping & arranging
- Wrap Text: **None, Square, Tight, Through, Top and Bottom, Edit Wrap
  Points**, wrap distances. **Tight/Through follow the visible outline of a
  transparent PNG** (wrap polygon traced from the alpha channel, editable).
- **Bring Forward / Bring to Front / Send Backward / Send to Back.**
- Group/ungroup, align (left/centre/right/top/middle/bottom, relative to page
  or margins), distribute, rotate (free + 90° steps), flip.
- Nudge with arrow keys (Alt+arrow for 1px), lock position, Selection pane.

### 3.6 Shapes & drawing
- Lines, arrows, rectangles, rounded rectangles, ellipses, stars, banners,
  callouts, hearts, etc. (Publisher's Shapes gallery).
- Fill: solid, gradient, picture, pattern, transparency. Line: colour, width,
  dash, arrowheads. Shadow & 3D-lite effects.
- **Borders & Accents** gallery equivalent, decorative page borders.

### 3.7 Fonts
- Uses every font installed on the system (via fontconfig on Linux).
- **Google Fonts browser** inside the app: search, preview, install with one
  click (installed to `~/.local/share/fonts` so other apps see them too).
- Fonts used in a design are embedded in the `.rdx` file so it opens correctly
  on another computer; missing-font warning with substitution.

### 3.8 Templates
- File > New shows **Featured** (built-in starter templates) and **Personal**
  (your saved templates), with thumbnails — just like Publisher's backstage.
- **Save As Template** (File > Save As > ReflectDesign Template) with name,
  category and description.
- **New Blank Template** (File > New > Personal): start a blank template of any
  page size; Save keeps updating it. ✔ Done 2026-11-21.
- Starter templates (first release): bulletin board title banner, classroom
  poster, event flyer, and a cut-out letter sheet.
- Building Blocks: save any selected objects as a reusable block.

### 3.9 Export & print
- **PDF:** vector text and shapes, embedded images at full resolution, any page
  size. Optional bleed and crop marks (off by default). RGB by default.
- **PNG:** choose DPI (72/150/300/custom) or pixel size, **transparent
  background** option, export whole page or **selected objects only**.
- JPEG export.
- Print dialog with **tiling** for printing large designs on letter paper.

### 3.10 Files
- Native format **`.rdx`** — a zip containing `document.json`, images and
  embedded fonts. Templates use **`.rdt`** (same structure).
- Autosave every 2 minutes and on crash recovery at next launch.
- Recent files list. ✔ Done 2026-11-21 (File › Open › Recent; see CHANGELOG.md).
- **Import `.pub`** (later milestone) using libmspub via LibreOffice → SVG,
  then mapped to ReflectDesign objects. Fancy WordArt may need touch-up.

## 4. Architecture

```
┌────────────────────────── Electron main process (Node) ──────────────────────────┐
│  menus · file dialogs · .rdx zip read/write · autosave · font discovery          │
│  (fc-list) · font file loading · Google Fonts download · template folders        │
└───────────────────────────────▲──────────────────────────────────────────────────┘
                                │ typed IPC (preload bridge)
┌───────────────────────────────┴──────── Renderer (TypeScript + React) ───────────┐
│  UI: ribbon, backstage, panes, dialogs                                           │
│  Core (framework-free, unit tested):                                             │
│    model/     document, pages, objects, stories, styles                          │
│    history/   undo/redo (command + snapshot patches)                             │
│    text/      HarfBuzz shaping → line breaking → frame flow → wrap exclusion    │
│    render/    one drawing API with two back ends: Canvas 2D (screen, PNG)        │
│               and PDF (pdf-lib) — screen and export share layout + paths         │
│    geometry/  transforms, hit testing, alpha-outline tracing for Tight wrap      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Key decisions:
- **Electron** (bundled Chromium) for identical rendering on Ubuntu, Windows
  and macOS. Tauri was considered but WebKitGTK on Linux has canvas and font
  quirks that matter for a WYSIWYG design tool.
- **Custom text engine** rather than browser text: linked frames, alpha-outline
  wrapping, Best Fit and exact PDF output are impossible with DOM text.
  HarfBuzz (WASM) shapes text and supplies glyph outlines; we draw outlines on
  canvas and write the same outlines to PDF, so output is identical.
- **Units:** document stores points (1/72 in). UI displays inches by default.
- **Packaging:** `.deb` and AppImage for Ubuntu via electron-builder; Windows
  `.exe` and macOS `.dmg` from the same config.

## 5. Milestones

Delivery is "full version", but test builds go out at each checkpoint for
feedback on anything that doesn't feel like Publisher.

| # | Milestone | Contents |
|---|---|---|
| M1 | Foundation | Project scaffold, document model, undo/redo, ribbon shell, page + scratch area, zoom, rulers, select/move/resize/rotate, arrange (forward/backward), save/open `.rdx` |
| M2 | Text engine core | HarfBuzz shaping, system fonts, rich text editing, paragraphs, alignment, line spacing, character spacing/kerning/scaling, columns, margins, vertical alignment |
| M3 | Text box power features | Linked boxes & overflow, Text Fit modes, drop caps, bullets/numbering, tabs, OpenType typography, styles, find/replace, spell check |
| M4 | Pictures & wrapping | Insert/crop/recolor/corrections, borders/effects, all wrap modes incl. alpha-traced Tight/Through + Edit Wrap Points |
| M5 | Shapes & WordArt effects | Shapes gallery, fills/lines, text outline/shadow/glow/reflection/gradient, text transform shapes, page borders |
| ✔ Checkpoint 1 | Test build #1 | `.deb` for Ubuntu — feedback round |
| M6 | Export & print | PDF (bleed/crop marks option), PNG (DPI, transparent, selection), JPEG, print with tiling |
| M7 | Templates & fonts | Backstage New screen, starter templates, Save As Template, Building Blocks, Google Fonts browser, font embedding |
| M8 | Polish | Master pages, guides/snap, Selection pane, autosave/recovery, shortcuts audit vs Publisher, right-click menus |
| ✔ Checkpoint 2 | Test build #2 | Feedback round |
| M9 | `.pub` import | libmspub-based import |
| 1.0 | Release | Installers for Ubuntu (plus Windows/macOS) |

## 6. Testing
- Unit tests (Vitest) for model, history, text layout, geometry.
- Golden-image tests: render sample documents to PNG and compare.
- PDF tests: export samples and rasterise to compare with screen render.
- Manual checklist comparing common tasks against Publisher 2016.
