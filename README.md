# Frontend Dev Utility

A Manifest V3 browser extension containing **89 frontend tools** in one popup and side panel. Everything runs locally — no backend, analytics, or remote code.

## Install (Chrome / Edge)

```bash
npm install
npm run build
```

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist` folder.
4. Click the toolbar icon to open the popup, or use the side-panel button.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘ + Shift + U` | Open the tool panel |
| `Ctrl/⌘ + Shift + S` | Capture a screenshot |
| `Ctrl/⌘ + Shift + C` | Open the color picker |
| `/` | Search tools |

Shortcuts can be remapped at `chrome://extensions/shortcuts`.

## UX overview

The extension opens on a **home dashboard** — there is no separate tool-list sidebar. It contains a search field, a personal **Pinned tools** row (up to 10), quick-start actions, recently used tools, favorites, and all **89 tool names shown directly**, grouped by category — click any name to open that tool immediately. Pin or favorite from the icons on any tool chip, and reorder pinned tools with the arrow buttons. Press `/` anywhere to focus dashboard search. Tools that need to click the inspected page (pickers, overlays, inspectors) are handed off to the browser's **side panel**, which opens straight into the selected tool — the popup would otherwise close when the page takes focus. All conversion, formatting, validation, and generator tools run directly in the popup.

## Tools

**Core (3):** Color Picker · Font Picker · Screenshot (viewport, element, full page)

**Design & Inspect (23):** Computed CSS · Selector Copier · Box Model · Grid/Flex Overlay · Element Ruler · Palette Extractor · Contrast Checker · CSS Generators · CSS Variables · CSS Minifier · CSS Formatter · Grid Template Builder · Flexbox Playground · Box Shadow Generator · Border Radius Generator · Clip Path Generator · Gradient Generator · Color Shades · Color Harmony · Animation Generator · Font Stack Generator · CSS Reset Snippets · CSS Comment Remover

**QA & Debugging (20):** Viewport Emulator · Image Inspector · A11y Audit · Heading Outline · Network Viewer · Console Capture · Storage Viewer · Performance · Link Checker · Color Blindness · HTML Validator · CSS Linter · Bracket Checker · Cron Parser · HTTP Status Codes · MIME Types · SEO Meta Analyzer · A11y Checklist · Meta Tag Generator · Media Query Builder

**Capture & Export (6):** Screenshot Editor · Element Snapshot · Screen Recorder · PDF Export · QR Code · CSS Export

**Productivity (21):** Live CSS Editor · Snippet Library · JSON Viewer · Regex Tester · Mock Data · Placeholder Image · Dark Mode Simulator · HTML Minifier · HTML Formatter · JSON to TypeScript · CSV to JSON · JSON to CSV · URL Parameter Editor · URL Encoder · Base64 Tool · Text Case Converter · Slug Generator · Lorem Ipsum · HTML Entities · Unicode Escaper · Text Diff

**Extras (16):** Breakpoint Viewer · Animation Inspector · Environment Switcher · UUID Generator · React Component · HTML Boilerplate · package.json Generator · Vite Config Generator · .gitignore Generator · Env Template · Tailwind Reference · Design Token Generator · SVG Placeholder · JSON Schema · CSS Color Names · Regex Cheatsheet

## Implementation notes

- **Page engine** (`src/content`): click-to-pick element inspection, overlays (box model, grid, ruler, headings, a11y), CSS injection, console/fetch/XHR instrumentation, and all page queries.
- **Service worker** (`src/background`): keyboard commands and screenshot downloads.
- **UI** (`src/app`, `src/components`, `src/tools`): React + TypeScript shell, shared UI kit, and one module per tool category.
- **Screenshot editor** (`src/annotate`): canvas-based arrows, boxes, ellipses, text, blur, highlights, undo/redo, and PNG export.
- Full-page capture scrolls and stitches frames; it does not require the `debugger` permission. Sticky elements may appear more than once.
- Viewport emulation opens a real browser window at the chosen size (an exact device override would require the `debugger` permission).
- Screen recording uses `getDisplayMedia`, so the browser asks which screen/tab to share. Output is WebM.
- PDF export uses the browser print dialog — choose "Save as PDF".

## Development

```bash
npm run dev     # watch build
npm run build   # type check + production build into dist/
```

After changing code, run `npm run build` and click **Reload** on the extension in `chrome://extensions`.

See `PLAN.md` for the original feature inventory, architecture, and roadmap.
