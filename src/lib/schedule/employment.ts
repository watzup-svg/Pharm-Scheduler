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
