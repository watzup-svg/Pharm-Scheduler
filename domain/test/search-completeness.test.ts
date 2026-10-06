// Search completeness: on tiny worlds, brute-force every set of moves / placements inside the scope Repair documents
// (docs/v3/DOMAIN_SPEC.md section 10: chains of up to 3 moves and 4 pharmacist-dates, or 5 and 8 with off-duty placements in Search Wider;
// moves stay on the gap dates and never touch pinned, past or partial-noted assignments) and compare with api.repair and api.build.
// ORACLE_N scales the number of worlds (default below), ORACLE_SEED replays one world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.ts";
import { seedWorld, type Seed } from "../src/seed.ts";
import { expectedOn } from "../src/patterns.ts";
import { cmp, dateRange, addDays } from "../src/dates.ts";
import type { Edit, RepairOption, World } from "../src/api-types.ts";
import type { Assignment, DomainState, Evaluation } from "../src/types.ts";

function rng(seed: number) {
  let x = (Math.imul(seed >>> 0 || 1, 2654435761) >>> 0) || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = 0; i < 4; i++) next();
  return { next, int: (n: number) => Math.floor(next() * n), chance: (p: number) => next() < p, pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]!, range: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) };
}
type Rng = ReturnType<typeof rng>;

const N = Number(process.env.ORACLE_N ?? 150);
const ONLY = process.env.ORACLE_SEED ? Number(process.env.ORACLE_SEED) : null;
const D0 = "2026-10-12"; // a Monday
const ASOF = "2026-10-12";
const PRESENCE = new Set(["availability", "closure", "double-booking", "licensing"]);
const SUGGESTIBLE = new Set(["travel-soft", "travel-hard", "consecutive-days"]);

// ---------- tiny worlds ----------
type GenOpts = { maxStores: number; maxPeople: number; days: number; standing: boolean };
function tinyWorld(seed: number, o: GenOpts): World {
  const r = rng(seed * 7919 + 13);
  const nS = r.range(2, o.maxStores), nP = r.range(Math.min(nS + 1, o.maxPeople), o.maxPeople);
  const dates = Array.from({ length: o.days }, (_, i) => addDays(D0, i));
  const sd: Seed = {
    stores: Array.from({ length: nS }, (_, i) => ({ id: `S${i + 1}`, state: r.chance(0.25) ? "WA" : "OR", req: r.range(1, 2), closedWeekdays: [] })),
    pharmacists: Array.from({ length: nP }, (_, i) => ({
      id: `P${i + 1}`, base: r.chance(0.1) ? null : `S${r.int(nS) + 1}`,
      lic: r.chance(0.07) ? null : r.chance(0.5) ? ["OR", "WA"] : ["OR"],
      ...(r.chance(0.08) ? { licExpires: { OR: addDays(D0, r.int(2)) } } : {}),
    })),
    travel: [], assignments: [], unavailability: [], dateOverrides: [], cells: [], standing: [],
  };
  for (let a = 1; a <= nS; a++) for (let b = 1; b <= nS; b++) if (a !== b && r.chance(0.88)) sd.travel!.push([`S${a}`, `S${b}`, r.chance(0.25) ? r.pick([85, 90, 95, 150, 155]) : r.range(10, 80), 10]);
  let seq = 1;
  for (const date of dates) {
    const free = Array.from({ length: nP }, (_, i) => `P${i + 1}`);
    for (let i = free.length - 1; i > 0; i--) { const j = r.int(i + 1); [free[i], free[j]] = [free[j]!, free[i]!]; }
    for (let s = 1; s <= nS; s++) {
      const want = Math.max(0, sd.stores[s - 1]!.req! + r.pick([-1, 0, 0, 0, 1, 1]));
      for (let k = 0; k < want && free.length; k++) sd.assignments!.push({
        store: `S${s}`, ph: free.pop()!, date, seq: seq++, source: r.pick(["manual", "manual", "build", "repair", "pattern", "emergency"] as const),
        agreed: r.chance(0.6), pinned: r.chance(0.1), ...(r.chance(0.07) ? { partialNote: "leaves at noon" } : {}),
      });
    }
  }
  for (let i = r.int(3); i > 0; i--) { const first = r.pick(dates); sd.unavailability!.push({ ph: `P${r.int(nP) + 1}`, first, last: first, status: r.pick(["Approved", "Actual", "Requested", "Denied"] as const), ...(r.chance(0.2) ? { type: "Turned-down" as const, scope: `S${r.int(nS) + 1}` } : {}) }); }
  for (let i = r.int(3); i > 0; i--) sd.dateOverrides!.push({ store: `S${r.int(nS) + 1}`, date: r.pick(dates), count: r.pick([0, 2, 3]) });
  for (let i = r.int(3); i > 0; i--) sd.cells!.push({ store: `S${r.int(nS) + 1}`, date: r.pick(dates), locum: r.chance(0.5) ? 1 : 0, acceptedShort: r.chance(0.5) ? 1 : 0 });
  if (o.standing) for (let i = r.int(3); i > 0; i--) sd.standing!.push({ store: `S${r.int(nS) + 1}`, ph: `P${r.int(nP) + 1}`, recurrence: { weekdays: [r.int(7)], cycleWeeks: 1, anchor: D0 }, from: "2026-01-01" });
  const w = seedWorld(sd);
  w.state.config = { ...w.state.config, searchNodeLimit: 50_000_000 };
  return w;
}

// ---------- shared measurement ----------
const evalAll = (st: DomainState, dates: string[]): Evaluation => api.evaluate(st, ASOF, { range: { from: dates[0]!, to: dates[dates.length - 1]! } });
function failKeys(st: DomainState, ev: Evaluation, kind: "presence" | "suggestible"): Set<string> {
  const out = new Set<string>();
  for (const a of Object.values(st.assignments)) for (const r of ev.assignments[a.id]!.results) if (r.verdict === "Fail" && !r.overridden && (kind === "presence" ? PRESENCE : SUGGESTIBLE).has(r.ruleId)) out.add(`${a.pharmacistId}|${a.storeId}|${a.date}|${r.ruleId}`);
  return out;
}
const minus = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).length;
function travelOn(st: DomainState, dates: string[]): number {
  let t = 0;
  for (const a of Object.values(st.assignments)) {
    if (!dates.includes(a.date)) continue;
    const base = st.pharmacists[a.pharmacistId]!.baseStoreId;
    if (base && base !== a.storeId) t += st.travel[`${base}|${a.storeId}`]?.minutes ?? 0;
  }
  return t;
}
function exceptionsOn(st: DomainState, dates: string[]): number {
  let n = 0;
  for (const d of dates) for (const e of expectedOn(st, d)) if (!Object.values(st.assignments).some((a) => a.date === d && a.storeId === e.storeId && a.pharmacistId === e.pharmacistId)) n++;
  return n;
}

type Op = { ph: string; date: string; to: string; from: string | null; asgId: string | null };
function applyOps(base: DomainState, ops: Op[]): DomainState {
  const st: DomainState = { ...base, assignments: { ...base.assignments } };
  let seq = 100000 + Object.keys(st.assignments).filter((k) => k.startsWith("Z")).length;
  for (const op of ops) {
    if (op.asgId) st.assignments[op.asgId] = { ...st.assignments[op.asgId]!, storeId: op.to, agreed: false, source: "repair" };
    else { const id = `Z${seq}`; st.assignments[id] = { id, date: op.date, storeId: op.to, pharmacistId: op.ph, placedSeq: seq++, source: "repair", agreed: false, pinned: false }; }
  }
  return st;
}
const tup = (o: Op): [string, string, string] => [o.ph, o.to, o.date];
const sortTup = (t: [string, string, string][]) => t.slice().sort((x, y) => cmp(x[0], y[0]) || cmp(x[1], y[1]) || cmp(x[2], y[2]));

type Scope = { chain: number; changed: number; offDuty: boolean };
type Cand = { ops: Op[]; metrics: { over: number; changed: number; net: number; travel: number }; tuples: [string, string, string][] };

/** Every clean set of ops on one gap date, found by plain enumeration of "each person does nothing or goes to one store". */
function cleanSetsOnDate(base: DomainState, baseEv: Evaluation, date: string, gapCells: string[], scope: Scope, gapOrder: string[]): Op[][] {
  const persons = Object.keys(base.pharmacists).sort(cmp);
  const stores = Object.keys(base.stores).sort(cmp);
  const onDate = Object.values(base.assignments).filter((a) => a.date === date);
  const choices: Op[][] = persons.map((ph) => {
    const cur = onDate.find((a) => a.pharmacistId === ph);
    const out: Op[] = [];
    if (cur) {
      if (cur.pinned || cur.partialNote || cur.date < ASOF) return out;
      for (const s of stores) if (s !== cur.storeId) out.push({ ph, date, to: s, from: cur.storeId, asgId: cur.id });
    } else if (scope.offDuty) for (const s of stores) out.push({ ph, date, to: s, from: null, asgId: null });
    return out;
  });
  const baseFail = failKeys(base, baseEv, "presence");
  const found: Op[][] = [];
  const cur: Op[] = [];
  const check = () => {
    if (!cur.length) return;
    const dest = new Set(gapCells), src = new Set<string>();
    for (const op of cur) if (op.from) src.add(`${op.from}|${date}`);
    for (const op of cur) if (!dest.has(`${op.to}|${date}`) && !src.has(`${op.to}|${date}`)) return; // pointless move: not a chain
    const st = applyOps(base, cur);
    const ev = evalAll(st, [date]);
    // every mover must count and be fully checkable
    const movedIds = cur.map((op) => Object.values(st.assignments).find((a) => a.date === date && a.pharmacistId === op.ph)!.id);
    for (const id of movedIds) { const e = ev.assignments[id]!; if (!e.counts || e.results.some((r) => r.verdict === "Unknown")) return; }
    const watch = new Set([...gapCells, ...src]);
    for (const k of watch) if (ev.cells[k]!.open > 0) return;
    if (minus(failKeys(st, ev, "presence"), baseFail) > 0) return;
    if (!derivable(base, cur, date, gapOrder, scope.chain)) return;
    found.push(cur.slice());
  };
  const rec = (i: number) => {
    if (i === persons.length) return check();
    rec(i + 1);
    if (cur.length >= scope.changed) return;
    for (const c of choices[i]!) { cur.push(c); rec(i + 1); cur.pop(); }
  };
  rec(0);
  return found;
}

/** Can the ops be played in some order where each one fills the first still-open cell, a vacated hole goes to the front, and no chain is deeper than `chain`? */
function derivable(base: DomainState, ops: Op[], date: string, gapOrder: string[], chain: number): boolean {
  const openOf = (st: DomainState) => evalAll(st, [date]).cells;
  const go = (st: DomainState, used: Set<number>, pending: { cell: string; depth: number }[]): boolean => {
    const cells = openOf(st);
    let p = pending;
    while (p.length && cells[p[0]!.cell]!.open === 0) p = p.slice(1);
    if (!p.length) return used.size === ops.length;
    const head = p[0]!;
    if (head.depth >= chain) return false;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      if (used.has(i) || `${op.to}|${date}` !== head.cell) continue;
      const st2 = applyOps(st, [op.asgId ? { ...op, asgId: op.asgId } : op]);
      const cells2 = openOf(st2);
      let np = [head, ...p.slice(1)];
      if (op.from) { const vk = `${op.from}|${date}`; if (cells2[vk]!.open > cells[vk]!.open) np = [{ cell: vk, depth: head.depth + 1 }, head, ...p.slice(1)]; }
      if (go(st2, new Set([...used, i]), np)) return true;
    }
    return false;
  };
  return go(base, new Set(), gapOrder.map((cell) => ({ cell, depth: 0 })));
}

const sameMetrics = (a: object, b: object) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const ordKey = (c: Cand) => [String(c.metrics.over).padStart(6, "0"), String(c.metrics.changed).padStart(6, "0"), String(c.metrics.net + 100000).padStart(8, "0"), String(c.metrics.travel).padStart(8, "0")];
function ordCmp(a: Cand, b: Cand): number {
  const x = ordKey(a), y = ordKey(b);
  for (let i = 0; i < x.length; i++) { const c = cmp(x[i]!, y[i]!); if (c) return c; }
  for (let i = 0; i < Math.min(a.tuples.length, b.tuples.length); i++) { const c = cmp(a.tuples[i]![0], b.tuples[i]![0]) || cmp(a.tuples[i]![1], b.tuples[i]![1]) || cmp(a.tuples[i]![2], b.tuples[i]![2]); if (c) return c; }
  return a.tuples.length - b.tuples.length;
}

/** All clean candidates for the gaps (every date combined). null = too many to combine (skipped). */
function bruteForce(w: World, gaps: { storeId: string; date: string }[], scope: Scope): Cand[] | null {
  const base = w.state;
  const dates = [...new Set(gaps.map((g) => g.date))].sort(cmp);
  const baseEv = evalAll(base, dates);
  const perDate = dates.map((d) => {
    const gapCells = gaps.filter((g) => g.date === d).sort((a, b) => cmp(a.storeId, b.storeId)).map((g) => `${g.storeId}|${d}`);
    return cleanSetsOnDate(base, baseEv, d, gapCells, scope, gapCells);
  });
  if (perDate.some((l) => !l.length)) return [];
  let combos: Op[][] = [[]];
  for (const list of perDate) {
    const next: Op[][] = [];
    for (const a of combos) for (const b of list) if (a.length + b.length <= scope.changed) next.push([...a, ...b]);
    combos = next;
    if (combos.length > 4000) return null;
  }
  const baseSug = failKeys(base, baseEv, "suggestible");
  const baseExc = exceptionsOn(base, dates);
  const out: Cand[] = combos.map((ops) => {
    const st = applyOps(base, ops);
    const ev = evalAll(st, dates);
    return { ops, metrics: { over: minus(failKeys(st, ev, "suggestible"), baseSug), changed: new Set(ops.map((o) => `${o.ph}|${o.date}`)).size, net: exceptionsOn(st, dates) - baseExc, travel: travelOn(st, dates) }, tuples: sortTup(ops.map(tup)) };
  });
  return out.sort(ordCmp);
}

function editTuples(base: DomainState, edits: Edit[]): [string, string, string][] {
  return sortTup(edits.map((e): [string, string, string] => {
    if (e.t === "move") { const a = base.assignments[e.assignmentId]!; return [a.pharmacistId, e.toStoreId, a.date]; }
    if (e.t === "place") return [e.pharmacistId, e.storeId, e.date];
    throw new Error("unexpected edit " + e.t);
  }));
}

/** Re-evaluate an option by really committing it, and return what its metrics should have been. */
function reality(w: World, gaps: { storeId: string; date: string }[], o: RepairOption) {
  const r = api.commit(w, o.edits, { kind: "repair", label: "x" });
  if ("refused" in r) throw new Error("commit refused an option: " + r.reason);
  const dates = [...new Set(gaps.map((g) => g.date))].sort(cmp);
  const before = evalAll(w.state, dates), after = evalAll(r.world.state, dates);
  const watch = new Set(gaps.map((g) => `${g.storeId}|${g.date}`));
  for (const e of o.edits) if (e.t === "move") { const a = w.state.assignments[e.assignmentId]!; watch.add(`${a.storeId}|${a.date}`); }
  let open = 0; for (const k of watch) open += after.cells[k]!.open;
  const touched = new Set(editTuples(w.state, o.edits).map((t) => `${t[0]}|${t[2]}`));
  return {
    violationsIntroduced: minus(failKeys(r.world.state, after, "presence"), failKeys(w.state, before, "presence")),
    overridesNeeded: minus(failKeys(r.world.state, after, "suggestible"), failKeys(w.state, before, "suggestible")),
    openRemaining: open, changedPharmacistDates: touched.size,
    patternNet: exceptionsOn(r.world.state, dates) - exceptionsOn(w.state, dates), travelMinutes: travelOn(r.world.state, dates),
  };
}

function pickGaps(w: World, r: Rng): { storeId: string; date: string }[] {
  const dates = dateRange(D0, addDays(D0, 2));
  const ev = evalAll(w.state, dates);
  const open = Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= ASOF).map((c) => ({ storeId: c.storeId, date: c.date }));
  const want = r.range(1, 2);
  const chosen: { storeId: string; date: string }[] = [];
  while (chosen.length < want && open.length) chosen.push(open.splice(r.int(open.length), 1)[0]!);
  return chosen.sort((a, b) => cmp(a.date, b.date) || cmp(a.storeId, b.storeId));
}

function runRepairCase(seed: number, wider: boolean, stats: Record<string, number>): string | null {
  const w = tinyWorld(seed, wider ? { maxStores: 4, maxPeople: 6, days: 2, standing: true } : { maxStores: 5, maxPeople: 7, days: 3, standing: true });
  const r = rng(seed ^ 0x5bd1e995);
  const gaps = pickGaps(w, r);
  if (!gaps.length) { stats.nogaps = (stats.nogaps ?? 0) + 1; return null; }
  const scope: Scope = wider ? { chain: 5, changed: 8, offDuty: true } : { chain: 3, changed: 4, offDuty: false };
  const tag = `seed ${seed} ${wider ? "wider" : "default"} gaps ${gaps.map((g) => g.storeId + "@" + g.date).join(",")}`;
  const res = api.repair(w, gaps, { wider, showNearMiss: true }, ASOF);
  if (res.status === "limit") return `${tag}: hit the search limit on a tiny world`;
  const bf = bruteForce(w, gaps, scope);
  stats.worlds = (stats.worlds ?? 0) + 1;
  if (bf === null) { stats.skippedBig = (stats.skippedBig ?? 0) + 1; }
  // (a) clean option exists iff repair claims options
  if (bf !== null) {
    if (bf.length > 0 && res.status !== "options") return `${tag}: brute force finds ${bf.length} clean option(s), best ${JSON.stringify(bf[0]!.tuples)}, but repair says "${res.status}: ${res.message}"`;
    if (bf.length === 0 && res.status === "options") return `${tag}: repair offers ${res.options.length} option(s) (${JSON.stringify(editTuples(w.state, res.options[0]!.edits))}) but brute force finds none within scope`;
    if (bf.length) stats.withOptions = (stats.withOptions ?? 0) + 1;
    // (b) the best three, in order
    if (bf.length) {
      const want = bf.slice(0, 3).map((c) => JSON.stringify(c.tuples)), got = res.options.map((o) => JSON.stringify(editTuples(w.state, o.edits)));
      if (JSON.stringify(want) !== JSON.stringify(got)) return `${tag}: top options differ\n    brute force: ${want.join(" | ")}\n    repair:      ${got.join(" | ")}`;
      if (res.options.length !== Math.min(3, bf.length)) return `${tag}: ${res.options.length} options, expected ${Math.min(3, bf.length)}`;
    }
  }
  // (c) declared metrics are real; options are clean
  for (const o of res.options) {
    const real = reality(w, gaps, o);
    if (!sameMetrics(real, o.metrics)) return `${tag}: option ${JSON.stringify(editTuples(w.state, o.edits))} declares ${JSON.stringify(o.metrics)} but reality is ${JSON.stringify(real)}`;
    if (o.metrics.violationsIntroduced !== 0 || o.metrics.openRemaining !== 0) return `${tag}: a non-clean option was offered`;
    stats.options = (stats.options ?? 0) + 1;
  }
  if (res.nearMiss) {
    const real = reality(w, gaps, res.nearMiss);
    if (res.status === "options") return `${tag}: nearMiss returned next to clean options`;
    if (!sameMetrics(real, res.nearMiss.metrics)) return `${tag}: nearMiss ${JSON.stringify(editTuples(w.state, res.nearMiss.edits))} declares ${JSON.stringify(res.nearMiss.metrics)} but reality is ${JSON.stringify(real)}`;
    if (res.nearMiss.metrics.violationsIntroduced === 0 && res.nearMiss.metrics.openRemaining === 0) return `${tag}: nearMiss is clean but status is ${res.status}`;
    stats.nearMiss = (stats.nearMiss ?? 0) + 1;
  }
  // the default budget gives the same answer, or says it ran out
  const w2: World = { ...w, state: { ...w.state, config: { ...w.state.config, searchNodeLimit: 4000 } } };
  const d = api.repair(w2, gaps, { wider }, ASOF);
  if (d.status !== "limit" && (d.status !== res.status || JSON.stringify(d.options.map((o) => editTuples(w.state, o.edits))) !== JSON.stringify(res.options.map((o) => editTuples(w.state, o.edits))))) return `${tag}: default node limit changes the answer without saying so (${d.status} vs ${res.status})`;
  if (d.status === "limit") stats.limit4000 = (stats.limit4000 ?? 0) + 1;
  return null;
}

for (const wider of [false, true]) {
  test(`repair completeness (${wider ? "Search Wider: chain 5, 8 changed, off-duty" : "default scope: chain 3, 4 changed"}) against brute force`, () => {
    const n = ONLY !== null ? 1 : wider ? Math.ceil(N / 3) : N;
    const bad: string[] = [];
    const stats: Record<string, number> = {};
    for (let i = 0; i < n && bad.length < 4; i++) {
      const seed = ONLY ?? i + 1;
      const m = runRepairCase(seed, wider, stats);
      if (m) bad.push(m + `\n    replay: ORACLE_SEED=${seed} node --experimental-strip-types --test domain/test/search-completeness.test.ts`);
    }
    if (process.env.V3_STATS) console.log(`repair ${wider ? "wider" : "default"}:`, JSON.stringify(stats));
    assert.equal(bad.length, 0, bad.join("\n"));
    if (ONLY === null && N >= 100) { assert.ok((stats.withOptions ?? 0) >= n / 6, "enough worlds with a clean option"); assert.ok((stats.worlds ?? 0) - (stats.withOptions ?? 0) >= n / 20, "enough worlds without one"); }
  });
}

test("repair regressions: seeds that once lost options when two gap dates shared the people-changed budget", () => {
  // The third best option of one date did not fit beside the other date's options, so a smaller one (more overrides) was dropped.
  for (const seed of [192, 1441, 2618]) {
    const stats: Record<string, number> = {};
    assert.equal(runRepairCase(seed, false, stats), null);
    assert.equal(stats.worlds, 1);
  }
});

test("repair: a cell short by two is filled by two people (regression: the head gap was dropped after one fill)", () => {
  const w = seedWorld({
    stores: [{ id: "S1", req: 2, closedWeekdays: [] }, { id: "S2", req: 1, closedWeekdays: [] }, { id: "S3", req: 1, closedWeekdays: [] }],
    pharmacists: [{ id: "P1" }, { id: "P2" }, { id: "P3" }, { id: "P4" }, { id: "P5" }],
    assignments: [{ store: "S2", ph: "P1", date: D0 }, { store: "S2", ph: "P2", date: D0 }, { store: "S3", ph: "P3", date: D0 }, { store: "S3", ph: "P4", date: D0 }],
  });
  const r = api.repair(w, [{ storeId: "S1", date: D0 }], {}, ASOF);
  assert.equal(r.status, "options");
  assert.equal(r.options[0]!.edits.length, 2);
  const c = api.commit(w, r.options[0]!.edits, { kind: "repair" });
  assert.ok(!("refused" in c));
  if (!("refused" in c)) assert.equal(api.evaluate(c.world.state, ASOF).cells[`S1|${D0}`]!.open, 0);
});

// ---------- Build ----------
function runBuildCase(seed: number, stats: Record<string, number>): string | null {
  const w = tinyWorld(seed, { maxStores: 5, maxPeople: 7, days: 3, standing: true });
  const asOf = seed % 4 === 0 ? addDays(D0, 1) : ASOF; // sometimes the first day is already past
  const range = { from: D0, to: addDays(D0, 2) };
  const tag = `seed ${seed} asOf ${asOf}`;
  const base = w.state;
  const res = api.build(w, range, asOf);
  if (res.report.searchLimitHit) return `${tag}: search limit on a tiny world`;
  let w2: World = w;
  if (res.proposal) {
    const o = api.openProposal(w, res.proposal);
    if ("refused" in o) return `${tag}: openProposal refused ${o.reason}`;
    const acc = api.acceptProposal(o);
    if ("refused" in acc) return `${tag}: acceptProposal refused ${acc.reason}`;
    w2 = acc.world;
    stats.proposals = (stats.proposals ?? 0) + 1;
  }
  const after = w2.state;
  // never moves or removes manual / emergency / pinned / noted / past assignments
  for (const a of Object.values(base.assignments)) {
    const protectedA = a.source === "manual" || a.source === "emergency" || a.pinned || !!a.partialNote;
    if (!protectedA && a.date >= asOf) continue;
    const b = after.assignments[a.id];
    if (!b) return `${tag}: Build removed ${a.id} (${a.source}${a.pinned ? ", pinned" : ""}${a.date < asOf ? ", past" : ""}) ${a.pharmacistId}@${a.storeId} ${a.date}`;
    if (b.storeId !== a.storeId || b.pharmacistId !== a.pharmacistId || b.date !== a.date || b.pinned !== a.pinned || b.source !== a.source) return `${tag}: Build changed protected ${a.id}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
  }
  const dates = dateRange(range.from, range.to);
  const evB = evalAll(base, dates), evA = evalAll(after, dates);
  // never introduces a presence Fail
  const nf = [...failKeys(after, evA, "presence")].filter((k) => !failKeys(base, evB, "presence").has(k));
  if (nf.length) return `${tag}: Build introduced presence Fail(s) ${nf.join("; ")}`;
  // every assignment Build created or moved counts
  for (const a of Object.values(after.assignments)) {
    const old = base.assignments[a.id];
    const isNew = !old || old.storeId !== a.storeId;
    if (isNew && !evA.assignments[a.id]!.counts) return `${tag}: Build's own placement ${a.id} ${a.pharmacistId}@${a.storeId} ${a.date} does not count`;
  }
  // no fillable gap is left: a legal single fill (inside Build's scope) must not exist for a gap that is short by one
  const baseFailsAfter = failKeys(after, evA, "presence");
  for (const c of Object.values(evA.cells)) {
    if (c.open !== 1 || c.date < asOf || c.date < range.from || c.date > range.to) continue;
    const onDate = Object.values(after.assignments).filter((a) => a.date === c.date);
    for (const a of onDate) {
      if (a.storeId === c.storeId || a.source === "manual" || a.source === "emergency" || a.pinned || a.partialNote) continue;
      if (onDate.some((x) => x.pharmacistId === a.pharmacistId && x.storeId === c.storeId)) continue;
      const st = applyOps(after, [{ ph: a.pharmacistId, date: a.date, to: c.storeId, from: a.storeId, asgId: a.id }]);
      const ev = evalAll(st, dates);
      const e = ev.assignments[a.id]!;
      if (!e.counts || e.results.some((r) => r.verdict === "Unknown")) continue;
      if (ev.cells[`${c.storeId}|${c.date}`]!.open !== 0 || ev.cells[`${a.storeId}|${a.date}`]!.open !== 0) continue;
      if (minus(failKeys(st, ev, "presence"), baseFailsAfter) > 0) continue;
      return `${tag}: Build left ${c.storeId}@${c.date} open although ${a.pharmacistId} (${a.source}) could move there from ${a.storeId} legally`;
    }
  }
  // idempotent
  const again = api.build(w2, range, asOf);
  if (again.proposal !== null || again.report.edits !== 0) return `${tag}: second Build is not a no-op (edits ${again.report.edits})`;
  stats.worlds = (stats.worlds ?? 0) + 1;
  for (const c of Object.values(evA.cells)) if (c.open > 0 && c.date >= asOf) stats.stillOpen = (stats.stillOpen ?? 0) + 1;
  const filled = Object.values(evB.cells).filter((c) => c.open > 0 && c.date >= asOf && evA.cells[`${c.storeId}|${c.date}`]!.open < c.open).length;
  stats.gapsFilled = (stats.gapsFilled ?? 0) + filled;
  return null;
}

test("build on tiny worlds: protected assignments stay, no new presence Fails, no fillable gap left, idempotent", () => {
  const n = ONLY !== null ? 1 : N * 2;
  const bad: string[] = [];
  const stats: Record<string, number> = {};
  for (let i = 0; i < n && bad.length < 4; i++) {
    const seed = ONLY ?? i + 1;
    const m = runBuildCase(seed, stats);
    if (m) bad.push(m + `\n    replay: ORACLE_SEED=${seed} node --experimental-strip-types --test domain/test/search-completeness.test.ts`);
  }
  if (process.env.V3_STATS) console.log("build:", JSON.stringify(stats));
  assert.equal(bad.length, 0, bad.join("\n"));
  if (ONLY === null && N >= 100) assert.ok((stats.gapsFilled ?? 0) > n / 4, "Build filled enough gaps for the test to mean something");
});

void ({} as Assignment);
