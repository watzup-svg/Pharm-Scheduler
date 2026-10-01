import { isoDate } from "./calendar.ts";
import { setCellValue } from "./grid.ts";
import { SLOTS } from "./slots.ts";
import type { Holiday, ScheduleDoc } from "./types.ts";

export const CLOSURE_REASONS = ["Inventory", "Short-staffed", "Weather or emergency", "Other"] as const;
export type ClosureReason = (typeof CLOSURE_REASONS)[number];

/**
 * Close one store for one day on purpose. The reason is saved and prints on the poster ("Closed: Short-staffed").
 * Everyone scheduled there that day comes off the shift, so they are free to cover elsewhere.
 */
export function closeStoreDayDoc(doc: ScheduleDoc, store: string, day: number, reason: string): ScheduleDoc {
  const date = isoDate(doc.year, doc.month, day);
  let grid = doc.grid;
  for (const slot of SLOTS) grid = setCellValue(grid, store, slot.id, day, "");
  const row: Holiday = { date, store, label: reason.trim() || "Closed", repeat: false, closure: true };
  const holidays = [...doc.holidays.filter((h) => !(h.closure && h.store === store && h.date === date)), row];
  return { ...doc, grid, holidays };
}

/** Undo a closure (not a calendar holiday). Nobody is put back: the shifts come back open. */
export function reopenStoreDayDoc(doc: ScheduleDoc, store: string, day: number): ScheduleDoc {
  const date = isoDate(doc.year, doc.month, day);
  return { ...doc, holidays: doc.holidays.filter((h) => !(h.closure && h.store === store && h.date === date)) };
}

/** The decided closure for a store and day, if there is one. */
export function closureFor(doc: ScheduleDoc, store: string, day: number): Holiday | null {
  const date = isoDate(doc.year, doc.month, day);
  return doc.holidays.find((h) => h.closure && h.store === store && h.date === date) ?? null;
}

/** Every decided closure in this month, in date order. */
export function closuresInMonth(doc: ScheduleDoc): (Holiday & { day: number })[] {
  const prefix = `${doc.year}-${String(doc.month).padStart(2, "0")}-`;
  return doc.holidays
    .filter((h) => h.closure && h.date.startsWith(prefix))
    .map((h) => ({ ...h, day: Number(h.date.slice(8, 10)) }))
    .sort((a, b) => a.day - b.day || a.store.localeCompare(b.store));
}
