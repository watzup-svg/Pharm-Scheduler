import {
  isoDate,
  daysInMonth,
  isStoreOpen,
  monthName,
  weekdayLong,
  weekdaySun0,
} from "./calendar.ts";
import { getCell, setCellValue } from "./grid.ts";
import { unlicensedAt } from "./licence.ts";
import { SLOTS } from "./slots.ts";
import type { Grid, ScheduleDoc } from "./types.ts";

export type DroppedPlacement = {
  name: string;
  store: string;
  slotShort: string;
  fromDay: number;
  fromWeekday: string;
  occurrence: number;
  toDay: number | null;
  toWeekday: string | null;
  reason: "shut" | "no-day" | "unlicensed" | "not-employed" | "usual-off";
};

export type NextMonthPlan = {
  year: number;
  month: number;
  monthLabel: string;
  fromLabel: string;
  grid: Grid;
  dropped: DroppedPlacement[];
};

export function nextYearMonth(year: number, month: number): { year: number; month: number } {
  if (month >= 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/** 1-based nth time this calendar day-of-week appears in the month. */
export function weekdayOccurrence(day: number): number {
  return Math.ceil(day / 7);
}

export function dayForOccurrence(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): number | null {
  const first = weekdaySun0(year, month, 1);
  const offset = (weekday - first + 7) % 7;
  const day = 1 + offset + (occurrence - 1) * 7;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return day;
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function dropLine(drop: DroppedPlacement): string {
  const row = drop.slotShort === "RPh2" ? "second pharmacist" : "pharmacist";
  const who = `${drop.name} · ${drop.store} ${row}`;
  const from = `${drop.fromWeekday.slice(0, 3)} ${drop.fromDay}`;
  if (drop.reason === "usual-off") return `${who} · ${drop.toWeekday ?? from} is their usual day off`;
  if (drop.reason === "not-employed") return `${who} · ${from} · not with the company that day (start or end date)`;
  if (drop.reason === "unlicensed") return `${who} · ${from} · not licensed in that state`;
  if (drop.reason === "shut" && drop.toDay != null && drop.toWeekday) {
    return `${who} · ${from} → ${drop.toWeekday.slice(0, 3)} ${drop.toDay} shut`;
  }
  return `${who} · ${from} → no ${ordinal(drop.occurrence)} ${drop.fromWeekday}`;
}

export function planNextMonth(doc: ScheduleDoc): NextMonthPlan {
  const dest = nextYearMonth(doc.year, doc.month);
  const srcDays = daysInMonth(doc.year, doc.month);
  const destDays = daysInMonth(dest.year, dest.month);
  let grid: Grid = {};
  const dropped: DroppedPlacement[] = [];

  for (const store of doc.stores) {
    for (const slot of SLOTS) {
      for (let day = 1; day <= srcDays; day++) {
        const name = getCell(doc.grid, store.code, slot.id, day).trim();
        if (!name) continue;
        const weekday = weekdaySun0(doc.year, doc.month, day);
        const occurrence = weekdayOccurrence(day);
        const toDay = dayForOccurrence(dest.year, dest.month, weekday, occurrence);
        const fromWeekday = weekdayLong(doc.year, doc.month, day);
        if (toDay == null) {
          dropped.push({
            name,
            store: store.code,
            slotShort: slot.short,
            fromDay: day,
            fromWeekday,
            occurrence,
            toDay: null,
            toWeekday: fromWeekday,
            reason: "no-day",
          });
          continue;
        }
        const open = isStoreOpen(store, dest.year, dest.month, toDay, destDays, doc.holidays);
        if (!open) {
          dropped.push({
            name,
            store: store.code,
            slotShort: slot.short,
            fromDay: day,
            fromWeekday,
            occurrence,
            toDay,
            toWeekday: weekdayLong(dest.year, dest.month, toDay),
            reason: "shut",
          });
          continue;
        }
        // A one-day relief pharmacist (or anyone past their end date) does not carry over.
        const destDate = isoDate(dest.year, dest.month, toDay);
        const who = doc.people.find((p) => p.name === name);
        if (who && ((who.startsOn && destDate < who.startsOn) || (who.endsOn && destDate > who.endsOn))) {
          dropped.push({
            name,
            store: store.code,
            slotShort: slot.short,
            fromDay: day,
            fromWeekday,
            occurrence,
            toDay,
            toWeekday: weekdayLong(dest.year, dest.month, toDay),
            reason: "not-employed",
          });
          continue;
        }
        if (who && who.unavailableDays?.includes(weekdaySun0(dest.year, dest.month, toDay))) {
          dropped.push({
            name,
            store: store.code,
            slotShort: slot.short,
            fromDay: day,
            fromWeekday,
            occurrence,
            toDay,
            toWeekday: weekdayLong(dest.year, dest.month, toDay),
            reason: "usual-off",
          });
          continue;
        }
        // Same rule as placing by hand: nobody goes where they are not licensed to work.
        if (unlicensedAt(doc, name, store.code, isoDate(dest.year, dest.month, toDay))) {
          dropped.push({
            name,
            store: store.code,
            slotShort: slot.short,
            fromDay: day,
            fromWeekday,
            occurrence,
            toDay,
            toWeekday: weekdayLong(dest.year, dest.month, toDay),
            reason: "unlicensed",
          });
          continue;
        }
        grid = setCellValue(grid, store.code, slot.id, toDay, name);
      }
    }
  }

  return {
    year: dest.year,
    month: dest.month,
    monthLabel: `${monthName(dest.year, dest.month)} ${dest.year}`,
    fromLabel: `${monthName(doc.year, doc.month)} ${doc.year}`,
    grid,
    dropped,
  };
}

export function applyNextMonthPlan(doc: ScheduleDoc, plan: NextMonthPlan): ScheduleDoc {
  return {
    ...doc,
    year: plan.year,
    month: plan.month,
    grid: plan.grid,
    // Notes are keyed by day number, so they would land on the wrong dates. They belong to one month.
    dayNotes: {},
  };
}

