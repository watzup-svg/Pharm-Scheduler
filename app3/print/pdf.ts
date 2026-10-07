// The printed packet as a PDF (jsPDF, bundled, no network). Draws only from a PrintModel, so a reprint is the same sheet.
// Look and sizes follow the prototype's posters: brand band, ink weekday bar, grid, 8pt key line.
import { jsPDF } from "jspdf";
import { DEFAULT_PRINT_OPTIONS, WEEKDAYS, itemLayout, legendText, paginate } from "./model.ts";
import type { GlancePage, PrintDay, PrintModel, PrintOptions, Sheet, StorePage } from "./model.ts";

type RGB = [number, number, number];
const INK: RGB = [28, 28, 28];
const MUTED: RGB = [92, 88, 84];
const NIGHT: RGB = [32, 24, 32];
const SHUT: RGB = [221, 215, 203];
const LINE: RGB = [200, 193, 180];
const PAPER: RGB = [255, 255, 255];
const BRAND: RGB = [200, 16, 46];
const ILLEGAL: RGB = [140, 58, 47];
const HATCH: RGB = [176, 168, 154];

type Box = { x: number; y: number; w: number; h: number };

export function pageSize(paper: PrintOptions["paper"]): { w: number; h: number } {
  return paper === "tabloid" ? { w: 11, h: 17 } : { w: 8.5, h: 11 };
}

function margins(opts: PrintOptions) {
  const base = opts.paper === "tabloid" ? 0.55 : 0.48;
  return { left: opts.punch ? base + 0.4 : base, right: base, top: base, bottom: base };
}

const toGray = (c: RGB): RGB => {
  const y = Math.round(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]);
  return [y, y, y];
};
const col = (o: PrintOptions, c: RGB): RGB => (o.grayscale ? toGray(c) : c);
const text = (d: jsPDF, o: PrintOptions, c: RGB) => { const k = col(o, c); d.setTextColor(k[0], k[1], k[2]); };
const fill = (d: jsPDF, o: PrintOptions, c: RGB) => { const k = col(o, c); d.setFillColor(k[0], k[1], k[2]); };
const stroke = (d: jsPDF, o: PrintOptions, c: RGB) => { const k = col(o, c); d.setDrawColor(k[0], k[1], k[2]); };
const scale = (o: PrintOptions) => (o.typeSize === "large" ? 1.2 : 1);

/** Standard PDF fonts cover Latin-1 only. Anything else becomes "?" rather than garbage. */
export function safe(s: string): string {
  return s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^ -~¡-ÿ]/g, "?");
}

export function clip(doc: jsPDF, s: string, width: number): string {
  if (doc.getTextWidth(s) <= width) return s;
  let t = s;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function capLines(doc: jsPDF, lines: string[], n: number, width: number): string[] {
  if (lines.length <= n) return lines;
  const kept = lines.slice(0, n);
  kept[n - 1] = clip(doc, `${kept[n - 1]} ...`, width);
  return kept;
}

// ---------- shared drawing ----------

function hatch(doc: jsPDF, o: PrintOptions, x: number, y: number, w: number, h: number, step: number) {
  stroke(doc, o, HATCH);
  doc.setLineWidth(0.007);
  for (let t = step; t < w + h; t += step) {
    const x1 = x + Math.min(t, w);
    const y1 = y + Math.max(0, t - w);
    const x2 = x + Math.max(0, t - h);
    const y2 = y + Math.min(t, h);
    doc.line(x1, y1, x2, y2);
  }
}

/** An empty box, drawn as a rectangle (a "□" glyph is not in the PDF's built-in fonts). */
function openBox(doc: jsPDF, o: PrintOptions, cx: number, cy: number, size: number) {
  stroke(doc, o, ILLEGAL);
  fill(doc, o, PAPER);
  doc.setLineWidth(Math.max(0.012, size * 0.09));
  doc.rect(cx - size / 2, cy - size / 2, size, size, "FD");
}

type Item = { box: true } | { box: false; label: string; full?: string };

/** Initials, with the person's whole name alongside when the legend knows exactly one name for them (drawn instead of the initials when there is room). */
function itemsOf(d: PrintDay, names?: Map<string, string>): Item[] {
  return [...d.initials.map((label): Item => ({ box: false, label, ...(names?.get(label) ? { full: names.get(label)! } : {}) })), ...Array.from({ length: d.open }, (): Item => ({ box: true }))];
}

/** Stack initials and open boxes inside a cell, one per line; two per line when there is no room. */
function drawItems(doc: jsPDF, o: PrintOptions, itemsIn: Item[], x: number, y: number, w: number, h: number, maxFont: number, minLine: number, minFullFont = 0) {
  if (!itemsIn.length) return;
  const lay = itemLayout(itemsIn.length, h, maxFont, minLine);
  const { perLine, lines, lineH } = lay;
  let font = lay.font;
  doc.setFont("helvetica", "bold");
  // Whole names when every person in the cell has one and the longest fits its column at a readable size; otherwise initials.
  let items = itemsIn;
  if (minFullFont > 0 && itemsIn.every((it) => it.box || it.full)) {
    const colW0 = w / perLine;
    let f = font;
    const widest = (size: number) => { doc.setFontSize(size); return Math.max(0, ...itemsIn.map((it) => (it.box ? 0 : doc.getTextWidth(safe(it.full!))))); };
    while (f > minFullFont && widest(f) > colW0 - 0.08) f -= 0.25;
    if (f >= minFullFont && widest(f) <= colW0 - 0.08) { items = itemsIn.map((it) => (it.box ? it : { box: false as const, label: it.full! })); font = f; }
  }
  // Keep every label inside its column.
  const colW = w / perLine;
  for (const it of items) {
    if (it.box) continue;
    doc.setFontSize(font);
    while (font > 3.5 && doc.getTextWidth(safe(it.label)) > colW - 0.03) { font -= 0.25; doc.setFontSize(font); }
  }
  const top = y + (h - lineH * lines) / 2;
  items.forEach((it, i) => {
    const row = Math.floor(i / perLine);
    const c = i % perLine;
    const cx = x + colW * c + colW / 2;
    const cy = top + row * lineH + lineH / 2;
    if (it.box) {
      openBox(doc, o, cx, cy, Math.min(lineH * 0.78, colW * 0.7, 0.26));
    } else {
      doc.setFontSize(font);
      text(doc, o, INK);
      doc.text(safe(it.label), cx, cy + (font / 72) * 0.36, { align: "center" });
    }
  });
}

function drawHeader(doc: jsPDF, o: PrintOptions, kicker: string, title: string, meta: string, right: string, box: Box, left: number, rightM: number) {
  const s = scale(o);
  fill(doc, o, NIGHT);
  doc.rect(box.x, box.y, box.w, 0.09, "F");
  fill(doc, o, BRAND);
  doc.rect(box.x, box.y, 1.3, 0.09, "F");
  text(doc, o, NIGHT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11 * s);
  doc.text(safe(kicker), left, box.y + 0.26);
  text(doc, o, INK);
  doc.setFontSize(11 * s);
  const rightW = doc.getTextWidth(safe(right));
  const titleMax = box.w - rightM - left - rightW - 0.3;
  let sz = 16 * s;
  doc.setFontSize(sz);
  while (sz > 11 && doc.getTextWidth(safe(title)) > titleMax) { sz -= 0.5; doc.setFontSize(sz); }
  doc.text(clip(doc, safe(title), titleMax), left, box.y + 0.52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5 * s);
  text(doc, o, MUTED);
  doc.text(clip(doc, safe(meta), box.w - rightM - left), left, box.y + 0.72);
  text(doc, o, NIGHT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11 * s);
  doc.text(safe(right), box.x + box.w - rightM, box.y + 0.52, { align: "right" });
}

/** Key line: a drawn box, then words. Returns nothing; baseline is `yBase`. */
function drawKey(doc: jsPDF, o: PrintOptions, x: number, yBase: number, showOpen: boolean, showClosed: boolean) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  text(doc, o, MUTED);
  let cx = x;
  if (showOpen) {
    openBox(doc, o, cx + 0.05, yBase - 0.03, 0.1);
    const t = "= a pharmacist is still needed.";
    text(doc, o, MUTED);
    doc.text(t, cx + 0.15, yBase);
    cx += 0.15 + doc.getTextWidth(t) + 0.18;
  }
  if (showClosed) {
    fill(doc, o, SHUT);
    stroke(doc, o, LINE);
    doc.setLineWidth(0.006);
    doc.rect(cx, yBase - 0.08, 0.1, 0.1, "FD");
    hatch(doc, o, cx, yBase - 0.08, 0.1, 0.1, 0.04);
    text(doc, o, MUTED);
    doc.text("= the store is closed.", cx + 0.15, yBase);
  }
}

// ---------- store page ----------

function drawStore(doc: jsPDF, p: StorePage, o: PrintOptions, box: Box) {
  const m = margins(o);
  const s = scale(o);
  const nameOf = new Map(p.legend.filter((l) => l.names.length === 1).map((l) => [l.initials, l.names[0]!] as [string, string]));
  const kicker = `STORE SCHEDULE${p.state ? ` - ${p.state}` : ""}${p.part ? ` - PAGE ${p.part.n} OF ${p.part.of}` : ""}`;
  drawHeader(doc, o, kicker, p.title, p.revisionLine, p.period, box, box.x + m.left, m.right);

  // Legend (names) sits above the key line at the foot of the box.
  const left = box.x + m.left;
  const innerW = box.w - m.left - m.right;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const legendLines = p.legend.length ? capLines(doc, doc.splitTextToSize(safe(`Initials: ${p.legend.map(legendText).join("   |   ")}`), innerW) as string[], 3, innerW) : [];
  const footLines = legendLines.length + 1;
  const footerTop = box.y + box.h - m.bottom - footLines * 0.14 - 0.04;
  const top = box.y + 0.92;
  const wdH = 0.26;
  const gridTop = top + wdH;
  const gridH = Math.max(0.8, footerTop - 0.1 - gridTop);
  const colW = innerW / 7;
  const rowH = gridH / Math.max(p.weeks.length, 1);

  fill(doc, o, NIGHT);
  doc.rect(left, top, innerW, wdH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  text(doc, o, PAPER);
  WEEKDAYS.forEach((d, i) => doc.text(d.toUpperCase(), left + i * colW + colW / 2, top + 0.18, { align: "center" }));

  stroke(doc, o, LINE);
  doc.setLineWidth(0.01);
  p.weeks.forEach((week, r) => {
    week.forEach((cell, c) => {
      const x = left + c * colW;
      const y = gridTop + r * rowH;
      fill(doc, o, cell.inRange ? (cell.closed ? SHUT : PAPER) : [244, 241, 235]);
      doc.rect(x, y, colW, rowH, "F");
      if (cell.inRange && cell.closed) hatch(doc, o, x, y, colW, rowH, 0.09);
      stroke(doc, o, LINE);
      doc.setLineWidth(0.01);
      doc.rect(x, y, colW, rowH, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9 * s);
      text(doc, o, cell.inRange ? INK : MUTED);
      if (!cell.inRange) {
        doc.setFont("helvetica", "normal");
        doc.text(String(cell.day), x + 0.06, y + 0.17);
        return;
      }
      doc.text(safe(cell.label), x + 0.06, y + 0.17);
      const items = itemsOf(cell, nameOf);
      if (cell.closed) {
        const label = items.length ? "Closed" : "CLOSED";
        doc.setFont("helvetica", "bold");
        doc.setFontSize((items.length ? 7.5 : Math.min(13 * s, 15)));
        text(doc, o, MUTED);
        if (items.length) {
          doc.text(label, x + colW - 0.06, y + 0.17, { align: "right" });
          drawItems(doc, o, items, x, y + 0.24, colW, rowH - 0.3, 14 * s, 0.17, 8);
        } else {
          doc.text(label, x + colW / 2, y + rowH / 2 + 0.06, { align: "center" });
        }
        return;
      }
      drawItems(doc, o, items, x, y + 0.24, colW, rowH - 0.3, 16 * s, 0.17, 8);
    });
  });

  // Foot: names, then the key.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  text(doc, o, INK);
  legendLines.forEach((ln, i) => doc.text(ln, left, footerTop + 0.1 + i * 0.14));
  const anyClosed = p.weeks.some((w) => w.some((d) => d.inRange && d.closed));
  drawKey(doc, o, left, footerTop + 0.1 + legendLines.length * 0.14, p.openTotal > 0, anyClosed);
}

// ---------- all stores at a glance ----------

function drawGlance(doc: jsPDF, g: GlancePage, o: PrintOptions) {
  const { w, h } = pageSize(o.paper);
  const m = margins(o);
  const s = scale(o);
  const box: Box = { x: 0, y: 0, w, h };
  const meta = g.revisionLine + (g.part ? ` - part ${g.part.n} of ${g.part.of}` : "");
  drawHeader(doc, o, "ALL STORES AT A GLANCE", "Pharmacists by store", meta, g.period, box, m.left, m.right);

  const left = m.left;
  const innerW = w - m.left - m.right;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const foot: string[] = [];
  if (g.warningLine) foot.push(g.warningLine);
  if (g.legend.length) foot.push(...capLines(doc, doc.splitTextToSize(safe(`Initials: ${g.legend.map(legendText).join("   |   ")}`), innerW) as string[], 5, innerW));
  const footH = (foot.length + 1) * 0.13 + 0.1;

  const top = 0.92;
  const headH = 0.36;
  const labelW = 0.62;
  const n = g.dates.length || 1;
  const colW = (innerW - labelW) / n;
  const avail = h - m.bottom - footH - top - headH;
  const rowH = Math.max(0.2, Math.min(0.46, avail / Math.max(g.rows.length, 1)));

  fill(doc, o, NIGHT);
  doc.rect(left, top, innerW, headH, "F");
  text(doc, o, PAPER);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5 * s);
  doc.text("Store", left + 0.06, top + 0.22);
  g.dates.forEach((d, i) => {
    const cx = left + labelW + i * colW + colW / 2;
    const parts = d.label.split(" ");
    const dayText = parts[parts.length - 1]!;
    doc.setFontSize(Math.min(7.5 * s, colW * 72 * 0.5));
    doc.text(dayText, cx, top + 0.15, { align: "center" });
    if (parts.length > 1) {
      doc.setFontSize(5);
      doc.text(parts[0]!.toUpperCase(), cx, top + 0.28, { align: "center" });
    }
  });

  g.rows.forEach((row, r) => {
    const y = top + headH + r * rowH;
    fill(doc, o, PAPER);
    stroke(doc, o, LINE);
    doc.setLineWidth(0.008);
    doc.rect(left, y, innerW, rowH, "FD");
    text(doc, o, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8 * s);
    doc.text(clip(doc, safe(row.code), labelW - 0.1), left + 0.06, y + rowH / 2 + 0.04);
    row.days.forEach((d, i) => {
      const x = left + labelW + i * colW;
      if (d.closed) {
        fill(doc, o, SHUT);
        doc.rect(x, y, colW, rowH, "F");
        hatch(doc, o, x, y, colW, rowH, 0.06);
      }
      stroke(doc, o, LINE);
      doc.setLineWidth(0.004);
      doc.rect(x, y, colW, rowH, "S");
      const items = itemsOf(d);
      if (!items.length) return;
      drawItems(doc, o, items, x, y + 0.01, colW, rowH - 0.02, 6.5 * s, 0.1);
    });
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  text(doc, o, g.warnings.open || g.warnings.violations ? ILLEGAL : MUTED);
  const base = h - m.bottom - footH + 0.12;
  foot.forEach((ln, i) => {
    text(doc, o, i === 0 && g.warningLine ? (g.warnings.open || g.warnings.violations ? ILLEGAL : MUTED) : INK);
    doc.text(ln, left, base + i * 0.13);
  });
  const anyOpen = g.rows.some((r) => r.days.some((d) => d.open > 0));
  const anyClosed = g.rows.some((r) => r.days.some((d) => d.closed));
  drawKey(doc, o, left, base + foot.length * 0.13, anyOpen, anyClosed);
}

// ---------- the packet ----------

function paint(doc: jsPDF, o: PrintOptions) {
  const { w, h } = pageSize(o.paper);
  fill(doc, o, PAPER);
  doc.rect(0, 0, w, h, "F");
}

function drawSheet(doc: jsPDF, sheet: Sheet, o: PrintOptions) {
  const { w, h } = pageSize(o.paper);
  if (sheet.kind === "glance") return drawGlance(doc, sheet.page, o);
  const [a, b] = sheet.pages;
  if (!b && sheet.pages.length === 1 && !o.twoUp) return drawStore(doc, a, o, { x: 0, y: 0, w, h });
  const half = h / 2;
  drawStore(doc, a, o, { x: 0, y: 0.08, w, h: half - 0.12 });
  stroke(doc, o, LINE);
  doc.setLineWidth(0.015);
  doc.setLineDashPattern([0.08, 0.06], 0);
  doc.line(margins(o).left, half, w - margins(o).right, half);
  doc.setLineDashPattern([], 0);
  text(doc, o, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("cut", w / 2, half - 0.04, { align: "center" });
  if (b) drawStore(doc, b, o, { x: 0, y: half + 0.08, w, h: half - 0.16 });
}

/** A stable 32-hex id so the same packet always yields the same bytes. */
function fileId(s: string): string {
  let out = "";
  for (let k = 0; k < 4; k++) {
    let hsh = 2166136261 ^ (k * 16777619);
    for (let i = 0; i < s.length; i++) { hsh ^= s.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
    out += (hsh >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}

export function buildPacketBytes(model: PrintModel, opts: PrintOptions = DEFAULT_PRINT_OPTIONS): ArrayBuffer {
  const { w, h } = pageSize(opts.paper);
  const doc = new jsPDF({ unit: "in", format: [w, h], orientation: "portrait" });
  doc.setProperties({ title: `Hi-School Pharmacy schedule, ${model.period}, revision ${model.revision}`, creator: "Hi-School Pharmacy scheduler" });
  // Fixed stamps: no clock read, and a reprint is byte-for-byte the same.
  doc.setCreationDate(`D:${model.postedOn.replace(/-/g, "")}120000+00'00'`);
  doc.setFileId(fileId(`${model.filename}|${JSON.stringify(opts)}|${model.stores.length}|${model.glance.length}`));
  const sheets = paginate(model, opts);
  sheets.forEach((sheet, i) => {
    if (i > 0) doc.addPage([w, h], "portrait");
    paint(doc, opts);
    drawSheet(doc, sheet, opts);
    text(doc, opts, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${i + 1} / ${sheets.length}`, w / 2, h - 0.26, { align: "center" });
  });
  if (!sheets.length) {
    paint(doc, opts);
    text(doc, opts, MUTED);
    doc.setFontSize(12);
    doc.text("Nothing was posted for these dates.", w / 2, h / 2, { align: "center" });
  }
  return doc.output("arraybuffer");
}

export function packetBlob(model: PrintModel, opts?: PrintOptions): Blob {
  return new Blob([buildPacketBytes(model, opts)], { type: "application/pdf" });
}
