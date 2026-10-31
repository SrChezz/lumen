// Copies pdf.js font data into public/ and builds the sample deck on first run.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const pdfjsDir = dirname(require.resolve("pdfjs-dist/package.json"));

for (const dir of ["standard_fonts", "cmaps"]) {
  const to = join(root, "public", "pdfjs", dir);
  if (!existsSync(to)) cpSync(join(pdfjsDir, dir), to, { recursive: true });
}

const samplePath = join(root, "public", "sample.pdf");
if (!existsSync(samplePath)) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle("Lumen sample deck");
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const W = 960, H = 540;
  const paper = rgb(0.972, 0.968, 0.956);
  const ink = rgb(0.09, 0.094, 0.105);
  const muted = rgb(0.42, 0.43, 0.46);
  const lamp = rgb(0.85, 0.6, 0.22);

  const slides = [
    { kicker: "Sample deck", title: "Lumen", body: ["A quiet room for your PDFs.", "Drop any file on the tab to replace this deck."] },
    { kicker: "Move", title: "One page at a time", keys: [["→  Space", "next page"], ["←  Shift Space", "previous page"], ["Home  End", "first and last page"]] },
    { kicker: "Jump", title: "Type a number, press Enter", keys: [["4  Enter", "go to page 4"], ["G", "see every page at once"]] },
    { kicker: "Pause", title: "Black out the screen", body: ["Press B for black or W for white, the way a projector", "remote does. Any key brings the page back."] },
    { kicker: "Frame", title: "Fit the page or the width", keys: [["F", "switch between fit page and fit width"], ["T", "light table or dark room"]] },
    { kicker: "Yours", title: "Open your own", body: ["Drag a PDF onto this tab, or press O.", "Lumen remembers the last page you were on."] },
  ];

  slides.forEach((s, i) => {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: paper });
    page.drawRectangle({ x: 72, y: H - 96, width: 28, height: 3, color: lamp });
    page.drawText(s.kicker.toUpperCase(), { x: 112, y: H - 100, size: 13, font: bold, color: muted });
    page.drawText(s.title, { x: 72, y: H - 210, size: i === 0 ? 96 : 54, font: bold, color: ink });
    let y = H - (i === 0 ? 290 : 280);
    for (const line of s.body ?? []) {
      page.drawText(line, { x: 72, y, size: 24, font: sans, color: ink });
      y -= 38;
    }
    for (const [k, v] of s.keys ?? []) {
      // Each key is a small keycap; the standard fonts can't encode arrows, so those are drawn.
      let x = 72;
      for (const cap of k.split(/\s{2,}/)) {
        const arrow = cap === "→" || cap === "←";
        const w = arrow ? 40 : mono.widthOfTextAtSize(cap, 18) + 22;
        page.drawRectangle({ x, y: y - 9, width: w, height: 32, borderColor: rgb(0.78, 0.79, 0.81), borderWidth: 1.2, color: rgb(1, 1, 1) });
        if (arrow) {
          const d = cap === "→" ? "M 0 0 L 16 0 M 10 -6 L 16 0 L 10 6" : "M 16 0 L 0 0 M 6 -6 L 0 0 L 6 6";
          page.drawSvgPath(d, { x: x + 12, y: y + 7, borderColor: ink, borderWidth: 1.8 });
        } else {
          page.drawText(cap, { x: x + 11, y, size: 18, font: mono, color: ink });
        }
        x += w + 10;
      }
      page.drawText(v, { x: 300, y: y + 1, size: 22, font: sans, color: muted });
      y -= 52;
    }
    page.drawText(`${String(i + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`,
      { x: W - 140, y: 48, size: 13, font: mono, color: muted });
  });

  mkdirSync(dirname(samplePath), { recursive: true });
  writeFileSync(samplePath, await doc.save());
}
