# Changelog

What has changed in ReflectDesign, newest first. Each fix has a regression
test in `tests/fixes.test.ts` or `tests/commands.test.ts`, except where noted.

## 2026-11-21 — Bug-fix round and two new features

### New features

- **Recent files (File › Open).** The Open screen now lists the publications
  you opened or saved most recently, newest first, with a preview, the folder
  and when you last used it. Click one to open it. Files that have been moved
  or deleted are left out automatically. Each entry can be removed with ✕, and
  **Clear Recent List** empties it. **Ctrl+O** now goes to this screen, like
  Publisher (use **Browse…** for the file picker). The list is kept in
  `recent-files.json` in the app's settings folder (up to 20 files).
- **New Blank Template (File › New › Personal).** Start a blank design as one
  of your own templates: pick a name, category, description and page size.
  The template is saved immediately, so it shows up under **New › Personal**.
  While you design it, the title bar says *(Template)*, and **Save (Ctrl+S)**
  updates that template. **Save As › Publication** turns it into a normal
  `.rdx` file instead. You can't accidentally reuse a template name you
  already have.

### Fixed — could lose or damage work

- **Pasting no longer undoes edits to the original text box.** Copy a text
  box, change its text, then paste: the original used to go back to the text
  it had when you copied it. Now only the pasted copy gets the copied text.
- **Pictures pasted into another publication keep their image.** Copying a
  picture, opening or starting another publication and pasting gave a blank
  picture that was dropped on save. The clipboard now carries the image too.
- **Duplicate Page keeps linked text boxes linked.** Copies of linked boxes
  used to each get the whole story, so the text appeared twice. Boxes linked
  to each other on the duplicated page now stay linked and continue the text.
- **Deleting a page in the middle of a linked chain keeps the chain flowing.**
  If text ran from page 1 → 2 → 3 and page 2 was deleted, page 3's box was cut
  off from the text. The boxes before and after are now joined, the same way
  deleting a single linked box works.
- **New, Open, Close and opening a recent file now ask before throwing away
  unsaved changes** (Save / Don't Save / Cancel). Before, they replaced the
  publication without asking.
- **Saving is safe and errors are shown.** Files are written to a temporary
  file and then renamed into place, so a crash or full disk mid-save can no
  longer leave a damaged `.rdx` (also for templates and exports). If saving
  fails, you now get a message instead of nothing happening.

### Fixed — print and PDF didn't match the screen

- **Multi-page PDFs: page 2 onwards no longer borrow page 1's gradients and
  shadows.** Every page's drawing ids are now unique. (Checked by exporting a
  real two-page PDF in Electron: page 1 red, page 2 blue, as designed.)
- **Dotted, dash and wave underlines now print as they look** instead of as
  solid lines.
- **No highlight behind a drop cap in PDFs**, matching the screen.

### Fixed — editing

- **Text wrap works for pictures grouped with the text box.** Objects in the
  same group, drawn in front of the box, were ignored.
- **Middle and Bottom vertical alignment work when other objects wrap the
  text.** Any wrapping object on the box used to snap the text to the top.
- **You can edit text inside a group.** Click the group to select it, then
  click into the text box (or double-click straight into it), as in Publisher.
- **Paste uses what you copied most recently.** After copying objects in
  ReflectDesign, copying text or a picture in another app and pressing Ctrl+V
  used to paste the old objects. Copying objects also puts their text on the
  system clipboard, so it can be pasted into other apps.
- **Ctrl+B / Ctrl+I / Ctrl+U toggle** when a whole text box is selected (they
  could only turn bold/italic/underline on).
- **Ctrl+Z / Ctrl+Y in ribbon boxes and dialogs** now undo the typing in that
  box instead of undoing a change to the publication.
- **Distribute leaves locked objects where they are**, like Align does.
- **Redo during a drag** finishes the drag first, like Undo does (no test).

### Fixed — app and security

- **Opened files can't run scripts during PDF export or printing.** Colours
  and other values from a file are checked and escaped before they go into
  the print page, and the print page blocks all scripts. A crafted `.rdx`
  could previously inject markup there.
- **Only one copy of the app runs.** Double-clicking a `.rdx` while
  ReflectDesign is open hands it to the open window (which asks about unsaved
  changes) instead of starting a second app (no test).
- **macOS: Cmd+Q and Cmd+C / V / X / A work** in text fields again (no test).
- **Picture memory leak fixed:** temporary picture URLs are released once the
  picture is loaded (no test).
- Opening a file that can't be read (from the file manager) shows a message
  instead of failing silently (no test).
