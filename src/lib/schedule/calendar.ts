import type { Holiday, Store } from "./types.ts";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdaySun0(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekdayShort(year: number, month: number, day: number): string {
  return WEEKDAYS[weekdaySun0(year, month, day)] ?? "";
}

export function weekdayLong(year: number, month: number, day: number): string {
  return WEEKDAYS_LONG[weekdaySun0(year, month, day)] ?? "";
}

export function monthName(_year: number, month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

export function monthDay(iso: string): string {
  return iso.slice(5);
}

export function holidayMatches(
  holidays: Holiday[],
  storeCode: string,
  date: string,
): Holiday | undefined {
  const md = monthDay(date);
  return holidays.find((h) => {
    if (h.store !== "ALL" && h.store !== storeCode) return false;
    if (h.repeat) return monthDay(h.date) === md;
    return h.date === date;
  });
}

export function inInclusiveRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export function isStoreOpen(
  store: Store,
  year: number,
  month: number,
  day: number,
  days: number,
  holidays: Holiday[],
): boolean {
  if (day < 1 || day > days) return false;
  const wd = weekdaySun0(year, month, day);
  if (store.closedWeekdays?.includes(wd)) return false;
  if (wd === 6 && !store.satOpen) return false;
  if (wd === 0 && !store.sunOpen) return false;
  const date = isoDate(year, month, day);
  if (holidayMatches(holidays, store.code, date)) return false;
  return true;
}

export function todayParts(d = new Date()): { year: number; month: number; day: number } {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/** Sunday-first weeks for a month grid. Days outside the month are null. */
export function monthWeeks(year: number, month: number): (number | null)[][] {
  const days = daysInMonth(year, month);
  const cells: (number | null)[] = Array.from({ length: weekdaySun0(year, month, 1) }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * The month to start a schedule for. Normally this month; in the last week of a month, next month,
 * because that is the one being planned.
 */
export function suggestedMonth(today: { year: number; month: number; day: number }): { year: number; month: number } {
  const left = daysInMonth(today.year, today.month) - today.day;
  if (left > 6) return { year: today.year, month: today.month };
  return today.month === 12 ? { year: today.year + 1, month: 1 } : { year: today.year, month: today.month + 1 };
}
