import { jsPDF } from "jspdf";
import { WEEKDAYS } from "./calendar.ts";
import { personRgb, toGray } from "./color.ts";
import { employeeHeaderMeta, firstNames, packPageCount, parsePosterLine, stateFromAddress } from "./print-model.ts";
import type { DistrictSheetModel, EmployeeCalendarModel, PrintModel, StorePosterModel } from "./print-model.ts";
import type { PrintPrefs } from "./types.ts";


const INK: [number, number, number] = [28, 28, 28];
const MUTED: [number, number, number] = [92, 88, 84];
const PINE: [number, number, number] = [32, 24, 32];
const SHUT: [number, number, number] = [221, 215, 203];
const LINE: [number, number, number] = [230, 225, 216];
const CREAM: [number, number, number] = [255, 255, 255];
const BRAND: [number, number, number] = [200, 16, 46];
const ILLEGAL: [number, number, number] = [140, 58, 47];
const WARN: [number, number, number] = [122, 78, 8];

/** `logo` is the official badge as a PNG data URL (600 × 265). Left out, the header has no logo. Never redrawn. */
export type DrawOpts = PrintPrefs & { draft: boolean; logo?: string | null };

const DEFAULT_OPTS: DrawOpts = {
  paper: "letter",
  typeSize: "normal",
  grayscale: false,
  twoUp: false,
  punch: false,
  includeStaff: false,
  draft: false,
};

type Box = { x: number; y: number; w: number; h: number };

function pageSize(paper: PrintPrefs["paper"]) {
  return paper === "tabloid" ? { w: 11, h: 17 } : { w: 8.5, h: 11 };
}

function margins(opts: DrawOpts) {
  const base = opts.paper === "tabloid" ? 0.55 : 0.48;
  return { left: opts.punch ? base + 0.4 : base, right: base, top: base, bottom: base };
}

function c(opts: DrawOpts, rgb: [number, number, number]): [number, number, number] {
  return opts.grayscale ? toGray(rgb) : rgb;
}

function rgb(doc: jsPDF, col: [number, number, number]) {
  doc.setTextColor(col[0], col[1], col[2]);
}
function fill(doc: jsPDF, col: [number, number, number]) {
  doc.setFillColor(col[0], col[1], col[2]);
}
function stroke(doc: jsPDF, col: [number, number, number]) {
  doc.setDrawColor(col[0], col[1], col[2]);
}

function typeScale(opts: DrawOpts) {
  return opts.typeSize === "large" ? 1.2 : 1;
}

function makeDoc(opts: DrawOpts) {
  const { w, h } = pageSize(opts.paper);
  return new jsPDF({ unit: "in", format: [w, h], orientation: "portrait" });
}

function paintPage(doc: jsPDF, opts: DrawOpts) {
  const { w, h } = pageSize(opts.paper);
  fill(doc, c(opts, CREAM));
  doc.rect(0, 0, w, h, "F");
}

function watermark(doc: jsPDF, opts: DrawOpts) {
  if (!opts.draft) return;
  const { w, h } = pageSize(opts.paper);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(72);
  doc.setTextColor(200, 80, 70);
  doc.text("DRAFT", w / 2, h / 2, { align: "center", angle: 35 });
}

function pageNumber(doc: jsPDF, opts: DrawOpts, page: number, total: number) {
  const { w, h } = pageSize(opts.paper);
  rgb(doc, c(opts, MUTED));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${page} / ${total}`, w / 2, h - 0.28, { align: "center" });
}

export function buildPdfBytes(model: PrintModel, opts: DrawOpts = DEFAULT_OPTS): ArrayBuffer {
  const doc = makeDoc(opts);
  paintPage(doc, opts);
  if (model.kind === "store") drawStore(doc, model, opts);
  else if (model.kind === "district") drawDistrict(doc, model, opts);
  else drawEmployee(doc, model, opts);
  watermark(doc, opts);
  pageNumber(doc, opts, 1, 1);
  return doc.output("arraybuffer");
}

export function buildPackBytes(models: PrintModel[], opts: DrawOpts = DEFAULT_OPTS): ArrayBuffer {
  const employees = models.filter((m): m is EmployeeCalendarModel => m.kind === "employee");
  const stores = models.filter((m): m is StorePosterModel => m.kind === "store");
  const district = models.filter((m): m is DistrictSheetModel => m.kind === "district");
  const total = packPageCount(stores.length, employees.length, opts.twoUp, district.length > 0);
  const doc = makeDoc(opts);
  let first = true;
  let page = 0;
  const add = (draw: () => void) => {
    if (!first) {
      const { w, h } = pageSize(opts.paper);
      doc.addPage([w, h], "portrait");
    }
    first = false;
    paintPage(doc, opts);
    draw();
    watermark(doc, opts);
    page += 1;
    pageNumber(doc, opts, page, Math.max(total, 1));
  };
  for (const d of district) add(() => drawDistrict(doc, d, opts));
  for (const s of stores) add(() => drawStore(doc, s, opts));
  if (opts.twoUp) {
    for (let i = 0; i < employees.length; i += 2) {
      const a = employees[i]!;
      const b = employees[i + 1];
      add(() => drawTwoUp(doc, a, b, opts));
    }
  } else {
    for (const e of employees) add(() => drawEmployee(doc, e, opts));
  }
  if (first) paintPage(doc, opts);
  return doc.output("arraybuffer");
}

function pdfBlob(model: PrintModel, opts?: DrawOpts): Blob {
  return new Blob([buildPdfBytes(model, opts)], { type: "application/pdf" });
}

export function packBlob(models: PrintModel[], opts?: DrawOpts): Blob {
  return new Blob([buildPackBytes(models, opts)], { type: "application/pdf" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadPdf(model: PrintModel, opts?: DrawOpts) {
  downloadBlob(pdfBlob(model, opts), model.filename);
}

export function downloadPack(models: PrintModel[], filename: string, opts?: DrawOpts) {
  downloadBlob(packBlob(models, opts), filename);
}

export function printBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.title = "Print PDF";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.addEventListener("load", () => {
    const frame = iframe.contentWindow;
    if (!frame) return;
    try {
      frame.focus();
      frame.print();
    } catch {
      // Some browsers (and sandboxed pages) won't print a PDF from a hidden frame. Open it so it can be printed from the viewer.
      window.open(url, "_blank", "noopener");
    }
    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  });
}

export function printPdf(model: PrintModel, opts?: DrawOpts) {
  printBlob(pdfBlob(model, opts));
}

/** Shorten text with an ellipsis until it fits the width at the current font. */
export function clip(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Wrap to at most maxLines; shrink the font toward minSize first, then end with an ellipsis. */
export function fitLines(doc: jsPDF, text: string, width: number, maxLines: number, size: number, minSize: number): { lines: string[]; size: number } {
  let sz = size;
  for (;;) {
    doc.setFontSize(sz);
    const lines = doc.splitTextToSize(text, width) as string[];
    const fits = lines.length <= maxLines && lines.every((l) => doc.getTextWidth(l) <= width + 0.001);
    if (fits || sz <= minSize) {
      if (lines.length <= maxLines) return { lines: lines.map((l) => clip(doc, l, width)), size: sz };
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = clip(doc, `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, width);
      return { lines: kept.map((l) => clip(doc, l, width)), size: sz };
    }
    sz = Math.max(minSize, sz - 0.5);
  }
}

function drawHeader(
  doc: jsPDF,
  opts: DrawOpts,
  kicker: string,
  title: string,
  meta: string,
  monthLabel: string,
  box: Box,
  left: number,
  right: number,
) {
  const s = typeScale(opts);
  // Brand band: near-black across the top with a short red segment.
  fill(doc, c(opts, PINE));
  doc.rect(box.x, box.y, box.w, 0.09, "F");
  fill(doc, c(opts, BRAND));
  doc.rect(box.x, box.y, 1.3, 0.09, "F");
  rgb(doc, c(opts, PINE));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11 * s);
  doc.text(kicker, left, box.y + 0.26);
  rgb(doc, c(opts, INK));
  const logoW = 1.05;
  const logoH = (logoW * 265) / 600;
  const logo = opts.grayscale ? null : opts.logo;
  const hasLogo = !!logo;
  doc.setFontSize(11 * s);
  const monthW = doc.getTextWidth(monthLabel);
  const titleMax = box.w - right - left - monthW - (hasLogo ? logoW + 0.18 : 0) - 0.3;
  doc.setFontSize(16 * s);
  {
    let sz = 16 * s;
    while (sz > 11 && doc.getTextWidth(title) > titleMax) {
      sz -= 0.5;
      doc.setFontSize(sz);
    }
  }
  doc.text(clip(doc, title, titleMax), left, box.y + 0.52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5 * s);
  rgb(doc, c(opts, MUTED));
  doc.text(clip(doc, meta, box.w - right - left - (hasLogo ? logoW + 0.18 : 0)), left, box.y + 0.72);
  rgb(doc, c(opts, PINE));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11 * s);
  if (hasLogo) {
    try {
      doc.addImage(logo!, "PNG", box.x + box.w - right - logoW, box.y + 0.15, logoW, logoH);
    } catch {
      /* no logo rather than no PDF */
    }
  }
  doc.text(monthLabel, box.x + box.w - right - (hasLogo ? logoW + 0.18 : 0), box.y + 0.52, { align: "right" });
}

function geo(opts: DrawOpts, weekCount: number, box: Box) {
  const m = margins(opts);
  const top = box.y + 0.92;
  const footerTop = box.y + box.h - m.bottom - 0.18;
  const wdH = 0.26;
  const gridTop = top + wdH;
  const gridH = Math.max(0.8, footerTop - 0.12 - gridTop);
  const innerW = box.w - m.left - m.right;
  return {
    left: box.x + m.left,
    top,
    wdH,
    gridTop,
    colW: innerW / 7,
    rowH: gridH / Math.max(weekCount, 1),
    innerW,
    footerTop,
  };
}

function drawWeekdays(doc: jsPDF, opts: DrawOpts, g: ReturnType<typeof geo>) {
  fill(doc, c(opts, PINE));
  doc.rect(g.left, g.top, g.innerW, g.wdH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  rgb(doc, c(opts, CREAM));
  WEEKDAYS.forEach((d, i) => {
    doc.text(d.toUpperCase(), g.left + i * g.colW + g.colW / 2, g.top + 0.18, { align: "center" });
  });
}

function drawStore(doc: jsPDF, model: StorePosterModel, opts: DrawOpts) {
  const { w, h } = pageSize(opts.paper);
  const m = margins(opts);
  const box: Box = { x: 0, y: 0, w, h };
  const s = typeScale(opts);
  drawHeader(
    doc,
    opts,
    `STORE POSTER${stateFromAddress(model.address) ? ` · ${stateFromAddress(model.address)}` : ""}`,
    `${model.tag}  ${model.name}`,
    `${model.address ? `${model.address} · ` : ""}${model.hours} · ${model.revised ? "Revised" : "Posted"} ${model.posted}`,
    model.monthLabel,
    box,
    m.left,
    m.right,
  );
  const g = geo(opts, model.weeks.length, box);
  drawWeekdays(doc, opts, g);
  stroke(doc, c(opts, LINE));
  doc.setLineWidth(0.01);

  model.weeks.forEach((week, r) => {
    week.forEach((cell, col) => {
      const x = g.left + col * g.colW;
      const y = g.gridTop + r * g.rowH;
      fill(doc, c(opts, cell.closed ? SHUT : CREAM));
      doc.rect(x, y, g.colW, g.rowH, "F");
      doc.rect(x, y, g.colW, g.rowH, "S");
      if (cell.day == null) return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9 * s);
      rgb(doc, c(opts, INK));
      doc.text(String(cell.day), x + 0.06, y + 0.18);
      if (cell.closed) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(Math.min(14 * s, 16));
        rgb(doc, c(opts, MUTED));
        doc.text("CLOSED", x + g.colW / 2, y + g.rowH / 2 + 0.08, { align: "center" });
        if (cell.reason) {
          // Why it is closed, in plain words, under the word CLOSED.
          doc.setFont("helvetica", "normal");
          const room = Math.max(1, Math.min(3, Math.floor((g.rowH / 2 - 0.3) / (0.14 * s))));
          const fit = fitLines(doc, cell.reason, g.colW - 0.12, room, 8.5 * s, 6.5);
          doc.setFontSize(fit.size);
          fit.lines.forEach((part, i) => doc.text(part, x + g.colW / 2, y + g.rowH / 2 + 0.28 + i * 0.14 * s, { align: "center" }));
        }
        return;
      }
      let ty = y + 0.42;
      // One type size per cell: the smallest any line needs, so a long name doesn't make its neighbors look mismatched.
      doc.setFont("helvetica", "bold");
      const cellSize = Math.min(
        10 * s,
        ...cell.lines.map((line) => {
          const q = parsePosterLine(line);
          return fitLines(doc, `${q.second ? "2nd: " : ""}${q.name}`, g.colW - 0.12, 2, 10 * s, 7).size;
        }),
      );
      cell.lines.forEach((line, i) => {
        const hex = cell.nameColors[i];
        const p = parsePosterLine(line);
        rgb(doc, c(opts, p.name ? personRgb(p.name, hex) : INK));
        doc.setFont("helvetica", "bold");
        const fit = fitLines(doc, `${p.second ? "2nd: " : ""}${p.name}`, g.colW - 0.12, 2, cellSize, 7);
        doc.setFontSize(fit.size);
        for (const part of fit.lines) {
          if (ty > y + g.rowH - 0.16) break;
          doc.text(part, x + 0.06, ty);
          ty += (fit.size / 10) * 0.16 * s;
        }
        if (p.away && ty <= y + g.rowH - 0.16) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7.5 * s);
          rgb(doc, c(opts, MUTED));
          doc.text(`from ${p.away}`, x + 0.06, ty);
          ty += 0.13 * s;
        }
        ty += 0.05;
      });
      if (cell.note) {
        doc.setFont("helvetica", "italic");
        rgb(doc, c(opts, MUTED));
        doc.setFontSize(7.5 * s);
        doc.text(clip(doc, cell.note, g.colW - 0.12), x + 0.06, y + g.rowH - 0.08);
      }
    });
  });

  rgb(doc, c(opts, MUTED));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    model.clean ? "Names are pharmacists. CLOSED = the store is closed." : "Names are pharmacists. “from XXX” = their home store is XXX. CLOSED = the store is closed.",
    g.left,
    g.footerTop + 0.12,
  );
}

function drawDistrict(doc: jsPDF, model: DistrictSheetModel, opts: DrawOpts) {
  const { w, h } = pageSize(opts.paper);
  const m = margins(opts);
  const box: Box = { x: 0, y: 0, w, h };
  const s = typeScale(opts);
  drawHeader(
    doc,
    opts,
    "DISTRICT",
    "Pharmacists",
    model.clean ? `Posted ${model.posted}` : `Posted ${model.posted}${model.holes.length ? ` · ${model.holes.length} ${model.holes.length === 1 ? "day" : "days"} with no coverage` : " · covered"}`,
    model.monthLabel,
    box,
    m.left,
    m.right,
  );
  const days = model.stores[0]?.days ?? [];
  const left = m.left;
  const top = box.y + 0.9;
  const innerW = w - m.left - m.right;
  const labelW = 0.55;
  const colW = days.length ? (innerW - labelW) / days.length : innerW;
  const rowH = 0.42;
  fill(doc, c(opts, PINE));
  doc.rect(left, top, innerW, 0.28, "F");
  rgb(doc, c(opts, CREAM));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7 * s);
  doc.text("Store", left + 0.06, top + 0.18);
  days.forEach((d, i) => {
    doc.text(String(d.day), left + labelW + i * colW + colW / 2, top + 0.18, { align: "center" });
  });
  model.stores.forEach((store, r) => {
    const y = top + 0.28 + r * rowH;
    stroke(doc, c(opts, LINE));
    doc.setLineWidth(0.008);
    fill(doc, c(opts, CREAM));
    doc.rect(left, y, innerW, rowH, "F");
    doc.rect(left, y, innerW, rowH, "S");
    rgb(doc, c(opts, INK));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8 * s);
    doc.text(store.tag, left + 0.06, y + 0.26);
    store.days.forEach((cell, i) => {
      const x = left + labelW + i * colW;
      if (cell.closed) {
        fill(doc, c(opts, SHUT));
        doc.rect(x, y, colW, rowH, "F");
      } else if (!cell.names.length && !model.clean) {
        fill(doc, c(opts, [240, 182, 173]));
        doc.rect(x, y, colW, rowH, "F");
      }
      rgb(doc, c(opts, cell.closed ? MUTED : cell.names.length ? INK : ILLEGAL));
      doc.setFont("helvetica", "normal");
      if (cell.closed) {
        doc.setFontSize(6 * s);
        doc.text("X", x + colW / 2, y + 0.26, { align: "center" });
        return;
      }
      const firsts = firstNames(cell.names);
      if (!firsts.length) {
        doc.setFontSize(6 * s);
        doc.text("—", x + colW / 2, y + 0.26, { align: "center" });
        return;
      }
      const start = firsts.length > 1 ? 4.6 * s : 5.4 * s;
      firsts.forEach((name, line) => {
        let size = start;
        doc.setFontSize(size);
        while (size > 3.2 && doc.getTextWidth(name) > colW - 0.02) {
          size -= 0.25;
          doc.setFontSize(size);
        }
        const yLine = firsts.length === 1 ? y + 0.26 : y + 0.16 + line * 0.16;
        doc.text(name, x + colW / 2, yLine, { align: "center" });
      });
    });
  });
  if (model.clean) return;
  rgb(doc, c(opts, model.holes.length ? ILLEGAL : MUTED));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const holeLine = model.holes.length
    ? `No coverage: ${model.holes.map((h) => `${h.tag} ${h.day}`).join(" · ")}`
    : "Every open day has a pharmacist.";
  const width = w - left - m.right;
  const cap = (lines: string[], n: number) => {
    if (lines.length <= n) return lines;
    const kept = lines.slice(0, n);
    kept[n - 1] = clip(doc, `${kept[n - 1]} …`, width);
    return kept;
  };
  const holes = cap(doc.splitTextToSize(holeLine, width) as string[], 3);
  // Accepted problems and deliberate closures, so the page that goes to the office says what was decided.
  const extra = model.exceptions.length ? cap(doc.splitTextToSize(`Left as is and planned: ${model.exceptions.join(" · ")}`, width) as string[], 4) : [];
  const all = [...extra, ...holes];
  all.forEach((ln, i) => doc.text(ln, left, h - m.bottom - 0.12 - (all.length - 1 - i) * 0.14));
}

function markColor(mark: string): [number, number, number] {
  if (mark === "DBL") return ILLEGAL;
  if (mark === "PTO") return WARN;
  if (mark === "OFF") return MUTED;
  return PINE;
}

function drawEmployeeInBox(doc: jsPDF, model: EmployeeCalendarModel, opts: DrawOpts, box: Box) {
  const m = margins(opts);
  const s = typeScale(opts);
  drawHeader(
    doc,
    opts,
    "EMPLOYEE MONTH",
    model.name,
    employeeHeaderMeta(model),
    model.monthLabel,
    box,
    m.left,
    m.right,
  );
  const g = geo(opts, model.weeks.length, box);
  drawWeekdays(doc, opts, g);
  stroke(doc, c(opts, LINE));
  doc.setLineWidth(0.01);
  model.weeks.forEach((week, r) => {
    week.forEach((cell, col) => {
      const x = g.left + col * g.colW;
      const y = g.gridTop + r * g.rowH;
      fill(doc, c(opts, CREAM));
      doc.rect(x, y, g.colW, g.rowH, "F");
      doc.rect(x, y, g.colW, g.rowH, "S");
      if (cell.day == null) return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5 * s);
      rgb(doc, c(opts, INK));
      doc.text(String(cell.day), x + 0.06, y + 0.16);
      doc.setFontSize(11 * s);
      rgb(doc, c(opts, markColor(cell.mark)));
      doc.text(cell.mark, x + g.colW / 2, y + g.rowH / 2 + (cell.cover ? -0.02 : 0.06), { align: "center" });
      if (cell.cover) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5 * s);
        rgb(doc, c(opts, MUTED));
        doc.text("cover", x + g.colW / 2, y + g.rowH / 2 + 0.14, { align: "center" });
      }
    });
  });
  rgb(doc, c(opts, MUTED));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(
    model.clean ? "Store: where they work. A blank day is not scheduled." : "Store: where they work. cover: not their home store. OFF: not scheduled. PTO: time off. DBL: scheduled twice that day.",
    g.left,
    g.footerTop + 0.1,
  );
}

function drawEmployee(doc: jsPDF, model: EmployeeCalendarModel, opts: DrawOpts) {
  const { w, h } = pageSize(opts.paper);
  drawEmployeeInBox(doc, model, opts, { x: 0, y: 0, w, h });
}

function drawTwoUp(
  doc: jsPDF,
  a: EmployeeCalendarModel,
  b: EmployeeCalendarModel | undefined,
  opts: DrawOpts,
) {
  const { w, h } = pageSize(opts.paper);
  const half = h / 2;
  drawEmployeeInBox(doc, a, opts, { x: 0, y: 0.08, w, h: half - 0.12 });
  stroke(doc, c(opts, LINE));
  doc.setLineWidth(0.015);
  doc.setLineDashPattern([0.08, 0.06], 0);
  doc.line(margins(opts).left, half, w - margins(opts).right, half);
  doc.setLineDashPattern([], 0);
  rgb(doc, c(opts, MUTED));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("cut", w / 2, half - 0.05, { align: "center" });
  if (b) drawEmployeeInBox(doc, b, opts, { x: 0, y: half + 0.08, w, h: half - 0.16 });
}

export function packFileName(year: number, month: number): string {
  const mm = month < 10 ? `0${month}` : String(month);
  return `HiSchool-Pharmacy-${year}-${mm}.pdf`;
}
