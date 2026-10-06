// Old vs new problem counts for prototype saved files.
//   node --experimental-strip-types scripts/v3-compare.ts month1.hisp.json [month2.hisp.json ...]
import { readFileSync } from "node:fs";
import { parseDoc } from "../src/lib/schedule/file.ts";
import { evaluate as evalOld } from "../src/lib/schedule/rules.ts";
import { DRIVE_TABLE } from "../src/lib/schedule/drive-table.ts";
import { importV2 } from "../domain/src/import-v2.ts";
import { evaluate as evalNew } from "../domain/src/coverage.ts";
import { monthDates } from "../domain/src/dates.ts";
import type { ScheduleDoc } from "../src/lib/schedule/types.ts";

export type Row = {
  month: string;
  old: { holes: number; leftover: number; doubledPersonDays: number; unlicensed: number; short: number; accepted: number; warns: number };
  neu: { openCells: number; openNoAssignment: number; openWithAssignment: number; closure: number; doubleBooking: number; doublePersonDays: number; licensing: number; availability: number; unverified: number };
  explained: string[];
  unexplained: string[];
};

export function compareDocs(docs: ScheduleDoc[]): { rows: Row[]; skipped: number } {
  const { world, report } = importV2(docs as unknown[], { driveTable: DRIVE_TABLE });
  const rows: Row[] = [];
  for (const doc of docs) {
    const ym = `${doc.year}-${String(doc.month).padStart(2, "0")}`;
    const dates = monthDates(ym);
    const o = evalOld(doc);
    const ev = evalNew(world.state, "0001-01-01", { range: { from: dates[0]!, to: dates[dates.length - 1]! } });
    const inMonth = (d: string) => d.startsWith(ym);
    const cells = Object.values(ev.cells).filter((c) => inMonth(c.date));
    const noAsg = (c: { storeId: string; date: string }) => !Object.values(world.state.assignments).some((a) => a.storeId === c.storeId && a.date === c.date);
    const openCells = cells.filter((c) => c.open > 0);
    const f = (rule: string) => Object.values(world.state.assignments).filter((a) => inMonth(a.date) && ev.assignments[a.id]!.results.some((r) => r.ruleId === rule && r.verdict === "Fail" && !r.overridden)).length;
    const doubledKeys = new Set<string>();
    for (const a of Object.values(world.state.assignments)) if (inMonth(a.date) && ev.assignments[a.id]!.results.some((r) => r.ruleId === "double-booking" && r.verdict === "Fail" && !r.overridden)) doubledKeys.add(`${a.pharmacistId}|${a.date}`);
    const row: Row = {
      month: ym,
      old: { holes: o.holes, leftover: o.closed, doubledPersonDays: o.doubles, unlicensed: o.unlicensed, short: o.short, accepted: o.accepted, warns: o.warns },
      neu: {
        openCells: openCells.length, openNoAssignment: openCells.filter(noAsg).length, openWithAssignment: openCells.filter((c) => !noAsg(c)).length,
        closure: f("closure"), doubleBooking: f("double-booking"), doublePersonDays: doubledKeys.size, licensing: f("licensing"), availability: f("availability"),
        unverified: cells.reduce((n, c) => n + c.unverified, 0),
      },
      explained: [], unexplained: [],
    };
    // Known reclassifications between the two models.
    if (row.neu.availability) row.explained.push(`${row.neu.availability} assignment(s) on time off: a warning in the prototype, a non-counting Fail in v3`);
    if (row.neu.openWithAssignment) row.explained.push(`${row.neu.openWithAssignment} cell(s) open in v3 because the person placed there does not count (time off, license, closure, double booking)`);
    if (row.old.short) row.explained.push(`${row.old.short} advisory 'needs second' day(s) in the prototype; v3 requires 2 on those weekdays, so they show as open when only one is placed`);
    // Comparable numbers must match.
    if (row.neu.closure !== row.old.leftover) row.unexplained.push(`closed-day leftovers: old ${row.old.leftover}, new ${row.neu.closure}`);
    if (row.neu.doublePersonDays !== row.old.doubledPersonDays) row.unexplained.push(`doubled person-days: old ${row.old.doubledPersonDays}, new ${row.neu.doublePersonDays}`);
    if (row.neu.licensing !== row.old.unlicensed) row.unexplained.push(`unlicensed placements: old ${row.old.unlicensed}, new ${row.neu.licensing}`);
    if (row.neu.openNoAssignment < row.old.holes) row.unexplained.push(`holes: old ${row.old.holes}, new empty-and-open ${row.neu.openNoAssignment}`);
    rows.push(row);
  }
  return { rows, skipped: report.skipped.length };
}

if (process.argv[1]?.endsWith("v3-compare.ts")) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error("usage: v3-compare.ts file.hisp.json ..."); process.exit(2); }
  const docs = files.map((f) => parseDoc(readFileSync(f, "utf8")));
  const { rows, skipped } = compareDocs(docs);
  for (const r of rows) {
    console.log(`\n${r.month}`);
    console.log("  old:", JSON.stringify(r.old));
    console.log("  new:", JSON.stringify(r.neu));
    for (const e of r.explained) console.log("  explained:", e);
    for (const e of r.unexplained) console.log("  UNEXPLAINED:", e);
  }
  console.log(`\n${skipped} item(s) skipped on import (see importV2 report).`);
  process.exit(rows.some((r) => r.unexplained.length) ? 1 : 0);
}
