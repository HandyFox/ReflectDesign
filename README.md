# ReflectDesign

A friendly page-layout app for bulletin boards, posters and signs — built to
feel like **Microsoft Publisher 2016/2019** on Linux (Ubuntu), Windows and macOS.

> Status: in development. See [docs/PLAN.md](docs/PLAN.md) for the full
> feature plan and milestones.

## Highlights (planned)
- Publisher-style ribbon, page navigation pane and gray scratch area
- Every Publisher text box feature: linked boxes, Best Fit, columns, drop caps,
  character spacing, OpenType typography, WordArt-style effects
- Transparent PNGs with Tight text wrap that follows the picture's outline
- Bring Forward / Send Backward, group, align, distribute
- Any custom page size, from labels to banners
- PDF export for print shops, PNG export (any DPI, transparent background)
- Your system fonts plus a built-in Google Fonts browser
- Starter templates and Save As Template

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
