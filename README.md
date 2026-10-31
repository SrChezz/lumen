# Lumen

**A quiet room for your PDFs.** Lumen is a small browser viewer for presenting a PDF like a slide deck: one page, fitted to the tab, with controls that step out of the way.

![A sample deck open in Lumen, with the floating controls at the bottom](docs/deck-dark.png)

## Why

Most PDF viewers are made for reading. Lumen is made for presenting. It shows one page fitted to the tab, keeps the controls in a small floating bar that hides when the mouse is idle, and gives you the keys a presenter expects: arrows, Space, a page number and Enter, and black or white screen.

"Full screen" in Lumen means filling the browser tab. It never uses the browser Fullscreen API and never takes over your monitor, so you can share just the tab in a video call and keep the rest of your screen for yourself.

## Features

- **Opening a PDF:** drop it anywhere on the tab, click the drop target, press <kbd>O</kbd>, or link to it with `?file=<url>`.
- **Sharp pages:** pages render at your screen's pixel density. When you resize, the page stays fitted right away and is re-rendered sharp a moment later.
- **Fast paging:** recent pages are cached, and the next and previous pages render ahead while the browser is idle.
- **Overview:** <kbd>G</kbd> shows a grid of every page; click one to jump to it.
- **Black or white screen:** <kbd>B</kbd> or <kbd>W</kbd> blanks the screen, like a projector remote does. Any key brings the page back.
- **Two themes:** *light table* and *dark room*. Lumen follows your system theme, and <kbd>T</kbd> switches it.
- **Remembers your place:** reopen a file and you're back on the page you left.
- **Touch support:** swipe to change pages; tap the center to show the controls.
- **Private:** your PDF is read in the browser and never uploaded anywhere.

| Empty state, light table | All pages |
| --- | --- |
| ![The empty state in the light theme with the "Drop a PDF" target](docs/empty-light.png) | ![The all pages overview showing six thumbnails](docs/overview-light.png) |

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| <kbd>→</kbd> <kbd>Space</kbd> <kbd>PgDn</kbd> | Next page |
| <kbd>←</kbd> <kbd>Shift</kbd>+<kbd>Space</kbd> <kbd>PgUp</kbd> | Previous page |
| <kbd>Home</kbd> / <kbd>End</kbd> | First or last page |
| a number, then <kbd>Enter</kbd> | Go to that page (`12` <kbd>Enter</kbd> → page 12) |
| <kbd>G</kbd> | All pages |
| <kbd>F</kbd> | Fit page or fit width |
| <kbd>B</kbd> or <kbd>.</kbd> | Black screen |
| <kbd>W</kbd> or <kbd>,</kbd> | White screen |
| <kbd>T</kbd> | Light table or dark room |
| <kbd>O</kbd> | Open another PDF |
| <kbd>?</kbd> | Show the shortcuts |

With the mouse, click the left 35% of a page to go back and anywhere else to go forward.

## Getting started

You need [Node.js](https://nodejs.org/) 22.12 or newer and [pnpm](https://pnpm.io/). This project uses pnpm only, so please don't use npm or yarn.

```sh
git clone https://github.com/SrChezz/lumen.git
cd lumen
pnpm install
pnpm dev
```

Then open <http://localhost:4321> and click **Open the sample deck**, or drop in your own PDF.

`pnpm dev` first runs `scripts/prepare-assets.mjs`, which copies pdf.js's font data (`cmaps`, `standard_fonts`) into `public/pdfjs/` and generates the sample deck at `public/sample.pdf` if it's missing. Astro 7 runs the dev server in the background: use `pnpm exec astro dev status` to check on it and `pnpm exec astro dev stop` to stop it.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Prepares the assets and serves the site at http://localhost:4321 |
| `pnpm build` | Builds the static site into `dist/` |
| `pnpm preview` | Serves the built `dist/` locally |
| `pnpm exec tsc --noEmit -p .` | Type checks the project |

### Opening a PDF from a URL

Add `?file=` to the address to open a PDF when the page loads:

```
http://localhost:4321/?file=/sample.pdf
```

The PDF has to be on the same origin, or on a server that sends CORS headers that allow it, because the browser fetches it directly.

## Deploying

`pnpm build` writes a fully static site to `dist/`, with no server code. You can host that folder on any static host, such as GitHub Pages, Netlify, Cloudflare Pages or Vercel.

## How it's built

- **[Astro](https://astro.build/)** builds a single static page.
- **[pdf.js](https://mozilla.github.io/pdf.js/)** (`pdfjs-dist`) renders the pages. Its worker loads as a separate asset.
- **[pdf-lib](https://pdf-lib.js.org/)** generates the sample deck when you build.
- Fonts are **Bricolage Grotesque** (display), **IBM Plex Sans** (interface) and **IBM Plex Mono** (numbers), served locally through Fontsource.

```
src/
  pages/index.astro     markup: empty state, stage, floating controls, dialogs
  styles/lumen.css      design tokens and both themes
  scripts/viewer.ts     all behavior: loading, rendering, cache, keys, touch
scripts/
  prepare-assets.mjs    copies pdf.js font data and builds the sample deck
public/
  sample.pdf            the sample deck
  favicon.svg
```

Each page renders to a canvas at `devicePixelRatio`. CSS (`max-width` and `max-height: 100%`) fits the canvas to the tab, so it fills the space instantly while the sharp re-render waits until you stop resizing. Up to eight rendered pages stay in a small LRU cache.

The design uses one accent color, `--lamp`, an amber like a projector lamp, and uses it sparingly: for focus rings, the progress bar, the current page in the overview and drop targets.

## Privacy

Lumen has no backend, analytics or tracking. A PDF you open is read in your browser. The only data Lumen stores is a few preferences in `localStorage` (theme, fit mode and the last page of each file). If storage is blocked, Lumen still works and just doesn't remember them.

## License

[MIT](LICENSE) © 2026 Cesar Atachao
