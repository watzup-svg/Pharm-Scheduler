import { effectiveTimeOff } from "./employment.ts";
import { isoDate, MONTH_NAMES } from "./calendar.ts";
import { personOnPto } from "./pto.ts";
import { SLOTS } from "./slots.ts";
import type { CellRef, ScheduleDoc, SlotId, SlotKind } from "./types.ts";

function slotUsedInMonth(doc: ScheduleDoc, store: string, slot: SlotId): boolean {
  const row = doc.grid[store]?.[slot];
  if (!row) return false;
  return Object.values(row).some((n) => n.trim());
}

/** Always show Pharmacist. Hide unused Pharmacist 2 unless it is used or revealed. */
export function visibleSlots(
  doc: ScheduleDoc,
  store: string,
  revealed: SlotId[] = [],
  kinds?: SlotKind[],
): typeof SLOTS {
  const extra = new Set(revealed);
  const always = new Set<SlotId>();
  if (!kinds || kinds.includes("RPh")) always.add("pharmacist");
  if (kinds?.includes("Tech")) always.add("tech1");
  if (kinds?.includes("Cash")) always.add("cashier");
  return SLOTS.filter((slot) => {
    if (kinds && !kinds.includes(slot.kind)) return false;
    if (always.has(slot.id)) return true;
    if (extra.has(slot.id)) return true;
    return slotUsedInMonth(doc, store, slot.id);
  });
}

export function collapsedSlots(
  doc: ScheduleDoc,
  store: string,
  revealed: SlotId[] = [],
  kinds?: SlotKind[],
): typeof SLOTS {
  const shown = new Set(visibleSlots(doc, store, revealed, kinds).map((s) => s.id));
  return SLOTS.filter((s) => {
    if (kinds && !kinds.includes(s.kind)) return false;
    return !shown.has(s.id);
  });
}

export function ptoOnDay(doc: ScheduleDoc, name: string, day: number): boolean {
  const date = isoDate(doc.year, doc.month, day);
  return personOnPto(effectiveTimeOff(doc), name, date);
}

export function suggestedMonthFileName(year: number, month: number): string {
  const label = MONTH_NAMES[month - 1] ?? String(month);
  return `HiSchool_Pharmacy_${label}_${year}.hisp.json`;
}

export function postedStamp(d = new Date()): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()] ?? ""} ${d.getDate()}, ${d.getFullYear()}`;
}

export function storeHoursLine(satOpen: boolean, sunOpen: boolean, closedWeekdays: number[] = []): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdays = closedWeekdays.length
    ? [1, 2, 3, 4, 5].filter((d) => !closedWeekdays.includes(d)).map((d) => names[d]).join(", ") || "no weekdays"
    : "Mon–Fri";
  return `${weekdays} · Sat ${satOpen ? "open" : "closed"} · Sun ${sunOpen ? "open" : "closed"}`;
}

/** Unique calendar days this person is on, not slot-count. */
export function daysWorked(doc: ScheduleDoc, name: string): number {
  const days = new Set<number>();
  for (const store of Object.keys(doc.grid)) {
    const slots = doc.grid[store] ?? {};
    for (const row of Object.values(slots)) {
      for (const [day, n] of Object.entries(row ?? {})) {
        if (n === name) days.add(Number(day));
      }
    }
  }
  return days.size;
}

export function namePlacements(doc: ScheduleDoc, name: string): CellRef[] {
  const out: CellRef[] = [];
  for (const store of doc.stores) {
    for (const slot of SLOTS) {
      const row = doc.grid[store.code]?.[slot.id] ?? {};
      for (const [day, n] of Object.entries(row)) {
        if (n === name) out.push({ store: store.code, slot: slot.id, day: Number(day) });
      }
    }
  }
  return out;
}
