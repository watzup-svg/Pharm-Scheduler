import { daysInMonth, isStoreOpen, weekdaySun0 } from "./calendar.ts";
import type { ScheduleDoc } from "./types.ts";

/** Which days of the month a "needs two pharmacists" mark would cover. Closed days are skipped: nobody works them. */
export function openDaysIn(doc: ScheduleDoc, store: string, days: number[]): number[] {
  const s = doc.stores.find((x) => x.code === store);
  if (!s) return [];
  const n = daysInMonth(doc.year, doc.month);
  return days.filter((d) => d >= 1 && d <= n && isStoreOpen(s, doc.year, doc.month, d, n, doc.holidays));
}

/** Every day in the month that falls on the same weekday as `day`. */
export function sameWeekdayDays(doc: ScheduleDoc, day: number): number[] {
  const n = daysInMonth(doc.year, doc.month);
  const wd = weekdaySun0(doc.year, doc.month, day);
  return Array.from({ length: n }, (_, i) => i + 1).filter((d) => weekdaySun0(doc.year, doc.month, d) === wd);
}

/** Every day from `from` to `to`, whichever way round they were given. */
export function dayRange(from: number, to: number): number[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** Mark (on) or clear (off) days at one store. Marking skips closed days; clearing removes whatever is listed. A mark never places anyone. */
export function setNeedsTwo(doc: ScheduleDoc, store: string, days: number[], on: boolean): ScheduleDoc {
  const have = new Set(doc.needsTwo?.[store] ?? []);
  for (const d of on ? openDaysIn(doc, store, days) : days) {
    if (on) have.add(d);
    else have.delete(d);
  }
  const list = [...have].sort((a, b) => a - b);
  const table = { ...(doc.needsTwo ?? {}) };
  if (list.length) table[store] = list;
  else delete table[store];
  const { needsTwo: _old, ...rest } = doc;
  return Object.keys(table).length ? { ...rest, needsTwo: table } : rest;
}

export function isMarkedTwo(doc: ScheduleDoc, store: string, day: number): boolean {
  return (doc.needsTwo?.[store] ?? []).includes(day);
}
