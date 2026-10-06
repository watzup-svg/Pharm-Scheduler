// Timing for the domain on a realistic size: 18 stores, 45 pharmacists, 31 days.
//   node --experimental-strip-types scripts/v3-perf.ts
import { api } from "../domain/src/api.ts";
import { seedWorld, type Seed } from "../domain/src/seed.ts";
import { addDays } from "../domain/src/dates.ts";

const stores = Array.from({ length: 18 }, (_, i) => ({ id: `S${i + 1}`, state: i % 5 === 0 ? ("WA" as const) : ("OR" as const), closedWeekdays: [0], twoDays: i % 4 === 0 ? [2, 4] : [] }));
const pharmacists = Array.from({ length: 45 }, (_, i) => ({ id: `P${i + 1}`, base: `S${(i % 18) + 1}`, lic: i % 7 === 0 ? (["OR", "WA"] as ("OR" | "WA")[]) : (["OR"] as ("OR" | "WA")[]) }));
const travel: [string, string, number, number][] = [];
for (let a = 1; a <= 18; a++) for (let b = 1; b <= 18; b++) if (a !== b) travel.push([`S${a}`, `S${b}`, 20 + ((a * 7 + b * 13) % 100), 10 + ((a * 3 + b * 5) % 80)]);
const assignments: NonNullable<Seed["assignments"]> = [];
let seq = 1;
for (let d = 0; d < 31; d++) {
  const date = addDays("2026-10-01", d);
  for (let s = 1; s <= 18; s++) if ((d + s) % 11 !== 0) assignments.push({ id: `A${seq}`, seq: seq++, store: `S${s}`, ph: `P${((s - 1 + d * 3) % 45) + 1}`, date });
}
const unavailability = Array.from({ length: 25 }, (_, i) => ({ ph: `P${(i * 2) % 45 + 1}`, first: addDays("2026-10-05", i), last: addDays("2026-10-07", i), status: "Approved" as const }));
const standing = Array.from({ length: 30 }, (_, i) => ({ store: `S${(i % 18) + 1}`, ph: `P${(i % 45) + 1}`, recurrence: { weekdays: [1, 3, 5], cycleWeeks: 1 as const, anchor: "2026-10-01" }, from: "2026-10-01" }));
const w = seedWorld({ stores, pharmacists, assignments, unavailability, travel, standing });
const t = (name: string, f: () => unknown) => { const t0 = performance.now(); const r = f(); console.log(name.padEnd(28), (performance.now() - t0).toFixed(0).padStart(6), "ms"); return r; };
console.log("assignments:", assignments.length);
t("evaluate (month, range)", () => api.evaluate(w.state, "2026-10-01", { range: { from: "2026-10-01", to: "2026-10-31" } }));
t("evaluate x10", () => { for (let i = 0; i < 10; i++) api.evaluate(w.state, "2026-10-01", { range: { from: "2026-10-01", to: "2026-10-31" } }); });
const t0 = performance.now();
const b = api.build(w, { from: "2026-10-01", to: "2026-10-31" }, "2026-10-01");
console.log("build ms", (performance.now() - t0).toFixed(0), "edits", b.proposal?.edits.length ?? 0, "unresolved", b.report.unresolvedGaps.length, "limitHit", b.report.searchLimitHit);
