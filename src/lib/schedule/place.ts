import { daysInMonth, isoDate, isStoreOpen } from "./calendar.ts";
import { getCell, setCellValue } from "./grid.ts";
import { unlicensedAt } from "./licence.ts";
import { RPH_SLOTS } from "./slots.ts";
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

/**
 * Single door for every name write. Clear always allowed. Names on shut days, and names outside a licensed state, rejected.
 * A person is never written twice at one store on one day: if they already fill the other row there, nothing changes.
 */
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
  if (trimmed && RPH_SLOTS.some((s) => s !== slot && getCell(doc.grid, store, s, day).trim() === trimmed)) return { doc, ok: true, reason: "noop" };
  return {
    doc: { ...doc, grid: setCellValue(doc.grid, store, slot, day, trimmed) },
    ok: true,
    reason: "ok",
  };
}

export function swapCells(doc: ScheduleDoc, a: CellRef, b: CellRef): ScheduleDoc {
  const nameA = getCell(doc.grid, a.store, a.slot, a.day);
  const nameB = getCell(doc.grid, b.store, b.slot, b.day);
  // Empty both first, so swapping the two rows of one store-day never meets the "already here" rule half way.
  let next = placeName(placeName(doc, a.store, a.slot, a.day, "").doc, b.store, b.slot, b.day, "").doc;
  const putB = placeName(next, a.store, a.slot, a.day, nameB);
  const putA = putB.ok ? placeName(putB.doc, b.store, b.slot, b.day, nameA) : putB;
  return putB.ok && putA.ok ? putA.doc : doc;
}

/** A person listed in both pharmacist rows of one store on one day. */
export type SameStoreRepeat = { store: string; day: number; name: string };

/**
 * Old files and the grid can hold the same person in both rows of one store-day. Keep the first row, clear the second,
 * and say what was cleared. Pure; returns the same doc when there is nothing to clear.
 */
export function dropSameStoreRepeats(doc: ScheduleDoc): { doc: ScheduleDoc; removed: SameStoreRepeat[] } {
  const removed: SameStoreRepeat[] = [];
  let grid = doc.grid;
  for (const [store, slots] of Object.entries(doc.grid)) {
    const first = slots?.[RPH_SLOTS[0]!] ?? {};
    const second = slots?.[RPH_SLOTS[1]!] ?? {};
    for (const [d, name] of Object.entries(second)) {
      const n = (name ?? "").trim();
      if (!n || (first[d] ?? "").trim() !== n) continue;
      grid = setCellValue(grid, store, RPH_SLOTS[1]!, Number(d), "");
      removed.push({ store, day: Number(d), name: n });
    }
  }
  return removed.length ? { doc: { ...doc, grid }, removed } : { doc, removed };
}
