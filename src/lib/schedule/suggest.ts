import { daysInMonth, isoDate, monthWeeks, weekdaySun0 } from "./calendar.ts";
import { timeOffDates } from "./pto.ts";
import { choicesFor, offerable, type HoleChoice } from "./dashboard.ts";
import { driveBetween } from "./geo.ts";
import { getCell } from "./grid.ts";
import { mileageFor, mileageText, rateOf, type Mileage } from "./mileage.ts";
import { isOpenDay } from "./place.ts";
import { RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc, SlotId } from "./types.ts";

/**
 * Who could take this cell, best first, with plain reasons. This is ranking, not assigning:
 * nothing is placed. It uses only what is in the file: who is free, licensed, a float, how many
 * days they already work, how far they would drive, and their usual days off.
 */
export type Suggestion = {
  name: string;
  home: string;
  float: boolean;
  state: HoleChoice["state"];
  score: number;
  reasons: string[];
  miles: number | null;
  /** Mileage pay if they work here from their home store. */
  mileage: Mileage;
  /** Rough one-way drive from their home store, in minutes (straight line × 1.3 at 45 mph). Null without locations. */
  driveMinutes: number | null;
  /** True when driveMinutes is the address estimate; false when the manager set it. */
  driveEstimated: boolean;
  /** Reminder text that is not a reason to refuse (e.g. usually off that weekday). */
  cautions: string[];
};

type Loads = Map<string, { days: Set<number>; away: Set<number> }>;
const loadCache = new WeakMap<ScheduleDoc, Loads>();

/** Who works which open days, and which of those are away from home, worked out in one pass over the grid and kept per schedule. */
function loadsOf(doc: ScheduleDoc): Loads {
  const hit = loadCache.get(doc);
  if (hit) return hit;
  const loads: Loads = new Map();
  const home = new Map(doc.people.map((p) => [p.name, p.home]));
  const last = daysInMonth(doc.year, doc.month);
  for (const store of doc.stores) {
    for (let d = 1; d <= last; d++) {
      if (!isOpenDay(doc, store.code, d)) continue;
      for (const slot of RPH_SLOTS) {
        const name = getCell(doc.grid, store.code, slot, d).trim();
        if (!name) continue;
        const l = loads.get(name) ?? { days: new Set<number>(), away: new Set<number>() };
        l.days.add(d);
        const h = home.get(name);
        if (h && store.code !== h) l.away.add(d);
        loads.set(name, l);
      }
    }
  }
  loadCache.set(doc, loads);
  return loads;
}

/** Days this person already works in the month, and in the week (Sun–Sat) of `day`. */
export function loadFor(doc: ScheduleDoc, name: string, day: number): { month: number; week: number; away: number; weekAway: number } {
  const l = loadsOf(doc).get(name);
  const days = l?.days ?? new Set<number>();
  const week = monthWeeks(doc.year, doc.month).find((w) => w.includes(day)) ?? [];
  const away = l?.away ?? new Set<number>();
  return { away: away.size, weekAway: week.filter((d): d is number => d != null && away.has(d)).length, month: days.size, week: week.filter((d): d is number => d != null && days.has(d)).length };
}

/** "~1 hr 30 min" for an estimate, "1 hr 30 min" when the manager set it. */
export function driveLabel(minutes: number, estimated: boolean): string {
  return `${estimated ? "~" : ""}${driveText(minutes)}`;
}

export function driveText(minutes: number): string {
  if (minutes < 60) return `${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 5) * 5;
  return m === 60 ? `${h + 1} hr` : m ? `${h} hr ${m} min` : `${h} hr`;
}

export function rankCandidates(
  doc: ScheduleDoc,
  store: string,
  day: number,
  slot: SlotId = "pharmacist",
  opts: { exclude?: string[]; /** Also return people who must not be offered (for explaining why they are missing). */ includeUnlicensed?: boolean } = {},
): Suggestion[] {
  const exclude = new Set(opts.exclude ?? []);
  const storeRow = doc.stores.find((s) => s.code === store);
  const state = storeRow?.address.match(/,\s*([A-Z]{2})(?:\s+\d{5})?\s*$/)?.[1] ?? "";
  const out: Suggestion[] = [];
  for (const c of choicesFor(doc, store, day, slot)) {
    if (exclude.has(c.name) || c.here) continue;
    // Nobody is suggested for a state they are not licensed in (or can't be shown to be).
    if (!opts.includeUnlicensed && !offerable(c)) continue;
    const person = doc.people.find((p) => p.name === c.name);
    // The district manager asked that this person is not proposed. They can still be chosen by hand.
    if (person?.noSuggest && !opts.includeUnlicensed) continue;
    const drive = c.home ? driveBetween(doc, c.home, store) : null;
    const miles = drive?.miles ?? null;
    const driveMinutes = drive ? drive.minutes : null;
    const driveEstimated = drive?.estimated ?? true;
    const mileage = mileageFor(doc, c.home, store);
    const load = loadFor(doc, c.name, day);
    const usual = 5 + (doc.stores.find((s) => s.code === c.home)?.satOpen ? 1 : 0);
    const reasons: string[] = [];
    const cautions: string[] = [];
    let score = 0;

    if (c.state === "free") {
      score = 100;
      reasons.push("Free that day");
    } else if (c.state === "double") {
      score = 40;
      const nameOf = (code: string) => doc.stores.find((s) => s.code === code)?.name ?? code;
      reasons.push(`Working at ${c.elsewhere.map(nameOf).join(", ")} that day`);
      if (c.elsewhereSolo.length) {
        // Moving the only pharmacist out of a store just moves the gap.
        score -= 30;
        cautions.push(`Moving them leaves ${c.elsewhereSolo.map(nameOf).join(", ")} with no coverage`);
      }
    } else if (c.state === "dayoff") {
      score = 20;
      reasons.push("Usual day off");
      cautions.push("Usual day off: ask first");
    } else if (c.state === "off") {
      score = 10;
      reasons.push("On time off that day");
    } else {
      score = -100;
      reasons.push(`Not licensed in ${c.lacksLicence}`);
    }

    if (c.state !== "blocked") {
      if (state && (person?.licensedStates?.length ?? 0) > 0) reasons.push(`Licensed in ${state}`);
      if (c.home === store) {
        score += 25;
        reasons.push("Usually works here");
      } else if (c.float) {
        score += 15;
        reasons.push("Float");
      } else {
        score -= 20;
        cautions.push("Would work away from their home store");
      }
      if (miles != null && c.home !== store) {
        // Drive time matters most among people who are free: about 0.5 point a minute, no cap, so a
        // two-hour drive costs 60 points and a 40-minute one costs 20. Floats are not exempt.
        score -= driveMinutes! * 0.5;
        reasons.push(`${driveEstimated ? "About " : ""}${driveText(driveMinutes!)} drive from their home store${driveEstimated ? "" : " (set by you)"}`);
        if (driveMinutes! >= 90) cautions.push("Long drive");
      }
      if (c.home !== store) {
        // Mileage pay counts like drive time: one dollar about one minute (half a point). Unknown distance costs like a 15-minute guess.
        if (mileage.paidMiles == null) score -= 7.5;
        else if (mileage.paidMiles > 0) {
          score -= mileage.paidMiles * (rateOf(doc)) * 0.5;
          reasons.push(mileageText(mileage));
        }
      }
      score -= load.month;
      // Spread the covering around: someone who has already been away from home a lot this month comes a little lower.
      if (c.home !== store && load.away > 0) {
        score -= Math.min(16, load.away * 2);
        if (load.away >= 3) reasons.push(`Has covered away from home ${load.away} days this month`);
      }
      reasons.push(`${load.month} ${load.month === 1 ? "day" : "days"} worked this month`);
      if (load.week + 1 > usual) {
        score -= 25;
        cautions.push(`Would be day ${load.week + 1} this week (usually ${usual})`);
      }
      const date = isoDate(doc.year, doc.month, day);
      if (doc.timeOff.some((t) => t.name === c.name && t.status === "requested" && timeOffDates(t).includes(date))) {
        score -= 20;
        cautions.push("Has asked for this day off (not decided yet)");
      }
      if (c.state !== "dayoff" && person?.unavailableDays?.includes(weekdaySun0(doc.year, doc.month, day))) {
        score -= 15;
        cautions.push("Usual day off");
      }
    }
    out.push({ name: c.name, home: c.home, float: c.float, state: c.state, score, reasons, miles, mileage, driveMinutes, driveEstimated, cautions });
  }
  const order = { free: 0, double: 1, dayoff: 2, off: 3, blocked: 4 } as const;
  return out.sort((a, b) => order[a.state] - order[b.state] || b.score - a.score || a.name.localeCompare(b.name));
}
