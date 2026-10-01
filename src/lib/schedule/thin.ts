import { effectiveTimeOff } from "./employment.ts";
import { daysInMonth, isoDate, isStoreOpen, weekdayLong } from "./calendar.ts";
import { namesOnStoreDay } from "./grid.ts";
import { licenceForState, stateOfStore } from "./licence.ts";
import { personOnPto } from "./pto.ts";
import { isRphRole } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

function eligible(doc: ScheduleDoc, name: string, state: string, _date: string): boolean {
  return doc.people.some((x) => x.name === name) && licenceForState(doc, name, state) === "ok";
}

export type StateShortage = {
  day: number;
  weekday: string;
  state: string;
  openStores: number;
  available: number;
  stores: string[];
};

/**
 * Days when a state has more open stores than pharmacists who could work there (licensed for it,
 * not on time off). Unlike the district-wide count, this cannot be hidden by pharmacists licensed elsewhere.
 */
export function shortageByState(doc: ScheduleDoc): StateShortage[] {
  const last = daysInMonth(doc.year, doc.month);
  const states = [...new Set(doc.stores.map(stateOfStore).filter(Boolean))];
  const out: StateShortage[] = [];
  for (let day = 1; day <= last; day++) {
    const date = isoDate(doc.year, doc.month, day);
    for (const state of states) {
      const open = doc.stores.filter(
        (s) => stateOfStore(s) === state && isStoreOpen(s, doc.year, doc.month, day, last, doc.holidays),
      );
      if (!open.length) continue;
      const available = doc.people.filter(
        (p) => isRphRole(p.role) && eligible(doc, p.name, state, date) && !personOnPto(effectiveTimeOff(doc), p.name, date),
      ).length;
      if (open.length > available) {
        out.push({ day, weekday: weekdayLong(doc.year, doc.month, day), state, openStores: open.length, available, stores: open.map((s) => s.code) });
      }
    }
  }
  return out;
}

export type ThinDay = { day: number; weekday: string; state: string; spare: number; stores: string[] };

/**
 * Days with no spare pharmacist for a state: nobody who is licensed there, free, and not on time off.
 * One more absence that day would leave a store with nobody. Only days that have an open store in the state.
 */
export function thinCoverDays(doc: ScheduleDoc, fromDay = 1): ThinDay[] {
  const last = daysInMonth(doc.year, doc.month);
  const states = [...new Set(doc.stores.map(stateOfStore).filter(Boolean))];
  const out: ThinDay[] = [];
  for (let day = Math.max(1, fromDay); day <= last; day++) {
    const date = isoDate(doc.year, doc.month, day);
    const placed = new Set(doc.stores.flatMap((s) => namesOnStoreDay(doc.grid, s.code, day)));
    for (const state of states) {
      const open = doc.stores.filter(
        (s) => stateOfStore(s) === state && isStoreOpen(s, doc.year, doc.month, day, last, doc.holidays),
      );
      if (!open.length) continue;
      const spare = doc.people.filter(
        (p) =>
          isRphRole(p.role) &&
          eligible(doc, p.name, state, date) &&
          !personOnPto(effectiveTimeOff(doc), p.name, date) &&
          !placed.has(p.name),
      ).length;
      if (spare === 0) out.push({ day, weekday: weekdayLong(doc.year, doc.month, day), state, spare, stores: open.map((s) => s.code) });
    }
  }
  return out;
}
