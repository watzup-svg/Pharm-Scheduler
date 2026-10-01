import { daysInMonth } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { RPH_SLOTS } from "./slots.ts";
import type { Grid, ScheduleDoc } from "./types.ts";

/** What was posted the last time the pack was printed, for one month. */
export type PrintSnapshot = { ym: string; at: number; grid: Grid };

export type ChangeSummary = {
  /** Store code to the days whose names changed. */
  stores: Record<string, number[]>;
  /** Person to the days where they were added or removed. */
  people: Record<string, number[]>;
  cells: number;
};

export const PRINTED_KEY = "hischool-schedule-printed-v1";

export function snapshotOf(doc: ScheduleDoc, at: number, ym: string): PrintSnapshot {
  return { ym, at, grid: JSON.parse(JSON.stringify(doc.grid)) as Grid };
}

/** Every cell that reads differently now than when it was printed. Nothing printed yet: no changes to report. */
export function changesSince(doc: ScheduleDoc, snap: PrintSnapshot | null): ChangeSummary {
  const out: ChangeSummary = { stores: {}, people: {}, cells: 0 };
  if (!snap) return out;
  const last = daysInMonth(doc.year, doc.month);
  const codes = new Set([...doc.stores.map((s) => s.code), ...Object.keys(snap.grid)]);
  const add = (map: Record<string, number[]>, key: string, day: number) => {
    const list = (map[key] ??= []);
    if (!list.includes(day)) list.push(day);
  };
  for (const store of codes) {
    for (let day = 1; day <= last; day++) {
      for (const slot of RPH_SLOTS) {
        const before = getCell(snap.grid, store, slot, day).trim();
        const now = getCell(doc.grid, store, slot, day).trim();
        if (before === now) continue;
        out.cells += 1;
        add(out.stores, store, day);
        if (before) add(out.people, before, day);
        if (now) add(out.people, now, day);
      }
    }
  }
  for (const map of [out.stores, out.people]) for (const k of Object.keys(map)) map[k]!.sort((a, b) => a - b);
  return out;
}
