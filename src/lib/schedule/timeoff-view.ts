import { daysInMonth, holidayMatches, isoDate, todayParts } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { isOpenDay } from "./place.ts";
import { isApproved, timeOffDates } from "./pto.ts";
import { isRphRole, RPH_SLOTS } from "./slots.ts";
import { thinCoverDays } from "./thin.ts";
import type { ScheduleDoc, TimeOff, TimeOffStatus } from "./types.ts";

export type TimeOffEntry = {
  /** Position in doc.timeOff, which the store actions use. */
  index: number;
  t: TimeOff;
  status: TimeOffStatus;
  dates: string[];
};

/**
 * A request still waiting for her decision in the month on screen: undecided, and at least one of its dates falls in
 * this month or later. A request whose dates are all in an earlier month (carried over by "Start next month") no
 * longer counts as waiting anywhere; it stays in the List tab, where she can still decide or remove it.
 */
export function isWaiting(doc: ScheduleDoc, t: TimeOff): boolean {
  if (t.status !== "requested") return false;
  const first = isoDate(doc.year, doc.month, 1);
  return timeOffDates(t).some((d) => d >= first);
}

/**
 * Approved time off for this person that covers this day, as the rows the store can change. Sick calls are not
 * time off she approved, so they are left out; the day panel only offers "Reject time off" for these rows.
 */
export function approvedOffOn(doc: ScheduleDoc, name: string, day: number): TimeOffEntry[] {
  const date = isoDate(doc.year, doc.month, day);
  return entriesOf(doc).filter((e) => e.t.name === name && e.status === "approved" && !/sick/i.test(e.t.note) && e.dates.includes(date));
}

/** Undecided requests whose dates are all before the month on screen. */
export function olderRequests(doc: ScheduleDoc): TimeOff[] {
  return doc.timeOff.filter((t) => t.status === "requested" && !isWaiting(doc, t));
}

export function entriesOf(doc: ScheduleDoc): TimeOffEntry[] {
  return doc.timeOff.map((t, index) => ({ index, t, status: t.status ?? "approved", dates: timeOffDates(t) }));
}

export type DayLoad = {
  day: number;
  date: string;
  /** Approved time off that day (pharmacists only). */
  off: string[];
  /** Requests not yet decided that cover the day. */
  pending: string[];
  pharmacists: number;
  /** No spare pharmacist left for some state that day. */
  thin: boolean;
  /** Open stores whose every scheduled pharmacist is off that day. */
  uncovered: string[];
};

/** One row per day of the month: who is off, who asked, and where that leaves the stores. */
export function dayLoads(doc: ScheduleDoc): DayLoad[] {
  const last = daysInMonth(doc.year, doc.month);
  const rph = new Set(doc.people.filter((p) => isRphRole(p.role)).map((p) => p.name));
  const thin = new Set(thinCoverDays(doc).map((t) => t.day));
  const entries = entriesOf(doc);
  const out: DayLoad[] = [];
  for (let day = 1; day <= last; day++) {
    const date = isoDate(doc.year, doc.month, day);
    const off = new Set<string>();
    const pending = new Set<string>();
    for (const e of entries) {
      if (!rph.has(e.t.name) || !e.dates.includes(date)) continue;
      if (e.status === "approved") off.add(e.t.name);
      else if (e.status === "requested") pending.add(e.t.name);
    }
    const uncovered: string[] = [];
    if (off.size) {
      for (const store of doc.stores) {
        if (!isOpenDay(doc, store.code, day)) continue;
        const placed = RPH_SLOTS.map((s) => getCell(doc.grid, store.code, s, day).trim()).filter(Boolean);
        if (placed.length && placed.every((n) => off.has(n))) uncovered.push(store.code);
      }
    }
    out.push({ day, date, off: [...off], pending: [...pending], pharmacists: rph.size, thin: thin.has(day), uncovered });
  }
  return out;
}

export type TimeOffSummary = {
  waiting: number;
  peopleOff: number;
  /** Shifts where someone approved off is still scheduled. */
  stillScheduled: number;
  busiest: { day: number; off: number; total: number } | null;
  thinDays: number;
  uncoveredShifts: number;
};

export function summarize(doc: ScheduleDoc, loads = dayLoads(doc)): TimeOffSummary {
  const off = new Set<string>();
  let busiest: TimeOffSummary["busiest"] = null;
  let stillScheduled = 0;
  for (const l of loads) {
    l.off.forEach((n) => off.add(n));
    if (l.off.length && (!busiest || l.off.length > busiest.off)) busiest = { day: l.day, off: l.off.length, total: l.pharmacists };
    for (const store of doc.stores) {
      for (const slot of RPH_SLOTS) {
        if (l.off.includes(getCell(doc.grid, store.code, slot, l.day).trim()) && isOpenDay(doc, store.code, l.day)) stillScheduled += 1;
      }
    }
  }
  return {
    waiting: doc.timeOff.filter((t) => isWaiting(doc, t)).length,
    peopleOff: off.size,
    stillScheduled,
    busiest,
    thinDays: loads.filter((l) => l.thin).length,
    uncoveredShifts: loads.reduce((n, l) => n + l.uncovered.length, 0),
  };
}

export type Overlap = { name: string; status: "approved" | "requested"; dates: string[] };

/** Other people already off, or who also asked, on any of these dates. */
export function overlapFor(doc: ScheduleDoc, name: string, dates: string[], exceptIndex = -1): Overlap[] {
  const want = new Set(dates);
  const rph = new Set(doc.people.filter((p) => isRphRole(p.role)).map((p) => p.name));
  const out: Overlap[] = [];
  for (const e of entriesOf(doc)) {
    if (e.index === exceptIndex || e.t.name === name || e.status === "declined" || !rph.has(e.t.name)) continue;
    const hit = e.dates.filter((d) => want.has(d));
    if (hit.length) out.push({ name: e.t.name, status: e.status, dates: hit });
  }
  return out;
}

/** Dates this person already has approved or requested, so adding them again is caught. */
export function duplicateDates(doc: ScheduleDoc, name: string, dates: string[], exceptIndex = -1): string[] {
  const have = new Set<string>();
  for (const e of entriesOf(doc)) {
    if (e.index === exceptIndex || e.t.name !== name || e.status === "declined") continue;
    e.dates.forEach((d) => have.add(d));
  }
  return dates.filter((d) => have.has(d));
}

/** The first day in the month of a request or entry, for sorting. */
export function firstDate(e: TimeOffEntry): string {
  return e.dates[0] ?? e.t.from ?? "";
}

/** Whole days between when a request arrived and its first day; null when unknown. */
export function noticeDays(e: TimeOffEntry): number | null {
  const asked = e.t.requestedOn;
  const first = firstDate(e);
  if (!asked || !first) return null;
  const a = Date.parse(`${asked}T00:00:00Z`);
  const b = Date.parse(`${first}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Entries that share the same dates, largest group first then by date. Used for "by date". */
export function groupByDates(entries: TimeOffEntry[]): { key: string; dates: string[]; entries: TimeOffEntry[] }[] {
  const map = new Map<string, { key: string; dates: string[]; entries: TimeOffEntry[] }>();
  for (const e of entries) {
    const key = e.dates.join(",");
    const g = map.get(key) ?? { key, dates: e.dates, entries: [] };
    g.entries.push(e);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => (a.dates[0] ?? "").localeCompare(b.dates[0] ?? ""));
}

export { isApproved };

export type HolidayDay = {
  day: number;
  /** Holiday names that fall on the day, once each. */
  labels: string[];
  /** Stores a holiday shuts that day. */
  closed: string[];
  /** The first cell where a pharmacist is still named at a store the holiday shuts, if any. */
  scheduled: { store: string; slot: (typeof RPH_SLOTS)[number]; day: number; name: string } | null;
};

/** Days of the month that have a holiday (calendar or district closure), who they shut, and whether anyone is still named there. */
export function holidayDays(doc: ScheduleDoc): HolidayDay[] {
  const out: HolidayDay[] = [];
  const calendar = doc.holidays.filter((h) => !h.closure);
  for (let day = 1; day <= daysInMonth(doc.year, doc.month); day++) {
    const date = isoDate(doc.year, doc.month, day);
    const labels: string[] = [];
    const closed: string[] = [];
    let scheduled: HolidayDay["scheduled"] = null;
    for (const store of doc.stores) {
      const h = holidayMatches(calendar, store.code, date);
      if (!h) continue;
      closed.push(store.code);
      if (!labels.includes(h.label)) labels.push(h.label);
      if (!scheduled) {
        for (const slot of RPH_SLOTS) {
          const name = getCell(doc.grid, store.code, slot, day).trim();
          if (name) {
            scheduled = { store: store.code, slot, day, name };
            break;
          }
        }
      }
    }
    if (closed.length) out.push({ day, labels, closed, scheduled });
  }
  return out;
}

/** The next holiday day in the month on screen: from today when this is the current month, else the first one. */
export function nextHoliday(doc: ScheduleDoc, days = holidayDays(doc)): HolidayDay | null {
  const t = todayParts();
  const from = t.year === doc.year && t.month === doc.month ? t.day : 1;
  return days.find((h) => h.day >= from) ?? null;
}
