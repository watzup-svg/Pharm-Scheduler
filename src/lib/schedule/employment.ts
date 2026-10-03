import { daysInMonth, isoDate } from "./calendar.ts";
import type { ScheduleDoc, TimeOff } from "./types.ts";

const cache = new WeakMap<ScheduleDoc, TimeOff[]>();

/**
 * Time off plus, for anyone with a first or last day at the company, the days of this month outside those dates.
 * Those days behave like time off everywhere: not suggested, not counted as available, shown yellow if still scheduled.
 */
export function effectiveTimeOff(doc: ScheduleDoc): TimeOff[] {
  if (!doc.people.some((p) => p.startsOn || p.endsOn)) return doc.timeOff;
  const hit = cache.get(doc);
  if (hit) return hit;
  const last = daysInMonth(doc.year, doc.month);
  const extra: TimeOff[] = [];
  for (const p of doc.people) {
    if (!p.startsOn && !p.endsOn) continue;
    const dates: string[] = [];
    for (let d = 1; d <= last; d++) {
      const date = isoDate(doc.year, doc.month, d);
      if ((p.startsOn && date < p.startsOn) || (p.endsOn && date > p.endsOn)) dates.push(date);
    }
    if (dates.length) extra.push({ name: p.name, dates, from: dates[0]!, to: dates[dates.length - 1]!, note: "Not with the company on these dates" });
  }
  const all = [...doc.timeOff, ...extra];
  cache.set(doc, all);
  return all;
}

export type OffKind = "time-off" | "left" | "not-yet";

/**
 * Why someone is off on this date: a time-off entry, or because it is after their last day or before their first day with the company.
 * A time-off entry wins when both apply. The behaviour is the same for all three (yellow, not suggested); only the words differ.
 */
export function offKind(doc: ScheduleDoc, name: string, date: string): OffKind {
  const entry = doc.timeOff.some((t) => t.name === name && (t.status ?? "approved") === "approved" && (t.dates?.length ? t.dates.includes(date) : t.from <= date && date <= t.to));
  if (entry) return "time-off";
  const p = doc.people.find((x) => x.name === name);
  if (p?.endsOn && date > p.endsOn) return "left";
  if (p?.startsOn && date < p.startsOn) return "not-yet";
  return "time-off";
}

export const OFF_WORDS: Record<OffKind, string> = { "time-off": "on time off", left: "after their last day", "not-yet": "before their first day" };
