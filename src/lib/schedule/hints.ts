import { daysInMonth, weekdayLong, weekdaySun0 } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { stateOfStore } from "./licence.ts";
import { isOpenDay } from "./place.ts";
import { personByName, RPH_SLOTS } from "./slots.ts";
import type { CellRef, ScheduleDoc, SlotId } from "./types.ts";

/**
 * Hints, not rules. They never block print and never change what counts as ready.
 * A hint says "check this": a weekday the person usually cannot work. Licences are not hints:
 * working outside a licensed state is a hard problem (see licence.ts and rules.ts).
 */

export type Hint = { kind: "weekday"; text: string };

export { stateOfStore, stateName, STATE_NAMES } from "./licence.ts";

/** State codes that appear across the stores, sorted. */
export function statesInUse(doc: ScheduleDoc): string[] {
  return [...new Set(doc.stores.map(stateOfStore).filter(Boolean))].sort();
}

export function personHints(doc: ScheduleDoc, name: string, _store: string, day: number): Hint[] {
  const person = personByName(doc.people, name);
  if (!person) return [];
  const out: Hint[] = [];
  const wd = weekdaySun0(doc.year, doc.month, day);
  if (person.unavailableDays?.includes(wd)) {
    out.push({ kind: "weekday", text: `Usually has ${weekdayLong(doc.year, doc.month, day)}s off` });
  }
  return out;
}

export type PlacedHint = { ref: CellRef; name: string; hints: Hint[] };

/** Every open-day placement that has a hint, in store then day order. */
export function hintsOnGrid(doc: ScheduleDoc): PlacedHint[] {
  const out: PlacedHint[] = [];
  const days = daysInMonth(doc.year, doc.month);
  for (const store of doc.stores) {
    for (let day = 1; day <= days; day++) {
      if (!isOpenDay(doc, store.code, day)) continue;
      for (const slot of RPH_SLOTS as SlotId[]) {
        const name = getCell(doc.grid, store.code, slot, day).trim();
        if (!name) continue;
        const hints = personHints(doc, name, store.code, day);
        if (hints.length) out.push({ ref: { store: store.code, slot, day }, name, hints });
      }
    }
  }
  return out;
}
