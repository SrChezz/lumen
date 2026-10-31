import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Browsers refuse canvases much bigger than this (Safari is the strictest).
const MAX_CANVAS_AREA = 16_000_000;
const CACHE_SIZE = 8;
const HUD_IDLE_MS = 2200;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $("app");
const stage = $("stage");
const mount = $("mount");
const errorLine = $("error");
const fileInput = $<HTMLInputElement>("file");
const hud = $("hud");
const prevBtn = $<HTMLButtonElement>("prev");
const nextBtn = $<HTMLButtonElement>("next");
const fitBtn = $<HTMLButtonElement>("fit");
const countNow = $("count-now");
const countAll = $("count-all");
const progress = $("progress");
const jumpChip = $("jump");
const toastChip = $("toast");
const blank = $("blank");
const veil = $("veil");
const overview = $<HTMLDialogElement>("overview");
const overviewMeta = $("overview-meta");
const thumbs = $("thumbs");
const help = $<HTMLDialogElement>("help");

let doc: PDFDocumentProxy | null = null;
let docTask: pdfjs.PDFDocumentLoadingTask | null = null;
let docName = "";
let docKey = "";
let current = 1;
let fit: "page" | "width" = read("lumen:fit") === "width" ? "width" : "page";
let generation = 0;
let showToken = 0;
let digits = "";
const cache = new Map<string, Promise<HTMLCanvasElement>>();

// ---------- storage (optional; the viewer works without it) ----------
function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

// ---------- opening ----------
type Source = { data: ArrayBuffer } | { url: string };

async function open(source: Source, name: string, key: string) {
  hideError();
  app.classList.add("loading");
  setProgress(0.08);
  try {
    const task = pdfjs.getDocument({
      ...source,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
    });
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total) setProgress(Math.max(0.08, loaded / total));
    };
    const next = await task.promise;
    const previous = docTask;
    docTask = task;
    doc = next;
    docName = name;
    docKey = key;
    invalidate();
    thumbs.replaceChildren();
    previous?.destroy();

    const saved = Number(read(`lumen:page:${key}`));
    current = saved >= 1 && saved <= next.numPages ? saved : 1;
    countAll.textContent = String(next.numPages);
    app.dataset.state = "viewing";
    await show(current);
    if (current > 1) toast(`Back on page ${current} of ${next.numPages}`);
    wake();
  } catch (err) {
    const message = describe(err, name);
    if (doc) toast(message); else showError(message);
  } finally {
    app.classList.remove("loading");
    syncChrome();
  }
}

function openFile(file: File | undefined) {
  if (!file) return;
  const looksLikePdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksLikePdf) {
    const message = `Lumen opens PDF files, and “${file.name}” isn't one.`;
    return doc ? toast(message) : showError(message);
  }
  file.arrayBuffer().then((data) =>
    open({ data }, file.name, `${file.name}:${file.size}:${file.lastModified}`));
}

function openUrl(url: string) {
  const name = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "document.pdf");
  open({ url }, name, `url:${url}`);
}

function describe(err: unknown, name: string) {
  const e = err as { name?: string };
  if (e?.name === "PasswordException") return `“${name}” is password-protected. Remove the password and open it again.`;
  if (e?.name === "MissingPDFException" || e?.name === "ResponseException") return `Lumen couldn't find “${name}”. Check the address and try again.`;
  return `“${name}” couldn't be read as a PDF. Try exporting it again.`;
}

function showError(message: string) {
  errorLine.textContent = message;
  errorLine.hidden = false;
}
function hideError() {
  errorLine.hidden = true;
}

// ---------- rendering ----------
function invalidate() {
  generation++;
  cache.clear();
}

function scaleFor(page: PDFPageProxy) {
  const base = page.getViewport({ scale: 1 });
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const cssScale = fit === "page" ? Math.min(w / base.width, h / base.height) : w / base.width;
  let scale = cssScale * (window.devicePixelRatio || 1);
  const area = base.width * base.height * scale * scale;
  if (area > MAX_CANVAS_AREA) scale *= Math.sqrt(MAX_CANVAS_AREA / area);
  return scale;
}

function render(n: number): Promise<HTMLCanvasElement> {
  const key = `${generation}:${n}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const d = doc!;
  const job = (async () => {
    const page = await d.getPage(n);
    const viewport = page.getViewport({ scale: scaleFor(page) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Page ${n} of ${d.numPages}`);
    await page.render({ canvas, viewport }).promise;
    return canvas;
  })();
  job.catch(() => cache.delete(key));
  cache.set(key, job);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return job;
}

async function show(n: number) {
  if (!doc) return;
  current = Math.min(Math.max(1, n), doc.numPages);
  syncChrome();
  write(`lumen:page:${docKey}`, String(current));
  const token = ++showToken;
  try {
    const canvas = await render(current);
    if (token !== showToken) return;
    stage.replaceChildren(canvas);
    if (fit === "width") stage.scrollTop = 0;
    idle(() => {
      if (!doc || token !== showToken) return;
      if (current < doc.numPages) render(current + 1);
      if (current > 1) render(current - 1);
    });
  } catch {
    if (token === showToken) toast(`Page ${current} couldn't be drawn.`);
  }
}

function go(n: number) {
  if (!doc) return;
  const target = Math.min(Math.max(1, n), doc.numPages);
  if (target !== current) show(target);
}

function idle(fn: () => void) {
  if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 600 });
  else setTimeout(fn, 120);
}

function syncChrome() {
  const total = doc?.numPages ?? 1;
  countNow.textContent = String(current);
  prevBtn.disabled = current <= 1;
  nextBtn.disabled = current >= total;
  if (!app.classList.contains("loading")) setProgress(doc ? current / total : 0);
  document.title = doc ? `${docName} · ${current}/${total}` : "Lumen";
  app.dataset.fit = fit;
  const fitLabel = fit === "page" ? "Fit width" : "Fit page";
  fitBtn.setAttribute("aria-label", fitLabel);
  fitBtn.title = `${fitLabel} (F)`;
}

function setProgress(p: number) {
  progress.style.setProperty("--p", `${(p * 100).toFixed(2)}%`);
}

// ---------- chrome: controls wake on mouse, sleep when idle ----------
let hudTimer = 0;
function wake() {
  app.classList.add("awake");
  clearTimeout(hudTimer);
  hudTimer = window.setTimeout(sleep, HUD_IDLE_MS);
}
function sleep() {
  if (hud.matches(":hover") || hud.contains(document.activeElement)) return wake();
  app.classList.remove("awake");
}

let toastTimer = 0;
function toast(message: string) {
  toastChip.textContent = message;
  toastChip.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastChip.hidden = true), 2600);
}

let jumpTimer = 0;
function setDigits(value: string) {
  digits = value;
  clearTimeout(jumpTimer);
  if (!digits) return void (jumpChip.hidden = true);
  const n = Number(digits);
  const ok = doc && n >= 1 && n <= doc.numPages;
  jumpChip.innerHTML = ok
    ? `Go to page <b>${n}</b> · Enter`
    : `No page <b>${n}</b> · ${doc?.numPages} pages`;
  jumpChip.hidden = false;
  jumpTimer = window.setTimeout(() => setDigits(""), 2500);
}

function setBlank(tone: "black" | "white" | null) {
  blank.hidden = !tone;
  if (tone) blank.dataset.tone = tone;
}

function toggleFit() {
  fit = fit === "page" ? "width" : "page";
  write("lumen:fit", fit);
  syncChrome();
  invalidate();
  show(current);
}

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  write("lumen:theme", root.dataset.theme);
}

// ---------- overview ----------
let thumbObserver: IntersectionObserver | null = null;

async function openOverview() {
  if (!doc || overview.open) return;
  const d = doc;
  overviewMeta.textContent = `${docName} · ${d.numPages} ${d.numPages === 1 ? "page" : "pages"}`;
  if (!thumbs.childElementCount) {
    const first = (await d.getPage(1)).getViewport({ scale: 1 });
    thumbObserver?.disconnect();
    thumbObserver = new IntersectionObserver(onThumbVisible, { root: thumbs, rootMargin: "200px" });
    const items = Array.from({ length: d.numPages }, (_, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb";
      btn.dataset.page = String(i + 1);
      btn.setAttribute("aria-label", `Page ${i + 1}`);
      btn.innerHTML = `<span class="frame"></span><span class="n">${String(i + 1).padStart(2, "0")}</span>`;
      btn.querySelector<HTMLElement>(".frame")!.style.setProperty("--ar", `${first.width} / ${first.height}`);
      li.append(btn);
      thumbObserver!.observe(btn);
      return li;
    });
    thumbs.replaceChildren(...items);
  }
  thumbs.querySelectorAll(".thumb").forEach((b) => b.removeAttribute("aria-current"));
  const active = thumbs.querySelector<HTMLElement>(`[data-page="${current}"]`);
  active?.setAttribute("aria-current", "page");
  overview.showModal();
  active?.focus();
  active?.scrollIntoView({ block: "center" });
}

function onThumbVisible(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    if (!entry.isIntersecting || !doc) continue;
    const btn = entry.target as HTMLElement;
    thumbObserver?.unobserve(btn);
    const d = doc;
    const frame = btn.querySelector<HTMLElement>(".frame")!;
    d.getPage(Number(btn.dataset.page)).then(async (page) => {
      const base = page.getViewport({ scale: 1 });
      const width = frame.clientWidth * (window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      if (d === doc) frame.replaceChildren(canvas);
    }).catch(() => {});
  }
}

thumbs.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".thumb");
  if (!btn) return;
  overview.close();
  go(Number(btn.dataset.page));
});

thumbs.addEventListener("keydown", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".thumb");
  if (!btn) return;
  const all = [...thumbs.querySelectorAll<HTMLElement>(".thumb")];
  const i = all.indexOf(btn);
  const top = all[0].offsetTop;
  const firstRowEnd = all.findIndex((b) => b.offsetTop !== top);
  const cols = firstRowEnd === -1 ? all.length : firstRowEnd;
  const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
  if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    all[e.key === "Home" ? 0 : all.length - 1].focus();
  } else if (step[e.key]) {
    e.preventDefault();
    all[Math.min(Math.max(0, i + step[e.key]), all.length - 1)].focus();
  }
});

for (const dialog of [overview, help]) {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || (e.target as HTMLElement).closest("[data-close]")) dialog.close();
  });
}
overview.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); overview.close(); }
});
help.addEventListener("keydown", (e) => {
  if (e.key === "?") { e.preventDefault(); help.close(); }
});

// ---------- input ----------
mount.addEventListener("click", () => fileInput.click());
$("sample").addEventListener("click", () => openUrl("/sample.pdf"));
fileInput.addEventListener("change", () => {
  openFile(fileInput.files?.[0]);
  fileInput.value = "";
});
prevBtn.addEventListener("click", () => go(current - 1));
nextBtn.addEventListener("click", () => go(current + 1));
fitBtn.addEventListener("click", toggleFit);
$("grid").addEventListener("click", openOverview);
$("theme").addEventListener("click", toggleTheme);
$("open").addEventListener("click", () => fileInput.click());
$("help-btn").addEventListener("click", () => help.showModal());
hud.addEventListener("click", (e) => e.stopPropagation());

document.addEventListener("keydown", (e) => {
  if (overview.open || help.open) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (!blank.hidden) {
    e.preventDefault();
    return setBlank(null);
  }

  const key = e.key;
  if (key === "?") return void (e.preventDefault(), help.showModal());
  if (key === "o" || key === "O") return void (e.preventDefault(), fileInput.click());
  if (key === "t" || key === "T") return void (e.preventDefault(), toggleTheme());
  if (!doc) return;

  if (/^[0-9]$/.test(key)) {
    e.preventDefault();
    return setDigits((digits + key).slice(-4));
  }
  if (key === "Enter" && digits) {
    e.preventDefault();
    const n = Number(digits);
    setDigits("");
    if (n >= 1 && n <= doc.numPages) go(n);
    return;
  }
  if (key === "Escape" && digits) return setDigits("");
  if (key === "Backspace" && digits) {
    e.preventDefault();
    return setDigits(digits.slice(0, -1));
  }

  // In fit-width mode, ↑/↓ scroll the page like a document.
  const scrolling = fit === "width" && (key === "ArrowDown" || key === "ArrowUp");
  const actions: Record<string, () => void> = {
    ArrowRight: () => go(current + 1),
    ArrowDown: () => go(current + 1),
    PageDown: () => go(current + 1),
    Enter: () => go(current + 1),
    " ": () => go(current + (e.shiftKey ? -1 : 1)),
    ArrowLeft: () => go(current - 1),
    ArrowUp: () => go(current - 1),
    PageUp: () => go(current - 1),
    Backspace: () => go(current - 1),
    Home: () => go(1),
    End: () => go(doc!.numPages),
    g: openOverview, G: openOverview,
    f: toggleFit, F: toggleFit,
    b: () => setBlank("black"), B: () => setBlank("black"), ".": () => setBlank("black"),
    w: () => setBlank("white"), W: () => setBlank("white"), ",": () => setBlank("white"),
  };
  const action = actions[key];
  if (!action || scrolling) return;
  if ((e.target as HTMLElement).closest?.("button") && (key === " " || key === "Enter")) return;
  e.preventDefault();
  action();
});

blank.addEventListener("click", () => setBlank(null));

// Click the left third to go back, the rest to go forward. On touch, the middle shows the controls.
stage.addEventListener("click", (e) => {
  if (!doc) return;
  const x = e.clientX / window.innerWidth;
  const touch = (e as PointerEvent).pointerType === "touch";
  if (touch && x > 0.3 && x < 0.7) return app.classList.contains("awake") ? sleep() : wake();
  if (fit === "width" && !touch) return;
  go(current + (x < (touch ? 0.3 : 0.35) ? -1 : 1));
});

let touchStart: { x: number; y: number } | null = null;
stage.addEventListener("touchstart", (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
stage.addEventListener("touchend", (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    e.preventDefault();
    go(current + (dx < 0 ? 1 : -1));
  }
});

document.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse" && app.dataset.state === "viewing") wake();
});
document.addEventListener("mouseleave", () => app.classList.remove("awake"));

// Drag and drop works anywhere, on the empty screen or over an open deck.
let dragDepth = 0;
const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
document.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (dragDepth++ === 0) {
    if (doc) veil.hidden = false; else mount.classList.add("over");
  }
});
document.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = "copy";
});
document.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) endDrag();
});
document.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  endDrag();
  openFile(e.dataTransfer!.files[0]);
});
function endDrag() {
  dragDepth = 0;
  veil.hidden = true;
  mount.classList.remove("over");
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!doc) return;
    invalidate();
    show(current);
  }, 150);
});

// ---------- start ----------
syncChrome();
const fromQuery = new URLSearchParams(location.search).get("file");
if (fromQuery) openUrl(fromQuery);
