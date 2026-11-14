import { pdfjsLib } from "./api.js";

const MIN_W = 0.04;
const MIN_H = 0.02;
const DEFAULT_BOX = { w: 0.34, h: 0.09 };
let nextId = 1;

/**
 * PDF preview with signature boxes. Boxes use the cloud `rectPct` contract: fractions of the
 * *displayed* page (pdf.js applies /Rotate), bottom-left origin. The core maps them to user space.
 */
export class Viewer {
  constructor(container, { onChange, onPage, boxLabel, boxImage }) {
    this.container = container;
    this.onChange = onChange || (() => {});
    this.onPage = onPage || (() => {});
    this.boxLabel = boxLabel || ((b, i) => `Chữ ký ${i + 1}`);
    this.boxImage = boxImage || (async () => null);
    this.doc = null;
    this.pageNum = 1;
    this.boxes = [];
    this.selected = null;
    this.pageSize = { w: 595, h: 842 };
  }

  async load(bytes) {
    if (this.doc) this.doc.destroy();
    this.doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
    this.pageNum = this.doc.numPages;
    await this.render();
  }

  get numPages() {
    return this.doc ? this.doc.numPages : 0;
  }

  async goto(n) {
    if (!this.doc) return;
    this.pageNum = Math.min(Math.max(n, 1), this.doc.numPages);
    await this.render();
  }

  async render() {
    const page = await this.doc.getPage(this.pageNum);
    const base = page.getViewport({ scale: 1 });
    this.pageSize = { w: base.width, h: base.height };
    const avail = Math.max(this.container.clientWidth - 48, 300);
    const scale = Math.min(avail / base.width, 1.6);
    const vp = page.getViewport({ scale });
    this.container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "page";
    const canvas = document.createElement("canvas");
    canvas.width = vp.width * devicePixelRatio;
    canvas.height = vp.height * devicePixelRatio;
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    wrap.append(canvas, overlay);
    this.container.append(wrap);
    this.overlay = overlay;
    this.size = { w: vp.width, h: vp.height };
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: vp,
      transform: [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
    }).promise;
    this.bindOverlay();
    this.drawBoxes();
    this.onPage(this.pageNum, this.doc.numPages);
  }

  /** Box size in PDF points (for stamp previews). */
  pointsOf(b) {
    return { w: b.w * this.pageSize.w, h: b.h * this.pageSize.h };
  }

  pointer(ev) {
    const r = this.overlay.getBoundingClientRect();
    return {
      x: Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((ev.clientY - r.top) / r.height, 0), 1),
    };
  }

  bindOverlay() {
    const ov = this.overlay;
    ov.onpointerdown = (ev) => {
      if (ev.target !== ov) return;
      const start = this.pointer(ev);
      const box = { id: nextId++, page: this.pageNum, x: start.x, y: 1 - start.y, w: 0, h: 0 };
      this.boxes.push(box);
      this.selected = box.id;
      ov.setPointerCapture(ev.pointerId);
      ov.onpointermove = (e) => {
        const p = this.pointer(e);
        box.x = Math.min(start.x, p.x);
        box.w = Math.abs(p.x - start.x);
        box.y = 1 - Math.max(start.y, p.y);
        box.h = Math.abs(p.y - start.y);
        this.drawBoxes();
      };
      ov.onpointerup = (e) => {
        ov.onpointermove = null;
        ov.onpointerup = null;
        if (box.w < MIN_W || box.h < MIN_H) {
          const p = this.pointer(e);
          box.w = DEFAULT_BOX.w;
          box.h = DEFAULT_BOX.h;
          box.x = Math.min(Math.max(p.x - box.w / 2, 0), 1 - box.w);
          const top = Math.min(Math.max(p.y - box.h / 2, 0), 1 - box.h);
          box.y = 1 - top - box.h;
        }
        this.changed();
      };
    };
  }

  changed() {
    this.drawBoxes();
    this.onChange(this.boxes);
  }

  removeBox(id) {
    this.boxes = this.boxes.filter((b) => b.id !== id);
    this.changed();
  }

  clearBoxes() {
    this.boxes = [];
    this.changed();
  }

  drawBoxes() {
    if (!this.overlay) return;
    this.overlay.querySelectorAll(".sig-box").forEach((n) => n.remove());
    this.boxes.forEach((b, i) => {
      if (b.page !== this.pageNum) return;
      const el = document.createElement("div");
      el.className = "sig-box" + (b.id === this.selected ? " selected" : "");
      el.style.left = `${b.x * 100}%`;
      el.style.top = `${(1 - b.y - b.h) * 100}%`;
      el.style.width = `${b.w * 100}%`;
      el.style.height = `${b.h * 100}%`;
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = this.boxLabel(b, i);
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "×";
      del.title = "Xoá ô này";
      del.onpointerdown = (e) => e.stopPropagation();
      del.onclick = () => this.removeBox(b.id);
      const handle = document.createElement("div");
      handle.className = "handle";
      el.append(tag, del, handle);
      this.overlay.append(el);
      if (b.w > MIN_W && b.h > MIN_H) {
        this.boxImage(b).then((url) => {
          if (url) el.style.backgroundImage = `url(${url})`;
        });
      }
      el.onpointerdown = (ev) => {
        ev.stopPropagation();
        this.selected = b.id;
        const resizing = ev.target === handle;
        const start = this.pointer(ev);
        const orig = { ...b };
        el.setPointerCapture(ev.pointerId);
        el.onpointermove = (e) => {
          const p = this.pointer(e);
          const dx = p.x - start.x;
          const dy = p.y - start.y;
          if (resizing) {
            b.w = Math.min(Math.max(orig.w + dx, MIN_W), 1 - orig.x);
            const newH = Math.min(Math.max(orig.h + dy, MIN_H), orig.y + orig.h);
            b.y = orig.y + orig.h - newH;
            b.h = newH;
          } else {
            b.x = Math.min(Math.max(orig.x + dx, 0), 1 - b.w);
            b.y = Math.min(Math.max(orig.y - dy, 0), 1 - b.h);
          }
          el.style.left = `${b.x * 100}%`;
          el.style.top = `${(1 - b.y - b.h) * 100}%`;
          el.style.width = `${b.w * 100}%`;
          el.style.height = `${b.h * 100}%`;
        };
        el.onpointerup = () => {
          el.onpointermove = null;
          el.onpointerup = null;
          this.changed();
        };
      };
    });
  }
}
