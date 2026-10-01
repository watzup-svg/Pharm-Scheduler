import { daysInMonth, weekdayLong, weekdaySun0 } from "./calendar.ts";
import { ptoOnDay } from "./coverage.ts";
import { getCell } from "./grid.ts";
import { cellKey, isOpenDay, placeName } from "./place.ts";
import { uniqueDays, uniqueSlots } from "./range.ts";
import { SLOTS, slotById } from "./slots.ts";
import { drop as dropPlace, type PlannedPlace, type StampResult } from "./stamp.ts";
import type { CellRef, ScheduleDoc, SlotId } from "./types.ts";

export type FillAxis = "day" | "slot" | "weekday" | "none";

export type FillPreview = {
  places: PlannedPlace[];
  skippedShut: number;
  axis: FillAxis;
  caption: string;
};

export type GridClip = {
  entries: { slotOffset: number; dayOffset: number; name: string }[];
};

export function nextOpenDay(doc: ScheduleDoc, ref: CellRef, dir: 1 | -1): CellRef {
  const last = daysInMonth(doc.year, doc.month);
  let day = ref.day + dir;
  while (day >= 1 && day <= last) {
    if (isOpenDay(doc, ref.store, day)) return { ...ref, day };
    day += dir;
  }
  return ref;
}

/** Last day in this slot that already has a name (open or leftover). */
export function previousFilled(doc: ScheduleDoc, ref: CellRef): CellRef | null {
  for (let day = ref.day - 1; day >= 1; day--) {
    if (getCell(doc.grid, ref.store, ref.slot, day).trim()) {
      return { store: ref.store, slot: ref.slot, day };
    }
  }
  return null;
}

export function rowCells(doc: ScheduleDoc, store: string, slot: SlotId): CellRef[] {
  const last = daysInMonth(doc.year, doc.month);
  const out: CellRef[] = [];
  for (let day = 1; day <= last; day++) out.push({ store, slot, day });
  return out;
}

export function colCells(store: string, day: number, slots: SlotId[]): CellRef[] {
  return slots.map((slot) => ({ store, slot, day }));
}

export function handleAnchor(cells: CellRef[]): CellRef | null {
  if (!cells.length) return null;
  return cells.reduce((best, c) => {
    const bs = SLOTS.findIndex((s) => s.id === best.slot);
    const cs = SLOTS.findIndex((s) => s.id === c.slot);
    if (c.day > best.day) return c;
    if (c.day === best.day && cs > bs) return c;
    return best;
  });
}

export function weekdayPlaces(doc: ScheduleDoc, source: CellRef[]): PlannedPlace[] {
  const last = daysInMonth(doc.year, doc.month);
  const out: PlannedPlace[] = [];
  const seen = new Set<string>();
  for (const ref of source) {
    const name = getCell(doc.grid, ref.store, ref.slot, ref.day).trim();
    if (!name) continue;
    const wd = weekdaySun0(doc.year, doc.month, ref.day);
    for (let day = 1; day <= last; day++) {
      if (day === ref.day) continue;
      if (weekdaySun0(doc.year, doc.month, day) !== wd) continue;
      if (!isOpenDay(doc, ref.store, day)) continue;
      if (getCell(doc.grid, ref.store, ref.slot, day).trim()) continue;
      const key = cellKey({ store: ref.store, slot: ref.slot, day });
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ store: ref.store, slot: ref.slot, day, name });
    }
  }
  return out;
}

function bounds(cells: CellRef[]) {
  const slots = uniqueSlots(cells);
  const days = uniqueDays(cells);
  const sIdx = slots.map((id) => SLOTS.findIndex((s) => s.id === id)).filter((i) => i >= 0);
  return {
    store: cells[0]!.store,
    slots,
    days,
    sMin: Math.min(...sIdx),
    sMax: Math.max(...sIdx),
    dMin: days[0]!,
    dMax: days[days.length - 1]!,
  };
}

function tileName(
  doc: ScheduleDoc,
  store: string,
  sMin: number,
  sMax: number,
  dMin: number,
  dMax: number,
  slot: SlotId,
  day: number,
): string {
  const span = dMax - dMin + 1;
  const slotSpan = sMax - sMin + 1;
  const si = SLOTS.findIndex((s) => s.id === slot);
  const srcSlot = SLOTS[sMin + ((((si - sMin) % slotSpan) + slotSpan) % slotSpan)]!;
  const srcDay = dMin + ((((day - dMin) % span) + span) % span);
  return getCell(doc.grid, store, srcSlot.id, srcDay).trim();
}

function captionFor(places: PlannedPlace[], skippedShut: number, axis: FillAxis, source: CellRef[], doc: ScheduleDoc): string {
  const name = places[0]?.name ?? source.map((c) => getCell(doc.grid, c.store, c.slot, c.day).trim()).find(Boolean) ?? "";
  if (axis === "weekday") {
    const day = source[0]?.day ?? 1;
    const wd = weekdayLong(doc.year, doc.month, day);
    if (!places.length) return `No empty ${wd}s`;
    return `${name} on other ${wd}s`;
  }
  if (!places.length && skippedShut) return "Can’t — shut";
  if (!places.length) return "Nothing empty to fill";
  const n = places.length;
  return `${name} → ${n} open day${n === 1 ? "" : "s"}`;
}

export function fillHandlePlaces(
  doc: ScheduleDoc,
  source: CellRef[],
  to: CellRef,
  opts: { alt?: boolean; visible?: SlotId[] } = {},
): FillPreview {
  const empty: FillPreview = { places: [], skippedShut: 0, axis: "none", caption: "Nothing empty to fill" };
  if (!source.length) return empty;
  const store = source[0]!.store;
  if (to.store !== store) return empty;
  if (opts.alt) {
    const places = weekdayPlaces(doc, source);
    return {
      places,
      skippedShut: 0,
      axis: "weekday",
      caption: captionFor(places, 0, "weekday", source, doc),
    };
  }
  const b = bounds(source);
  const visible = opts.visible ?? SLOTS.map((s) => s.id);
  const toSlotI = SLOTS.findIndex((s) => s.id === to.slot);
  if (toSlotI < 0) return empty;
  const dd =
    to.day > b.dMax ? to.day - b.dMax : to.day < b.dMin ? b.dMin - to.day : 0;
  const ds =
    toSlotI > b.sMax ? toSlotI - b.sMax : toSlotI < b.sMin ? b.sMin - toSlotI : 0;
  let axis: FillAxis = "none";
  if (dd === 0 && ds === 0) return { ...empty, caption: "Drag to fill" };
  if (dd >= ds && dd > 0) axis = "day";
  else if (ds > 0) axis = "slot";
  else axis = "day";

  const kinds = new Set(source.map((c) => slotById(c.slot).kind));
  const places: PlannedPlace[] = [];
  let skippedShut = 0;
  const seen = new Set<string>();

  function add(slot: SlotId, day: number) {
    if (day < 1 || day > daysInMonth(doc.year, doc.month)) return;
    if (!isOpenDay(doc, store, day)) {
      skippedShut += 1;
      return;
    }
    if (getCell(doc.grid, store, slot, day).trim()) return;
    const name = tileName(doc, store, b.sMin, b.sMax, b.dMin, b.dMax, slot, day);
    if (!name) return;
    const key = cellKey({ store, slot, day });
    if (seen.has(key)) return;
    seen.add(key);
    places.push({ store, slot, day, name });
  }

  if (axis === "day") {
    const from = to.day < b.dMin ? to.day : b.dMax + 1;
    const until = to.day < b.dMin ? b.dMin - 1 : to.day;
    for (const slot of b.slots) {
      for (let day = from; day <= until; day++) add(slot, day);
    }
  } else {
    if (kinds.size !== 1) {
      return { places: [], skippedShut: 0, axis, caption: "Drag right to fill days" };
    }
    const kind = [...kinds][0]!;
    const fromI = toSlotI < b.sMin ? toSlotI : b.sMax + 1;
    const untilI = toSlotI < b.sMin ? b.sMin - 1 : toSlotI;
    for (let i = fromI; i <= untilI; i++) {
      const slot = SLOTS[i];
      if (!slot) continue;
      if (slot.kind !== kind) continue;
      if (!visible.includes(slot.id)) continue;
      for (const day of b.days) add(slot.id, day);
    }
  }

  return {
    places,
    skippedShut,
    axis,
    caption: captionFor(places, skippedShut, axis, source, doc),
  };
}

export function rangeAssignPlaces(doc: ScheduleDoc, cells: CellRef[], name: string): PlannedPlace[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const out: PlannedPlace[] = [];
  for (const c of cells) {
    if (!isOpenDay(doc, c.store, c.day)) continue;
    if (getCell(doc.grid, c.store, c.slot, c.day).trim()) continue;
    out.push({ store: c.store, slot: c.slot, day: c.day, name: trimmed });
  }
  return out;
}

export function clipFromCells(doc: ScheduleDoc, cells: CellRef[]): GridClip {
  if (!cells.length) return { entries: [] };
  const slots = uniqueSlots(cells);
  const days = uniqueDays(cells);
  const originIdx = SLOTS.findIndex((s) => s.id === slots[0]);
  const originDay = days[0] ?? 1;
  const store = cells[0]!.store;
  const entries: GridClip["entries"] = [];
  for (const slot of slots) {
    const slotOffset = SLOTS.findIndex((s) => s.id === slot) - originIdx;
    for (const day of days) {
      entries.push({
        slotOffset,
        dayOffset: day - originDay,
        name: getCell(doc.grid, store, slot, day),
      });
    }
  }
  return { entries };
}

export function pasteClip(doc: ScheduleDoc, at: CellRef, clip: GridClip): StampResult {
  const originIdx = SLOTS.findIndex((s) => s.id === at.slot);
  const last = daysInMonth(doc.year, doc.month);
  let next = doc;
  const dropped: StampResult["dropped"] = [];
  for (const e of clip.entries) {
    const slot = SLOTS[originIdx + e.slotOffset];
    const day = at.day + e.dayOffset;
    if (!slot || day < 1 || day > last) continue;
    const placed = placeName(next, at.store, slot.id, day, e.name);
    if (!placed.ok) dropped.push(dropPlace(e.name, at.store, slot.id, day, doc.year, doc.month, placed.reason === "unlicensed" ? "unlicensed" : "shut"));
    else next = placed.doc;
  }
  return { doc: next, dropped };
}

export function applyPlaces(doc: ScheduleDoc, places: PlannedPlace[], skipPto = false): StampResult {
  let next = doc;
  const dropped: StampResult["dropped"] = [];
  const seen = new Set<string>();
  for (const p of places) {
    const key = `${p.store}|${p.slot}|${p.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (skipPto && ptoOnDay(doc, p.name, p.day)) continue;
    const placed = placeName(next, p.store, p.slot, p.day, p.name);
    if (!placed.ok) dropped.push(dropPlace(p.name, p.store, p.slot, p.day, doc.year, doc.month, placed.reason === "unlicensed" ? "unlicensed" : "shut"));
    else next = placed.doc;
  }
  return { doc: next, dropped };
}
