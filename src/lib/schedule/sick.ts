import { daysInMonth, isoDate, weekdayLong } from "./calendar.ts";
import { clearNameOnStoreDay, shortStoreName } from "./fix.ts";
import { getCell } from "./grid.ts";
import { isOpenDay } from "./place.ts";
import { normalizeTimeOff } from "./pto.ts";
import { RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc, SlotId } from "./types.ts";

export type SickShift = {
  store: string;
  storeName: string;
  slot: SlotId;
  day: number;
  weekday: string;
  /** Other pharmacists who stay at that store that day. Empty means the store would have nobody. */
  othersStay: string[];
};

/** Every open shift this person is on for the given days. */
export function sickShifts(doc: ScheduleDoc, name: string, days: number[]): SickShift[] {
  const out: SickShift[] = [];
  const last = daysInMonth(doc.year, doc.month);
  for (const day of [...new Set(days)].sort((a, b) => a - b)) {
    if (day < 1 || day > last) continue;
    for (const store of doc.stores) {
      if (!isOpenDay(doc, store.code, day)) continue;
      for (const slot of RPH_SLOTS) {
        if (getCell(doc.grid, store.code, slot, day).trim() !== name) continue;
        out.push({
          store: store.code,
          storeName: shortStoreName(store.name),
          slot,
          day,
          weekday: weekdayLong(doc.year, doc.month, day),
          othersStay: RPH_SLOTS.filter((s) => s !== slot)
            .map((s) => getCell(doc.grid, store.code, s, day).trim())
            .filter((n) => n && n !== name),
        });
      }
    }
  }
  return out;
}

/**
 * Someone called in sick: log the days as approved time off ("Called in sick") and take them off those
 * shifts, so the empty shifts show up as open and nothing prints with a sick person on it.
 */
export function callInSickDoc(doc: ScheduleDoc, name: string, days: number[], note = "Called in sick"): ScheduleDoc {
  const dates = [...new Set(days)].sort((a, b) => a - b).map((d) => isoDate(doc.year, doc.month, d));
  let next: ScheduleDoc = { ...doc, timeOff: [...doc.timeOff, normalizeTimeOff({ name, dates, note })] };
  for (const s of sickShifts(doc, name, days)) next = clearNameOnStoreDay(next, s.store, s.day, name);
  return next;
}
