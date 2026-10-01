import { daysInMonth, weekdayLong, weekdaySun0 } from "./calendar.ts";
import { ptoOnDay } from "./coverage.ts";
import { getCell } from "./grid.ts";
import { isOpenDay, placeName } from "./place.ts";
import { slotById, SLOTS, slotsForKinds } from "./slots.ts";
import type { CellRef, DroppedPlacement, Pattern, ScheduleDoc, SlotId, SlotKind } from "./types.ts";

export type StampResult = {
  doc: ScheduleDoc;
  dropped: DroppedPlacement[];
};

export type PlannedPlace = {
  store: string;
  slot: SlotId;
  day: number;
  name: string;
};

export type StampOpts = {
  skipPto?: boolean;
  kinds?: SlotKind[];
};

export function drop(
  name: string,
  store: string,
  slot: SlotId,
  day: number,
  year: number,
  month: number,
  reason: DroppedPlacement["reason"] = "shut",
): DroppedPlacement {
  const wd = weekdayLong(year, month, day);
  return {
    name,
    store,
    slotShort: slotById(slot).short,
    fromDay: day,
    fromWeekday: wd,
    occurrence: 0,
    toDay: day,
    toWeekday: wd,
    reason,
  };
}

function eachDayOfWeek(year: number, month: number, weekday: number): number[] {
  const days = daysInMonth(year, month);
  const out: number[] = [];
  for (let d = 1; d <= days; d++) {
    if (weekdaySun0(year, month, d) === weekday) out.push(d);
  }
  return out;
}

export function getPatternCell(
  pattern: Pattern,
  store: string,
  slot: SlotId,
  weekday: number,
): string {
  return pattern[store]?.[slot]?.[String(weekday)] ?? "";
}

export function setPatternCell(
  pattern: Pattern,
  store: string,
  slot: SlotId,
  weekday: number,
  name: string,
): Pattern {
  const next: Pattern = { ...pattern, [store]: { ...pattern[store] } };
  const row = { ...(next[store]?.[slot] ?? {}) };
  const key = String(weekday);
  if (name.trim()) row[key] = name.trim();
  else delete row[key];
  next[store] = { ...next[store], [slot]: row };
  return next;
}

export function copyPatternStore(pattern: Pattern, from: string, to: string): Pattern {
  if (from === to) return pattern;
  return { ...pattern, [to]: structuredClone(pattern[from] ?? {}) };
}

export function clearPatternStore(pattern: Pattern, store: string): Pattern {
  const next = { ...pattern };
  delete next[store];
  return next;
}

/** True when this is the person’s usual weekly day off. Bulk tools skip these; placing one by hand asks first. */
export function onUsualDayOff(doc: ScheduleDoc, name: string, day: number): boolean {
  return Boolean(doc.people.find((p) => p.name === name)?.unavailableDays?.includes(weekdaySun0(doc.year, doc.month, day)));
}

export function ptoPlanned(doc: ScheduleDoc, planned: PlannedPlace[]): PlannedPlace[] {
  return planned.filter((p) => ptoOnDay(doc, p.name, p.day));
}

/** Stamps never overwrite: a cell that already has a name is left alone. */
export function plannedStampWeekday(
  doc: ScheduleDoc,
  weekday: number,
  storeCode?: string,
  kinds?: SlotKind[],
): PlannedPlace[] {
  const stores = storeCode ? doc.stores.filter((s) => s.code === storeCode) : doc.stores;
  const days = eachDayOfWeek(doc.year, doc.month, weekday);
  const out: PlannedPlace[] = [];
  for (const store of stores) {
    for (const slot of slotsForKinds(kinds)) {
      const name = getPatternCell(doc.pattern, store.code, slot.id, weekday).trim();
      if (!name) continue;
      for (const day of days) {
        if (getCell(doc.grid, store.code, slot.id, day).trim()) continue;
        if (!isOpenDay(doc, store.code, day)) continue;
        if (onUsualDayOff(doc, name, day)) continue;
        out.push({ store: store.code, slot: slot.id, day, name });
      }
    }
  }
  return out;
}

export function plannedStampWeek(
  doc: ScheduleDoc,
  storeCode?: string,
  kinds?: SlotKind[],
): PlannedPlace[] {
  const out: PlannedPlace[] = [];
  for (let wd = 0; wd < 7; wd++) {
    out.push(...plannedStampWeekday(doc, wd, storeCode, kinds));
  }
  return out;
}

/** `includeUsualOff` also lists their usual days off, to count what was skipped. */
export function plannedStampHomes(doc: ScheduleDoc, includeUsualOff = false): PlannedPlace[] {
  const days = daysInMonth(doc.year, doc.month);
  const out: PlannedPlace[] = [];
  for (const person of doc.people) {
    if (person.role !== "Pharmacist") continue;
    if (!person.home || person.home === "—") continue;
    if (!doc.stores.some((s) => s.code === person.home)) continue;
    for (let day = 1; day <= days; day++) {
      if (!isOpenDay(doc, person.home, day)) continue;
      if (getCell(doc.grid, person.home, "pharmacist", day).trim()) continue;
      if (!includeUsualOff && onUsualDayOff(doc, person.name, day)) continue;
      out.push({ store: person.home, slot: "pharmacist", day, name: person.name });
    }
  }
  return out;
}

/** Fill never overwrites: only empty open days in this row are planned. */
export function plannedFillSlot(doc: ScheduleDoc, ref: CellRef): PlannedPlace[] {
  const name = getCell(doc.grid, ref.store, ref.slot, ref.day).trim();
  if (!name) return [];
  const days = daysInMonth(doc.year, doc.month);
  const out: PlannedPlace[] = [];
  for (let day = 1; day <= days; day++) {
    if (day === ref.day) continue;
    if (!isOpenDay(doc, ref.store, day)) continue;
    if (getCell(doc.grid, ref.store, ref.slot, day).trim()) continue;
    if (onUsualDayOff(doc, name, day)) continue;
    out.push({ store: ref.store, slot: ref.slot, day, name });
  }
  return out;
}

/** Pattern weekday → every matching open day this month. Empty stays empty; filled cells stay as they are. */
export function stampWeekday(
  doc: ScheduleDoc,
  weekday: number,
  storeCode?: string,
  skipPto = false,
  kinds?: SlotKind[],
): StampResult {
  const stores = storeCode ? doc.stores.filter((s) => s.code === storeCode) : doc.stores;
  let next = doc;
  const dropped: DroppedPlacement[] = [];
  const days = eachDayOfWeek(doc.year, doc.month, weekday);
  for (const store of stores) {
    for (const slot of slotsForKinds(kinds)) {
      const name = getPatternCell(doc.pattern, store.code, slot.id, weekday).trim();
      if (!name) continue;
      for (const day of days) {
        if (getCell(next.grid, store.code, slot.id, day).trim()) continue;
        if (skipPto && ptoOnDay(doc, name, day)) continue;
        if (onUsualDayOff(doc, name, day)) {
          dropped.push(drop(name, store.code, slot.id, day, doc.year, doc.month, "usual-off"));
          continue;
        }
        const placed = placeName(next, store.code, slot.id, day, name);
        if (!placed.ok) dropped.push(drop(name, store.code, slot.id, day, doc.year, doc.month, placed.reason === "unlicensed" ? "unlicensed" : "shut"));
        else next = placed.doc;
      }
    }
  }
  return { doc: next, dropped };
}

export function stampTypicalWeek(
  doc: ScheduleDoc,
  storeCode?: string,
  skipPto = false,
  kinds?: SlotKind[],
): StampResult {
  let next = doc;
  const dropped: DroppedPlacement[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const step = stampWeekday(next, wd, storeCode, skipPto, kinds);
    next = step.doc;
    dropped.push(...step.dropped);
  }
  return { doc: next, dropped };
}

/** Copy filled cells from one calendar day onto other same-weekdays. Does not wipe empties or overwrite names. */
export function copyWeekdayColumn(doc: ScheduleDoc, fromDay: number): StampResult {
  const weekday = weekdaySun0(doc.year, doc.month, fromDay);
  const days = eachDayOfWeek(doc.year, doc.month, weekday).filter((d) => d !== fromDay);
  let next = doc;
  const dropped: DroppedPlacement[] = [];
  for (const store of doc.stores) {
    for (const slot of SLOTS) {
      const name = getCell(doc.grid, store.code, slot.id, fromDay).trim();
      if (!name) continue;
      for (const day of days) {
        if (getCell(next.grid, store.code, slot.id, day).trim()) continue;
        if (onUsualDayOff(doc, name, day)) {
          dropped.push(drop(name, store.code, slot.id, day, doc.year, doc.month, "usual-off"));
          continue;
        }
        const placed = placeName(next, store.code, slot.id, day, name);
        if (!placed.ok) dropped.push(drop(name, store.code, slot.id, day, doc.year, doc.month, placed.reason === "unlicensed" ? "unlicensed" : "shut"));
        else next = placed.doc;
      }
    }
  }
  return { doc: next, dropped };
}

/** Place this person on remaining open empty days of one slot. Never fills shut days. */
export function fillOpenDaysInSlot(
  doc: ScheduleDoc,
  ref: CellRef,
  skipPto = false,
): StampResult {
  const name = getCell(doc.grid, ref.store, ref.slot, ref.day).trim();
  if (!name) return { doc, dropped: [] };
  const days = daysInMonth(doc.year, doc.month);
  let next = doc;
  const dropped: DroppedPlacement[] = [];
  for (let day = 1; day <= days; day++) {
    if (day === ref.day) continue;
    if (!isOpenDay(doc, ref.store, day)) continue;
    if (getCell(next.grid, ref.store, ref.slot, day).trim()) continue;
    if (skipPto && ptoOnDay(doc, name, day)) continue;
    if (onUsualDayOff(doc, name, day)) {
      dropped.push(drop(name, ref.store, ref.slot, day, doc.year, doc.month, "usual-off"));
      continue;
    }
    const placed = placeName(next, ref.store, ref.slot, day, name);
    if (!placed.ok) dropped.push(drop(name, ref.store, ref.slot, day, doc.year, doc.month, placed.reason === "unlicensed" ? "unlicensed" : "shut"));
    else next = placed.doc;
  }
  return { doc: next, dropped };
}

/** Copy first occurrence of each weekday from the grid into the pattern stencil. */
export function captureFirstWeek(doc: ScheduleDoc, storeCode?: string, kinds?: SlotKind[]): Pattern {
  let pattern: Pattern = { ...doc.pattern };
  const stores = storeCode ? doc.stores.filter((s) => s.code === storeCode) : doc.stores;
  const days = daysInMonth(doc.year, doc.month);
  const seen = new Set<string>();
  for (const store of stores) {
    for (let day = 1; day <= days; day++) {
      const wd = weekdaySun0(doc.year, doc.month, day);
      for (const slot of slotsForKinds(kinds)) {
        const key = `${store.code}|${slot.id}|${wd}`;
        if (seen.has(key)) continue;
        const name = getCell(doc.grid, store.code, slot.id, day).trim();
        if (!name) continue;
        seen.add(key);
        pattern = setPatternCell(pattern, store.code, slot.id, wd, name);
      }
    }
  }
  return pattern;
}

export function clearRange(doc: ScheduleDoc, cells: CellRef[]): ScheduleDoc {
  let next = doc;
  for (const c of cells) {
    next = placeName(next, c.store, c.slot, c.day, "").doc;
  }
  return next;
}

export function assignRange(
  doc: ScheduleDoc,
  cells: CellRef[],
  name: string,
  emptyOnly = false,
  skipPto = false,
): StampResult {
  let next = doc;
  const dropped: DroppedPlacement[] = [];
  for (const c of cells) {
    if (emptyOnly && getCell(next.grid, c.store, c.slot, c.day).trim()) continue;
    if (skipPto && ptoOnDay(doc, name, c.day)) continue;
    const placed = placeName(next, c.store, c.slot, c.day, name);
    if (!placed.ok) dropped.push(drop(name, c.store, c.slot, c.day, doc.year, doc.month, placed.reason === "unlicensed" ? "unlicensed" : "shut"));
    else next = placed.doc;
  }
  return { doc: next, dropped };
}
