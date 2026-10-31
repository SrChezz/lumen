# Lumen — PDF presentation viewer

## Goal
A minimalist, simple, good-looking PDF viewer that runs in the browser, for presenting PDFs like slides.
Details matter: be careful with spacing, type, states and keyboard behavior.

## Hard requirements
- **"Full screen" means filling the browser tab only.** The page fills 100% of the tab's viewport.
  Never use the browser Fullscreen API (`requestFullscreen`), and never take over the whole monitor.
- Minimal chrome: only the current page, fitted to the tab. The controls float and hide when the mouse is idle.
- Stack: **Astro** (static, a single page). Package manager: **pnpm only, never npm**.

## Commands
- `pnpm install`
- `pnpm dev`: copies the pdf.js font data, builds `public/sample.pdf` if missing, and serves http://localhost:4321.
  Astro 7 runs the dev server in the background (`pnpm exec astro dev status` / `pnpm exec astro dev stop`).
- `pnpm build`: static output in `dist/`.
- `pnpm exec tsc --noEmit -p .`: type check.

## Layout
- `src/pages/index.astro`: markup (empty state, stage, floating controls, overview and shortcuts dialogs).
- `src/styles/lumen.css`: design tokens at the top. "Light table" (light) and "dark room" (dark) themes,
  plus a `data-theme` override that `T` toggles. Fonts: Bricolage Grotesque (display), IBM Plex Sans (UI), IBM Plex Mono (numbers).
  The one accent is `--lamp`, a projector-lamp amber, used sparingly.
- `src/scripts/viewer.ts`: all behavior. Uses pdfjs-dist 6 with the worker loaded through `?url`.
- `scripts/prepare-assets.mjs`: copies `cmaps`/`standard_fonts` into `public/pdfjs/` (gitignored) and generates the sample deck with pdf-lib.

## Behavior
- Open a PDF by dropping it anywhere, clicking the slide-mount drop target, pressing `O`, "Open the sample deck", or `?file=<url>`.
- Pages are rendered at devicePixelRatio and fitted with CSS (`max-width/max-height: 100%`), so a resize stays fitted while
  the crisp re-render is debounced. Rendered pages go in a small LRU cache, and the neighboring pages are prerendered when the browser is idle.
- Keys: ←/→, Space/Shift+Space, PgUp/PgDn, Home/End, a number then Enter to jump, `G` all pages, `F` fit page or fit width,
  `B`/`.` black screen, `W`/`,` white screen (any key returns), `T` theme, `?` shortcuts.
- Clicking the left 35% of the page goes back and anywhere else goes forward. On touch you can swipe, and tapping the center shows the controls.
- The last page you viewed is remembered for each file in localStorage. Storage is optional and wrapped in try/catch.
- Errors are shown inline on the empty screen, or as a toast over an open deck. Never use `alert()`.
