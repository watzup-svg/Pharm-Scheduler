import { effectiveTimeOff } from "./employment.ts";
import {
  weekdaySun0,
  daysInMonth,
  isoDate,
  isStoreOpen,
} from "./calendar.ts";
import { getCell, namesOnStoreDay } from "./grid.ts";
import { OFF_WORDS, offKind } from "./employment.ts";
import { unlicensedAt } from "./licence.ts";
import { personOnPto } from "./pto.ts";
import { isRphName, RPH_SLOTS } from "./slots.ts";
import type { DayIssue, Evaluation, ScheduleDoc } from "./types.ts";

export function issueKey(store: string, day: number): string {
  return `${store}|${day}`;
}

function joinNames(names: string[]): string {
  return names.join(", ");
}

function whyText(issue: Omit<DayIssue, "why">): string {
  const parts: string[] = [];
  if (issue.doubledNames.length) {
    parts.push(`${joinNames(issue.doubledNames)} is booked at two stores. Clear one.`);
  }
  if (issue.unlicensedNames.length) {
    parts.push(`Not licensed in this state: ${joinNames(issue.unlicensedNames)}. Clear or replace.`);
  }
  if (issue.hole) parts.push("No coverage: no pharmacist. Add one.");
  if (issue.leftover && issue.leftoverNames.length) {
    const rph = issue.leftoverNames.filter((n) => n);
    parts.push(`Closed — clear ${joinNames(rph)}.`);
  }
  if (issue.staffLeftover && issue.leftoverNames.length && !issue.leftover) {
    parts.push(`Closed — clear ${joinNames(issue.leftoverNames)}.`);
  }
  if (issue.ptoNames.length) {
    const words = OFF_WORDS;
    const by = new Map<string, string[]>();
    for (const n of issue.ptoNames) by.set(words[issue.ptoWhy?.[n] ?? "time-off"], [...(by.get(words[issue.ptoWhy?.[n] ?? "time-off"]) ?? []), n]);
    parts.push(`${[...by].map(([w, names]) => `${joinNames(names)} ${w}`).join("; ")} (prints yellow).`);
  }
  return parts.join(" ");
}

function doubledNamesByDay(doc: ScheduleDoc, days: number): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (let day = 1; day <= days; day++) {
    const counts = new Map<string, number>();
    for (const store of doc.stores) {
      for (const name of namesOnStoreDay(doc.grid, store.code, day)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    const doubled = [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .map(([name]) => name)
      .filter((name) => isRphName(doc.people, name));
    if (doubled.length) out[day] = doubled;
  }
  return out;
}

function rphNames(doc: ScheduleDoc, store: string, day: number): string[] {
  return RPH_SLOTS.map((slot) => getCell(doc.grid, store, slot, day).trim()).filter(Boolean);
}

/** Keys for problems the district manager can accept. Licenses are not among them: nobody may work in a state they are not licensed in. */
export const holeKey = (store: string, day: number) => `hole|${store}|${day}`;
export const leftoverKey = (store: string, day: number) => `leftover|${store}|${day}`;
export const doubleKey = (name: string, day: number) => `double|${name}|${day}`;

export function evaluate(doc: ScheduleDoc): Evaluation {
  const days = daysInMonth(doc.year, doc.month);
  const rawDoubled = doubledNamesByDay(doc, days);
  const acked = new Set((doc.accepted ?? []).map((a) => a.key));
  const problemKeys: string[] = [];
  let accepted = 0;
  // A person in two places is one problem for the day, so it is accepted by name and day, not by store.
  const doubledByDay: Record<number, string[]> = {};
  for (const [d, names] of Object.entries(rawDoubled)) {
    const day = Number(d);
    const open = names.filter((n) => {
      problemKeys.push(doubleKey(n, day));
      if (acked.has(doubleKey(n, day))) {
        accepted += 1;
        return false;
      }
      return true;
    });
    if (open.length) doubledByDay[day] = open;
  }
  const issues: DayIssue[] = [];
  const byKey: Record<string, DayIssue> = {};
  const storeHoles: Record<string, number> = {};
  const storeClosed: Record<string, number> = {};

  let holes = 0;
  let closed = 0;
  let staffClosed = 0;
  let doubles = 0;
  let unlicensed = 0;
  let short = 0;
  let warns = 0;
  let staffWarns = 0;

  for (const names of Object.values(doubledByDay)) doubles += names.length;

  for (const store of doc.stores) {
    storeHoles[store.code] = 0;
    storeClosed[store.code] = 0;
    for (let day = 1; day <= days; day++) {
      const open = isStoreOpen(store, doc.year, doc.month, day, days, doc.holidays);
      const date = isoDate(doc.year, doc.month, day);
      const placed = namesOnStoreDay(doc.grid, store.code, day);
      const leftoverAll = open ? [] : placed;
      const rphLeft = leftoverAll.filter((n) => isRphName(doc.people, n));
      const leftover = rphLeft.length > 0;
      const staffLeftover = leftoverAll.some((n) => !isRphName(doc.people, n));
      const leftoverNames = leftoverAll;
      const rph = rphNames(doc, store.code, day);
      const holeRaw = open && rph.length === 0;
      const holeAccepted = holeRaw && acked.has(holeKey(store.code, day));
      const hole = holeRaw && !holeAccepted;
      if (holeRaw) problemKeys.push(holeKey(store.code, day));
      if (holeAccepted) accepted += 1;
      const leftoverRaw = leftover;
      const leftoverAccepted = leftoverRaw && acked.has(leftoverKey(store.code, day));
      if (leftoverRaw) problemKeys.push(leftoverKey(store.code, day));
      if (leftoverAccepted) accepted += 1;
      const doubledNames = (doubledByDay[day] ?? []).filter((n) => placed.includes(n));
      const doubledAccepted = (rawDoubled[day] ?? []).filter((n) => placed.includes(n) && acked.has(doubleKey(n, day)));
      // Only open days: a name on a closed day is already a leftover.
      const unlicensedNames = open ? [...new Set(rph.filter((n) => unlicensedAt(doc, n, store.code, date)))] : [];
      const ptoNames = [...new Set(placed.filter((n) => personOnPto(effectiveTimeOff(doc), n, date) && isRphName(doc.people, n)))];

      const ptoWhy = Object.fromEntries(ptoNames.map((n) => [n, offKind(doc, n, date)]));
      const soloFloatName: string | null = null;
      const needsSecond = open && rph.length === 1 && (store.twoPharmacistDays ?? []).includes(weekdaySun0(doc.year, doc.month, day));

      const base = {
        store: store.code,
        day,
        hole,
        holeAccepted,
        leftover: leftover && !leftoverAccepted,
        leftoverAccepted,
        staffLeftover,
        leftoverNames,
        doubledNames,
        doubledAccepted,
        unlicensedNames,
        needsSecond,
        ptoNames,
        ptoWhy,
        soloFloatName,
        open,
      };
      const issue: DayIssue = { ...base, why: whyText(base) };
      issues.push(issue);
      byKey[issueKey(store.code, day)] = issue;

      if (hole) {
        holes += 1;
        storeHoles[store.code] += 1;
      }
      if (leftover && !leftoverAccepted) {
        closed += 1;
        storeClosed[store.code] += 1;
      }
      if (staffLeftover) staffClosed += 1;
      unlicensed += unlicensedNames.length;
      if (needsSecond) short += 1;
      if (ptoNames.length) warns += 1;
    }
  }

  return {
    holes,
    closed,
    staffClosed,
    doubles,
    unlicensed,
    short,
    warns,
    staffWarns,
    ready: holes + closed + doubles + unlicensed === 0,
    accepted,
    problemKeys,
    issues,
    byKey,
    doubledByDay,
    storeHoles,
    storeClosed,
  };
}
