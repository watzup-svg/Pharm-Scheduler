// Pure helpers for the Overview screen. No React, no store, no domain calls (types only), so a plain node test can run them.
import type { ISODate } from "@domain";

// ---------- months ----------
const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "2026-10" for the month the Overview talks about: the as-of month while it is inside the window, otherwise the window's first month. */
export function overviewMonth(asOf: ISODate, win: { from: ISODate; to: ISODate }): string {
  return (asOf >= win.from && asOf <= win.to ? asOf : win.from).slice(0, 7);
}
export function monthBounds(ym: string): { from: ISODate; to: ISODate } {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return { from: `${ym}-01`, to: `${ym}-${pad(lastDayOf(y, m))}` };
}
export function nextMonthOf(ym: string): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}
export function prevMonthOf(ym: string): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (ym: string): string => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

/** Whether the "Start next month" card is shown, and whether it is the main thing: past the middle of the month it leads. */
export function nextMonthCard(asOf: ISODate, ym: string, nextMonthShifts: number): { show: boolean; lead: boolean } {
  const inMonth = asOf.slice(0, 7) === ym;
  const pastMid = (inMonth && Number(asOf.slice(8, 10)) >= 15) || asOf.slice(0, 7) > ym;
  const empty = nextMonthShifts === 0;
  return { show: pastMid || empty, lead: pastMid && empty };
}

// ---------- thin-month ticks ----------
export type TickState = "ok" | "open" | "break" | "closed";
/** One day of one store. A broken rule outranks an open shift; a day with nobody needed and nobody placed is closed. */
export function tickState(c: { required: number; open: number; hasAssignments: boolean; breaks: boolean } | undefined): TickState {
  if (!c) return "closed";
  if (c.breaks) return "break";
  if (c.open > 0) return "open";
  if (c.required === 0 && !c.hasAssignments) return "closed";
  return "ok";
}
export const TICK_WORD: Record<TickState, string> = { ok: "covered", open: "needs cover", break: "rule broken", closed: "closed" };

// ---------- problems ----------
export type IssueLike = { kind: "open" | "violation" | "warning"; storeId: string; date: ISODate; pharmacistId?: string | undefined; ruleId?: string | undefined; text: string };

/** The cell key the wall uses. */
export const cellKey = (storeId: string, date: ISODate) => `${storeId}|${date}`;

export type Problem = {
  key: string;
  kind: "open" | "violation";
  date: ISODate;
  /** Stores involved, first one is where the wall opens. One person at two stores is one problem with two stores. */
  storeIds: string[];
  pharmacistId?: string;
  ruleId?: string;
  text: string;
};

/** Serious issues only (open shifts and rule breaks), merged so one person at two stores is one problem. Date order is kept. */
export function groupProblems(issues: IssueLike[]): Problem[] {
  const out: Problem[] = [];
  const byKey = new Map<string, Problem>();
  for (const i of issues) {
    if (i.kind === "warning") continue;
    const key = i.kind === "open" ? `open|${i.storeId}|${i.date}` : `v|${i.pharmacistId ?? ""}|${i.date}|${i.ruleId ?? ""}`;
    const hit = byKey.get(key);
    if (hit) { if (!hit.storeIds.includes(i.storeId)) hit.storeIds.push(i.storeId); continue; }
    const p: Problem = { key, kind: i.kind, date: i.date, storeIds: [i.storeId], text: i.text, ...(i.pharmacistId ? { pharmacistId: i.pharmacistId } : {}), ...(i.ruleId ? { ruleId: i.ruleId } : {}) };
    byKey.set(key, p);
    out.push(p);
  }
  return out;
}

export type MarkCount = { problems: number; cells: number };
/**
 * How many cells carry each kind of mark. A problem that touches two stores (one person booked twice) is one problem and marks two cells.
 * `markOf` names the mark kind of a problem (open shifts are "open"; a broken rule maps to its mark).
 */
export function markCounts(problems: Problem[], markOf: (p: Problem) => string): { byKind: Record<string, MarkCount>; problems: number; cells: number } {
  const byKind: Record<string, MarkCount> = {};
  const all = new Set<string>();
  const perKind = new Map<string, Set<string>>();
  for (const p of problems) {
    const k = markOf(p);
    const set = perKind.get(k) ?? perKind.set(k, new Set()).get(k)!;
    const c = (byKind[k] ??= { problems: 0, cells: 0 });
    c.problems += 1;
    for (const s of p.storeIds) { set.add(cellKey(s, p.date)); all.add(cellKey(s, p.date)); }
  }
  for (const [k, set] of perKind) byKind[k]!.cells = set.size;
  return { byKind, problems: problems.length, cells: all.size };
}

/** The next `n` problems on or after `from`, in date order. */
export function nextProblems(problems: Problem[], from: ISODate, n: number): Problem[] {
  return problems.filter((p) => p.date >= from).slice(0, n);
}

// ---------- the month checklist ----------
export type Where =
  | { to: "setup"; tab: "checks" | "stores" | "pharmacists" }
  | { to: "timeoff" }
  | { to: "problem"; storeId?: string; date?: ISODate }
  | { to: "print" }
  | { to: "tell" }
  | { to: "save" };
export type ChecklistItem = { id: string; label: string; detail: string; done: boolean; where: Where };

export type ChecklistFacts = {
  licencesMissing: number;
  driveTimesMissing: number;
  waiting: number;
  openShifts: number;
  ruleBreaks: number;
  firstProblem: { storeId: string; date: ISODate } | null;
  /** Latest posting that overlaps the month, or null when none. */
  postedRevision: number | null;
  /** Days that differ from the latest posting. */
  changedDays: number;
  /** People with a changed schedule they have not been told about. */
  toTell: number;
  fileSaved: boolean;
  fileDetail: string;
};

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function buildChecklist(f: ChecklistFacts): ChecklistItem[] {
  const setupGaps = f.licencesMissing + f.driveTimesMissing;
  const setupParts = [f.licencesMissing ? `${n(f.licencesMissing, "licence")} missing` : "", f.driveTimesMissing ? `${n(f.driveTimesMissing, "drive time")} missing` : ""].filter(Boolean).join(", ");
  const postedDone = f.postedRevision !== null && f.changedDays === 0 && f.toTell === 0;
  return [
    { id: "setup", label: "Licences and drive times", detail: setupGaps ? setupParts : "All recorded", done: setupGaps === 0, where: { to: "setup", tab: "checks" } },
    { id: "requests", label: "Time-off requests", detail: f.waiting ? `${f.waiting} waiting` : "None waiting", done: f.waiting === 0, where: { to: "timeoff" } },
    { id: "cover", label: "Every shift covered", detail: f.openShifts ? `${n(f.openShifts, "shift")} still open` : "All covered", done: f.openShifts === 0, where: { to: "problem", ...(f.firstProblem ?? {}) } },
    { id: "rules", label: "No rule breaks", detail: f.ruleBreaks ? n(f.ruleBreaks, "break") : "None", done: f.ruleBreaks === 0, where: { to: "problem", ...(f.firstProblem ?? {}) } },
    {
      id: "posted", label: "Posted and told",
      detail: f.postedRevision === null ? "Not posted yet" : f.changedDays > 0 || f.toTell > 0 ? `Changed since posting: tell ${n(f.toTell, "person", "people")}` : `Revision ${f.postedRevision}`,
      done: postedDone, where: f.postedRevision !== null && f.toTell > 0 ? { to: "tell" } : { to: "print" },
    },
    { id: "saved", label: "Changes saved", detail: f.fileDetail, done: f.fileSaved, where: { to: "save" } },
  ];
}
