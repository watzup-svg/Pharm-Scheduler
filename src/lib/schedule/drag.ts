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
    // A move empties its source first, so moving within one store-day is never refused as "already here".
    const start = !copy && from && !range.some((c) => sameRef(c, from)) ? placeName(doc, from.store, from.slot, from.day, "").doc : doc;
    return assignRange(start, range, name).doc;
  }
  if (from && !copy && !sameRef(from, to)) {
    const dest = getCell(doc.grid, to.store, to.slot, to.day).trim();
    if (dest && dest !== name) return swapCells(doc, from, to);
  }
  const moving = Boolean(from && !copy && !sameRef(from, to));
  const start = moving ? placeName(doc, from!.store, from!.slot, from!.day, "").doc : doc;
  const placed = placeName(start, to.store, to.slot, to.day, name);
  return placed.ok ? placed.doc : doc;
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
