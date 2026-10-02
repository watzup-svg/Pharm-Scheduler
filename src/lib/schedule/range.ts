import { SLOTS } from "./slots.ts";
import type { CellRef, ScheduleDoc, SlotId } from "./types.ts";

/** Rectangle of cells in one store between two corners (slot × day). */
export function rectCells(_doc: ScheduleDoc, a: CellRef, b: CellRef): CellRef[] {
  if (a.store !== b.store) return [b];
  const slots = SLOTS.map((s) => s.id);
  const i1 = slots.indexOf(a.slot);
  const i2 = slots.indexOf(b.slot);
  if (i1 < 0 || i2 < 0) return [b];
  const lo = Math.min(i1, i2);
  const hi = Math.max(i1, i2);
  const d1 = Math.min(a.day, b.day);
  const d2 = Math.max(a.day, b.day);
  const out: CellRef[] = [];
  for (let i = lo; i <= hi; i++) {
    const slot = slots[i];
    if (!slot) continue;
    for (let day = d1; day <= d2; day++) {
      out.push({ store: a.store, slot, day });
    }
  }
  return out;
}

export function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((row) => row.length)
    .map((row) => row.split("\t"));
}

/** Apply TSV with focus as top-left. Rows walk slots, columns walk days. */
export function tsvCells(focus: CellRef, table: string[][]): { ref: CellRef; name: string }[] {
  const slots = SLOTS.map((s) => s.id);
  const start = slots.indexOf(focus.slot);
  if (start < 0) return [];
  const out: { ref: CellRef; name: string }[] = [];
  table.forEach((row, ri) => {
    const slot = slots[start + ri];
    if (!slot) return;
    row.forEach((name, ci) => {
      out.push({
        ref: { store: focus.store, slot, day: focus.day + ci },
        name: name.trim(),
      });
    });
  });
  return out;
}

export function uniqueSlots(cells: CellRef[]): SlotId[] {
  const order = SLOTS.map((s) => s.id);
  const set = new Set(cells.map((c) => c.slot));
  return order.filter((id) => set.has(id));
}

export function uniqueDays(cells: CellRef[]): number[] {
  return [...new Set(cells.map((c) => c.day))].sort((a, b) => a - b);
}
