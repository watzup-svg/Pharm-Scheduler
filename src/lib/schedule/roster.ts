import { effectiveTimeOff } from "./employment.ts";
import { isoDate, isStoreOpen, daysInMonth } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { personOnPto } from "./pto.ts";
import { issueKey } from "./rules.ts";
import { stateOfStore } from "./hints.ts";
import { isRphRole, RPH_SLOTS } from "./slots.ts";
import type { Evaluation, ScheduleDoc } from "./types.ts";

export type DayStoreLine = {
  store: string;
  name: string;
  open: boolean;
  names: string[];
  hole: boolean;
  leftover: boolean;
  doubled: string[];
  off: string[];
};

export type DayRoster = {
  day: number;
  stores: DayStoreLine[];
  /** Pharmacists who are nowhere this day and not on time off: who you could call. */
  free: { name: string; home: string; float: boolean }[];
  /** On time off this day. */
  off: string[];
};

/** Everyone, everywhere, on one date. */
export function dayRoster(doc: ScheduleDoc, ev: Evaluation, day: number): DayRoster {
  const date = isoDate(doc.year, doc.month, day);
  const days = daysInMonth(doc.year, doc.month);
  const placed = new Set<string>();
  const stores: DayStoreLine[] = doc.stores.map((store) => {
    const names = RPH_SLOTS.map((slot) => getCell(doc.grid, store.code, slot, day).trim()).filter(Boolean);
    names.forEach((n) => placed.add(n));
    const issue = ev.byKey[issueKey(store.code, day)];
    return {
      store: store.code,
      name: store.name,
      open: isStoreOpen(store, doc.year, doc.month, day, days, doc.holidays),
      names,
      hole: Boolean(issue?.hole),
      leftover: Boolean(issue?.leftover),
      doubled: issue?.doubledNames ?? [],
      off: issue?.ptoNames ?? [],
    };
  });
  const pharmacists = doc.people.filter((p) => isRphRole(p.role));
  const off = pharmacists.filter((p) => personOnPto(effectiveTimeOff(doc), p.name, date)).map((p) => p.name);
  const free = pharmacists
    .filter((p) => !placed.has(p.name) && !off.includes(p.name))
    .map((p) => ({ name: p.name, home: p.home, float: p.role === "Float Pharmacist" }));
  return { day, stores, free, off };
}

/**
 * Which stores the board lists. "all", "problems" (a hole, a double or a name on a closed day),
 * or a state code such as "OR".
 */
export function filterStores(doc: ScheduleDoc, ev: Evaluation, filter: string) {
  if (filter === "all") return doc.stores;
  if (filter === "problems") {
    return doc.stores.filter((s) => {
      const doubles = ev.issues.some(
        (i) => i.store === s.code && (i.doubledNames.length > 0 || i.unlicensedNames.length > 0),
      );
      return (ev.storeHoles[s.code] ?? 0) + (ev.storeClosed[s.code] ?? 0) > 0 || doubles;
    });
  }
  return doc.stores.filter((s) => stateOfStore(s) === filter);
}

/** The Sunday-first weeks of the month as [firstDay, lastDay] pairs of real days. */
export function weekRanges(year: number, month: number): [number, number][] {
  const last = daysInMonth(year, month);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const out: [number, number][] = [];
  let start = 1;
  let end = Math.min(last, 7 - first);
  while (start <= last) {
    out.push([start, end]);
    start = end + 1;
    end = Math.min(last, start + 6);
  }
  return out;
}
