import { daysInMonth, isStoreOpen, monthName, weekdayShort, weekdaySun0 } from "./calendar.ts";
import { awayList, monthStatus, type MonthStatus } from "./dashboard.ts";
import { shortStoreName } from "./fix.ts";
import { hintsOnGrid } from "./hints.ts";
import { stateOfStore } from "./licence.ts";
import { issueKey } from "./rules.ts";
import { thinCoverDays } from "./thin.ts";
import { workloadFlags } from "./workload.ts";
import { getCell } from "./grid.ts";
import { RPH_SLOTS } from "./slots.ts";
import { isWaiting } from "./timeoff-view.ts";
import type { Evaluation, ScheduleDoc } from "./types.ts";

export type DayTone = "ok" | "hole" | "second" | "accepted" | "double" | "license" | "leftover" | "closed" | "off" | "away" | "cover";

/** The one look a store-day has. Most serious first, the same order the calendars use. */
export function dayTone(doc: ScheduleDoc, ev: Evaluation, store: string, day: number): DayTone {
  const issue = ev.byKey[issueKey(store, day)];
  if (!issue) return "ok";
  if (!issue.open) return issue.leftover ? "leftover" : issue.leftoverAccepted ? "accepted" : "closed";
  if (issue.unlicensedNames.length) return "license";
  if (issue.doubledNames.length) return "double";
  if (issue.hole) return "hole";
  if (issue.second) return "second";
  if (issue.holeAccepted || issue.secondAccepted || issue.doubledAccepted.length) return "accepted";
  if (issue.ptoNames.length) return "off";
  const names = RPH_SLOTS.map((s) => getCell(doc.grid, store, s, day).trim()).filter(Boolean);
  if (names.some((n) => { const p = doc.people.find((x) => x.name === n); return p?.role === "Pharmacist" && p.home !== store && p.home !== "—"; })) return "away";
  if (names.some((n) => { const p = doc.people.find((x) => x.name === n); return p && p.home !== store && p.home !== "—"; })) return "cover";
  return "ok";
}

export type StoreCard = {
  code: string;
  name: string;
  short: string;
  phone: string;
  state: string;
  /** Who is there today, when the file is this month. Null otherwise. */
  today: string[] | null;
  todayTone: DayTone | null;
  problems: number;
  /** First day of the month with something wrong at this store, or null. */
  firstProblemDay: number | null;
  /** Each problem day at this store in plain words, in date order: "No coverage · Wed Oct 21". */
  problemLines: string[];
};

export type District = {
  status: MonthStatus;
  counts: {
    holes: number;
    seconds: number;
    doubles: number;
    closedNames: number;
    unlicensed: number;
    /** Advisory, never blocking. */
    short: number;
    requests: number;
    away: number;
    thin: number;
    checks: number;
  };
  cards: StoreCard[];
  days: number;
  strip: { code: string; name: string; tones: DayTone[] }[];
  weekend: boolean[];
};

export function districtModel(doc: ScheduleDoc, ev: Evaluation, today: { year: number; month: number; day: number } | null): District {
  const days = daysInMonth(doc.year, doc.month);
  const inMonth = today != null && today.year === doc.year && today.month === doc.month;
  const status = monthStatus(doc, ev);
  const cards: StoreCard[] = doc.stores.map((s) => {
    let problems = 0;
    let first: number | null = null;
    const problemLines: string[] = [];
    const firstName = (n: string | undefined) => (n ?? "").split(" ")[0] ?? "";
    for (let d = 1; d <= days; d++) {
      const i = ev.byKey[issueKey(s.code, d)];
      if (i && (i.hole || i.second || i.leftover || i.doubledNames.length || i.unlicensedNames.length)) {
        problems += 1;
        if (first == null) first = d;
        const what = i.unlicensedNames.length
          ? `${firstName(i.unlicensedNames[0])} not licensed here`
          : i.doubledNames.length
            ? `${firstName(i.doubledNames[0])} at two stores`
            : i.hole
              ? "No coverage"
              : i.second
                ? "Needs a second"
                : `${firstName(i.leftoverNames[0])} on a closed day`;
        problemLines.push(`${what} · ${weekdayShort(doc.year, doc.month, d)} ${monthName(doc.year, doc.month).slice(0, 3)} ${d}`);
      }
    }
    const open = inMonth && isStoreOpen(s, doc.year, doc.month, today!.day, days, doc.holidays);
    return {
      code: s.code,
      name: s.name,
      short: shortStoreName(s.name),
      phone: s.phone ?? "",
      state: stateOfStore(s),
      today: inMonth ? (open ? RPH_SLOTS.map((sl) => getCell(doc.grid, s.code, sl, today!.day).trim()).filter(Boolean) : []) : null,
      todayTone: inMonth ? dayTone(doc, ev, s.code, today!.day) : null,
      problems,
      firstProblemDay: first,
      problemLines,
    };
  });
  const strip = doc.stores.map((s) => ({
    code: s.code,
    name: s.name,
    tones: Array.from({ length: days }, (_, i) => dayTone(doc, ev, s.code, i + 1)),
  }));
  const thin = thinCoverDays(doc, inMonth ? today!.day : 1);
  return {
    status,
    counts: {
      holes: ev.holes,
      seconds: ev.seconds,
      doubles: ev.doubles,
      closedNames: ev.closed,
      unlicensed: ev.unlicensed,
      short: ev.short,
      requests: doc.timeOff.filter((t) => isWaiting(doc, t)).length,
      away: awayList(doc).length,
      thin: thin.length,
      checks: hintsOnGrid(doc).length + workloadFlags(doc).length,
    },
    cards,
    days,
    strip,
    weekend: Array.from({ length: days }, (_, i) => [0, 6].includes(weekdaySun0(doc.year, doc.month, i + 1))),
  };
}

