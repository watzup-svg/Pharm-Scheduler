// Corruption fuzz: damage one field at random; either checkIntegrity reports a fatal problem, or nothing in the domain throws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { api } from "../src/api.ts";
import { seedWorld, type Seed } from "../src/seed.ts";
import { addDays } from "../src/dates.ts";
import { checkIntegrity } from "../src/integrity.ts";
import { importV2 } from "../src/import-v2.ts";
import { clone } from "../src/canonical.ts";
import { choicesFor } from "../src/choices.ts";
import type { World } from "../src/api-types.ts";

function rng(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]!, chance: (p: number) => next() < p };
}

const START = "2026-06-01";
const DAYS = 10;

/** A small world that touches every table. */
function smallWorld(seed: number): World {
  const r = rng(seed);
  const nS = 3, nP = 6;
  const stores = Array.from({ length: nS }, (_, i) => ({ id: `S${i + 1}`, state: r.chance(0.3) ? ("WA" as const) : ("OR" as const), req: 1, closedWeekdays: [0], twoDays: [2] }));
  const pharmacists = Array.from({ length: nP }, (_, i) => ({ id: `P${i + 1}`, base: `S${(i % nS) + 1}`, lic: ["OR", "WA"] as ("OR" | "WA")[], ...(i === 0 ? { licExpires: { WA: "2026-06-05" } } : {}) }));
  const assignments: NonNullable<Seed["assignments"]> = [];
  let n = 1;
  for (let d = 0; d < DAYS; d++) for (const s of stores) if (r.chance(0.7)) assignments.push({ id: `A${n}`, seq: n++, store: s.id, ph: `P${r.int(nP) + 1}`, date: addDays(START, d), agreed: r.chance(0.7), pinned: r.chance(0.05) });
  const travel: [string, string, number, number][] = [];
  for (const a of stores) for (const b of stores) if (a.id !== b.id && r.chance(0.8)) travel.push([a.id, b.id, 10 + r.int(150), 5 + r.int(100)]);
  const seedDoc: Seed = {
    stores, pharmacists, assignments, travel,
    unavailability: [{ ph: "P1", first: addDays(START, 2), last: addDays(START, 3) }, { ph: "P2", first: addDays(START, 4), type: "Turned-down", scope: "S1" }],
    dateOverrides: [{ store: "S1", date: addDays(START, 5), count: 0, note: "closed" }],
    cells: [{ store: "S2", date: addDays(START, 6), locum: 1 }],
    standing: [{ store: "S1", ph: "P3", recurrence: { weekdays: [1, 3], cycleWeeks: 2, anchor: START, nth: [1, 2] }, from: START, to: "2026-12-31" }],
    built: [addDays(START, 0)],
  };
  let w = seedWorld(seedDoc);
  const a1 = Object.keys(w.state.assignments)[0];
  if (a1) {
    const c = api.commit(w, [{ t: "override", assignmentId: a1, ruleId: "closure", reason: "ok" }], { kind: "manual" });
    if (!("refused" in c)) w = c.world;
  }
  return w;
}

type Path = (string | number)[];
function leafPaths(v: unknown, base: Path = [], out: Path[] = []): Path[] {
  if (v && typeof v === "object") {
    const ks = Object.keys(v as object);
    if (!ks.length) out.push(base);
    for (const k of ks) leafPaths((v as Record<string, unknown>)[k], [...base, Array.isArray(v) ? Number(k) : k], out);
  } else out.push(base);
  return out;
}
const getAt = (o: unknown, p: Path) => p.reduce<unknown>((x, k) => (x as Record<string | number, unknown>)?.[k], o);
function setAt(o: unknown, p: Path, v: unknown) {
  const parent = getAt(o, p.slice(0, -1)) as Record<string | number, unknown>;
  if (v === DELETE) delete parent[p[p.length - 1]!]; else parent[p[p.length - 1]!] = v;
}
const DELETE = Symbol("delete");

const TABLES = ["stores", "pharmacists", "requirements", "dateOverrides", "unavailability", "assignments", "overrides", "cellCounts", "standing", "travel", "built"] as const;

/** Applies one random corruption in place. Returns a label. */
function corrupt(w: World, r: ReturnType<typeof rng>): string {
  const st = w.state as unknown as Record<string, Record<string, unknown>>;
  const kind = r.int(12);
  if (kind === 0) { const t = r.pick(["config", "nextId", ...TABLES]); (st as Record<string, unknown>)[t] = r.pick([null, undefined, 5, "x", []]); return `drop table ${t}`; }
  const group = r.pick([...TABLES, "config", "nextId", "journal"] as const);
  if (group === "journal") {
    const j = w.journal as unknown as Record<string, unknown>;
    const f = r.pick(["changeSets", "snapshots", "told", "checkpoints"]);
    const paths = leafPaths(j[f], [f]);
    if (!paths.length) { j[f] = r.pick([null, 7, "x"]); return `journal ${f}`; }
    const p = r.pick(paths);
    setAt(j, p, valueFor(r, kind, getAt(j, p)));
    return `journal ${p.join(".")}`;
  }
  const tbl = st[group] as Record<string, unknown>;
  if (group === "config" || group === "nextId") {
    const p = r.pick(leafPaths(tbl));
    setAt(tbl, p, valueFor(r, kind, getAt(tbl, p)));
    return `${group}.${p.join(".")}`;
  }
  const keys = Object.keys(tbl);
  if (!keys.length) return "empty table";
  const key = r.pick(keys);
  if (kind === 1) { delete tbl[key]; return `delete ${group}:${key}`; }
  if (kind === 2) { const other = r.pick(keys); const a = tbl[key]; tbl[key] = tbl[other]; tbl[other] = a; return `swap keys ${group}:${key}/${other}`; }
  if (kind === 3) { tbl[`${key}x`] = tbl[key]; delete tbl[key]; return `rename key ${group}:${key}`; }
  if (kind === 4) { tbl[key] = r.pick([null, 0, "text", [], true]); return `row ${group}:${key} wrong type`; }
  const p = r.pick(leafPaths(tbl[key], [key]));
  setAt(tbl, p, valueFor(r, kind, getAt(tbl, p)));
  return `${group}:${p.join(".")}`;
}
function valueFor(r: ReturnType<typeof rng>, kind: number, old: unknown): unknown {
  switch (kind) {
    case 5: return r.pick(["2026-13-45", "abc", "", "2026-02-30", "20260601", "0000-00-00", "2026-6-1", "９９９９-01-01"]);
    case 6: return r.pick([-1, -1000, 1.5, 1e308]);
    case 7: return r.pick([NaN, Infinity, -Infinity]);
    case 8: return r.pick(["S999", "P999", "A999", "nope"]);
    case 9: return r.pick([null, undefined, {}, [], "str", 42, true, [1, 2]]);
    case 10: return typeof old === "number" ? old + r.pick([-1, 1, 100, 7]) : typeof old === "string" ? `${old}|` : DELETE;
    default: return DELETE;
  }
}

function exercise(w: World, asOf: string) {
  const range = { from: START, to: addDays(START, DAYS + 2) };
  const ev = api.evaluate(w.state, asOf, { range });
  api.evaluate(w.state, asOf, { range, includeRequested: true });
  api.evaluate(w.state, asOf, { window: { from: addDays(START, 2), to: addDays(START, 6) } });
  const b = api.build(w, range, asOf);
  if (b.proposal) {
    const o = api.openProposal(w, b.proposal);
    if (!("refused" in o)) api.acceptProposal(o);
  }
  const gaps = Object.values(ev.cells).filter((c) => c.open > 0).slice(0, 2).map((c) => ({ storeId: c.storeId, date: c.date }));
  if (gaps.length) api.repair(w, gaps, { showNearMiss: true }, asOf);
  api.improve(w, { ...range, includeNext14: true }, asOf);
  api.resetToPattern(w, range, null, asOf);
  const p = api.post(w, range, asOf);
  api.toTell(p.world, asOf);
  api.changedSincePosting(p.world);
  const a = Object.values(w.state.assignments)[0];
  if (a) choicesFor(w.state, a.storeId, a.date, asOf);
  api.stateHash(w.state);
}

test("corruption fuzz: a fatal problem is reported, or nothing throws", () => {
  let reported = 0, exercised = 0;
  for (let seed = 1; seed <= 2500; seed++) {
    const r = rng(seed * 104729);
    const w = clone(smallWorld(seed % 25 + 1));
    const label = corrupt(w, r);
    let issues;
    try { issues = checkIntegrity(w.state, w.journal); } catch (e) { assert.fail(`seed ${seed} (${label}): checkIntegrity threw ${String(e)}`); }
    if (issues.some((i) => i.fatal)) { reported++; continue; }
    exercised++;
    try { exercise(w, addDays(START, 3)); } catch (e) { assert.fail(`seed ${seed} (${label}): threw ${(e as Error).stack}`); }
  }
  if (process.env.V3_STATS) console.log("corruption", { reported, exercised });
  assert.ok(reported > 1000, `only ${reported} corruptions reported`);
  assert.ok(exercised > 100, `only ${exercised} corruptions exercised`);
});

test("corruption fuzz on the practice world", () => {
  const demo = JSON.parse(readFileSync(new URL("../../fixtures/demo-v2.json", import.meta.url), "utf8"));
  const dt = JSON.parse(readFileSync(new URL("../../fixtures/drive-table.json", import.meta.url), "utf8"));
  const base = importV2([demo], { driveTable: dt.pairs }).world;
  const asOf = Object.values(base.state.assignments).map((a) => a.date).sort()[5]!;
  for (let seed = 1; seed <= 150; seed++) {
    const r = rng(seed * 7919);
    const w = clone(base);
    const label = corrupt(w, r);
    const issues = checkIntegrity(w.state, w.journal);
    if (issues.some((i) => i.fatal)) continue;
    try {
      api.evaluate(w.state, asOf, { range: { from: asOf, to: addDays(asOf, 30) } });
      const ev = api.evaluate(w.state, asOf, { range: { from: asOf, to: addDays(asOf, 30) } });
      const gap = Object.values(ev.cells).find((c) => c.open > 0 && c.date >= asOf);
      if (gap) api.repair(w, [{ storeId: gap.storeId, date: gap.date }], {}, asOf);
    } catch (e) { assert.fail(`practice seed ${seed} (${label}): threw ${(e as Error).stack}`); }
  }
});

test("checkIntegrity accepts clean worlds and names specific damage", () => {
  const w = smallWorld(3);
  assert.deepEqual(checkIntegrity(w.state, w.journal), []);
  const t = (f: (s: Record<string, any>) => void, re: RegExp) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const c = clone(w);
    f(c.state as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const issues = checkIntegrity(c.state);
    assert.ok(issues.some((i) => re.test(`${i.table} ${i.key} ${i.problem}`) && i.fatal), `${re}: got ${JSON.stringify(issues)}`);
  };
  t((s) => { s.assignments.A1.date = "2026-02-30"; }, /assignments A1 bad date/);
  t((s) => { s.requirements["S1|1|0001-01-01"].count = -1; }, /requirements .*bad count/);
  t((s) => { s.requirements["S1|1|0001-01-01"].weekday = 9; }, /bad weekday/);
  t((s) => { s.dateOverrides["S1|2026-06-06"].storeId = "S9"; }, /dateOverrides .*unknown store/);
  t((s) => { s.cellCounts["S2|2026-06-07"].locum = NaN; }, /cellCounts/);
  t((s) => { s.config.maxConsecutiveDays = 1.5; }, /config maxConsecutiveDays/);
  t((s) => { s.pharmacists.P1.licenses.WA = "soon"; }, /license expiry/);
  t((s) => { s.pharmacists.P1.licenses.ZZ = null; }, /unknown state/);
  t((s) => { s.travel[Object.keys(s.travel)[0]!].minutes = -5; }, /travel .*minutes/);
  t((s) => { s.standing.T1.recurrence.weekdays = [7]; }, /weekdays/);
  t((s) => { s.standing.T1.recurrence.anchor = "x"; }, /anchor/);
  t((s) => { s.stores.S1.inactiveFrom = "nope"; }, /inactiveFrom/);
  t((s) => { delete s.stores.S2; }, /unknown store/);
  t((s) => { s.built["junk"] = true; }, /built/);
  const c = clone(w);
  c.state.nextId.assignment = 1;
  assert.ok(checkIntegrity(c.state).some((i) => i.table === "nextId" && !i.fatal));
});
