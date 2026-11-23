# ReflectDesign

A friendly page-layout app for bulletin boards, posters and signs — built to
feel like **Microsoft Publisher 2016/2019** on Linux (Ubuntu), Windows and macOS.

> Status: in development. See [docs/PLAN.md](docs/PLAN.md) for the full
> feature plan and milestones, and [CHANGELOG.md](CHANGELOG.md) for what has
> been fixed and added recently.

## Highlights (planned)
- Publisher-style ribbon, page navigation pane and gray scratch area
- Every Publisher text box feature: linked boxes, Best Fit, columns, drop caps,
  character spacing, OpenType typography, WordArt-style effects
- Transparent PNGs with Tight text wrap that follows the picture's outline
- Bring Forward / Send Backward, group, align, distribute
- Any custom page size, from labels to banners
- PDF export for print shops, PNG export (any DPI, transparent background)
- Your system fonts plus a built-in Google Fonts browser
- Starter templates, Save As Template and New Blank Template
- Greeting cards: quarter-fold and half-fold, side or top fold, standard card
  sizes, and printing laid out ready to fold
- Print or export big designs on smaller paper (Letter, Legal, Tabloid
  11 × 17", 12 × 18", 13 × 19", A4, A3 and poster sizes) at any size, with cut
  marks, line-up marks, sheet labels and an assembly guide
- Calendars: month, year-at-a-glance and birthday-board layouts, five
  calendar designs, and a list of birthdays, holidays and events that carries
  over to next year. Dates can be saved to and loaded from .rdcal, .ics
  (Google, Outlook, Apple Calendar) and .csv files.
- Recent files on the File › Open screen

## Install on Ubuntu

Every change is built automatically on GitHub. To install (or update to) the
latest build:

```bash
wget -O /tmp/reflectdesign.deb https://github.com/HandyFox/ReflectDesign/releases/download/latest/ReflectDesign-linux-amd64.deb && sudo apt install -y /tmp/reflectdesign.deb
```

Then open **ReflectDesign** from the app menu. An AppImage is also on the
[latest release](https://github.com/HandyFox/ReflectDesign/releases/tag/latest).

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev        # start the app with hot reload
npm test           # unit tests
npm run typecheck  # TypeScript checks
npm run dist:linux # build .deb and AppImage into release/
```

## License
Apache 2.0 — see [LICENSE](LICENSE).
