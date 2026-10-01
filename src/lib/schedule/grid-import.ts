import { daysInMonth } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { placeName } from "./place.ts";
import type { ScheduleDoc, SlotId } from "./types.ts";

export type ImportProblem = { line: number; why: string; text: string };
export type ImportResult = {
  doc: ScheduleDoc;
  placed: number;
  /** Cells that already had a name and were left alone. */
  skipped: number;
  problems: ImportProblem[];
};

function findStore(doc: ScheduleDoc, raw: string) {
  const q = raw.trim().toLowerCase();
  return (
    doc.stores.find((s) => s.code.toLowerCase() === q) ??
    doc.stores.find((s) => s.name.toLowerCase() === q) ??
    doc.stores.find((s) => q.length >= 3 && s.name.toLowerCase().startsWith(q))
  );
}

function findPerson(doc: ScheduleDoc, raw: string): string | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const exact = doc.people.find((p) => p.name.toLowerCase() === q);
  if (exact) return exact.name;
  const first = doc.people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === q);
  return first.length === 1 ? first[0]!.name : null;
}

/**
 * Paste a schedule copied from a spreadsheet. One header row with day numbers (1, 2, 3 …) and one row
 * per store: the store code or name first, then optionally a row label ("2nd" or "second" for the
 * second pharmacist), then a name in each day's column. Names must match the roster (a first name is
 * fine when only one person has it). Filled cells are never overwritten, and the same rules as
 * typing apply: closed days and states someone is not licensed in are refused and reported.
 */
export function importGridText(doc: ScheduleDoc, text: string): ImportResult {
  const problems: ImportProblem[] = [];
  let next = doc;
  let placed = 0;
  let skipped = 0;
  const rows = text.split(/\r?\n/);
  const last = daysInMonth(doc.year, doc.month);

  let dayCols: Map<number, number> | null = null;
  let headerAt = -1;
  rows.forEach((line, i) => {
    if (dayCols) return;
    const cells = line.split("\t");
    const cols = new Map<number, number>();
    cells.forEach((c, idx) => {
      const n = Number(c.trim());
      if (Number.isInteger(n) && n >= 1 && n <= 31 && c.trim() !== "") cols.set(idx, n);
    });
    if (cols.size >= 2) {
      dayCols = cols;
      headerAt = i;
    }
  });
  if (!dayCols) {
    return { doc, placed: 0, skipped: 0, problems: [{ line: 1, why: "No header row of day numbers (1, 2, 3 …) found", text: rows[0] ?? "" }] };
  }
  const cols: Map<number, number> = dayCols;
  const firstDayCol = Math.min(...cols.keys());

  rows.forEach((line, i) => {
    if (i <= headerAt || !line.trim()) return;
    const cells = line.split("\t");
    const store = findStore(next, cells[0] ?? "");
    if (!store) {
      problems.push({ line: i + 1, why: `No store matches “${(cells[0] ?? "").trim()}”`, text: line.slice(0, 60) });
      return;
    }
    const label = cells.slice(1, firstDayCol).join(" ").toLowerCase();
    const slot: SlotId = /2|second|two/.test(label) ? "pharmacist2" : "pharmacist";
    for (const [col, day] of cols) {
      const raw = (cells[col] ?? "").trim();
      if (!raw || day > last) continue;
      const name = findPerson(next, raw);
      if (!name) {
        problems.push({ line: i + 1, why: `Day ${day}: no one on the roster is “${raw}”`, text: store.code });
        continue;
      }
      if (getCell(next.grid, store.code, slot, day).trim()) {
        skipped += 1;
        continue;
      }
      const res = placeName(next, store.code, slot, day, name);
      if (!res.ok) {
        problems.push({
          line: i + 1,
          why: `Day ${day}: ${name} ${res.reason === "shut" ? "at a closed store" : "is not licensed in that state"}`,
          text: store.code,
        });
        continue;
      }
      next = res.doc;
      placed += 1;
    }
  });
  return { doc: next, placed, skipped, problems };
}
