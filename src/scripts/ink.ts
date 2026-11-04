// Ink: a transparent canvas laid over the page for pen and highlighter marks.
// Points are stored as fractions of the page (0–1), so marks stay put when the
// page is resized or switched between fit page and fit width.

export type Tool = "pen" | "marker";
type Stroke = { t: Tool; c: string; p: number[] }; // p = [x0, y0, x1, y1, ...]

export const COLORS = [
  { name: "Red", value: "#e5484d" },
  { name: "Amber", value: "#f0a020" },
  { name: "Blue", value: "#2f7ff0" },
  { name: "Green", value: "#2fa36b" },
  { name: "Black", value: "#16171a" },
] as const;

// Line widths as a fraction of the page diagonal.
const WIDTH: Record<Tool, number> = { pen: 0.0024, marker: 0.016 };
const MARKER_ALPHA = 0.38;
const MAX_CANVAS_AREA = 16_000_000;

const round = (n: number) => Math.round(n * 10_000) / 10_000;

export class Ink {
  readonly canvas = document.createElement("canvas");
  tool: Tool = "pen";
  color = 0;
  private pages = new Map<number, Stroke[]>();
  private page = 0;
  private storageKey = "";
  private live: Stroke | null = null;
  private pointer = -1;
  private frame = 0;
  private resizer = new ResizeObserver(() => this.fit());

  constructor() {
    const c = this.canvas;
    c.className = "ink";
    c.setAttribute("aria-hidden", "true");
    c.addEventListener("pointerdown", (e) => this.down(e));
    c.addEventListener("pointermove", (e) => this.move(e));
    c.addEventListener("pointerup", (e) => this.up(e.pointerId));
    c.addEventListener("pointercancel", (e) => this.up(e.pointerId));
    this.updateCursor();
  }

  get drawing() {
    return this.live !== null;
  }

  get colorName() {
    return COLORS[this.color].name;
  }

  get colorValue() {
    return COLORS[this.color].value;
  }

  /** Switch to another document's marks. They're kept for the browser session. */
  load(docKey: string) {
    this.commit();
    this.pages.clear();
    this.storageKey = `lumen:ink:${docKey}`;
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return;
      for (const [n, strokes] of Object.entries(JSON.parse(raw) as Record<string, Stroke[]>)) {
        if (!Array.isArray(strokes)) continue;
        const valid = strokes.filter((s) => s && Array.isArray(s.p) && typeof s.c === "string" && s.t in WIDTH);
        if (valid.length) this.pages.set(Number(n), valid);
      }
    } catch {}
  }

  /** Place the surface on a page sheet. */
  attach(host: HTMLElement, page: number) {
    this.commit();
    this.page = page;
    host.append(this.canvas);
    this.resizer.disconnect();
    this.resizer.observe(host);
    this.fit();
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.updateCursor();
  }

  nextColor() {
    this.color = (this.color + 1) % COLORS.length;
    this.updateCursor();
  }

  /** Remove the last mark on the current page. Returns false if there was none. */
  undo() {
    const strokes = this.pages.get(this.page);
    if (!strokes?.length) return false;
    strokes.pop();
    this.changed();
    return true;
  }

  /** Remove every mark on the current page. Returns false if there were none. */
  erase() {
    if (!this.pages.get(this.page)?.length) return false;
    this.pages.delete(this.page);
    this.changed();
    return true;
  }

  // ---------- input ----------
  private point(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return [round((e.clientX - r.left) / r.width), round((e.clientY - r.top) / r.height)];
  }

  private down(e: PointerEvent) {
    if (this.live || e.button !== 0) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointer = e.pointerId;
    this.live = { t: this.tool, c: this.colorValue, p: this.point(e) };
    this.request();
  }

  private move(e: PointerEvent) {
    if (!this.live || e.pointerId !== this.pointer) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) this.live.p.push(...this.point(ev));
    this.request();
  }

  private up(pointerId: number) {
    if (pointerId === this.pointer) this.commit();
  }

  private commit() {
    const stroke = this.live;
    if (!stroke) return;
    this.live = null;
    this.pointer = -1;
    const strokes = this.pages.get(this.page) ?? [];
    strokes.push(stroke);
    this.pages.set(this.page, strokes);
    this.changed();
  }

  private changed() {
    this.request();
    if (!this.storageKey) return;
    try {
      if (this.pages.size) sessionStorage.setItem(this.storageKey, JSON.stringify(Object.fromEntries(this.pages)));
      else sessionStorage.removeItem(this.storageKey);
    } catch {}
  }

  // ---------- drawing ----------
  private fit() {
    const host = this.canvas.parentElement;
    if (!host) return;
    let scale = window.devicePixelRatio || 1;
    const area = host.clientWidth * host.clientHeight * scale * scale;
    if (area > MAX_CANVAS_AREA) scale *= Math.sqrt(MAX_CANVAS_AREA / area);
    const w = Math.max(1, Math.round(host.clientWidth * scale));
    const h = Math.max(1, Math.round(host.clientHeight * scale));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.draw();
  }

  private request() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);
    const strokes = this.pages.get(this.page) ?? [];
    for (const s of strokes) paint(ctx, s, w, h);
    if (this.live) paint(ctx, this.live, w, h);
  }

  private updateCursor() {
    const marker = this.tool === "marker";
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">` +
      `<circle cx="12" cy="12" r="${marker ? 7 : 3.5}" fill="${this.colorValue}" fill-opacity="${marker ? 0.55 : 1}" ` +
      `stroke="#fff" stroke-width="1.5"/></svg>`;
    this.canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
  }
}

function paint(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  const p = s.p;
  if (p.length < 2) return;
  ctx.save();
  ctx.strokeStyle = s.c;
  ctx.lineWidth = Math.max(1, WIDTH[s.t] * Math.hypot(w, h));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = s.t === "marker" ? MARKER_ALPHA : 1;
  ctx.beginPath();
  ctx.moveTo(p[0] * w, p[1] * h);
  if (p.length === 2) {
    ctx.lineTo(p[0] * w + 0.01, p[1] * h); // a tap leaves a dot
  } else {
    // Smooth the line by curving through the midpoints between samples.
    for (let i = 2; i < p.length - 2; i += 2) {
      const x = p[i] * w, y = p[i + 1] * h;
      ctx.quadraticCurveTo(x, y, (x + p[i + 2] * w) / 2, (y + p[i + 3] * h) / 2);
    }
    ctx.lineTo(p[p.length - 2] * w, p[p.length - 1] * h);
  }
  ctx.stroke();
  ctx.restore();
}
