import { daysInMonth, isoDate } from "./calendar.ts";
import { getCell, setCellValue } from "./grid.ts";
import { isOpenDay } from "./place.ts";
import { shortStoreName } from "./fix.ts";
import { RPH_SLOTS } from "./slots.ts";
import { isApproved, normalizeTimeOff, personOnPto, timeOffDates } from "./pto.ts";
import { effectiveTimeOff } from "./employment.ts";
import { thinCoverDays } from "./thin.ts";
import { rankCandidates, type Suggestion } from "./suggest.ts";
import type { ScheduleDoc, SlotId } from "./types.ts";

export type ImpactItem = {
  store: string;
  storeName: string;
  day: number;
  slot: SlotId;
  /** Nobody else would be left at the store that day. */
  becomesHole: boolean;
  /** Best people to take it, when it becomes a hole. Never placed for you. */
  suggestions: Suggestion[];
};

/**
 * "If this person is off on these dates, what happens?" Lists every shift they are on that would
 * lose its pharmacist, and who could take each. Nothing is changed.
 */
export function timeOffImpact(doc: ScheduleDoc, name: string, dates: string[]): ImpactItem[] {
  const want = new Set(dates);
  const last = daysInMonth(doc.year, doc.month);
  const days = Array.from({ length: last }, (_, i) => i + 1).filter((d) => want.has(isoDate(doc.year, doc.month, d)));
  if (!days.length) return [];

  // The world where they are off: cleared from every shift on those days, and marked off for ranking.
  let without = { ...doc, timeOff: [...doc.timeOff, { name, dates, from: dates[0]!, to: dates[dates.length - 1]!, note: "" }] };
  const hits: { store: string; slot: SlotId; day: number }[] = [];
  for (const day of days) {
    for (const store of doc.stores) {
      if (!isOpenDay(doc, store.code, day)) continue;
      for (const slot of RPH_SLOTS) {
        if (getCell(doc.grid, store.code, slot, day).trim() === name) {
          hits.push({ store: store.code, slot, day });
          without = { ...without, grid: setCellValue(without.grid, store.code, slot, day, "") };
        }
      }
    }
  }
  return hits.map((h) => {
    const others = RPH_SLOTS.some((s) => getCell(without.grid, h.store, s, h.day).trim());
    return {
      ...h,
      storeName: shortStoreName(doc.stores.find((s) => s.code === h.store)?.name ?? h.store),
      becomesHole: !others,
      suggestions: others ? [] : rankCandidates(without, h.store, h.day, h.slot, { exclude: [name] }).filter((s) => s.state === "free").slice(0, 3),
    };
  });
}

/** Plain hints for approving a request: who else is off, and whether it leaves a day with no spare pharmacist. */
export function requestHints(doc: ScheduleDoc, name: string, dates: string[]): string[] {
  const hints: string[] = [];
  const want = new Set(dates);
  const others = new Set<string>();
  for (const t of doc.timeOff) {
    if (t.name === name || !isApproved(t)) continue;
    if (timeOffDates(t).some((d) => want.has(d))) others.add(t.name);
  }
  if (others.size) hints.push(`${others.size} ${others.size === 1 ? "other is" : "others are"} already off those days: ${[...others].join(", ")}.`);
  const row = normalizeTimeOff({ name, dates });
  const after = { ...doc, timeOff: [...doc.timeOff, row] };
  const before = new Set(thinCoverDays(doc).map((t) => `${t.day}|${t.state}`));
  const newThin = thinCoverDays(after).filter((t) => !before.has(`${t.day}|${t.state}`));
  if (newThin.length) hints.push(`Approving leaves no spare pharmacist on ${newThin.map((t) => `${t.weekday.slice(0, 3)} ${t.day} (${t.state})`).join(", ")}.`);
  return hints;
}

/**
 * True when approving this request leaves every store they are on with another pharmacist who is actually working
 * (not someone else already on approved time off that day). Used for "approve all the safe ones".
 */
export function safeToApprove(doc: ScheduleDoc, name: string, dates: string[]): boolean {
  const off = effectiveTimeOff(doc);
  return timeOffImpact(doc, name, dates).every((i) => {
    const date = isoDate(doc.year, doc.month, i.day);
    return RPH_SLOTS.some((slot) => {
      const other = getCell(doc.grid, i.store, slot, i.day).trim();
      return other && other !== name && !personOnPto(off, other, date);
    });
  });
}

/**
 * Dates in this month where taking all of `names` off would leave an open store with no pharmacist who is actually
 * working (someone else already on approved time off does not count). Cheap: no suggestions are ranked.
 */
export function riskDates(doc: ScheduleDoc, names: string[]): Set<string> {
  const out = new Set<string>();
  if (!names.length) return out;
  const off = effectiveTimeOff(doc);
  const gone = new Set(names);
  const last = daysInMonth(doc.year, doc.month);
  for (let day = 1; day <= last; day++) {
    const date = isoDate(doc.year, doc.month, day);
    for (const store of doc.stores) {
      if (!isOpenDay(doc, store.code, day)) continue;
      const placed = RPH_SLOTS.map((slot) => getCell(doc.grid, store.code, slot, day).trim()).filter(Boolean);
      if (!placed.some((n) => gone.has(n))) continue;
      if (!placed.some((n) => !gone.has(n) && !personOnPto(off, n, date))) {
        out.add(date);
        break;
      }
    }
  }
  return out;
}
