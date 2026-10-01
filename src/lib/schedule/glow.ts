import { daysInMonth, isoDate, weekdaySun0 } from "./calendar.ts";
import { effectiveTimeOff } from "./employment.ts";
import { getCell } from "./grid.ts";
import { licenceAt, unlicensedAt } from "./licence.ts";
import { isOpenDay } from "./place.ts";
import { personOnPto } from "./pto.ts";
import { RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc, SlotId } from "./types.ts";

/**
 * How a person looks for an empty shift, for the "place a person" glow. It must always agree with `choicesFor`
 * (a test checks that on every empty shift): free is green, a usual day off asks first, everything else is not offered.
 */
export type Glow = "free" | "dayoff" | "double" | "off" | "blocked" | "filled";

export const glowKey = (store: string, day: number) => `${store}|${day}`;

/** One answer per open store-day for this person. Fast: one pass over the month, no ranking. Read-only. */
export function glowFor(doc: ScheduleDoc, name: string, slot: SlotId = "pharmacist"): Map<string, Glow> {
  const out = new Map<string, Glow>();
  const person = doc.people.find((p) => p.name === name);
  if (!person) return out;
  const last = daysInMonth(doc.year, doc.month);
  const off = effectiveTimeOff(doc);
  // Where they already are, by day.
  const placed = new Map<number, { store: string; slot: SlotId }[]>();
  for (const s of doc.stores) {
    for (const sl of RPH_SLOTS) {
      for (let d = 1; d <= last; d++) {
        if (getCell(doc.grid, s.code, sl, d).trim() === name) {
          const list = placed.get(d) ?? [];
          list.push({ store: s.code, slot: sl });
          placed.set(d, list);
        }
      }
    }
  }
  for (const s of doc.stores) {
    const lic = licenceAt(doc, name, s.code).status;
    const lacks = unlicensedAt(doc, name, s.code);
    for (let d = 1; d <= last; d++) {
      if (!isOpenDay(doc, s.code, d)) continue;
      if (getCell(doc.grid, s.code, slot, d).trim()) {
        out.set(glowKey(s.code, d), "filled");
        continue;
      }
      const date = isoDate(doc.year, doc.month, d);
      let g: Glow;
      if (lacks || lic !== "ok") g = "blocked";
      else if (personOnPto(off, name, date)) g = "off";
      else if ((placed.get(d) ?? []).some((p) => !(p.store === s.code && p.slot === slot))) g = "double";
      else if (person.unavailableDays?.includes(weekdaySun0(doc.year, doc.month, d))) g = "dayoff";
      else g = "free";
      out.set(glowKey(s.code, d), g);
    }
  }
  return out;
}
