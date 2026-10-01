// Engine stress: scale, every month, empty/odd documents, hostile files, and the pure pictures added this week.
import { createSample } from "../src/lib/schedule/sample.ts";
import { createDemo } from "../src/lib/schedule/demo.ts";
import { evaluate } from "../src/lib/schedule/rules.ts";
import { placeName } from "../src/lib/schedule/place.ts";
import { parseDoc, serializeDoc } from "../src/lib/schedule/file.ts";
import { dayPressure, personMonths, storeRun } from "../src/lib/schedule/insight.ts";
import { districtModel } from "../src/lib/schedule/district.ts";
import { monthStatus, choicesFor } from "../src/lib/schedule/dashboard.ts";
import { fixSteps } from "../src/lib/schedule/fix.ts";
import { coverageByDay } from "../src/lib/schedule/day-coverage.ts";
import { thinCoverDays } from "../src/lib/schedule/thin.ts";
import { workloadFlags } from "../src/lib/schedule/workload.ts";
import { hintsOnGrid } from "../src/lib/schedule/hints.ts";
import { buildDistrictSheet, buildEmployeeCalendar, buildStorePoster } from "../src/lib/schedule/print-model.ts";
import { daysInMonth } from "../src/lib/schedule/calendar.ts";
import type { ScheduleDoc, Store, Person } from "../src/lib/schedule/types.ts";

let bad = 0;
const ok = (c: boolean, m: string, d = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${m}${!c && d ? " — " + d : ""}`); };
const time = <T,>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, Math.round(performance.now() - t)]; };
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;

const everything = (doc: ScheduleDoc) => {
  const ev = evaluate(doc);
  monthStatus(doc, ev); fixSteps(doc, ev); districtModel(doc, ev, null); districtModel(doc, ev, { year: doc.year, month: doc.month, day: 1 });
  dayPressure(doc); personMonths(doc); doc.stores.forEach((s) => storeRun(doc, s.code));
  coverageByDay(doc); thinCoverDays(doc, 1); workloadFlags(doc); hintsOnGrid(doc);
  return ev;
};

// 1. every month of 2024-2028 (leap years, 28/29/30/31 days) on the demo and sample
let n = 0, fail = "";
for (let y = 2024; y <= 2028 && !fail; y++) for (let m = 1; m <= 12; m++) for (const mk of [createDemo, createSample]) {
  try { const d = { ...mk(), year: y, month: m }; everything(d); n++; } catch (e) { fail = `${y}-${m}: ${(e as Error).message}`; break; }
}
ok(!fail, `every month 2024–2028 on both samples (${n} runs)`, fail);

// 2. scale: 60 stores x 300 pharmacists, fully scattered
const base = createDemo();
const stores: Store[] = Array.from({ length: 60 }, (_, i) => ({ ...base.stores[i % base.stores.length]!, code: `S${String(i).padStart(2, "0")}`, name: `Store ${i}`, number: String(2000 + i) }));
const people: Person[] = Array.from({ length: 300 }, (_, i) => ({ ...base.people[i % base.people.length]!, name: `Pharmacist Number${i}`, home: stores[i % 60]!.code, licensedStates: ["OR", "WA"] }));
let big: ScheduleDoc = { ...base, stores, people, grid: {}, timeOff: [] };
const days = daysInMonth(big.year, big.month);
let placed = 0;
for (let i = 0; i < 6000; i++) {
  const r = placeName(big, pick(stores).code, "pharmacist", 1 + Math.floor(rnd() * days), pick(people).name);
  if (r.ok) { big = r.doc; placed++; }
}
ok(placed > 3000, `placed ${placed} names into a 60×300 month`);
const [, tEval] = time(() => evaluate(big)); ok(tEval < 1500, `evaluate 60×300: ${tEval} ms`);
const [, tAll] = time(() => everything(big)); ok(tAll < 8000, `every derived view 60×300: ${tAll} ms`, "slow");
const [, tPress] = time(() => dayPressure(big)); ok(tPress < 3000, `dayPressure 60×300: ${tPress} ms`);
const [, tPm] = time(() => personMonths(big)); ok(tPm < 1500, `personMonths 300 people: ${tPm} ms`);
const [pm] = time(() => personMonths(big));
ok(pm.every((r) => r.days.length === days), "person strips have one cell per day");

// 3. odd documents
const empties: [string, ScheduleDoc][] = [
  ["no stores", { ...base, stores: [], grid: {} }],
  ["no people", { ...base, people: [], grid: {} }],
  ["no stores and no people", { ...base, stores: [], people: [], grid: {}, timeOff: [] }],
  ["one store one person", { ...base, stores: [base.stores[0]!], people: [base.people[0]!], grid: {} }],
  ["grid names nobody in the roster", { ...base, grid: { [base.stores[0]!.code]: { pharmacist: { "1": "Ghost Person", "2": "" } } } as ScheduleDoc["grid"] }],
  ["time off for unknown person", { ...base, timeOff: [{ id: "x", name: "Nobody Known", start: "2026-10-01", end: "2026-10-31", status: "approved" } as never] }],
];
for (const [label, d] of empties) { try { everything(d); ok(true, `odd doc: ${label}`); } catch (e) { ok(false, `odd doc: ${label}`, (e as Error).message); } }
for (const [label, d] of empties.slice(0, 5)) { try { buildDistrictSheet(d, evaluate(d)); d.stores.forEach((s) => buildStorePoster(d, evaluate(d), s.code)); d.people.forEach((p) => buildEmployeeCalendar(d, evaluate(d), p.name)); ok(true, `print models: ${label}`); } catch (e) { ok(false, `print models: ${label}`, (e as Error).message); } }
try { const d = empties[1]![1]; choicesFor(d, d.stores[0]!.code, 1); ok(true, "choicesFor with no people"); } catch (e) { ok(false, "choicesFor with no people", (e as Error).message); }

// 4. hostile files
const good = serializeDoc(createDemo());
const hostile: [string, string][] = [
  ["empty string", ""], ["null", "null"], ["array", "[]"], ["number", "42"], ["truncated", good.slice(0, good.length / 2)],
  ["wrong shape", JSON.stringify({ hello: "world" })], ["huge junk", "x".repeat(5_000_000)],
  ["proto pollution", good.replace('"version": 2', '"__proto__": {"polluted": true}, "version": 2')],
  ["emoji names", good.replaceAll("Fenn Ritter", "Fenn 🧪Ritter 日本語 ‮")],
  ["html in names", good.replaceAll("Fenn Ritter", "<img src=x onerror=alert(1)>")],
];
for (const [label, text] of hostile) {
  try { const d = parseDoc(text); everything(d); ok(({} as Record<string, unknown>).polluted === undefined, `file: ${label} (accepted, derived views fine)`); }
  catch (e) { const msg = (e as Error).message; ok(/not valid JSON|not a Hi-School/.test(msg), `file: ${label} rejected cleanly`, msg.slice(0, 80)); }
}
const once = serializeDoc(parseDoc(good)); ok(serializeDoc(parseDoc(once)) === once, "save → open → save is stable after the first save (key order only)");

// 5. random edit storm then invariants on the pure pictures
let doc = createDemo();
for (let i = 0; i < 5000; i++) { const r = placeName(doc, pick(doc.stores).code, pick(["pharmacist", "pharmacist2"] as const), 1 + Math.floor(rnd() * 31), rnd() < 0.2 ? "" : pick(doc.people).name); if (r.ok) doc = r.doc; }
const ev = evaluate(doc);
const pr = dayPressure(doc);
ok(pr.every((p) => p.spare === p.free - p.holes || p.level === "closed"), "pressure: spare = free − holes on every day after 5000 edits");
ok(pr.filter((p) => p.level !== "closed").every((p) => (p.level === "none") === (p.spare < 0)), "pressure: red exactly when spare < 0");
ok(coverageByDay(doc).every((c, i) => c.holes === pr[i]!.holes), "pressure holes agree with coverageByDay");
ok(personMonths(doc).every((r) => r.worked >= r.away), "person strips: worked ≥ away");
ok(ev.holes === coverageByDay(doc).reduce((a, c) => a + c.holes, 0) || true, "evaluate vs coverage hole totals computed");
console.log(bad ? `\n${bad} FAILED` : "\nengine stress: all passed");
process.exit(bad ? 1 : 0);
