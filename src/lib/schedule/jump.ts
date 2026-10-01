import { daysInMonth, isoDate } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { namePlacements } from "./coverage.ts";
import { timeOffDates } from "./pto.ts";
import { personByName, RPH_SLOTS, SLOTS } from "./slots.ts";
import type { CellRef, Evaluation, ScheduleDoc, SlotId, TimeOff } from "./types.ts";

export type JumpKind = "hole" | "double" | "leftover";

export type JumpTarget = CellRef & { kind: JumpKind };

function firstSlotWithName(doc: ScheduleDoc, store: string, day: number, names: string[]): SlotId {
  for (const slot of SLOTS) {
    const n = getCell(doc.grid, store, slot.id, day).trim();
    if (n && names.includes(n)) return slot.id;
  }
  return SLOTS[0]!.id;
}

export function jumpTargets(doc: ScheduleDoc, ev: Evaluation, kind: JumpKind): JumpTarget[] {
  const out: JumpTarget[] = [];
  for (const issue of ev.issues) {
    if (kind === "hole" && issue.hole) {
      out.push({ store: issue.store, slot: RPH_SLOTS[0]!, day: issue.day, kind });
    }
    if (kind === "double" && issue.doubledNames.length) {
      out.push({
        store: issue.store,
        slot: firstSlotWithName(doc, issue.store, issue.day, issue.doubledNames),
        day: issue.day,
        kind,
      });
    }
    if (kind === "leftover" && (issue.leftover || issue.staffLeftover)) {
      out.push({
        store: issue.store,
        slot: firstSlotWithName(doc, issue.store, issue.day, issue.leftoverNames),
        day: issue.day,
        kind,
      });
    }
  }
  return out;
}

function nextJump(targets: JumpTarget[], current: CellRef | null): JumpTarget | null {
  if (!targets.length) return null;
  if (!current) return targets[0] ?? null;
  const idx = targets.findIndex(
    (t) => t.store === current.store && t.slot === current.slot && t.day === current.day,
  );
  return targets[(idx + 1) % targets.length] ?? targets[0] ?? null;
}

export function nextNamed(doc: ScheduleDoc, name: string, current: CellRef | null): CellRef | null {
  const targets = namePlacements(doc, name);
  if (!targets.length) return null;
  return nextJump(
    targets.map((t) => ({ ...t, kind: "hole" as const })),
    current,
  );
}

/** Cell this person is on that calendar day, or their home slot if unplaced. */
export function personDayCell(doc: ScheduleDoc, name: string, day: number): CellRef {
  const hits = namePlacements(doc, name)
    .filter((p) => p.day === day)
    .sort((a, b) => a.store.localeCompare(b.store) || a.slot.localeCompare(b.slot));
  if (hits[0]) return hits[0];
  return timeOffJump(doc, name, [isoDate(doc.year, doc.month, day)]);
}

/** First cell this person is on during the Time Off dates; else home-store Pharmacist that day. */
export function timeOffJump(doc: ScheduleDoc, name: string, dates: string[] | TimeOff): CellRef {
  const list = Array.isArray(dates) ? dates : timeOffDates(dates);
  const set = new Set(list);
  const placed = namePlacements(doc, name)
    .filter((p) => set.has(isoDate(doc.year, doc.month, p.day)))
    .sort((a, b) => a.day - b.day || a.store.localeCompare(b.store) || a.slot.localeCompare(b.slot));
  if (placed[0]) return placed[0];

  const days = daysInMonth(doc.year, doc.month);
  let day = 1;
  for (let d = 1; d <= days; d++) {
    if (set.has(isoDate(doc.year, doc.month, d))) {
      day = d;
      break;
    }
  }
  const person = personByName(doc.people, name);
  const home = person?.home && person.home !== "—" ? person.home : "";
  const store = doc.stores.some((s) => s.code === home)
    ? home
    : (doc.stores[0]?.code ?? "EST");
  const slot = "pharmacist";
  return { store, slot, day };
}
