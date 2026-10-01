import { weekdayLong } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { isOpenDay, placeName, swapCells } from "./place.ts";
import { assignRange } from "./stamp.ts";
import type { CellRef, ScheduleDoc } from "./types.ts";


export type DragPayload = {
  name: string;
  from?: CellRef;
};

function sameRef(a: CellRef | null | undefined, b: CellRef | null | undefined): boolean {
  return Boolean(a && b && a.store === b.store && a.slot === b.slot && a.day === b.day);
}

/** One undo-worth of drop: move, copy, swap, or fill a selected range. Shut targets are rejected. */
export function dropName(
  doc: ScheduleDoc,
  to: CellRef,
  payload: DragPayload,
  copy: boolean,
  range: CellRef[] = [],
): ScheduleDoc {
  const name = payload.name.trim();
  if (!name) return doc;
  const from = payload.from;
  const inRange = range.length > 1 && range.some((c) => sameRef(c, to));
  if (inRange) {
    let next = assignRange(doc, range, name).doc;
    if (!copy && from && !range.some((c) => sameRef(c, from))) {
      next = placeName(next, from.store, from.slot, from.day, "").doc;
    }
    return next;
  }
  if (from && !copy && !sameRef(from, to)) {
    const dest = getCell(doc.grid, to.store, to.slot, to.day).trim();
    if (dest && dest !== name) return swapCells(doc, from, to);
  }
  const placed = placeName(doc, to.store, to.slot, to.day, name);
  if (!placed.ok) return doc;
  let next = placed.doc;
  if (from && !copy && !sameRef(from, to)) {
    next = placeName(next, from.store, from.slot, from.day, "").doc;
  }
  return next;
}

export function dropCaption(
  doc: ScheduleDoc,
  to: CellRef,
  payload: DragPayload,
  copy: boolean,
  range: CellRef[] = [],
): string {
  const name = payload.name.trim();
  if (!name) return "";
  if (!isOpenDay(doc, to.store, to.day)) {
    return `Can’t — ${weekdayLong(doc.year, doc.month, to.day)} shut`;
  }
  if (range.length > 1 && range.some((c) => sameRef(c, to))) {
    const n = range.filter((c) => isOpenDay(doc, c.store, c.day)).length;
    return `Fill ${n} open days with ${name}`;
  }
  const dest = getCell(doc.grid, to.store, to.slot, to.day).trim();
  if (payload.from && !copy && dest && dest !== name) return `Swap ${name} ↔ ${dest}`;
  if (copy || !payload.from) return `Copy ${name}`;
  return `Move ${name}`;
}
