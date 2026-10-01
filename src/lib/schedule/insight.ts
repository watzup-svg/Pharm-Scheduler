// Read-only pictures of decisions the month already contains. Nothing here writes or changes a rule.
import { daysInMonth, isStoreOpen, isoDate, weekdaySun0 } from "./calendar.ts";
import { choicesFor, offerable } from "./dashboard.ts";
import { effectiveTimeOff } from "./employment.ts";
import { getCell } from "./grid.ts";
import { stateOfStore } from "./licence.ts";
import { personOnPto } from "./pto.ts";
import { isRphRole, RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

export type Pressure = {
  day: number;
  open: number;
  /** Open stores with nobody named. */
  holes: number;
  /** Pharmacists who could be placed that day without being in two places, off, or unlicensed for the store. */
  free: number;
  /** free minus holes. Negative means the day cannot be fully covered. */
  spare: number;
  level: "closed" | "spare" | "tight" | "none";
};

/** Per day: open shifts still empty against pharmacists still free. A short bar is spare, a red bar is nobody left. */
export function dayPressure(doc: ScheduleDoc): Pressure[] {
  const days = daysInMonth(doc.year, doc.month);
  const out: Pressure[] = [];
  for (let day = 1; day <= days; day++) {
    const open = doc.stores.filter((s) => isStoreOpen(s, doc.year, doc.month, day, days, doc.holidays));
    if (!open.length) {
      out.push({ day, open: 0, holes: 0, free: 0, spare: 0, level: "closed" });
      continue;
    }
    const holeStores = open.filter((s) => !RPH_SLOTS.some((slot) => getCell(doc.grid, s.code, slot, day).trim()));
    // Anyone free for an empty store counts once, however many stores are empty. Who is free only varies with the licence state of
    // the store, so one probe per state is enough (asking every empty store was the slow part on a big district).
    const probes = new Map<string, string>();
    for (const s of holeStores.length ? holeStores : [open[0]!]) if (!probes.has(stateOfStore(s))) probes.set(stateOfStore(s), s.code);
    const free = new Set<string>();
    for (const code of probes.values()) for (const c of choicesFor(doc, code, day)) if (c.state === "free" && offerable(c) && !c.here) free.add(c.name);
    const spare = free.size - holeStores.length;
    out.push({ day, open: open.length, holes: holeStores.length, free: free.size, spare, level: spare < 0 ? "none" : spare === 0 ? "tight" : "spare" });
  }
  return out;
}

export type PersonDay = "none" | "home" | "cover" | "off" | "double";
export type PersonMonth = { name: string; days: PersonDay[]; /** The store they are at each day (the first, when in two), or null. */ at: (string | null)[]; away: number; worked: number; saturdays: number; sat: boolean[] };

/** Each pharmacist's month on one line: at home, covering elsewhere, on time off, or in two places. Most days away first. */
export function personMonths(doc: ScheduleDoc): PersonMonth[] {
  const n = daysInMonth(doc.year, doc.month);
  const off = effectiveTimeOff(doc);
  const sat = Array.from({ length: n }, (_, i) => weekdaySun0(doc.year, doc.month, i + 1) === 6);
  const rows: PersonMonth[] = [];
  for (const p of doc.people) {
    if (!isRphRole(p.role)) continue;
    const days: PersonDay[] = [];
    const where: (string | null)[] = [];
    let away = 0;
    let worked = 0;
    let saturdays = 0;
    for (let d = 1; d <= n; d++) {
      const at = doc.stores.filter((s) => RPH_SLOTS.some((slot) => getCell(doc.grid, s.code, slot, d).trim() === p.name));
      let state: PersonDay = "none";
      if (at.length > 1) state = "double";
      else if (at.length === 1) state = at[0]!.code === p.home || p.home === "—" ? "home" : "cover";
      else if (personOnPto(off, p.name, isoDate(doc.year, doc.month, d))) state = "off";
      if (state !== "none" && state !== "off") {
        worked += 1;
        if (sat[d - 1]) saturdays += 1;
      }
      if (state === "cover") away += 1;
      days.push(state);
      where.push(at[0]?.code ?? null);
    }
    rows.push({ name: p.name, days, at: where, away, worked, saturdays, sat });
  }
  return rows.sort((a, b) => b.away - a.away || b.worked - a.worked || a.name.localeCompare(b.name));
}

export type StoreRun = { name: string; days: number; changes: number } | null;

/** The longest stretch of open days one pharmacist stays at a store, and how many times the name changes. */
export function storeRun(doc: ScheduleDoc, store: string): StoreRun {
  const s = doc.stores.find((x) => x.code === store);
  if (!s) return null;
  const n = daysInMonth(doc.year, doc.month);
  let best: { name: string; days: number } | null = null;
  let cur = "";
  let len = 0;
  let changes = 0;
  let last = "";
  for (let d = 1; d <= n; d++) {
    if (!isStoreOpen(s, doc.year, doc.month, d, n, doc.holidays)) continue;
    const name = RPH_SLOTS.map((slot) => getCell(doc.grid, store, slot, d).trim()).find(Boolean) ?? "";
    if (name && last && name !== last) changes += 1;
    if (name) last = name;
    if (name && name === cur) len += 1;
    else {
      cur = name;
      len = name ? 1 : 0;
    }
    if (name && (!best || len > best.days)) best = { name, days: len };
  }
  return best ? { ...best, changes } : null;
}
