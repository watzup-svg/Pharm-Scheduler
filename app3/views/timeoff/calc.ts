// The Time off page's thinking, with no screen in it: how heavy each day is, which day is worst, what approving or adding a record would leave
// uncovered, and who could be called, in the words the old scheduler used. Pure (domain and copy.ts only) so a plain Node test can run it.
import {
  addDays, applyScratch, choicesFor, dateRange, evalDelta, evaluate, isValidDate, makeCtx, weekday,
  type Assignment, type Choice, type DomainState, type Edit, type Evaluation, type ISODate, type UnavailStatus, type UnavailType, type Unavailability,
} from "../../../domain/src/index.ts";
import { fmtDate, plural } from "../../copy.ts";

export type Cell = { storeId: string; date: ISODate };

// ---------------------------------------------------------------- holidays (offline)
const nth = (ym: string, dow: number, n: number): ISODate => {
  const first = `${ym}-01`;
  return addDays(first, ((dow - weekday(first) + 7) % 7) + 7 * (n - 1));
};
const lastOf = (ym: string, dow: number): ISODate => {
  let d = nth(ym, dow, 4);
  while (addDays(d, 7).slice(0, 7) === ym) d = addDays(d, 7);
  return d;
};

/** The US federal holidays of one year, by date. The app has no holiday table of its own, so the calendar carries these offline. */
export function usHolidays(year: number): Map<ISODate, string> {
  const y = String(year).padStart(4, "0");
  const m = new Map<ISODate, string>();
  m.set(`${y}-01-01`, "New Year's Day");
  m.set(nth(`${y}-01`, 1, 3), "Martin Luther King Jr. Day");
  m.set(nth(`${y}-02`, 1, 3), "Presidents' Day");
  m.set(lastOf(`${y}-05`, 1), "Memorial Day");
  m.set(`${y}-06-19`, "Juneteenth");
  m.set(`${y}-07-04`, "Independence Day");
  m.set(nth(`${y}-09`, 1, 1), "Labor Day");
  m.set(nth(`${y}-10`, 1, 2), "Columbus Day");
  m.set(`${y}-11-11`, "Veterans Day");
  m.set(nth(`${y}-11`, 4, 4), "Thanksgiving");
  m.set(`${y}-12-25`, "Christmas Day");
  return m;
}
const holidayCache = new Map<number, Map<ISODate, string>>();
export function holidayOn(date: ISODate): string | null {
  const y = Number(date.slice(0, 4));
  let t = holidayCache.get(y);
  if (!t) holidayCache.set(y, (t = usHolidays(y)));
  return t.get(date) ?? null;
}

// ---------------------------------------------------------------- how heavy each day is
export type ShortCell = {
  storeId: string; date: ISODate;
  /** Nobody counts there at all (as opposed to fewer than the store needs). */
  empty: boolean; open: number;
  /** Who is named there but is off (so does not count). */
  offIds: string[];
};
export type DayLoad = {
  date: ISODate;
  /** People with approved time off that day (a store-scoped "turned down" record is not time off). */
  off: string[];
  /** People with a request waiting that day. */
  waiting: string[];
  /** Stores left short or empty because someone named there is off. */
  short: ShortCell[];
  /** Stores a date override closes (count 0): holidays and the like. */
  closed: string[];
  holiday: string | null;
  /** How much trouble: an empty store weighs three, a short one one. */
  score: number;
};

const counts = (u: Unavailability) => u.status === "Approved" || u.status === "Actual";

/** One row per day in [from, to]. `ev` must be evaluated with a range that covers it (and without waiting requests, so only decided time off counts). */
export function dayLoads(state: DomainState, ev: Evaluation, from: ISODate, to: ISODate): DayLoad[] {
  const dates = dateRange(from, to);
  const rows = new Map<ISODate, DayLoad>(dates.map((d) => [d, { date: d, off: [], waiting: [], short: [], closed: [], holiday: holidayOn(d), score: 0 }]));
  for (const u of Object.values(state.unavailability)) {
    if (u.scopeStoreId || u.last < from || u.first > to) continue;
    const list = counts(u) ? "off" : u.status === "Requested" ? "waiting" : null;
    if (!list) continue;
    for (let d = u.first < from ? from : u.first; d <= u.last && d <= to; d = addDays(d, 1)) {
      const row = rows.get(d)!;
      if (!row[list].includes(u.pharmacistId)) row[list].push(u.pharmacistId);
    }
  }
  const offIn = new Map<string, string[]>();
  for (const a of Object.values(state.assignments)) {
    if (a.date < from || a.date > to) continue;
    const r = ev.assignments[a.id]?.results.find((x) => x.ruleId === "availability");
    if (!r || r.verdict !== "Fail" || r.overridden) continue;
    const k = `${a.storeId}|${a.date}`;
    (offIn.get(k) ?? offIn.set(k, []).get(k)!).push(a.pharmacistId);
  }
  for (const [k, ids] of offIn) {
    const c = ev.cells[k];
    if (!c || c.open <= 0) continue;
    const row = rows.get(c.date)!;
    row.short.push({ storeId: c.storeId, date: c.date, empty: c.required > 0 && c.covered === 0, open: c.open, offIds: ids.sort() });
  }
  for (const o of Object.values(state.dateOverrides)) if (o.count === 0 && o.date >= from && o.date <= to) rows.get(o.date)!.closed.push(o.storeId);
  for (const row of rows.values()) {
    row.off.sort(); row.waiting.sort(); row.closed.sort();
    row.short.sort((a, b) => (a.storeId < b.storeId ? -1 : 1));
    row.score = row.short.reduce((n, s) => n + (s.empty ? 3 : 1), 0);
  }
  return dates.map((d) => rows.get(d)!);
}

/** The day with the most trouble: highest score, then most people off, then the earliest. Null when no store is left short. */
export function troubleDay(loads: DayLoad[]): DayLoad | null {
  let best: DayLoad | null = null;
  for (const l of loads) if (l.score > 0 && (!best || l.score > best.score || (l.score === best.score && l.off.length > best.off.length))) best = l;
  return best;
}

// ---------------------------------------------------------------- what approving would open
/**
 * The cells that would newly be open if each of these records counted (by record id). Nothing is committed.
 * A record can only change its own person's assignments inside its dates, so each is judged with evalDelta against one shared evaluation
 * (`base`: evaluated over a range that covers every record, without waiting requests).
 */
export function cellsOpenedIfApproved(state: DomainState, records: Unavailability[], asOf: ISODate, base: Evaluation): Map<string, Cell[]> {
  const out = new Map<string, Cell[]>();
  if (!records.length) return out;
  const ctx = makeCtx(state);
  const ofPh = new Map<string, Assignment[]>();
  const byDate = new Map<string, Assignment[]>();
  for (const a of Object.values(state.assignments)) {
    (ofPh.get(a.pharmacistId) ?? ofPh.set(a.pharmacistId, []).get(a.pharmacistId)!).push(a);
    (byDate.get(a.date) ?? byDate.set(a.date, []).get(a.date)!).push(a);
  }
  for (const u of records) {
    // The edit is refused (and counts as nothing) when the record's dates are not valid.
    if (!isValidDate(u.first) || !isValidDate(u.last) || u.last < u.first || (u.type === "Turned-down" && u.first !== u.last)) { out.set(u.id, []); continue; }
    const list = ofPh.get(u.pharmacistId) ?? [];
    const inRange = (a: Assignment) => a.date >= u.first && a.date <= u.last;
    const keys = [...new Set(list.filter(inRange).map((a) => `${a.storeId}|${a.date}`))];
    if (!keys.length) { out.set(u.id, []); continue; }
    const unavByP = new Map(ctx.unavByP);
    unavByP.set(u.pharmacistId, [...(ctx.unavByP.get(u.pharmacistId) ?? []).filter((x) => x.id !== u.id), { id: u.id, first: u.first, last: u.last, ...(u.scopeStoreId ? { scope: u.scopeStoreId } : {}) }]);
    const ev = evalDelta(state, { ...ctx, unavByP }, base, [u.pharmacistId], keys, { ofPharmacist: () => list, onDate: (d) => byDate.get(d) ?? [] }, inRange);
    const cells: Cell[] = [];
    for (const k of keys) {
      const date = k.slice(k.indexOf("|") + 1);
      if (date >= asOf && (ev.cells[k]?.open ?? 0) > (base.cells[k]?.open ?? 0)) cells.push({ storeId: k.slice(0, k.indexOf("|")), date });
    }
    cells.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0));
    out.set(u.id, cells);
  }
  return out;
}

/** The cells a record that is not saved yet would leave short, by trying it on a copy. Null when the schedule would refuse the record. */
export function previewNewRecord(
  state: DomainState, asOf: ISODate,
  r: { pharmacistId: string; first: ISODate; last: ISODate; status: UnavailStatus; type: UnavailType },
): { cells: Cell[]; shifts: number; after: DomainState } | null {
  if (!isValidDate(r.first) || !isValidDate(r.last) || r.last < r.first) return null;
  // A waiting record is tried as if it were approved: that is what "if approved" means, and it keeps other people's waiting requests out of the answer.
  const edit: Edit = { t: "unavail.add", pharmacistId: r.pharmacistId, first: r.first, last: r.last, status: r.status === "Requested" ? "Approved" : r.status, type: r.type };
  const after = applyScratch(state, [edit]);
  if ("refused" in after) return null;
  const range = { from: r.first, to: r.last };
  const was = evaluate(state, asOf, { range });
  const now = evaluate(after, asOf, { range });
  const cells: Cell[] = [];
  let shifts = 0;
  for (const a of Object.values(state.assignments)) if (a.pharmacistId === r.pharmacistId && a.date >= r.first && a.date <= r.last && a.date >= asOf) shifts++;
  for (const c of Object.values(now.cells)) if (c.date >= asOf && c.open > (was.cells[`${c.storeId}|${c.date}`]?.open ?? 0)) cells.push({ storeId: c.storeId, date: c.date });
  cells.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.storeId < b.storeId ? -1 : 1));
  return { cells, shifts, after };
}

/**
 * Which of these waiting requests can be approved together without leaving any store short, in the order given.
 * Each is tried on top of the ones already taken, so two requests that together empty a store are not both chosen.
 */
export function safeToApprove(state: DomainState, records: Unavailability[], asOf: ISODate): string[] {
  const out: string[] = [];
  let cur = state;
  for (const u of records) {
    if (u.status !== "Requested") continue;
    const base = evaluate(cur, asOf, { range: { from: u.first, to: u.last } });
    const live = cur.unavailability[u.id];
    if (!live || cellsOpenedIfApproved(cur, [live], asOf, base).get(u.id)?.length !== 0) continue;
    const next = applyScratch(cur, [{ t: "unavail.update", id: u.id, patch: { status: "Approved" } }]);
    if ("refused" in next) continue;
    out.push(u.id);
    cur = next;
  }
  return out;
}

// ---------------------------------------------------------------- who could be called
export type Caller = {
  pharmacistId: string;
  choice: Choice;
  /** Plain reasons in favour: "Free that day", "Close by (20 min)", "Was off yesterday". */
  good: string[];
  /** Plain cautions: "Would be day 6 in a row", "Long drive (95 min)". */
  caution: string[];
  edit: Edit;
};

/** How many days in a row this person would be working if they worked `date` (the unbroken days before it, plus the day). */
export function runDay(state: DomainState, pharmacistId: string, date: ISODate): number {
  const days = new Set<string>();
  for (const a of Object.values(state.assignments)) if (a.pharmacistId === pharmacistId) days.add(a.date);
  let n = 1;
  for (let d = addDays(date, -1); days.has(d); d = addDays(d, -1)) n += 1;
  return n;
}

const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

/** The reason words for one candidate, as the old suggestions said them. */
export function callerWords(state: DomainState, c: Choice, storeId: string, date: ISODate): { good: string[]; caution: string[] } {
  const code = (id: string) => state.stores[id]?.code ?? id;
  const good: string[] = [];
  const caution: string[] = [];
  const base = state.pharmacists[c.pharmacistId]?.baseStoreId ?? null;
  if (c.currently === "off") good.push("Free that day");
  else {
    const here = c.currently.split(",").map(code).join(" and ");
    if (c.leavesShort) caution.push(`At ${here} that day, would leave it short`);
    else good.push(`At ${here} that day`);
  }
  if (base === storeId) good.push("Home store");
  else if (c.travelMinutes !== null && c.travelMinutes > 0 && c.travelMinutes <= 30) good.push(`Close by (${c.travelMinutes} min)`);
  const yesterday = addDays(date, -1);
  const workedYesterday = Object.values(state.assignments).some((a) => a.pharmacistId === c.pharmacistId && a.date === yesterday);
  if (!workedYesterday) good.push("Was off yesterday");
  if (c.warns.includes("consecutive-days")) caution.push(`Would be ${ordinal(runDay(state, c.pharmacistId, date))} day in a row`);
  if (c.warns.includes("travel-hard")) caution.push(`Very long drive (${c.travelMinutes ?? "?"} min)`);
  else if (c.warns.includes("travel-soft")) caution.push(`Long drive (${c.travelMinutes ?? "?"} min)`);
  if (c.unknown.some((x) => x.startsWith("travel"))) caution.push("Drive time not known");
  if (c.unknown.includes("licensing")) caution.push("Licensing not recorded");
  const asked = Object.values(state.unavailability).some((u) => u.pharmacistId === c.pharmacistId && u.status === "Requested" && u.first <= date && date <= u.last && (!u.scopeStoreId || u.scopeStoreId === storeId));
  if (asked) caution.push("Asked for this day off");
  return { good, caution };
}

/** Everyone who would count at this store on this date, best first (the domain's ranking), each with reason words and the edit that would place them. */
export function callers(state: DomainState, storeId: string, date: ISODate, asOf: ISODate, exclude: string[] = []): Caller[] {
  const out: Caller[] = [];
  for (const c of choicesFor(state, storeId, date, asOf)) {
    if (!c.counts || c.unavailable || exclude.includes(c.pharmacistId)) continue;
    const p = state.pharmacists[c.pharmacistId];
    if (!p || (p.inactiveFrom !== undefined && p.inactiveFrom <= date) || (p.activeFrom !== undefined && p.activeFrom > date)) continue;
    const w = callerWords(state, c, storeId, date);
    const edit: Edit = c.action === "move" && c.assignmentId ? { t: "move", assignmentId: c.assignmentId, toStoreId: storeId } : { t: "place", storeId, pharmacistId: c.pharmacistId, date };
    out.push({ pharmacistId: c.pharmacistId, choice: c, ...w, edit });
  }
  return out;
}

// ---------------------------------------------------------------- words
const coverWords = (n: number) => (n === 0 ? "nobody is free to cover" : `${plural(n, "person", "people")} could cover`);

/**
 * "Approving opens WIN on Tue Oct 13; 2 people could cover." `covers` is how many could cover the first cell.
 * `verb` is "Approving" on a waiting request and "Adding this" in the Add drawer.
 */
export function consequenceText(code: (storeId: string) => string, cells: Cell[], covers: number, verb = "Approving"): string {
  if (!cells.length) return `${verb} leaves every store covered.`;
  const first = cells[0]!;
  const more = cells.length - 1;
  const head = `${verb} opens ${code(first.storeId)} on ${fmtDate(first.date)}`;
  return more > 0 ? `${head} and ${more} more. ${coverWords(covers)[0]!.toUpperCase()}${coverWords(covers).slice(1)} the first.` : `${head}; ${coverWords(covers)}.`;
}

/** How a day reads in one line, for the day's hover note and screen-reader name. */
export function dayWords(load: DayLoad, name: (id: string) => string, code: (storeId: string) => string): string[] {
  const out = [fmtDate(load.date) + (load.holiday ? `, ${load.holiday}` : "")];
  out.push(load.off.length ? `${load.off.length} off: ${load.off.map(name).join(", ")}` : "Nobody off");
  if (load.waiting.length) out.push(`${load.waiting.length} waiting: ${load.waiting.map(name).join(", ")}`);
  const empty = load.short.filter((s) => s.empty).map((s) => code(s.storeId));
  const short = load.short.filter((s) => !s.empty).map((s) => code(s.storeId));
  if (empty.length) out.push(`Nobody at ${empty.join(", ")}`);
  if (short.length) out.push(`${short.join(", ")} short`);
  if (load.closed.length) out.push(`Closed: ${load.closed.map(code).join(", ")}`);
  return out;
}
