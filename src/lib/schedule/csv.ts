import { daysInMonth, weekdayShort } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { SLOTS } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

export function gridCsv(doc: ScheduleDoc): string {
  const days = daysInMonth(doc.year, doc.month);
  const header = "Store,Slot,Day,Weekday,Name";
  const rows: string[] = [header];
  for (const store of doc.stores) {
    for (const slot of SLOTS) {
      for (let day = 1; day <= days; day++) {
        const name = getCell(doc.grid, store.code, slot.id, day).trim();
        if (!name) continue;
        rows.push(
          [
            csvField(store.code),
            csvField(slot.short),
            String(day),
            csvField(weekdayShort(doc.year, doc.month, day)),
            csvField(name),
          ].join(","),
        );
      }
    }
  }
  return `${rows.join("\n")}\n`;
}

export function csvFileName(year: number, month: number): string {
  const mm = month < 10 ? `0${month}` : String(month);
  return `HiSchool-Pharmacy-${year}-${mm}.csv`;
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
