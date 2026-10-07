// Pure helpers for the Setup tabs: holidays worked out offline, a person's week and month, licence state, a store's month line,
// missing drive times, the pattern preview, and plain-text / CSV lists. No React, no clock: every date comes in as an argument.
// Imports are relative (not "@domain") so the tests run with `node --experimental-strip-types --test` (domain/test/setup-lib.test.ts).
import { addDays, cmp, dateRange, toDayNumber, weekday } from "../../../domain/src/dates.ts";
import { expectedOn, standingMatches } from "../../../domain/src/patterns.ts";
import type { Edit } from "../../../domain/src/api-types.ts";
import type { Assignment, DomainState, Evaluation, ISODate, Pharmacist, Standing, StateCode, Store } from "../../../domain/src/types.ts";
import { csvLine, oneLine } from "../../exportText.ts";

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Monday first, the order the DM reads a week in. */
export const MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): ISODate => `${y}-${pad2(m)}-${pad2(d)}`;

/** "Tue Oct 6". */
export function dayLabel(d: ISODate): string {
  return `${DAY_SHORT[weekday(d)]} ${MONTH_SHORT[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
}
/** "Oct 6". */
export function monthDay(d: ISODate): string {
  return `${MONTH_SHORT[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
}
/** "Oct 6, 2027" for a licence date. */
export function fullDate(d: ISODate): string {
  return `${monthDay(d)}, ${d.slice(0, 4)}`;
}
/** "Oct 5 to 11", or "Oct 28 to Nov 3" when the week crosses a month. */
export function weekLabel(monday: ISODate): string {
  const end = addDays(monday, 6);
  return `${monthDay(monday)} to ${monday.slice(5, 7) === end.slice(5, 7) ? Number(end.slice(8, 10)) : monthDay(end)}`;
}
/** The Monday of the week holding `d`. */
export function mondayOf(d: ISODate): ISODate {
  return addDays(d, -((weekday(d) + 6) % 7));
}
/** Month ("YYYY-MM") of the week that starts on `monday`: the month of its Thursday, so a week belongs to one month. */
export function monthOfWeek(monday: ISODate): string {
  return addDays(monday, 3).slice(0, 7);
}

// ---------------------------------------------------------------- US holidays (offline)

export type UsHoliday = {
  key: string;
  label: string;
  /** The day itself. */
  date: ISODate;
  /** When the day itself falls on a weekend, the weekday it is observed (Saturday -> Friday, Sunday -> Monday). */
  observed?: ISODate;
  /** True for the ones that move (Monday or Thursday rules); false for fixed month-and-day holidays. */
  floating: boolean;
};

/** The date of the nth (1-based) `wd` (0 = Sunday) of a month. */
export function nthWeekdayOf(year: number, month: number, wd: number, n: number): ISODate {
  const first = weekday(iso(year, month, 1));
  return iso(year, month, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
}
/** The date of the last `wd` of a month. */
export function lastWeekdayOf(year: number, month: number, wd: number): ISODate {
  const next = month === 12 ? iso(year + 1, 1, 1) : iso(year, month + 1, 1);
  const last = addDays(next, -1);
  return addDays(last, -((weekday(last) - wd + 7) % 7));
}
/** The federal "observed" day for a fixed holiday: Saturday -> Friday, Sunday -> Monday; otherwise none. */
export function observedFor(date: ISODate): ISODate | undefined {
  const w = weekday(date);
  return w === 6 ? addDays(date, -1) : w === 0 ? addDays(date, 1) : undefined;
}

/** The common U.S. holidays for a year, in date order. Worked out here from the calendar; nothing is looked up online. */
export function usHolidays(year: number): UsHoliday[] {
  const fixed = (month: number, day: number, key: string, label: string): UsHoliday => {
    const date = iso(year, month, day);
    const observed = observedFor(date);
    return { key, label, date, ...(observed ? { observed } : {}), floating: false };
  };
  const moving = (date: ISODate, key: string, label: string): UsHoliday => ({ key, label, date, floating: true });
  return [
    fixed(1, 1, "new-year", "New Year's Day"),
    moving(nthWeekdayOf(year, 1, 1, 3), "mlk", "Martin Luther King Jr. Day"),
    moving(nthWeekdayOf(year, 2, 1, 3), "presidents", "Presidents' Day"),
    moving(lastWeekdayOf(year, 5, 1), "memorial", "Memorial Day"),
    fixed(6, 19, "juneteenth", "Juneteenth"),
    fixed(7, 4, "independence", "Independence Day"),
    moving(nthWeekdayOf(year, 9, 1, 1), "labor", "Labor Day"),
    moving(nthWeekdayOf(year, 10, 1, 2), "columbus", "Columbus Day"),
    fixed(11, 11, "veterans", "Veterans Day"),
    moving(nthWeekdayOf(year, 11, 4, 4), "thanksgiving", "Thanksgiving"),
    fixed(12, 25, "christmas", "Christmas Day"),
  ].sort((a, b) => cmp(a.date, b.date));
}

// ---------------------------------------------------------------- stores: weekly need and a day's setting

export const storeActiveOn = (s: Store, date: ISODate): boolean => (s.activeFrom === undefined || s.activeFrom <= date) && (s.inactiveFrom === undefined || s.inactiveFrom > date);
export const pharmacistActiveOn = (p: Pharmacist, date: ISODate): boolean => (p.activeFrom === undefined || p.activeFrom <= date) && (p.inactiveFrom === undefined || p.inactiveFrom > date);

/** The weekly need in force on a date (ignores one-off date changes). */
export function weeklyNeed(state: DomainState, storeId: string, wd: number, date: ISODate): number {
  let n = 0;
  let best = "";
  for (const r of Object.values(state.requirements)) {
    if (r.storeId === storeId && r.weekday === wd && r.effectiveFrom <= date && r.effectiveFrom >= best) { n = r.count; best = r.effectiveFrom; }
  }
  return n;
}

export function storesByCode(state: DomainState): Store[] {
  return Object.values(state.stores).sort((a, b) => cmp(a.code.toUpperCase(), b.code.toUpperCase()) || cmp(a.id, b.id));
}
export function pharmacistsByName(state: DomainState): Pharmacist[] {
  return Object.values(state.pharmacists).sort((a, b) => cmp(a.name.toUpperCase(), b.name.toUpperCase()) || cmp(a.id, b.id));
}

/** How one store stands on one date, for the holiday lists. */
export type DayStatus = {
  storeId: string;
  /** closed: a date change of 0. reduced: a date change above 0. usual: no date change, open. shut: no date change and closed that weekday anyway. */
  kind: "closed" | "reduced" | "usual" | "shut";
  /** The need that day. */
  count: number;
  /** The weekly need that day without any date change. */
  usual: number;
  /** The date change's note, if there is one. */
  note: string | null;
};

/** Every store active on the date, with how the date stands for it. Code order. */
export function dayStatuses(state: DomainState, date: ISODate): DayStatus[] {
  const out: DayStatus[] = [];
  for (const s of storesByCode(state)) {
    if (!storeActiveOn(s, date)) continue;
    const usual = weeklyNeed(state, s.id, weekday(date), date);
    const o = state.dateOverrides[`${s.id}|${date}`];
    if (o) out.push({ storeId: s.id, kind: o.count === 0 ? "closed" : "reduced", count: o.count, usual, note: o.note || null });
    else out.push({ storeId: s.id, kind: usual === 0 ? "shut" : "usual", count: usual, usual, note: null });
  }
  return out;
}

/** What to do with one store on a holiday. "usual" removes the date change. */
export type HolidaySetting = { t: "close" } | { t: "need"; n: number } | { t: "usual" };

export function holidayEdit(state: DomainState, storeId: string, date: ISODate, label: string, setting: HolidaySetting): Edit | null {
  const has = !!state.dateOverrides[`${storeId}|${date}`];
  if (setting.t === "usual") return has ? { t: "dateOverride.clear", storeId, date } : null;
  const count = setting.t === "close" ? 0 : setting.n;
  const cur = state.dateOverrides[`${storeId}|${date}`];
  if (cur && cur.count === count && cur.note === label) return null;
  return { t: "dateOverride.set", storeId, date, count, note: label };
}

/**
 * The toggle on a holiday row. If every store is already closed that day, it reopens the ones this holiday closed (date change of 0
 * with this holiday's name); otherwise it closes every store that is not closed yet. Stores that are shut that weekday anyway are left alone.
 */
export function holidayToggle(state: DomainState, date: ISODate, label: string): { edits: Edit[]; action: "close" | "reopen"; stores: string[] } {
  const rows = dayStatuses(state, date);
  const allClosed = rows.length > 0 && rows.every((r) => r.kind === "closed" || r.kind === "shut");
  if (allClosed) {
    const mine = rows.filter((r) => r.kind === "closed" && r.note === label);
    return { edits: mine.map((r) => ({ t: "dateOverride.clear" as const, storeId: r.storeId, date })), action: "reopen", stores: mine.map((r) => r.storeId) };
  }
  const todo = rows.filter((r) => r.kind === "usual" || r.kind === "reduced");
  return { edits: todo.map((r) => ({ t: "dateOverride.set" as const, storeId: r.storeId, date, count: 0, note: label })), action: "close", stores: todo.map((r) => r.storeId) };
}

/** One word for a holiday row: how many stores it closes. */
export function holidaySummary(rows: DayStatus[]): { closed: number; reduced: number; shut: number; total: number } {
  return {
    closed: rows.filter((r) => r.kind === "closed").length,
    reduced: rows.filter((r) => r.kind === "reduced").length,
    shut: rows.filter((r) => r.kind === "shut").length,
    total: rows.length,
  };
}

// ---------------------------------------------------------------- people: a week, a month, licences, patterns

export type DayMark = "home" | "cover" | "off" | "waiting" | "double" | "none";
export type PersonDay = {
  date: ISODate;
  mark: DayMark;
  /** Store codes they are placed at that day. */
  at: string[];
  /** Placed on a day they have approved time off. */
  placedWhileOff: boolean;
};

/** Assignments by pharmacist, then date. Build once per state. */
export type AssignmentIndex = Map<string, Map<ISODate, Assignment[]>>;
export function indexByPerson(state: DomainState): AssignmentIndex {
  const m: AssignmentIndex = new Map();
  for (const a of Object.values(state.assignments)) {
    let days = m.get(a.pharmacistId);
    if (!days) m.set(a.pharmacistId, (days = new Map()));
    const l = days.get(a.date);
    if (l) l.push(a); else days.set(a.date, [a]);
  }
  return m;
}

/** What one date looks like for a person. Time off that counts is Approved or Actual; Requested shows as waiting. */
export function personDay(state: DomainState, p: Pharmacist, date: ISODate, idx: AssignmentIndex): PersonDay {
  const list = idx.get(p.id)?.get(date) ?? [];
  let off = false;
  let waiting = false;
  for (const u of Object.values(state.unavailability)) {
    if (u.pharmacistId !== p.id || u.scopeStoreId !== undefined || date < u.first || date > u.last) continue;
    if (u.status === "Approved" || u.status === "Actual") off = true;
    else if (u.status === "Requested") waiting = true;
  }
  const at = list.map((a) => state.stores[a.storeId]?.code ?? a.storeId);
  if (list.length > 1) return { date, mark: "double", at, placedWhileOff: off };
  if (list.length === 1) {
    const home = p.baseStoreId === null || list[0]!.storeId === p.baseStoreId;
    return { date, mark: home ? "home" : "cover", at, placedWhileOff: off };
  }
  return { date, mark: off ? "off" : waiting ? "waiting" : "none", at, placedWhileOff: false };
}

export function personWeek(state: DomainState, p: Pharmacist, monday: ISODate, idx: AssignmentIndex): PersonDay[] {
  return dateRange(monday, addDays(monday, 6)).map((d) => personDay(state, p, d, idx));
}

export type MonthStats = {
  /** Days placed in the month. */
  days: number;
  /** The longest stretch of days in a row that touches the month (it may start earlier or end later). */
  longest: number;
  from: ISODate | null;
  to: ISODate | null;
};

/** Days placed in a month ("YYYY-MM") and the longest run of consecutive days, counted the way the days-in-a-row rule counts them. */
export function monthStats(personDays: Map<ISODate, Assignment[]> | undefined, month: string): MonthStats {
  if (!personDays || personDays.size === 0) return { days: 0, longest: 0, from: null, to: null };
  const dates = [...personDays.keys()].sort(cmp);
  let days = 0;
  let best: MonthStats = { days: 0, longest: 0, from: null, to: null };
  let start = 0;
  for (let i = 0; i <= dates.length; i++) {
    if (i < dates.length && dates[i]!.startsWith(month)) days += 1;
    if (i === dates.length || (i > 0 && toDayNumber(dates[i]!) !== toDayNumber(dates[i - 1]!) + 1)) {
      const run = dates.slice(start, i);
      if (run.length > best.longest && run.some((d) => d.startsWith(month))) best = { days: 0, longest: run.length, from: run[0]!, to: run[run.length - 1]! };
      start = i;
    }
  }
  return { ...best, days };
}

export type LicenceItem = { state: StateCode; until: ISODate | null; status: "ok" | "expiring" | "expired" };
export type LicenceInfo = {
  recorded: boolean;
  items: LicenceItem[];
  /** What deserves a look, worst first; null when there is nothing. */
  attention: "missing" | "none" | "expired" | "expiring" | null;
};

/** Licences as of a date. "Expiring" means the last valid day is within `soonDays` days. */
export function licenceInfo(p: Pharmacist, asOf: ISODate, soonDays = 60): LicenceInfo {
  if (!p.licenses) return { recorded: false, items: [], attention: "missing" };
  const soon = addDays(asOf, soonDays);
  const items: LicenceItem[] = (Object.keys(p.licenses) as StateCode[]).sort().map((state) => {
    const until = p.licenses![state] ?? null;
    return { state, until, status: until === null ? "ok" : until < asOf ? "expired" : until <= soon ? "expiring" : "ok" };
  });
  const attention = items.length === 0 ? "none" : items.some((i) => i.status === "expired") ? "expired" : items.some((i) => i.status === "expiring") ? "expiring" : null;
  return { recorded: true, items, attention };
}

/** "Mon-Fri", "Mon, Wed, Fri": three or more days in a row collapse. */
export function describeWeekdays(weekdays: number[]): string {
  const set = new Set(weekdays);
  const order = MON_FIRST.filter((w) => set.has(w));
  if (order.length === 0) return "no days";
  const parts: string[] = [];
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && MON_FIRST.indexOf(order[j + 1]!) === MON_FIRST.indexOf(order[j]!) + 1) j++;
    if (j - i >= 2) parts.push(`${DAY_SHORT[order[i]!]}-${DAY_SHORT[order[j]!]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_SHORT[order[k]!]);
    i = j + 1;
  }
  return parts.join(", ");
}

/** The standing agreements of one person still in force on a date, e.g. ["Mon-Fri at EST", "Sat at CAT, every 2nd week"]. */
export function standingParts(state: DomainState, pharmacistId: string, asOf: ISODate): string[] {
  return Object.values(state.standing)
    .filter((t) => t.pharmacistId === pharmacistId && (t.effectiveTo === undefined || t.effectiveTo >= asOf))
    .sort((a, b) => cmp(state.stores[a.storeId]?.code ?? "", state.stores[b.storeId]?.code ?? "") || cmp(a.id, b.id))
    .map((t) => {
      const r = t.recurrence;
      const cycle = r.cycleWeeks > 1 ? `, every ${r.cycleWeeks === 2 ? "2nd" : r.cycleWeeks === 3 ? "3rd" : "4th"} week` : "";
      const nth = r.nth && r.nth.length ? `, ${r.nth.slice().sort().map((n) => ["", "1st", "2nd", "3rd", "4th", "5th"][n]).join(" and ")} of the month` : "";
      return `${describeWeekdays(r.weekdays)} at ${state.stores[t.storeId]?.code ?? t.storeId}${cycle}${nth}`;
    });
}

export type PersonRow = {
  p: Pharmacist;
  week: PersonDay[];
  month: MonthStats;
  licence: LicenceInfo;
  standing: string[];
  /** Why this person is worth a look, in plain words; empty when nothing is. */
  attention: string[];
  overRunLimit: boolean;
};

export function personRow(state: DomainState, p: Pharmacist, monday: ISODate, asOf: ISODate, idx: AssignmentIndex): PersonRow {
  const month = monthStats(idx.get(p.id), monthOfWeek(monday));
  const licence = licenceInfo(p, asOf);
  const overRunLimit = month.longest > state.config.maxConsecutiveDays;
  const week = personWeek(state, p, monday, idx);
  const attention: string[] = [];
  if (licence.attention === "missing") attention.push("Licences not recorded");
  else if (licence.attention === "none") attention.push("Not licensed in OR or WA");
  else if (licence.attention === "expired") attention.push("A licence has expired");
  else if (licence.attention === "expiring") attention.push("A licence is about to expire");
  if (overRunLimit) attention.push(`${month.longest} days in a row, over the limit of ${state.config.maxConsecutiveDays}`);
  if (week.some((d) => d.mark === "double")) attention.push("In two places on one day this week");
  return { p, week, month, licence, standing: standingParts(state, p.id, asOf), attention, overRunLimit };
}

// ---------------------------------------------------------------- a store's month in one line

export type Tick = "closed" | "covered" | "open" | "broken";
export type StoreTick = { date: ISODate; tick: Tick; open: boolean; broken: boolean };

/** Assignments by store and date. Build once per state. */
export function indexByCell(state: DomainState): Map<string, Assignment[]> {
  const m = new Map<string, Assignment[]>();
  for (const a of Object.values(state.assignments)) {
    const k = `${a.storeId}|${a.date}`;
    const l = m.get(k);
    if (l) l.push(a); else m.set(k, [a]);
  }
  return m;
}

export type StoreMonth = {
  ticks: StoreTick[];
  counts: { covered: number; open: number; broken: number; closed: number };
  /** The pharmacist who stays at the store the most open days in a row. */
  longest: { pharmacistId: string; days: number; from: ISODate; to: ISODate } | null;
};

/** One tick per date: closed (no need), covered, open (someone is missing), or broken (a rule fails for someone placed there). */
export function storeMonth(ev: Evaluation, storeId: string, dates: ISODate[], byCell: Map<string, Assignment[]>): StoreMonth {
  const ticks: StoreTick[] = [];
  const counts = { covered: 0, open: 0, broken: 0, closed: 0 };
  const present: { date: ISODate; ids: string[] }[] = [];
  for (const date of dates) {
    const list = byCell.get(`${storeId}|${date}`) ?? [];
    const cov = ev.cells[`${storeId}|${date}`];
    const required = cov?.required ?? 0;
    const open = (cov?.open ?? 0) > 0;
    const broken = list.some((a) => ev.assignments[a.id]?.results.some((r) => r.verdict === "Fail" && !r.overridden));
    if (required === 0 && list.length === 0) { ticks.push({ date, tick: "closed", open: false, broken: false }); counts.closed += 1; continue; }
    const tick: Tick = open ? "open" : broken ? "broken" : "covered";
    ticks.push({ date, tick, open, broken });
    if (open) counts.open += 1;
    if (broken) counts.broken += 1;
    if (!open && !broken) counts.covered += 1;
    present.push({ date, ids: list.map((a) => a.pharmacistId) });
  }
  // Longest stay: over the days the store is open, a person's streak grows by one each open day they are there and ends when they are not.
  let best: StoreMonth["longest"] = null;
  const streak = new Map<string, { n: number; from: ISODate }>();
  for (const day of present) {
    const here = new Set(day.ids);
    for (const id of [...streak.keys()]) if (!here.has(id)) streak.delete(id);
    for (const id of [...here].sort(cmp)) {
      const s = streak.get(id);
      const next = s ? { n: s.n + 1, from: s.from } : { n: 1, from: day.date };
      streak.set(id, next);
      if (!best || next.n > best.days) best = { pharmacistId: id, days: next.n, from: next.from, to: day.date };
    }
  }
  return { ticks, counts, longest: best };
}

// ---------------------------------------------------------------- missing drive times

export type MissingPartner = { otherId: string; /** Store -> other is not known. */ missingForward: boolean; /** Other -> store is not known. */ missingBack: boolean };
export type MissingForStore = { storeId: string; partners: MissingPartner[] };

/** For each store active on a date: the other active stores it has no drive time with, in one direction or both. Most missing first. */
export function missingDistances(state: DomainState, asOf: ISODate): MissingForStore[] {
  const active = storesByCode(state).filter((s) => storeActiveOn(s, asOf));
  const out: MissingForStore[] = [];
  for (const s of active) {
    const partners: MissingPartner[] = [];
    for (const o of active) {
      if (o.id === s.id) continue;
      const missingForward = !state.travel[`${s.id}|${o.id}`];
      const missingBack = !state.travel[`${o.id}|${s.id}`];
      if (missingForward || missingBack) partners.push({ otherId: o.id, missingForward, missingBack });
    }
    if (partners.length) out.push({ storeId: s.id, partners });
  }
  return out.sort((a, b) => b.partners.length - a.partners.length || cmp(state.stores[a.storeId]!.code, state.stores[b.storeId]!.code));
}

/** The active store with the shortest known drive time to `storeId` (either direction), or null when none is known. */
export function nearestStore(state: DomainState, storeId: string, asOf: ISODate): string | null {
  let best: { id: string; minutes: number } | null = null;
  for (const o of storesByCode(state)) {
    if (o.id === storeId || !storeActiveOn(o, asOf)) continue;
    const t = state.travel[`${storeId}|${o.id}`] ?? state.travel[`${o.id}|${storeId}`];
    if (t && (!best || t.minutes < best.minutes)) best = { id: o.id, minutes: t.minutes };
  }
  return best?.id ?? null;
}

/** What the nearest store's own drive time to `otherId` is, as a starting guess the DM can change; null when that is not known either. */
export function guessFromNearest(state: DomainState, nearestId: string, otherId: string): { minutes: number; miles: number } | null {
  if (nearestId === otherId) return null;
  const t = state.travel[`${nearestId}|${otherId}`] ?? state.travel[`${otherId}|${nearestId}`];
  return t ? { minutes: t.minutes, miles: t.miles } : null;
}

export const parseWholeMinutes = (s: string): number | null => (/^\d{1,4}$/.test(s.trim()) && Number(s.trim()) >= 1 ? Number(s.trim()) : null);
export const parseMilesText = (s: string): number | null => (/^\d{1,4}(\.\d{1,2})?$/.test(s.trim()) ? Number(s.trim()) : null);

/** travel.set edits for one typed pair: only the directions that are missing are written; a known direction is never changed. */
export function distanceEdits(state: DomainState, storeId: string, otherId: string, minutes: number, miles: number): Edit[] {
  const edits: Edit[] = [];
  for (const [f, t] of [[storeId, otherId], [otherId, storeId]] as const) {
    if (!state.travel[`${f}|${t}`]) edits.push({ t: "travel.set", pair: { fromStoreId: f, toStoreId: t, minutes, miles } });
  }
  return edits;
}

// ---------------------------------------------------------------- pattern preview

export type PreviewIssue = "closed" | "off" | "elsewhere" | "placed" | "placed-elsewhere";
export type PreviewDay = { date: ISODate; hit: boolean; issue?: PreviewIssue; text?: string };

/**
 * What a standing agreement would produce over the next `weeks` weeks (Monday to Sunday rows, starting with the week of `from`).
 * A matching day is flagged when the store is closed, the pharmacist is on time off, another pattern puts them elsewhere, or they are
 * already placed. Nothing is saved or placed by looking.
 */
export function previewPattern(state: DomainState, draft: Standing, from: ISODate, weeks = 4): { rows: PreviewDay[][]; hits: number; flagged: number } {
  const monday = mondayOf(from);
  const withDraft: DomainState = { ...state, standing: { ...state.standing, [draft.id]: draft } };
  const rows: PreviewDay[][] = [];
  let hits = 0;
  let flagged = 0;
  for (let w = 0; w < weeks; w++) {
    const row: PreviewDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, w * 7 + i);
      const hit = date >= from && standingMatches(draft, date);
      if (!hit) { row.push({ date, hit: false }); continue; }
      hits += 1;
      const store = state.stores[draft.storeId];
      const ph = state.pharmacists[draft.pharmacistId];
      const code = store?.code ?? draft.storeId;
      let issue: PreviewIssue | undefined;
      let text: string | undefined;
      const closed = !store || !storeActiveOn(store, date) || weeklyNeedWithDates(state, draft.storeId, date) === 0;
      const mine = Object.values(state.assignments).filter((a) => a.pharmacistId === draft.pharmacistId && a.date === date);
      const offToday = !!ph && Object.values(state.unavailability).some((u) => u.pharmacistId === ph.id && u.scopeStoreId === undefined && (u.status === "Approved" || u.status === "Actual") && date >= u.first && date <= u.last);
      const elsewhere = expectedOn(withDraft, date).filter((e) => e.pharmacistId === draft.pharmacistId && e.standingId !== draft.id);
      if (closed) { issue = "closed"; text = `${code} is closed that day, so nobody would be placed.`; }
      else if (offToday) { issue = "off"; text = "They have time off that day, so they would not count."; }
      else if (mine.some((a) => a.storeId === draft.storeId)) { issue = "placed"; text = `Already placed at ${code} that day.`; }
      else if (mine.length) { issue = "placed-elsewhere"; text = `Already placed at ${state.stores[mine[0]!.storeId]?.code ?? mine[0]!.storeId} that day.`; }
      else if (elsewhere.length) { issue = "elsewhere"; text = `Another pattern puts them at ${state.stores[elsewhere[0]!.storeId]?.code ?? elsewhere[0]!.storeId} that day.`; }
      if (issue) flagged += 1;
      row.push({ date, hit: true, ...(issue ? { issue } : {}), ...(text ? { text } : {}) });
    }
    rows.push(row);
  }
  return { rows, hits, flagged };
}

/** The days a "usual days off" pattern covers, from `from` to `to` (or `weeks` weeks when open-ended). Merged into runs, so Sat + Sun is one record. Days that already have approved time off are left out. */
export function daysOffRuns(state: DomainState, draft: Standing, from: ISODate, to: ISODate): { first: ISODate; last: ISODate }[] {
  const dates = dateRange(from, to).filter((d) => standingMatches(draft, d) && !Object.values(state.unavailability).some((u) => u.pharmacistId === draft.pharmacistId && u.scopeStoreId === undefined && (u.status === "Approved" || u.status === "Actual") && u.first <= d && d <= u.last));
  const runs: { first: ISODate; last: ISODate }[] = [];
  for (const d of dates) {
    const last = runs[runs.length - 1];
    if (last && addDays(last.last, 1) === d) last.last = d; else runs.push({ first: d, last: d });
  }
  return runs;
}

/** Like previewPattern, for usual days off: a matching day is flagged when the person is already placed somewhere (they would then not count) or already has time off. */
export function previewDaysOff(state: DomainState, draft: Standing, from: ISODate, weeks = 4): { rows: PreviewDay[][]; hits: number; flagged: number } {
  const monday = mondayOf(from);
  const rows: PreviewDay[][] = [];
  let hits = 0;
  let flagged = 0;
  for (let w = 0; w < weeks; w++) {
    const row: PreviewDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, w * 7 + i);
      if (!(date >= from && standingMatches(draft, date))) { row.push({ date, hit: false }); continue; }
      hits += 1;
      const mine = Object.values(state.assignments).filter((a) => a.pharmacistId === draft.pharmacistId && a.date === date);
      const already = Object.values(state.unavailability).some((u) => u.pharmacistId === draft.pharmacistId && u.scopeStoreId === undefined && (u.status === "Approved" || u.status === "Actual") && u.first <= date && date <= u.last);
      let issue: PreviewIssue | undefined;
      let text: string | undefined;
      if (already) { issue = "off"; text = "Already has time off that day; nothing to add."; }
      else if (mine.length) { issue = "placed-elsewhere"; text = `Scheduled at ${state.stores[mine[0]!.storeId]?.code ?? mine[0]!.storeId} that day, so they would not count there.`; }
      if (issue) flagged += 1;
      row.push({ date, hit: true, ...(issue ? { issue } : {}), ...(text ? { text } : {}) });
    }
    rows.push(row);
  }
  return { rows, hits, flagged };
}

/** The need for a store on a date, with date changes and the store's active dates applied. */
function weeklyNeedWithDates(state: DomainState, storeId: string, date: ISODate): number {
  const o = state.dateOverrides[`${storeId}|${date}`];
  return o ? o.count : weeklyNeed(state, storeId, weekday(date), date);
}

// ---------------------------------------------------------------- plain-text and CSV lists

const licenceWords = (p: Pharmacist, asOf: ISODate): string => {
  const info = licenceInfo(p, asOf);
  if (!info.recorded) return "not recorded";
  if (!info.items.length) return "none";
  return info.items.map((i) => `${i.state}${i.until ? ` until ${fullDate(i.until)}` : ""}`).join("; ");
};

export type ListRow = string[];
export function peopleList(state: DomainState, asOf: ISODate, includeLeft = false): { header: string[]; rows: ListRow[] } {
  const header = ["Name", "Initials", "Base store", "Licences", "Usually works"];
  const rows = pharmacistsByName(state)
    .filter((p) => includeLeft || pharmacistActiveOn(p, asOf) || (p.activeFrom !== undefined && p.activeFrom > asOf))
    .map((p) => [p.name, p.initials, p.baseStoreId ? state.stores[p.baseStoreId]?.code ?? "" : "", licenceWords(p, asOf), standingParts(state, p.id, asOf).join("; ")]);
  return { header, rows };
}

export function storesList(state: DomainState, asOf: ISODate): { header: string[]; rows: ListRow[] } {
  const header = ["Code", "Name", "State", ...MON_FIRST.map((w) => DAY_SHORT[w]!)];
  const rows = storesByCode(state).filter((s) => storeActiveOn(s, asOf) || (s.activeFrom !== undefined && s.activeFrom > asOf)).map((s) => [
    s.code, s.name, s.state ?? "", ...MON_FIRST.map((w) => String(weeklyNeed(state, s.id, w, asOf))),
  ]);
  return { header, rows };
}

/** Comma-separated text for a spreadsheet. Text that could run as a formula is quoted safely (csvCell). */
export function listCsv(list: { header: string[]; rows: ListRow[] }): string {
  return [csvLine(list.header), ...list.rows.map(csvLine)].join("\r\n") + "\r\n";
}
/** Plain text, one line per row, fields joined with " | ". Line breaks inside a field cannot start a new line. */
export function listText(list: { header: string[]; rows: ListRow[] }): string {
  return [list.header.join(" | "), ...list.rows.map((r) => r.map((c) => oneLine(c)).join(" | "))].join("\n") + "\n";
}
