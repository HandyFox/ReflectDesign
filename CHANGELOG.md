# Changelog

What has changed in ReflectDesign, newest first. Each fix has a regression
test in `tests/fixes.test.ts` or `tests/commands.test.ts`, except where noted.

## 2026-11-23 — Two-sided greeting cards that fold once

### New features

- **Print a quarter-fold card in half, on both sides of the paper (File ›
  Print › Fold).** Cards like the Birthday Card are designed to fold in
  fourths, and still can be. The new choice is **In half — prints on both
  sides, fold once like a store-bought card**:
  - The outside (Back and Front) prints on one side of the sheet.
  - The inside (Inside Left and Inside Right) prints on the other side,
    lined up exactly behind it.
  - You fold the card once, and the inside is clean paper with no folds
    running through the writing.
- **More than one card per sheet (Per sheet).** Cards print as many copies
  per sheet as fit, or one if you choose. For example, a 4.25 × 5.5" card
  printed in half gives two cards on each Letter or A4 sheet. The folding
  steps say where to cut:
  - along the trim marks when there is room for them;
  - otherwise the size of each piece ("Cut the sheet in half, into two
    8.5" × 5.5" pieces").
- **The right two-sided setting, worked out for you.**
  - Print tells you whether to **flip on long edge** or **flip on short
    edge**. This depends on the fold and on which way the paper goes through
    the printer.
  - The print dialog now opens with that setting already chosen.
  - If a test print still comes out with the inside upside down, tick "turn
    it around".
- **Two-sided PDF too (File › Export).** Choose **Ready to print on both sides
  and fold in half**. The file is named "(two-sided, fold in half)".
- **The print preview shows the whole sheet.** It shows every copy, with
  each card's edge, its fold line (dashed), and both sides as they will
  print.

### Tests

- `tests/card.test.ts`: each copy on the sheet is folded in 3D. Every panel
  must land in the right place, the right way up, with the inside behind
  the right part of the outside. Cases covered:
  - side and top folds;
  - Letter and A4;
  - one per sheet and as many as fit;
  - small cards several across the sheet, which checks that the back side
    is mirrored correctly.

## 2026-11-23 — Print big designs on smaller paper

### New features

- **Choose the paper size when exporting a PDF (File › Export).** By
  default the PDF is still the design's own size. Pick any paper and choose
  either:
  - **Full size**: the design is split across as many sheets as it needs,
    to put together into one big print.
  - **Fit on one sheet**: each page is shrunk or enlarged to fit.
- **Common paper sizes, grouped by printer:**
  - **Home and office:** Letter (8.5 × 11"), Legal (8.5 × 14"), Half
    Letter (5.5 × 8.5"), A4 and A5.
  - **Large-format printers and print shops:** Tabloid / Ledger
    (11 × 17"), Arch B (12 × 18"), Super B / A3+ (13 × 19") and A3.
  - **Poster printers and plotters:** 18 × 24", 24 × 36", 36 × 48", A2, A1
    and A0.
  - **Custom size.**
- **Make it bigger (or smaller):** print at actual size, a percentage
  (quick 150%, 200%, 300% and 400% buttons), or a finished width or height.
  For example, a Letter design 4 feet wide, on Tabloid sheets.
- **Sheets that fit together perfectly.** Every sheet has:
  - **cut marks** at the corners showing exactly where to trim;
  - **line-up marks** (small triangles) showing where the next sheet's cut
    edge goes;
  - a **label** (A1, A2, B1…: row letter and column number) and "sheet 3 of
    8".
  The marks sit in a narrow band inside the printable area, so they always
  print. Neighbouring sheets **overlap** (½" by default, or ¼" or 1"), so
  small cutting errors don't leave gaps. Choose **None** to cut and butt the
  edges together instead.
- **Assembly guide page:** the first page shows the whole design with the
  seams and sheet labels marked, the finished size, the sheet count, and
  step-by-step instructions.
- **Fewest sheets automatically:** portrait or landscape paper is chosen to
  use the fewest sheets, or you can pick one.
- **Printer edge setting:** 0, ⅛", ¼" (most printers) or ½", for printers
  that can't print right to the edge.
- **Live preview** of where the sheets join, with their labels. The screen
  shows the finished size and sheet count, warns when enlarging would make
  pictures print below 150 dpi, and has a "How to put it together" list.
- **File › Print uses the same options.** It replaces the old tiling, which
  had no cut marks, labels or guide.

### Fixed

- Printing a design on paper of the same size (a Letter flyer on Letter
  paper) printed it across 2 sheets. It now prints on one sheet, as you'd
  expect.

### How it was checked

`tests/poster.test.ts` checks:
- that the sheets cover the whole design with as few sheets as possible;
- that "automatic" picks the orientation with fewer sheets;
- the size options (percentage, finished width, finished height);
- that **every neighbour's piece starts exactly at the line-up marks** (with
  overlap) or meets it edge to edge (without).

A command test exports a 24 × 36" poster on Tabloid and checks the page
count. Finally, the 24 × 18" Classroom Wall Calendar was exported on Letter
paper in the running app, and the 8 sheets were cut and laid together in
code exactly as the guide says. The result matched a straight export of the
design pixel for pixel (no noticeable differences), and every overlap strip
was identical to its neighbour's.

## 2026-11-21 (late evening) — Calendars

### New features

- **Calendars that draw themselves.** A calendar is a new kind of object.
  Change its month or year, or add a birthday, and it redraws at once,
  on screen and in print. Three layouts:
  - **Month**: the classic grid, with each date's birthdays and events written
    in its box. A crowded box uses smaller text, and only then says "+2 more".
  - **Year at a Glance**: 12 small months, with the days that have dates
    marked.
  - **List of Dates by Month**: 12 boxes listing each month's dates, for
    example a classroom **birthday board** that works every year.
- **Calendar dates (Calendar Tools › Calendar Dates, or double-click a
  calendar).** One list of birthdays, anniversaries, holidays, events and
  reminders for the whole publication. Every calendar in it shows them.
  - **Dates carry over from year to year.** Birthdays and other yearly dates
    are stored without a year, so they land on the right day in any year.
    Give a birth year to show "Sam (turns 9)" or "Mom & Dad (26 years)".
    29 February birthdays show on the 28th in other years.
  - **Holidays that move are worked out for each year**: "4th Thursday of
    November" (Thanksgiving), "last Monday of May" (Memorial Day), and dates
    based on Easter.
  - **Ready-made lists:** the 11 US federal holidays, popular US days
    (Valentine's Day, Easter, Mother's Day, Halloween…) and classroom days.
    Adding a list twice doesn't add anything twice.
  - **One-time events** (a field trip on 8 May 2027) appear only in their
    year.
- **Saving and loading dates (Save Dates / Load Dates)**, so next year's
  calendar starts with everyone's birthdays:
  - **ReflectDesign dates (.rdcal)**: everything, exactly. Best for year to
    year.
  - **Last year's calendar (.rdx)**: load the dates straight out of it.
  - **iCalendar (.ics)**: to and from Google Calendar, Outlook and Apple
    Calendar. Birthdays and holidays are saved as yearly repeating events.
    Events that repeat weekly, monthly or daily are skipped, with a note
    saying how many.
  - **Spreadsheet (.csv)**: to and from Excel, LibreOffice or Google Sheets.
    A simple two-column "Name, Birthday" sheet works. Dates can be written as
    3/14, 3/14/2015, 2015-03-14, March 14, 14 March, or "4th Thursday of
    November". Rows that can't be read are listed.
  - **Add or Replace**: loading adds only the dates that aren't already
    there, or replaces the whole list.
- **New calendar publications (File › New › Calendars)**, with a live
  preview. Pick the design, colours, first month and year, number of months
  (1–24, so school-year calendars from August work), whether weeks start on
  Sunday or Monday, and which dates to include: holiday lists, the open
  publication's dates, or dates loaded from a file. Five designs:
  - **Picture Wall Calendar**: a picture above each month, with a cover page.
  - **Monthly Planner**: big boxes to write in.
  - **Year at a Glance**
  - **Birthday Board**
  - **Classroom Wall Calendar**: 24 × 18" for the bulletin board.
- **Insert › Calendar**: This Month, Next Month, Year at a Glance, Birthdays
  by Month, or a whole new calendar publication.
- **Calendar Tools tab** (appears when a calendar is selected):
  - **Dates**: Calendar Dates, Add Holidays, Load Dates, Save Dates.
  - **Month**: previous and next month, pick a month and year, and **Change
    Year**, which moves every calendar in the publication together. It also
    updates page names like "January 2027" and the cover's year title.
  - **Layout**: Month, Year or List; week starts; day names (Sunday / Sun /
    S); where the date number sits; title on or off, or your own title text;
    dates on or off; which kinds of dates to show (for example only
    birthdays); and faded dates from the months before and after.
  - **Style**: six colour themes (Classic Blue, Bright Classroom, Modern
    Minimal, Garden, Sunset, and Black & White to save ink), plus colours for
    the day-names bar, title, numbers, lines, weekends, boxes and date text,
    line weight, and the title and text fonts.
- Calendars print and export to PDF exactly as they look, and their fonts
  are included in the PDF.

### How calendars were checked

`tests/calendar.test.ts` checks:
- the date maths against real dates (the 2027 federal holidays published by
  OPM, and Easter 2024–2027);
- that every layout keeps everything inside the calendar at several sizes;
- that the .rdcal, .ics and .csv formats all bring dates back exactly,
  including moving holidays, Easter-based dates, leap-day birthdays and birth
  years;
- that a Google Calendar export and a plain "Name, Birthday" spreadsheet
  import correctly;
- that dates can be loaded from a saved publication.

`tests/commands.test.ts` covers inserting calendars, editing dates, holiday
lists, saving the dates and loading them into "next year's" calendar, Change
Year (with undo), and the calendar settings. Every design was also created
in the running app, with dates loaded from a spreadsheet, and exported to PDF.

## 2026-11-21 (evening) — Greeting cards

### New features

- **Greeting card layouts.** A publication can now be a folded card, like
  Publisher's greeting cards. A card has four pages, named for you: **Front**,
  **Inside Left**, **Inside Right** and **Back** (or Inside Top / Inside
  Bottom for cards that open upward). Four layouts:
  - **Quarter-fold**: the whole card prints on *one side* of one sheet and is
    folded twice. Works with any printer.
  - **Half-fold**: the outside prints on one side of the sheet and the inside
    on the other, folded once. Needs two-sided printing ("flip on short
    edge"), or feeding the sheet through twice.
  - Each as a **side fold** (opens like a book) or a **top fold** (opens
    upward).
- **Standard card sizes:** quarter-fold 4.25 × 5.5" and 5.5 × 4.25";
  half-fold 5.5 × 8.5" and 8.5 × 5.5"; 5 × 7" and 4.5 × 6.25" (half-fold on
  Letter, trimmed to fit standard envelopes); and A6 quarter-fold, A5
  half-fold and A6 half-fold for A4 paper.
- **Where to find it:**
  - **File › New › Greeting Cards**: the two card templates and a blank card
    in each size.
  - **Page Design › Size › Greeting Cards**: turn the open publication into a
    card. Missing pages are added. Pages you named yourself keep their names.
    Picking an ordinary page size turns it back into a normal publication.
  - **Page Setup › Layout**: Full page or one of the four card folds, with
    any card size and Letter or A4 paper.
  - **Page Design › Orientation** on a card switches between side fold and
    top fold.
- **Printing cards (File › Print).** ReflectDesign lays the card out on the
  sheet so it reads correctly once folded: some panels print upside down
  on purpose. The preview shows the printed sheet (both sides for
  half-fold) with every panel labelled and the folds dashed. The screen also
  gives step-by-step folding instructions. Options: paper size, trim and fold
  marks (added automatically when the paper is bigger than the card), and
  turning the inside around for printers that flip the other way. Pages 5–8
  make a second card, and so on.
- **PDF for cards (File › Export).** Choose **Ready to print and fold** (the
  unfolded sheet, as above) or **Separate pages**.
- **Two card templates** (File › New › Greeting Cards):
  - **Birthday Card**: quarter-fold 4.25 × 5.5" with balloons, confetti, a
    "Make a wish!" inside page and a message.
  - **Thank You Card**: 5 × 7" half-fold with a picture frame over a printed
    heart-and-leaves design, a message and a signature.

### How the card layouts were checked

`tests/card.test.ts` folds the printed sheet in 3D, step by step as the
on-screen instructions say. It checks that the front ends up on top, facing
out and the right way up, that the back is outermost, and that the inside
pages face the reader in order, for all four folds. Deliberately breaking any
of the layouts makes the test fail. The app was also run, and real PDFs were
exported and checked page by page.

### Fixed

- Page Setup: the Margin Guides boxes no longer spill out of the dialog.

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
