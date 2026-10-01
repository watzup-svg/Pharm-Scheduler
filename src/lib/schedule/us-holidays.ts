import { weekdaySun0, daysInMonth, pad2 } from "./calendar.ts";

export type UsHoliday = {
  key: string;
  label: string;
  date: string;
  /** Same month and day every year, so it can repeat. */
  fixed: boolean;
  /** When the date falls on a weekend, the weekday it is usually observed (federal rule). */
  observed?: string;
};

function nth(year: number, month: number, weekday: number, n: number): number {
  const first = weekdaySun0(year, month, 1);
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

function last(year: number, month: number, weekday: number): number {
  const end = daysInMonth(year, month);
  return end - ((weekdaySun0(year, month, end) - weekday + 7) % 7);
}

const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

function fixed(year: number, month: number, day: number, key: string, label: string): UsHoliday {
  const wd = weekdaySun0(year, month, day);
  let observed: string | undefined;
  if (wd === 6) observed = shift(year, month, day, -1);
  if (wd === 0) observed = shift(year, month, day, 1);
  return { key, label, date: iso(year, month, day), fixed: true, ...(observed ? { observed } : {}) };
}

function shift(y: number, m: number, d: number, by: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The federal holidays for a year, computed here. No internet needed. Which ones close a store is the manager's call. */
export function usHolidays(year: number): UsHoliday[] {
  return [
    fixed(year, 1, 1, "newyear", "New Year’s Day"),
    { key: "mlk", label: "Martin Luther King Jr. Day", date: iso(year, 1, nth(year, 1, 1, 3)), fixed: false },
    { key: "presidents", label: "Presidents’ Day", date: iso(year, 2, nth(year, 2, 1, 3)), fixed: false },
    { key: "memorial", label: "Memorial Day", date: iso(year, 5, last(year, 5, 1)), fixed: false },
    fixed(year, 6, 19, "juneteenth", "Juneteenth"),
    fixed(year, 7, 4, "july4", "Independence Day"),
    { key: "labor", label: "Labor Day", date: iso(year, 9, nth(year, 9, 1, 1)), fixed: false },
    { key: "columbus", label: "Columbus / Indigenous Peoples’ Day", date: iso(year, 10, nth(year, 10, 1, 2)), fixed: false },
    fixed(year, 11, 11, "veterans", "Veterans Day"),
    { key: "thanksgiving", label: "Thanksgiving", date: iso(year, 11, nth(year, 11, 4, 4)), fixed: false },
    fixed(year, 12, 25, "christmas", "Christmas Day"),
  ];
}
