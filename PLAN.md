# Frontend Dev Utility — Browser Extension Plan

## 1. Goal

A single browser extension that puts the everyday tools a frontend developer needs into one place: inspect, measure, pick, capture, and export — without leaving the page.

Your three starting features:

1. **Font Picker** — inspect and preview fonts used on the page
2. **Color Picker** — eyedropper + format conversion + copy
3. **Screenshot Capture** — viewport / full page / element

**Answer to "how many other things can we add?":** 37 concrete additional ideas are listed below, for **40 features total**. Realistically, ship ~12 in v1 and treat the rest as a roadmap.

---

## 2. Assumptions

- Target **Chrome / Edge first** (Manifest V3), Firefox/Chrome-port later via webextension-polyfill.
- Distribution: Chrome Web Store (unlisted/private initially), plus local unpacked load for development.
- UI language: English. Theme: dark, compact, DevTools-like.
- Free, no backend. All processing happens locally in the browser.

---

## 3. Recommended Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Build | Vite + TypeScript | Fast HMR, content/popup/service-worker builds |
| UI | React + Tailwind CSS | Component reuse across popup & side panel |
| Icons | Lucide React | Consistent, lightweight icon set |
| State | Zustand + `chrome.storage` | Sync settings across popup/side panel/background |
| Styling engine | Plain CSS + CSS variables | Easy theming and token extraction |
| Testing | Vitest + Playwright | Unit tests + real-extension E2E |
| Packaging | `vite-plugin-web-extension` or manual Vite multi-entry | Manifest V3 output |

### Extension surfaces

- **Popup** (click toolbar icon): quick access to picker, screenshot, recent colors/fonts.
- **Side panel** (Chrome `sidePanel` API): persistent toolbox for longer sessions (inspector, palette, snippets).
- **Content script**: element inspection, overlays, rulers, style injection.
- **Service worker**: messaging hub, screenshot orchestration, storage, shortcuts.
- **Options page**: settings, keyboard shortcuts, theme, enabled tools.

### Permissions (minimal, request more later)

```json
{
  "permissions": ["activeTab", "scripting", "storage", "sidePanel", "commands"],
  "host_permissions": ["<all_urls>"]
}
```

`debugger` is only needed for true full-page / clipped element screenshots — request it behind an explicit opt-in with a clear explanation, or implement scroll-and-stitch without it.

---

## 4. Feature Inventory (40 total)

### Phase 1 — MVP (your 3)

| # | Feature | Scope for v1 |
| --- | --- | --- |
| 1 | **Color Picker** | EyeDropper API, HEX/RGB/HSL/HSLA inputs, copy to clipboard, recent colors, sample palette from page |
| 2 | **Font Picker** | Click element → show computed `font-family`, size, weight, line-height; live preview of system/Google fonts; copy CSS declaration |
| 3 | **Screenshot Capture** | Viewport capture, selected-element capture, copy/download PNG; full-page in v1.1 |

### Phase 2 — Inspect & Design (9)

| # | Feature | Description |
| --- | --- | --- |
| 4 | Computed CSS inspector | Show all computed styles of the clicked element, searchable |
| 5 | Selector copier | Copy CSS selector, XPath, or Tailwind-style class path |
| 6 | Box model overlay | Visualize margin / border / padding / content with colored regions |
| 7 | Grid & Flexbox overlay | Highlight grid tracks, gaps, flex directions, alignment |
| 8 | Element ruler | Measure pixel distance between two clicked elements |
| 9 | Color palette extractor | Pull dominant colors from the page into a shareable palette |
| 10 | WCAG contrast checker | Foreground/background contrast ratio with AA/AAA pass/fail |
| 12 | CSS generators | Gradient, box-shadow, border-radius, and clip-path builders |
| 13 | CSS variables / design tokens | List all custom properties on `:root` and where they're used |

### Phase 3 — QA & Debugging (10)

| # | Feature | Description |
| --- | --- | --- |
| 14 | Responsive viewport emulator | Resize to preset devices or custom width/height |
| 15 | Image inspector | Dimensions, file size, `srcset`, alt text, lazy-loading state |
| 16 | Accessibility quick audit | Missing alt text, labels, low contrast, small tap targets |
| 17 | Heading outline | H1–H6 structure tree with jump-to-element |
| 18 | Network request viewer | Lightweight list of XHR/fetch requests, status, timing, response preview |
| 19 | Console log capture | Capture `console.*` calls and uncaught errors into a panel |
| 20 | Storage & cookie viewer | View/edit `localStorage`, `sessionStorage`, cookies, IndexedDB names |
| 21 | Performance quick stats | Load time, DOM nodes, FCP/LCP where available |
| 22 | Link & resource checker | Flag broken images, empty links, 404 resources |
| 23 | Color blindness simulator | Protanopia/deuteranopia/tritanopia preview filter |

### Phase 4 — Capture & Export (6)

| # | Feature | Description |
| --- | --- | --- |
| 24 | Annotated screenshots | Draw arrows, boxes, text, blur before saving |
| 25 | Element snapshot | Copy element HTML + its computed CSS as one snippet |
| 26 | Screen / GIF recorder | Record tab as WebM or short GIF |
| 27 | PDF export | Save page or selected area as PDF via print/stylesheet |
| 28 | QR code generator | Generate QR for the current URL and copy/download |
| 29 | Live CSS export | Export current font/color/spacing choices as CSS, SCSS, or Tailwind config |

### Phase 5 — Dev Productivity (7)

| # | Feature | Description |
| --- | --- | --- |
| 30 | Live CSS editor | Inject and edit CSS on the fly with reset-on-reload option |
| 31 | Snippet library | Save/reuse HTML, CSS, JS snippets in local storage |
| 32 | JSON formatter/viewer | Paste or capture API JSON, tree view, copy formatted |
| 33 | Regex tester | Live regex with flags, match highlights, JS/CSS-aware presets |
| 35 | Lorem / mock data generator | Lorem text, names, emails, addresses, arrays of fake users |
| 36 | Placeholder image generator | Custom size/color/text placeholder, copy URL or download |
| 37 | Dark mode simulator | Force/invert colors to preview a dark theme |

### Phase 6 — Nice-to-Have (3)

| # | Feature | Description |
| --- | --- | --- |
| 38 | Breakpoint viewer | Show active media queries and current breakpoint |
| 39 | Animation inspector | List CSS animations/transitions; slow-motion toggle |
| 40 | Environment switcher | Quick swap between localhost / staging / production URL prefixes |

---

## 5. Prioritization Rule

Score each idea 1–5 on: **frequency of use**, **implementation cost**, **differentiation**.

- Build first: high frequency + low cost (color picker, computed CSS inspector, JSON viewer).
- Build later: high cost + low frequency (screen recorder, PDF export).
- Skip unless requested: features Chrome DevTools already does better (full protocol debugger, CPU profiler).

**Proposed v1 (12 features):** #1–10, #12, #30. Everything else follows in monthly releases.

---

## 6. Architecture Sketch

```
extension/
├── manifest.json
├── src/
│   ├── background/        # service worker, shortcuts, screenshot orchestration
│   ├── content/           # element picker, overlays, injection
│   ├── popup/             # React app, quick tools
│   ├── sidepanel/         # React app, persistent toolbox
│   ├── options/           # settings page
│   ├── shared/            # types, messaging, theme, storage hooks
│   └── lib/               # color math, CSS parsing, screenshot helpers
└── tests/
```

### Messaging contract

```ts
type Message =
  | { type: 'PICK_ELEMENT'; mode: 'font' | 'css' | 'measure' }
  | { type: 'CAPTURE'; target: 'viewport' | 'fullpage' | 'element' }
  | { type: 'INJECT_CSS'; css: string; id: string }
  | { type: 'GET_COMPUTED_STYLE'; selector: string }
  | { type: 'GET_PAGE_COLORS' };
```

Use `chrome.runtime.sendMessage` → service worker → `chrome.tabs.sendMessage` → content script. Keep payloads small; never pass DOM nodes.

---

## 7. Key Technical Notes / Risks

- **Eyedropper**: `EyeDropper` API works in extension pages (Chrome 95+) but cannot sample a web page from the content script due to canvas tainting. Use the native EyeDropper in the popup, or ask the user to click a pixel in "page pick" mode with CDP support.
- **Full-page screenshot**: `captureVisibleTab` only sees the viewport. Use `chrome.debugger` + `Page.captureScreenshot({ captureBeyondViewport: true })` behind opt-in, or scroll-and-stitch manually. Element clipping uses `getBoundingClientRect()` + devicePixelRatio.
- **Cross-origin iframes**: content scripts need `all_frames: true`; some pages (chrome://, Web Store) are restricted — show a friendly unavailable state.
- **Permissions trust**: only request `debugger`, `cookies`, or `webRequest` when the user enables the feature that needs them.
- **Performance**: overlays/rulers must be CSS-only where possible; avoid layout thrash by batching `getBoundingClientRect()` reads.
- **Privacy**: no analytics, no remote code, all data local. State this clearly in the store listing.

---

## 8. Milestones

| Milestone | Deliverable |
| --- | --- |
| M0 — Scaffold (week 1) | Manifest V3 shell, popup, side panel, messaging, theme, settings |
| M1 — Core trio (weeks 2–3) | Color picker, font picker, viewport/element screenshots |
| M2 — Inspector (weeks 4–5) | Computed CSS, selector copy, box model, grid overlay, contrast checker |
| M3 — QA tools (weeks 6–7) | Viewport emulator, image inspector, a11y audit, palette extractor, live CSS editor |
| M4 — Export & extras (week 8+) | Annotations, element snapshot, PDF, snippets, remaining phases |
| M5 — Polish | Shortcuts, i18n-ready strings, docs, store assets, publishing |

---

## 9. Definition of Done (per feature)

- Works on Chrome + Edge, unpacked and packaged
- Keyboard accessible, visible focus states
- Settings persisted via `chrome.storage.sync`
- Error/empty states handled (restricted page, no selection, clipboard denied)
- Unit test for pure logic + manual E2E checklist
- Screenshot/GIF in docs for the store listing

---

## 10. Next Steps

1. Confirm browser targets and whether v1 should stay at 3 features or include Phase 2.
2. Scaffold the Vite + React + TS extension and load it unpacked.
3. Implement the shared messaging layer and element-picker overlay first — most features reuse it.
4. Build Color Picker → Font Picker → Screenshot, then run the E2E checklist.
