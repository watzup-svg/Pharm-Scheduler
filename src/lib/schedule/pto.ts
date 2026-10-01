import { daysInMonth, inInclusiveRange, isoDate, isStoreOpen, MONTH_NAMES } from "./calendar.ts";
import type { Person, ScheduleDoc, TimeOff } from "./types.ts";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string): boolean {
  return ISO.test(value);
}

export function enumerateIsoRange(from: string, to: string): string[] {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return [];
  const out: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  let day = Number(from.slice(8, 10));
  for (let i = 0; i < 400; i++) {
    const iso = isoDate(year, month, day);
    out.push(iso);
    if (iso >= to) break;
    day += 1;
    const dim = daysInMonth(year, month);
    if (day > dim) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return out;
}

function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates.filter(isIsoDate))].sort();
}

/** Expand a v1/v2 from–to row (or a dates array) into a canonical TimeOff. */
export function normalizeTimeOff(row: {
  name: string;
  from?: string;
  to?: string;
  dates?: string[];
  note?: string;
  status?: TimeOff["status"];
  requestedOn?: string;
}): TimeOff {
  const fromDates = Array.isArray(row.dates) ? row.dates : [];
  const dates = uniqueSortedDates(
    fromDates.length ? fromDates : enumerateIsoRange(row.from ?? "", row.to ?? ""),
  );
  return {
    name: row.name,
    dates,
    from: dates[0] ?? row.from ?? "",
    to: dates[dates.length - 1] ?? row.to ?? "",
    note: (row.note ?? "").trim(),
    ...(row.status && row.status !== "approved" ? { status: row.status } : {}),
    ...(row.requestedOn ? { requestedOn: row.requestedOn } : {}),
  };
}

export function timeOffDates(row: TimeOff): string[] {
  if (row.dates?.length) return uniqueSortedDates(row.dates);
  return enumerateIsoRange(row.from, row.to);
}

function ptoCoversDate(row: TimeOff, date: string): boolean {
  if (row.dates?.length) return row.dates.includes(date);
  if (row.from && row.to) return inInclusiveRange(date, row.from, row.to);
  return false;
}

/** Only approved time off counts. A request or a declined request changes nothing on the schedule. */
export function isApproved(row: TimeOff): boolean {
  return row.status == null || row.status === "approved";
}

export function personOnPto(timeOff: TimeOff[], name: string, date: string): boolean {
  return timeOff.some((t) => t.name === name && isApproved(t) && ptoCoversDate(t, date));
}

function homeStoreOf(people: Person[], name: string): string {
  const person = people.find((p) => p.name === name);
  if (!person?.home || person.home === "—") return "";
  return person.home;
}

export function dateClosedForPerson(doc: ScheduleDoc, name: string, date: string): boolean {
  const [ys, ms, ds] = date.split("-");
  const year = Number(ys);
  const month = Number(ms);
  const day = Number(ds);
  if (!year || !month || !day) return false;
  const dim = daysInMonth(year, month);
  const home = homeStoreOf(doc.people, name);
  const homeStore = doc.stores.find((s) => s.code === home);
  if (homeStore) {
    return !isStoreOpen(homeStore, year, month, day, dim, doc.holidays);
  }
  return doc.stores.every((s) => !isStoreOpen(s, year, month, day, dim, doc.holidays));
}

export function keepOpenPtoDates(
  doc: ScheduleDoc,
  name: string,
  dates: string[],
): { kept: string[]; skipped: string[] } {
  const kept: string[] = [];
  const skipped: string[] = [];
  for (const date of uniqueSortedDates(dates)) {
    if (dateClosedForPerson(doc, name, date)) skipped.push(date);
    else kept.push(date);
  }
  return { kept, skipped };
}

export function formatDateList(dates: string[]): string {
  const sorted = uniqueSortedDates(dates);
  if (!sorted.length) return "";
  const groups: { start: string; end: string }[] = [];
  for (const date of sorted) {
    const last = groups[groups.length - 1];
    if (last && enumerateIsoRange(last.end, date).length === 2) {
      last.end = date;
    } else {
      groups.push({ start: date, end: date });
    }
  }
  return groups
    .map((g) => {
      const a = prettyMd(g.start);
      if (g.start === g.end) return a;
      return `${a}–${prettyMd(g.end)}`;
    })
    .join(", ");
}

function prettyMd(iso: string): string {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const label = MONTH_NAMES[month - 1]?.slice(0, 3) ?? iso.slice(5, 7);
  return `${label} ${day}`;
}
