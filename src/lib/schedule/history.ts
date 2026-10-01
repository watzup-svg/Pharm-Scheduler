import { monthName, weekdayShort } from "./calendar.ts";
import { shortStoreName } from "./fix.ts";
import type { ScheduleDoc } from "./types.ts";

export type HistoryEntry = {
  /** How many Undo steps take the schedule back to just before this change. */
  undoSteps: number;
  text: string;
};

type Cell = { store: string; slot: string; day: number; from: string; to: string };

function gridDiff(a: ScheduleDoc, b: ScheduleDoc): Cell[] {
  const out: Cell[] = [];
  const stores = new Set([...Object.keys(a.grid), ...Object.keys(b.grid)]);
  for (const store of stores) {
    const slots = new Set([...Object.keys(a.grid[store] ?? {}), ...Object.keys(b.grid[store] ?? {})]);
    for (const slot of slots) {
      const ra = (a.grid[store] as Record<string, Record<string, string>> | undefined)?.[slot] ?? {};
      const rb = (b.grid[store] as Record<string, Record<string, string>> | undefined)?.[slot] ?? {};
      for (const d of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
        const from = (ra[d] ?? "").trim();
        const to = (rb[d] ?? "").trim();
        if (from !== to) out.push({ store, slot, day: Number(d), from, to });
      }
    }
  }
  return out;
}

/** One plain sentence for what changed between two states. Read-only: it only compares. */
export function describeChange(a: ScheduleDoc, b: ScheduleDoc): string {
  const first = (n: string) => n.split(" ")[0] ?? n;
  const storeName = (code: string) => shortStoreName(b.stores.find((s) => s.code === code)?.name ?? a.stores.find((s) => s.code === code)?.name ?? code);
  const when = (d: number) => `${weekdayShort(b.year, b.month, d)} ${monthName(b.year, b.month).slice(0, 3)} ${d}`;
  const cells = gridDiff(a, b);
  if (cells.length === 1) {
    const c = cells[0]!;
    const where = `${storeName(c.store)}, ${when(c.day)}`;
    if (c.from && c.to) return `${first(c.to)} replaced ${first(c.from)} at ${where}`;
    if (c.to) return `${first(c.to)} scheduled at ${where}`;
    return `${first(c.from)} removed from ${where}`;
  }
  if (cells.length > 1) {
    const stores = [...new Set(cells.map((c) => storeName(c.store)))];
    return `${cells.length} shifts changed (${stores.slice(0, 3).join(", ")}${stores.length > 3 ? ` and ${stores.length - 3} more` : ""})`;
  }
  if (a.timeOff.length !== b.timeOff.length) {
    const added = b.timeOff.length > a.timeOff.length;
    const row = (added ? b.timeOff : a.timeOff).find((t) => !(added ? a.timeOff : b.timeOff).some((u) => u.name === t.name && u.from === t.from && u.to === t.to));
    return `Time off ${added ? "added" : "removed"}${row ? ` for ${first(row.name)}` : ""}`;
  }
  if (JSON.stringify(a.timeOff) !== JSON.stringify(b.timeOff)) return "Time off changed";
  if (a.people.length !== b.people.length) return a.people.length < b.people.length ? "Pharmacist added" : "Pharmacist removed";
  if (a.stores.length !== b.stores.length) return a.stores.length < b.stores.length ? "Store added" : "Store removed";
  if (JSON.stringify(a.holidays) !== JSON.stringify(b.holidays)) return "Holidays or closures changed";
  if (JSON.stringify(a.dayNotes) !== JSON.stringify(b.dayNotes)) return "Poster note changed";
  if (JSON.stringify(a.accepted ?? []) !== JSON.stringify(b.accepted ?? [])) return "A problem was left as is, or put back";
  return "Details changed";
}

/**
 * The steps that can be undone, newest first. `undoStack` holds the state before each change, oldest first, and `current` is now.
 * Going back to before a change is just that many Undo steps, so it uses the undo that already exists.
 */
export function historyEntries(undoStack: ScheduleDoc[], current: ScheduleDoc): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (let i = undoStack.length - 1; i >= 0; i--) {
    const before = undoStack[i]!;
    const after = i === undoStack.length - 1 ? current : undoStack[i + 1]!;
    out.push({ undoSteps: undoStack.length - i, text: describeChange(before, after) });
  }
  return out;
}
