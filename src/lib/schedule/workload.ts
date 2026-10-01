import { daysInMonth, monthWeeks, MONTH_NAMES, weekdaySun0 } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { isOpenDay } from "./place.ts";
import { isRphRole, RPH_SLOTS } from "./slots.ts";
import type { CellRef, ScheduleDoc } from "./types.ts";

/** Yellow flags on how much someone works. Never blocks print and never touches "ready". */
export type WorkloadFlag = {
  name: string;
  kind: "week" | "run" | "saturdays";
  text: string;
  /** The first cell worth looking at. */
  ref: CellRef;
};

const RUN_LIMIT = 7;
const SAT_GAP = 2;

/** Open days each person is on, with one cell per day for jumping to it. */
function workedDays(doc: ScheduleDoc): Map<string, Map<number, CellRef>> {
  const out = new Map<string, Map<number, CellRef>>();
  const days = daysInMonth(doc.year, doc.month);
  for (const store of doc.stores) {
    for (let day = 1; day <= days; day++) {
      if (!isOpenDay(doc, store.code, day)) continue;
      for (const slot of RPH_SLOTS) {
        const name = getCell(doc.grid, store.code, slot, day).trim();
        if (!name) continue;
        const map = out.get(name) ?? new Map<number, CellRef>();
        if (!map.has(day)) map.set(day, { store: store.code, slot, day });
        out.set(name, map);
      }
    }
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function workloadFlags(doc: ScheduleDoc): WorkloadFlag[] {
  const out: WorkloadFlag[] = [];
  const worked = workedDays(doc);
  const weeks = monthWeeks(doc.year, doc.month);
  const monthLabel = MONTH_NAMES[doc.month - 1]!.slice(0, 3);

  for (const person of doc.people) {
    if (!isRphRole(person.role)) continue;
    const days = worked.get(person.name);
    if (!days || !days.size) continue;
    const home = doc.stores.find((s) => s.code === person.home);
    // A normal week: Monday to Friday, plus Saturday when the home store opens Saturdays.
    const usual = 5 + (home?.satOpen ? 1 : 0);

    for (const week of weeks) {
      const inWeek = week.filter((d): d is number => d != null && days.has(d));
      if (inWeek.length > usual) {
        const first = week.find((d): d is number => d != null)!;
        out.push({
          name: person.name,
          kind: "week",
          text: `${person.name}: ${inWeek.length} days the week of ${monthLabel} ${first} (usually ${usual})`,
          ref: days.get(inWeek[usual]!)!,
        });
      }
    }

    // One flag per stretch of seven or more days in a row, reported once with its full length.
    const last = daysInMonth(doc.year, doc.month);
    let run = 0;
    for (let d = 1; d <= last + 1; d++) {
      if (d <= last && days.has(d)) {
        run += 1;
        continue;
      }
      if (run >= RUN_LIMIT) {
        out.push({
          name: person.name,
          kind: "run",
          text: `${person.name}: ${run} days in a row ending ${monthLabel} ${d - 1}`,
          ref: days.get(d - 1)!,
        });
      }
      run = 0;
    }
  }

  // Saturdays: only compare people whose home store opens on Saturdays.
  const sat = (name: string) => [...(worked.get(name)?.keys() ?? [])].filter((d) => weekdaySun0(doc.year, doc.month, d) === 6);
  const peers = doc.people.filter((p) => isRphRole(p.role) && doc.stores.find((s) => s.code === p.home)?.satOpen);
  if (peers.length >= 3) {
    const mid = median(peers.map((p) => sat(p.name).length));
    for (const p of peers) {
      const mine = sat(p.name);
      if (mine.length >= mid + SAT_GAP && mine.length >= 1) {
        out.push({
          name: p.name,
          kind: "saturdays",
          text: `${p.name}: ${mine.length} Saturdays (most work ${mid})`,
          ref: worked.get(p.name)!.get(mine[0]!)!,
        });
      }
    }
  }
  return out;
}
