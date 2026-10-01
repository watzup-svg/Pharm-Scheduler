import { effectiveTimeOff } from "./employment.ts";
import { daysInMonth, isoDate, isStoreOpen, weekdayLong, weekdayShort, weekdaySun0 } from "./calendar.ts";
import { namePlacements } from "./coverage.ts";
import { fixSteps, pickerOptions, shortStoreName, type FixStep } from "./fix.ts";
import { personHints, type Hint } from "./hints.ts";
import { licenceAt, unlicensedAt } from "./licence.ts";
import { getCell } from "./grid.ts";
import { formatDateList, isApproved, personOnPto, timeOffDates } from "./pto.ts";
import { isRphName, isRphRole, personByName, RPH_SLOTS } from "./slots.ts";
import type { CellRef, Evaluation, ScheduleDoc, SlotId } from "./types.ts";

export type Today = { year: number; month: number; day: number };

export type TodayLine = {
  code: string;
  name: string;
  rph: string[];
  hole: boolean;
  /** People standing here today who are on time off. */
  off: string[];
};

export type HoleChoice = {
  name: string;
  home: string;
  float: boolean;
  /** free: nobody has them that day. double: already in another store that day. off: on time off. dayoff: their usual weekly day off (ask first). */
  state: "free" | "double" | "off" | "dayoff" | "blocked";
  /** Store codes where this person already is that day (state "double"). */
  elsewhere: string[];
  /** Subset of `elsewhere` where they are the only pharmacist that day (moving them leaves that store with no coverage). */
  elsewhereSolo: string[];
  /** Already the name in this very cell. */
  here: boolean;
  /** Weekday reminders. Never block. */
  hints: Hint[];
  /** State they are not licensed in at this store; they cannot be placed here. */
  lacksLicence: string | null;
  /** ok, or the reason they must not be offered here ("lacks" a license, or none on file for this state). */
  licence: "ok" | "lacks" | "unrecorded";
  /** The store's state, for wording. */
  licenceState: string;
};

/** Only these may be suggested or listed as choices. Everyone else is named in a "not shown" note, never offered. */
export function offerable(c: Pick<HoleChoice, "state" | "licence">): boolean {
  return c.state !== "blocked" && c.licence === "ok";
}

export type NextHole = {
  store: string;
  storeName: string;
  day: number;
  weekday: string;
  reason: string;
  choices: HoleChoice[];
};

export type OffRow = {
  name: string;
  home: string;
  dates: string[];
  label: string;
  /** Cells this person is still placed on during those dates. */
  sitting: CellRef[];
};

export type MonthStatus = {
  ready: boolean;
  steps: FixStep[];
  next: FixStep | null;
  then: FixStep | null;
  /** Problems after `next` and `then`. */
  more: number;
  /** Time-off placements that print anyway. */
  printableTimeOff: number;
};

export type HoleRow = {
  store: string;
  storeName: string;
  day: number;
  weekday: string;
  reason: string;
  free: string[];
};

export type ShortageDay = {
  day: number;
  weekday: string;
  openStores: number;
  available: number;
  /** Codes of the stores open that day. */
  stores: string[];
};

export type RosterLine = {
  name: string;
  role: string;
  home: string;
  float: boolean;
  days: number;
  saturdays: number;
  /** First time-off day on or after `fromDay`, or null. */
  nextPto: number | null;
  /** Latest time-off day before `fromDay`, or null. */
  lastPto: number | null;
};

function rphOnStoreDay(doc: ScheduleDoc, store: string, day: number): string[] {
  return RPH_SLOTS.map((slot) => getCell(doc.grid, store, slot, day).trim()).filter(Boolean);
}

function isOpen(doc: ScheduleDoc, code: string, day: number): boolean {
  const store = doc.stores.find((s) => s.code === code);
  if (!store) return false;
  return isStoreOpen(store, doc.year, doc.month, day, daysInMonth(doc.year, doc.month), doc.holidays);
}

function sameMonth(doc: ScheduleDoc, today: Today): boolean {
  return today.year === doc.year && today.month === doc.month;
}

/** Ready or not, plus the next two problems in fix order (shut-day names, doubles, holes). */
export function monthStatus(doc: ScheduleDoc, ev: Evaluation): MonthStatus {
  const steps = fixSteps(doc, ev, "rph");
  return {
    // Both must agree. If they ever disagree, fail safe: not ready.
    ready: ev.ready && steps.length === 0,
    steps,
    next: steps[0] ?? null,
    then: steps[1] ?? null,
    more: Math.max(0, steps.length - 2),
    printableTimeOff: ev.issues.reduce((n, i) => n + i.ptoNames.length, 0),
  };
}

/** One line per open store. Closed stores are left out. Null when the file is not this month. */
export function todayLines(doc: ScheduleDoc, today: Today): TodayLine[] | null {
  if (!sameMonth(doc, today)) return null;
  const date = isoDate(doc.year, doc.month, today.day);
  const out: TodayLine[] = [];
  for (const store of doc.stores) {
    if (!isOpen(doc, store.code, today.day)) continue;
    const rph = rphOnStoreDay(doc, store.code, today.day);
    out.push({
      code: store.code,
      name: store.name,
      rph,
      hole: rph.length === 0,
      off: rph.filter((n) => personOnPto(effectiveTimeOff(doc), n, date)),
    });
  }
  return out;
}

/**
 * Everyone who could take this cell, best first. Nobody is placed.
 * "double" means putting them here would put them in two places that date
 * (another store, or the other pharmacist row of this store).
 */
export function choicesFor(
  doc: ScheduleDoc,
  store: string,
  day: number,
  slot: SlotId = "pharmacist",
): HoleChoice[] {
  const date = isoDate(doc.year, doc.month, day);
  const here = getCell(doc.grid, store, slot, day).trim();
  return pickerOptions(doc, store, "RPh", day, here).map(({ name }) => {
    const person = personByName(doc.people, name);
    const elsewhere = doc.stores
      .filter((s) =>
        RPH_SLOTS.some(
          (other) =>
            !(s.code === store && other === slot) && getCell(doc.grid, s.code, other, day).trim() === name,
        ),
      )
      .map((s) => s.code);
    const elsewhereSolo = elsewhere.filter((code) => rphOnStoreDay(doc, code, day).length <= 1);
    const lacksLicence = unlicensedAt(doc, name, store, date);
    const lic = licenceAt(doc, name, store);
    const state: HoleChoice["state"] = lacksLicence
      ? "blocked"
      : personOnPto(effectiveTimeOff(doc), name, date)
        ? "off"
        : elsewhere.length
          ? "double"
          : person?.unavailableDays?.includes(weekdaySun0(doc.year, doc.month, day))
            ? "dayoff"
            : "free";
    return {
      name,
      home: person?.home && person.home !== "—" ? person.home : "",
      float: person?.role === "Float Pharmacist",
      state,
      elsewhere,
      elsewhereSolo,
      here: name === here,
      hints: personHints(doc, name, store, day),
      lacksLicence,
      licence: lacksLicence ? "lacks" : lic.status,
      licenceState: lic.state,
    };
  });
}

export function holeQueue(doc: ScheduleDoc): HoleRow[] {
  const days = daysInMonth(doc.year, doc.month);
  const rows: HoleRow[] = [];
  for (const store of doc.stores) {
    for (let day = 1; day <= days; day++) {
      if (!isStoreOpen(store, doc.year, doc.month, day, days, doc.holidays)) continue;
      if (rphOnStoreDay(doc, store.code, day).length) continue;
      const date = isoDate(doc.year, doc.month, day);
      const homeRph = doc.people.find(
        (p) => p.role === "Pharmacist" && p.home === store.code,
      );
      const reason =
        homeRph && personOnPto(effectiveTimeOff(doc), homeRph.name, date)
          ? `${homeRph.name.split(" ")[0]} PTO`
          : "no pharmacist";
      const free = choicesFor(doc, store.code, day)
        .filter((c) => c.state === "free" && offerable(c))
        .map((c) => c.name);
      rows.push({
        store: store.code,
        storeName: shortStoreName(store.name),
        day,
        weekday: weekdayShort(doc.year, doc.month, day),
        reason,
        free: free.slice(0, 3),
      });
    }
  }
  return rows;
}

/**
 * The earliest open hole. When the file is this month, holes from today on come first;
 * earlier holes only show once nothing later is left.
 */
export function nextHole(doc: ScheduleDoc, today?: Today): NextHole | null {
  const rows = holeQueue(doc);
  if (!rows.length) return null;
  const order = (a: HoleRow, b: HoleRow) =>
    a.day - b.day || doc.stores.findIndex((s) => s.code === a.store) - doc.stores.findIndex((s) => s.code === b.store);
  const sorted = [...rows].sort(order);
  const upcoming = today && sameMonth(doc, today) ? sorted.filter((r) => r.day >= today.day) : sorted;
  const row = (upcoming.length ? upcoming : sorted)[0]!;
  return {
    store: row.store,
    storeName: row.storeName,
    day: row.day,
    weekday: weekdayLong(doc.year, doc.month, row.day),
    reason: row.reason,
    choices: choicesFor(doc, row.store, row.day),
  };
}

/** Time off this month, one row per person, and whether they are still on a shift those dates. */
export function offThisMonth(doc: ScheduleDoc): OffRow[] {
  const start = isoDate(doc.year, doc.month, 1);
  const end = isoDate(doc.year, doc.month, daysInMonth(doc.year, doc.month));
  const byName = new Map<string, Set<string>>();
  for (const row of doc.timeOff) {
    if (!isRphName(doc.people, row.name) || !isApproved(row)) continue;
    for (const date of timeOffDates(row)) {
      if (date < start || date > end) continue;
      const set = byName.get(row.name) ?? new Set<string>();
      set.add(date);
      byName.set(row.name, set);
    }
  }
  const out: OffRow[] = [];
  for (const person of doc.people) {
    const set = byName.get(person.name);
    if (!set) continue;
    const dates = [...set].sort();
    out.push({
      name: person.name,
      home: person.home === "—" ? "" : person.home,
      dates,
      label: formatDateList(dates),
      sitting: namePlacements(doc, person.name).filter((p) => set.has(isoDate(doc.year, doc.month, p.day))),
    });
  }
  return out;
}

export function shortageDays(doc: ScheduleDoc): ShortageDay[] {
  const days = daysInMonth(doc.year, doc.month);
  const rph = doc.people.filter((p) => isRphRole(p.role));
  const out: ShortageDay[] = [];
  for (let day = 1; day <= days; day++) {
    const date = isoDate(doc.year, doc.month, day);
    const open = doc.stores.filter((s) => isStoreOpen(s, doc.year, doc.month, day, days, doc.holidays));
    if (!open.length) continue;
    const available = rph.filter((p) => !personOnPto(effectiveTimeOff(doc), p.name, date)).length;
    if (open.length > available) {
      out.push({
        day,
        weekday: weekdayLong(doc.year, doc.month, day),
        openStores: open.length,
        available,
        stores: open.map((s) => s.code),
      });
    }
  }
  return out;
}

export function saturdaysWorked(doc: ScheduleDoc, name: string): number {
  const seen = new Set<number>();
  for (const store of Object.keys(doc.grid)) {
    const slots = doc.grid[store] ?? {};
    for (const row of Object.values(slots)) {
      for (const [day, n] of Object.entries(row ?? {})) {
        if (n !== name) continue;
        const d = Number(day);
        if (weekdaySun0Safe(doc.year, doc.month, d) === 6) seen.add(d);
      }
    }
  }
  return seen.size;
}

function weekdaySun0Safe(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Distinct calendar days, so a person doubled on one date counts once. */
function daysWorkedKind(
  doc: ScheduleDoc,
  name: string,
  slots: readonly string[],
): number {
  const days = new Set<number>();
  for (const store of Object.keys(doc.grid)) {
    for (const slot of slots) {
      const row = doc.grid[store]?.[slot as keyof (typeof doc.grid)[string]] ?? {};
      for (const [day, n] of Object.entries(row ?? {})) {
        if (n === name) days.add(Number(day));
      }
    }
  }
  return days.size;
}

/** Pharmacist workload. `fromDay` makes "next time off" mean the next one from that day on. */
export function rosterLines(doc: ScheduleDoc, fromDay = 1): RosterLine[] {
  return doc.people
    .filter((p) => isRphRole(p.role))
    .map((p) => ({
      name: p.name,
      role: p.role,
      home: p.home,
      float: p.role === "Float Pharmacist",
      days: daysWorkedKind(doc, p.name, RPH_SLOTS),
      saturdays: saturdaysWorked(doc, p.name),
      nextPto: ptoDay(doc, p.name, fromDay, "next"),
      lastPto: ptoDay(doc, p.name, fromDay, "last"),
    }));
}

function ptoDay(doc: ScheduleDoc, name: string, fromDay: number, which: "next" | "last"): number | null {
  const start = isoDate(doc.year, doc.month, 1);
  const end = isoDate(doc.year, doc.month, daysInMonth(doc.year, doc.month));
  const from = isoDate(doc.year, doc.month, Math.max(1, fromDay));
  let found: number | null = null;
  for (const row of doc.timeOff) {
    if (row.name !== name || !isApproved(row)) continue;
    for (const date of timeOffDates(row)) {
      if (date < start || date > end) continue;
      if (which === "next" ? date < from : date >= from) continue;
      const day = Number(date.slice(8, 10));
      if (found == null || (which === "next" ? day < found : day > found)) found = day;
    }
  }
  return found;
}

export function covering(doc: ScheduleDoc, name: string, store: string): boolean {
  const person = personByName(doc.people, name);
  if (!person?.home || person.home === "—") return false;
  return person.home !== store;
}

/**
 * The regular (non-float) pharmacist working at a store that is not their home. Floats work anywhere
 * by design, so they are not "away". Returns the home store code, or null.
 */
export function awayFromHome(doc: ScheduleDoc, name: string, store: string): string | null {
  const person = personByName(doc.people, name);
  if (!person || person.role !== "Pharmacist") return null;
  if (!person.home || person.home === "—" || person.home === store) return null;
  return doc.stores.some((s) => s.code === person.home) ? person.home : null;
}

export type AwayRow = { name: string; home: string; ref: CellRef };

/** Every open-day placement of a regular pharmacist away from their home store, in date order. */
export function awayList(doc: ScheduleDoc): AwayRow[] {
  const out: AwayRow[] = [];
  const days = daysInMonth(doc.year, doc.month);
  for (let day = 1; day <= days; day++) {
    for (const store of doc.stores) {
      if (!isStoreOpen(store, doc.year, doc.month, day, days, doc.holidays)) continue;
      for (const slot of RPH_SLOTS) {
        const name = getCell(doc.grid, store.code, slot, day).trim();
        if (!name) continue;
        const home = awayFromHome(doc, name, store.code);
        if (home) out.push({ name, home, ref: { store: store.code, slot, day } });
      }
    }
  }
  return out;
}
