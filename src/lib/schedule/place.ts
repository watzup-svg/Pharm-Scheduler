import { daysInMonth, isoDate, isStoreOpen } from "./calendar.ts";
import { getCell, setCellValue } from "./grid.ts";
import { unlicensedAt } from "./licence.ts";
import type { CellRef, ScheduleDoc, SlotId } from "./types.ts";

export function cellKey(ref: CellRef): string {
  return `${ref.store}|${ref.slot}|${ref.day}`;
}

export function isOpenDay(doc: ScheduleDoc, storeCode: string, day: number): boolean {
  const store = doc.stores.find((s) => s.code === storeCode);
  if (!store) return false;
  const days = daysInMonth(doc.year, doc.month);
  return isStoreOpen(store, doc.year, doc.month, day, days, doc.holidays);
}

/** Single door for every name write. Clear always allowed. Names on shut days, and names outside a licensed state, rejected. */
export function placeName(
  doc: ScheduleDoc,
  store: string,
  slot: SlotId,
  day: number,
  name: string,
): { doc: ScheduleDoc; ok: boolean; reason: "ok" | "shut" | "unlicensed" | "missing-store" | "noop" } {
  const trimmed = name.trim();
  if (!doc.stores.some((s) => s.code === store)) {
    return { doc, ok: false, reason: "missing-store" };
  }
  if (trimmed && !isOpenDay(doc, store, day)) {
    return { doc, ok: false, reason: "shut" };
  }
  if (trimmed && unlicensedAt(doc, trimmed, store, isoDate(doc.year, doc.month, day))) {
    return { doc, ok: false, reason: "unlicensed" };
  }
  const current = getCell(doc.grid, store, slot, day);
  if (current === trimmed) return { doc, ok: true, reason: "noop" };
  return {
    doc: { ...doc, grid: setCellValue(doc.grid, store, slot, day, trimmed) },
    ok: true,
    reason: "ok",
  };
}

export function swapCells(doc: ScheduleDoc, a: CellRef, b: CellRef): ScheduleDoc {
  const nameA = getCell(doc.grid, a.store, a.slot, a.day);
  const nameB = getCell(doc.grid, b.store, b.slot, b.day);
  let next = doc;
  const first = placeName(next, a.store, a.slot, a.day, "");
  next = first.doc;
  const putB = placeName(next, a.store, a.slot, a.day, nameB);
  if (!putB.ok) {
    return placeName(next, a.store, a.slot, a.day, nameA).doc;
  }
  next = putB.doc;
  const putA = placeName(next, b.store, b.slot, b.day, nameA);
  if (!putA.ok) {
    next = placeName(next, a.store, a.slot, a.day, nameA).doc;
    next = placeName(next, b.store, b.slot, b.day, nameB).doc;
    return next;
  }
  return putA.doc;
}
