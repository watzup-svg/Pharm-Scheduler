import { daysInMonth, isStoreOpen, weekdaySun0 } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { isRphRole, RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

export type FairnessRow = {
  name: string;
  home: string;
  float: boolean;
  days: number;
  saturdays: number;
  /** Days worked at a store that is not their home. */
  awayDays: number;
  /** Same measures last month, when it is known. */
  prev: { days: number; saturdays: number; awayDays: number } | null;
};

function tally(doc: ScheduleDoc, name: string, home: string) {
  const days = new Set<number>();
  const sats = new Set<number>();
  const away = new Set<number>();
  const last = daysInMonth(doc.year, doc.month);
  for (const store of doc.stores) {
    for (let d = 1; d <= last; d++) {
      if (!isStoreOpen(store, doc.year, doc.month, d, last, doc.holidays)) continue;
      if (!RPH_SLOTS.some((slot) => getCell(doc.grid, store.code, slot, d).trim() === name)) continue;
      days.add(d);
      if (weekdaySun0(doc.year, doc.month, d) === 6) sats.add(d);
      if (store.code !== home) away.add(d);
    }
  }
  return { days: days.size, saturdays: sats.size, awayDays: away.size };
}

/** Days, Saturdays and days away from home for each pharmacist, beside last month when it is available. */
export function fairness(doc: ScheduleDoc, previous: ScheduleDoc | null = null): FairnessRow[] {
  return doc.people
    .filter((p) => isRphRole(p.role))
    .map((p) => ({
      name: p.name,
      home: p.home,
      float: p.role === "Float Pharmacist",
      ...tally(doc, p.name, p.home),
      prev: previous && previous.people.some((q) => q.name === p.name) ? tally(previous, p.name, p.home) : null,
    }));
}
