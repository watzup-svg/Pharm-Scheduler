// Print model: a pure function of a PostingSnapshot (plus the current names and store labels).
// It never looks at live assignments or requirements, so a reprint of an old revision is the same
// every time. Runtime imports use relative paths so this file runs under `node --experimental-strip-types`.
import { addDays, cmp, dateRange, weekday } from "../../domain/src/dates.ts";
import type { DomainState, ISODate, PostingSnapshot } from "../../domain/src/types.ts";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** At most this many calendar weeks on one store page; a longer range continues on the next page. */
export const MAX_WEEKS_PER_PAGE = 6;
/** At most this many days across the "all stores" page. */
export const MAX_GLANCE_DAYS = 31;

export type PrintOptions = {
  paper: "letter" | "tabloid";
  typeSize: "normal" | "large";
  grayscale: boolean;
  /** Two store pages on one sheet, each half height. */
  twoUp: boolean;
  /** Extra left margin for a hole punch. */
  punch: boolean;
  /** Add the "all stores at a glance" page at the front. */
  includeGlance: boolean;
};

export const DEFAULT_PRINT_OPTIONS: PrintOptions = { paper: "letter", typeSize: "large", grayscale: false, twoUp: false, punch: false, includeGlance: true };

export type PrintDay = {
  date: ISODate;
  /** Day of month. */
  day: number;
  /** "12", or "Nov 1" on the first day of a month and on the first day of the range. */
  label: string;
  /** Inside the posted range. Days of a partial week outside the range are blank. */
  inRange: boolean;
  /** Requirement was 0: the store is closed. */
  closed: boolean;
  required: number;
  initials: string[];
  /** Blank boxes to print: people still needed (required minus the initials posted). */
  open: number;
};

export type LegendEntry = { initials: string; names: string[] };

export type StorePage = {
  kind: "store";
  storeId: string;
  code: string;
  name: string;
  state: string | null;
  /** Code and name, as one heading. */
  title: string;
  /** "Revision 2, posted Oct 6, 2026" */
  revisionLine: string;
  period: string;
  weeks: PrintDay[][];
  legend: LegendEntry[];
  /** Total blank boxes on this page. */
  openTotal: number;
  /** Set when a long range continues on another page. */
  part: { n: number; of: number } | null;
};

export type GlanceRow = { storeId: string; code: string; name: string; days: PrintDay[] };
export type GlancePage = {
  kind: "glance";
  title: string;
  revisionLine: string;
  period: string;
  rows: GlanceRow[];
  /** Day columns, from the first row (or the range when there are no stores). */
  dates: { date: ISODate; label: string }[];
  legend: LegendEntry[];
  warnings: PostingSnapshot["warnings"];
  /** One plain sentence about what was open or problematic when posted. "" when nothing. */
  warningLine: string;
  part: { n: number; of: number } | null;
};

export type PrintModel = {
  revision: number;
  postedOn: ISODate;
  period: string;
  periodKey: string;
  revisionLine: string;
  filename: string;
  stores: StorePage[];
  glance: GlancePage[];
};

export type Sheet = { kind: "glance"; page: GlancePage } | { kind: "stores"; pages: [StorePage] | [StorePage, StorePage] };

// ---------- labels ----------

function parts(d: ISODate): [number, number, number] {
  return [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
}

export function longDate(d: ISODate): string {
  const [y, m, day] = parts(d);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}

function shortDate(d: ISODate): string {
  const [, m, day] = parts(d);
  return `${MONTHS[m - 1]} ${day}`;
}

function lastOfMonth(d: ISODate): ISODate {
  const [y, m] = parts(d);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

/** "October 2026" for a whole calendar month, otherwise "Oct 19 to Nov 1, 2026". */
export function periodLabel(from: ISODate, to: ISODate): string {
  const [y, m] = parts(from);
  if (from.slice(0, 7) === to.slice(0, 7) && from.slice(8) === "01" && to === lastOfMonth(from)) return `${MONTHS_LONG[m - 1]} ${y}`;
  if (from === to) return longDate(from);
  const [y2] = parts(to);
  return y === y2 ? `${shortDate(from)} to ${shortDate(to)}, ${y2}` : `${longDate(from)} to ${longDate(to)}`;
}

/** "2026-10" for a whole month, otherwise "2026-10-19_to_2026-11-01". Safe in a file name. */
export function periodKey(from: ISODate, to: ISODate): string {
  if (from.slice(0, 7) === to.slice(0, 7) && from.slice(8) === "01" && to === lastOfMonth(from)) return from.slice(0, 7);
  return from === to ? from : `${from}_to_${to}`;
}

export function pdfFileName(s: Pick<PostingSnapshot, "from" | "to" | "revision">): string {
  return `HiSchool_${periodKey(s.from, s.to)}_rev${s.revision}.pdf`;
}

export function revisionLine(s: Pick<PostingSnapshot, "revision" | "postedOn">): string {
  return `Revision ${s.revision}, posted ${longDate(s.postedOn)}`;
}

export function warningSentence(w: PostingSnapshot["warnings"]): string {
  const bits: string[] = [];
  if (w.open) bits.push(`${w.open} open ${w.open === 1 ? "shift" : "shifts"}`);
  if (w.violations) bits.push(`${w.violations} ${w.violations === 1 ? "problem" : "problems"}`);
  if (w.overrides) bits.push(`${w.overrides} accepted ${w.overrides === 1 ? "exception" : "exceptions"}`);
  if (!bits.length) return "";
  return `Posted with ${bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}` : bits[0]}.`;
}

// ---------- builders ----------

function dayCell(snapshot: PostingSnapshot, storeId: string, date: ISODate): PrintDay {
  const c = snapshot.cells[`${storeId}|${date}`];
  const required = c?.required ?? 0;
  const initials = c ? c.initials.slice() : [];
  const [, , day] = parts(date);
  const label = day === 1 || date === snapshot.from ? shortDate(date) : String(day);
  return { date, day, label, inRange: true, closed: required === 0, required, initials, open: Math.max(0, required - initials.length) };
}

function blankCell(date: ISODate): PrintDay {
  return { date, day: parts(date)[2], label: String(parts(date)[2]), inRange: false, closed: false, required: 0, initials: [], open: 0 };
}

/** Sunday-first weeks that cover from..to. Days outside the range are blank cells. */
function weeksFor(snapshot: PostingSnapshot, storeId: string): PrintDay[][] {
  const start = addDays(snapshot.from, -weekday(snapshot.from));
  const end = addDays(snapshot.to, 6 - weekday(snapshot.to));
  const days = dateRange(start, end).map((d) => (d < snapshot.from || d > snapshot.to ? blankCell(d) : dayCell(snapshot, storeId, d)));
  const weeks: PrintDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** Initials -> names. Names come from the pharmacist table as it is now; the initials come from the snapshot. */
export function legendFor(initialsUsed: Iterable<string>, state: Pick<DomainState, "pharmacists">): LegendEntry[] {
  const used = [...new Set(initialsUsed)].sort(cmp);
  const byInitials = new Map<string, string[]>();
  for (const p of Object.values(state.pharmacists)) {
    const list = byInitials.get(p.initials) ?? [];
    list.push(p.name);
    byInitials.set(p.initials, list);
  }
  return used.map((initials) => ({ initials, names: (byInitials.get(initials) ?? []).slice().sort(cmp) }));
}

/** Stores that belong on the packet: any with a posted cell, plus every store active during the range. */
function storesFor(snapshot: PostingSnapshot, state: Pick<DomainState, "stores">): string[] {
  const ids = new Set<string>();
  for (const k of Object.keys(snapshot.cells)) ids.add(k.split("|")[0]!);
  for (const s of Object.values(state.stores)) {
    const startsBeforeEnd = !s.activeFrom || s.activeFrom <= snapshot.to;
    const endsAfterStart = !s.inactiveFrom || s.inactiveFrom > snapshot.from;
    if (startsBeforeEnd && endsAfterStart) ids.add(s.id);
  }
  return [...ids].filter((id) => state.stores[id]).sort((a, b) => cmp(state.stores[a]!.code, state.stores[b]!.code) || cmp(a, b));
}

export function snapshotToPrintModel(snapshot: PostingSnapshot, state: Pick<DomainState, "stores" | "pharmacists">): PrintModel {
  const period = periodLabel(snapshot.from, snapshot.to);
  const rev = revisionLine(snapshot);
  const ids = storesFor(snapshot, state);

  const stores: StorePage[] = [];
  for (const id of ids) {
    const st = state.stores[id]!;
    const weeks = weeksFor(snapshot, id);
    const chunks: PrintDay[][][] = [];
    for (let i = 0; i < weeks.length; i += MAX_WEEKS_PER_PAGE) chunks.push(weeks.slice(i, i + MAX_WEEKS_PER_PAGE));
    chunks.forEach((chunk, i) => {
      const cells = chunk.flat().filter((d) => d.inRange);
      stores.push({
        kind: "store", storeId: id, code: st.code, name: st.name, state: st.state,
        title: st.name && st.name !== st.code ? `${st.code}  ${st.name}` : st.code,
        revisionLine: rev, period, weeks: chunk,
        legend: legendFor(cells.flatMap((d) => d.initials), state),
        openTotal: cells.reduce((n, d) => n + d.open, 0),
        part: chunks.length > 1 ? { n: i + 1, of: chunks.length } : null,
      });
    });
  }

  const allDates = dateRange(snapshot.from, snapshot.to);
  const glance: GlancePage[] = [];
  const nParts = Math.max(1, Math.ceil(allDates.length / MAX_GLANCE_DAYS));
  for (let p = 0; p < nParts; p++) {
    const dates = allDates.slice(p * MAX_GLANCE_DAYS, (p + 1) * MAX_GLANCE_DAYS);
    const rows: GlanceRow[] = ids.map((id) => ({ storeId: id, code: state.stores[id]!.code, name: state.stores[id]!.name, days: dates.map((d) => dayCell(snapshot, id, d)) }));
    glance.push({
      kind: "glance", title: "All stores", revisionLine: rev, period, rows,
      dates: dates.map((d) => ({ date: d, label: parts(d)[2] === 1 || d === snapshot.from ? shortDate(d) : String(parts(d)[2]) })),
      legend: legendFor(rows.flatMap((r) => r.days.flatMap((d) => d.initials)), state),
      warnings: snapshot.warnings, warningLine: warningSentence(snapshot.warnings),
      part: nParts > 1 ? { n: p + 1, of: nParts } : null,
    });
  }

  return { revision: snapshot.revision, postedOn: snapshot.postedOn, period, periodKey: periodKey(snapshot.from, snapshot.to), revisionLine: rev, filename: pdfFileName(snapshot), stores, glance };
}

/** The sheets of paper, in order. Two-up puts two store pages on each sheet. */
export function paginate(model: PrintModel, opts: Pick<PrintOptions, "twoUp" | "includeGlance">): Sheet[] {
  const sheets: Sheet[] = [];
  if (opts.includeGlance) for (const g of model.glance) sheets.push({ kind: "glance", page: g });
  if (opts.twoUp) {
    for (let i = 0; i < model.stores.length; i += 2) {
      const a = model.stores[i]!;
      const b = model.stores[i + 1];
      sheets.push({ kind: "stores", pages: b ? [a, b] : [a] });
    }
  } else {
    for (const s of model.stores) sheets.push({ kind: "stores", pages: [s] });
  }
  return sheets;
}

export function sheetCount(model: PrintModel, opts: Pick<PrintOptions, "twoUp" | "includeGlance">): number {
  return paginate(model, opts).length;
}

/** Legend as one line of text per entry: "JD Jane Doe". */
export function legendText(l: LegendEntry): string {
  return l.names.length ? `${l.initials} ${l.names.join(" / ")}` : l.initials;
}

/**
 * How initials and open boxes stack inside a cell of height `h` inches: one per line, or two per line when the cell is short.
 * Shared by the PDF and the on-screen sheet so they agree. Font in points.
 */
export function itemLayout(n: number, h: number, maxFont: number, minLine: number): { perLine: 1 | 2; lines: number; lineH: number; font: number } {
  const cap = (maxFont / 72) * 1.55;
  let perLine: 1 | 2 = 1;
  let lines = Math.max(n, 1);
  let lineH = Math.min(h / lines, cap);
  if (lineH < minLine && n > 1) {
    perLine = 2;
    lines = Math.ceil(n / 2);
    lineH = Math.min(h / lines, cap);
  }
  return { perLine, lines, lineH, font: Math.max(4, Math.min(maxFont, lineH * 72 * 0.74)) };
}
