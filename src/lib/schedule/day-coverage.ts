import { daysInMonth, isoDate, isStoreOpen, weekdayLong } from "./calendar.ts";
import { effectiveTimeOff } from "./employment.ts";
import { getCell } from "./grid.ts";
import { personOnPto } from "./pto.ts";
import { isRphRole, RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

export type DayCover = {
  day: number;
  weekday: string;
  /** Stores open that day. 0 on a day everything is closed. */
  open: number;
  /** Open stores with no pharmacist named (accepted or not: it is still no coverage). */
  holes: number;
  /** Pharmacists named on a store that day who are on time off. */
  onTimeOff: number;
  /** How many more stores are open than pharmacists are available; 0 when there are enough. */
  short: number;
};

/** One entry per day of the month: how covered the district is. Read-only, for the coverage strip. */
export function coverageByDay(doc: ScheduleDoc): DayCover[] {
  const days = daysInMonth(doc.year, doc.month);
  const off = effectiveTimeOff(doc);
  const rph = doc.people.filter((p) => isRphRole(p.role));
  const out: DayCover[] = [];
  for (let day = 1; day <= days; day++) {
    const date = isoDate(doc.year, doc.month, day);
    const open = doc.stores.filter((s) => isStoreOpen(s, doc.year, doc.month, day, days, doc.holidays));
    let holes = 0;
    let onTimeOff = 0;
    for (const store of open) {
      const names = RPH_SLOTS.map((slot) => getCell(doc.grid, store.code, slot, day).trim()).filter(Boolean);
      if (!names.length) holes += 1;
      onTimeOff += names.filter((n) => personOnPto(off, n, date)).length;
    }
    const available = rph.filter((p) => !personOnPto(off, p.name, date)).length;
    out.push({ day, weekday: weekdayLong(doc.year, doc.month, day), open: open.length, holes, onTimeOff, short: Math.max(0, open.length - available) });
  }
  return out;
}
