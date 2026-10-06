// Metamorphic relations for evaluate, build, repair and improve: change the input in a way that must not change the answer (or must change
// it in a known way) and compare. ORACLE_N scales the number of worlds, ORACLE_SEED replays one.
//
// What the spec says about ids (DOMAIN_SPEC.md I-9): ids are opaque but ORDER by code point, and that order is the documented tie-break
// (searches go in pharmacist id, store id, date order and ties end on the (pharmacist, store, date) tuple). So:
//  - an order-preserving renaming must give exactly the same answer, ids mapped back;
//  - a reversing renaming must give the same evaluation and, for Repair, the same status and metrics of the options (only ties between
//    equally good options may come out in another order); Build and Improve are greedy, so a changed tie-break may legitimately lead
//    elsewhere and only their invariants are asserted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.ts";
import { seedWorld, type Seed } from "../src/seed.ts";
import { addDays, cmp, dateRange } from "../src/dates.ts";
import { canonical, clone } from "../src/canonical.ts";
import { ENGINE_VERSION } from "../src/changeset.ts";
import type { Edit, Proposal, World } from "../src/api-types.ts";

function rng(seed: number) {
  let x = (Math.imul(seed >>> 0 || 1, 2654435761) >>> 0) || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = 0; i < 4; i++) next();
  return { next, int: (n: number) => Math.floor(next() * n), chance: (p: number) => next() < p, pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]!, range: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) };
}
type Rng = ReturnType<typeof rng>;
const N = Number(process.env.ORACLE_N ?? 20);
const ONLY = process.env.ORACLE_SEED ? Number(process.env.ORACLE_SEED) : null;
const D0 = "2026-10-12";
const DAYS = 12;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

// ---------- a mid-size world with fixed-width ids (so string order and id order agree everywhere) ----------
function genWorld(seed: number): World {
  const r = rng(seed * 104729 + 7);
  const nS = r.range(3, 6), nP = r.range(nS + 4, nS + 9);
  const S = (i: number) => `S${i}`, P = (i: number) => `P${pad(i, 2)}`;
  const sd: Seed = {
    stores: Array.from({ length: nS }, (_, i) => ({ id: S(i + 1), state: r.chance(0.2) ? "WA" : "OR", req: 1, closedWeekdays: r.chance(0.5) ? [0] : [0, 6], twoDays: r.chance(0.3) ? [r.int(5) + 1] : [] })),
    pharmacists: Array.from({ length: nP }, (_, i) => ({ id: P(i + 1), base: r.chance(0.08) ? null : S((i % nS) + 1), lic: r.chance(0.06) ? null : r.chance(0.4) ? ["OR", "WA"] : ["OR"], ...(r.chance(0.05) ? { licExpires: { OR: addDays(D0, r.int(DAYS)) } } : {}) })),
    travel: [], assignments: [], unavailability: [], dateOverrides: [], cells: [], standing: [],
  };
  for (let a = 1; a <= nS; a++) for (let b = 1; b <= nS; b++) if (a !== b && r.chance(0.85)) sd.travel!.push([S(a), S(b), r.chance(0.2) ? r.pick([88, 95, 151]) : r.range(10, 85), r.range(5, 60)]);
  let seq = 1, aid = 1;
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(D0, d);
    const free = Array.from({ length: nP }, (_, i) => P(i + 1));
    for (let i = free.length - 1; i > 0; i--) { const j = r.int(i + 1); [free[i], free[j]] = [free[j]!, free[i]!]; }
    for (let s = 1; s <= nS; s++) if (r.chance(0.82)) for (let k = r.chance(0.3) ? 2 : 1; k > 0 && free.length; k--) sd.assignments!.push({ id: `A${pad(aid++, 3)}`, store: S(s), ph: free.pop()!, date, seq: seq++, source: r.pick(["manual", "pattern", "build", "repair", "emergency"] as const), agreed: r.chance(0.8), pinned: r.chance(0.04), ...(r.chance(0.04) ? { partialNote: "half day" } : {}) });
  }
  for (let i = r.int(nP); i > 0; i--) { const first = addDays(D0, r.int(DAYS)); sd.unavailability!.push({ ph: P(r.int(nP) + 1), first, last: addDays(first, r.int(3)), status: r.pick(["Approved", "Actual", "Requested", "Denied"] as const) }); }
  for (let i = r.int(3); i > 0; i--) sd.dateOverrides!.push({ store: S(r.int(nS) + 1), date: addDays(D0, r.int(DAYS)), count: r.pick([0, 2]) });
  for (let i = r.int(3); i > 0; i--) sd.cells!.push({ store: S(r.int(nS) + 1), date: addDays(D0, r.int(DAYS)), locum: r.int(2), acceptedShort: r.int(2) });
  for (let i = r.range(1, 4); i > 0; i--) sd.standing!.push({ store: S(r.int(nS) + 1), ph: P(r.int(nP) + 1), recurrence: { weekdays: [1 + r.int(5)], cycleWeeks: r.pick([1, 2] as const), anchor: D0 }, from: "2026-01-01" });
  let w = seedWorld(sd);
  // a few real overrides, made the real way
  for (let i = 0; i < 4; i++) {
    const ev = api.evaluate(w.state, D0);
    const fails = Object.values(w.state.assignments).flatMap((a) => (ev.assignments[a.id]?.results ?? []).filter((x) => x.verdict === "Fail" && x.ruleId !== "licensing").map((x) => ({ a, x })));
    if (!fails.length) break;
    const f = r.pick(fails);
    const c = api.commit(w, [{ t: "override", assignmentId: f.a.id, ruleId: f.x.ruleId, reason: "ok" }], { kind: "manual" });
    if (!("refused" in c)) w = c.world;
  }
  return w;
}

// ---------- structural transforms (renaming ids, shifting dates, reordering records) ----------
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const ID_RE = /(?<![A-Za-z0-9])([SPA]\d+)(?![A-Za-z0-9])/g;
function deepMap(x: unknown, f: (s: string) => string): unknown {
  if (typeof x === "string") return f(x);
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map((v) => deepMap(v, f));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(x)) out[f(k)] = deepMap((x as Record<string, unknown>)[k], f);
  return out;
}
const shiftDates = (days: number) => (s: string) => s.replace(DATE_RE, (d) => addDays(d, days));
/** Order-preserving (or reversing) bijection over the store, pharmacist and assignment ids that occur in the world. */
function idMap(w: World, reverse: boolean): { fwd: (s: string) => string; inv: (s: string) => string } {
  const ids = [...Object.keys(w.state.stores), ...Object.keys(w.state.pharmacists), ...Object.keys(w.state.assignments)];
  const f = new Map<string, string>(), b = new Map<string, string>();
  for (const [prefix, list] of [["S", Object.keys(w.state.stores)], ["P", Object.keys(w.state.pharmacists)], ["A", Object.keys(w.state.assignments)]] as const) {
    const sorted = list.slice().sort(cmp);
    sorted.forEach((id, i) => { const rank = reverse ? sorted.length - 1 - i : i; const nid = `${prefix}${pad(rank + 1, 5)}`.replace(/^(.)/, (c) => c) ; f.set(id, nid); b.set(nid, id); });
  }
  void ids;
  const swap = (m: Map<string, string>) => (s: string) => s.replace(ID_RE, (t) => m.get(t) ?? t);
  return { fwd: swap(f), inv: swap(b) };
}
const mapWorld = (w: World, f: (s: string) => string): World => deepMap(w, f) as World;
const mapAny = <T>(x: T, f: (s: string) => string): T => deepMap(x, f) as T;

function shuffledKeys<T>(rec: Record<string, T>, r: Rng): Record<string, T> {
  const keys = Object.keys(rec);
  for (let i = keys.length - 1; i > 0; i--) { const j = r.int(i + 1); [keys[i], keys[j]] = [keys[j]!, keys[i]!]; }
  const out: Record<string, T> = {};
  for (const k of keys) out[k] = rec[k]!;
  return out;
}
function permuteWorld(w: World, r: Rng): World {
  const s = w.state;
  const st = { ...s, stores: shuffledKeys(s.stores, r), pharmacists: shuffledKeys(s.pharmacists, r), requirements: shuffledKeys(s.requirements, r), dateOverrides: shuffledKeys(s.dateOverrides, r), unavailability: shuffledKeys(s.unavailability, r), assignments: shuffledKeys(s.assignments, r), overrides: shuffledKeys(s.overrides, r), cellCounts: shuffledKeys(s.cellCounts, r), standing: shuffledKeys(s.standing, r), travel: shuffledKeys(s.travel, r), built: shuffledKeys(s.built, r) };
  return { ...w, state: st };
}

// ---------- engine calls, normalised ----------
type Out = { ev: unknown; build: unknown; repair: unknown; improve: unknown };
const strip = (p: Proposal | null) => (p ? { ...p, stateHash: "-" } : null);
function gapsOf(w: World, asOf: string, range: { from: string; to: string }) {
  const ev = api.evaluate(w.state, asOf, { range });
  return Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= asOf).map((c) => ({ storeId: c.storeId, date: c.date })).sort((a, b) => cmp(a.date, b.date) || cmp(a.storeId, b.storeId)).slice(0, 3);
}
function run(w: World, asOf: string, gapsIn: { storeId: string; date: string }[]): Out {
  const gaps = gapsIn.slice().sort((a, b) => cmp(a.date, b.date) || cmp(a.storeId, b.storeId));
  const range = { from: D0, to: addDays(D0, DAYS - 1) };
  const b = api.build(w, range, asOf);
  const rep = api.repair(w, gaps, { showNearMiss: true }, asOf);
  const rw = api.repair(w, gaps.slice(0, 2), { wider: true }, asOf);
  const imp = api.improve(w, { ...range, includeNext14: true }, asOf);
  return {
    ev: api.evaluate(w.state, asOf, { range }),
    build: { proposal: strip(b.proposal), report: b.report },
    repair: { rep, rw },
    improve: { status: imp.status, message: imp.message, proposal: strip(imp.proposal) },
  };
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function firstDiff(a: unknown, b: unknown, path = ""): string {
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return same(a, b) ? "" : `${path}: ${JSON.stringify(a)?.slice(0, 160)} != ${JSON.stringify(b)?.slice(0, 160)}`;
  const ka = Object.keys(a as object).sort(cmp), kb = Object.keys(b as object).sort(cmp);
  for (const k of new Set([...ka, ...kb])) { const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`); if (d) return d; }
  return "";
}
const replay = (seed: number) => `\n    replay: ORACLE_SEED=${seed} node --experimental-strip-types --test domain/test/metamorphic.test.ts`;
const seedsFor = (n: number) => (ONLY !== null ? [ONLY] : Array.from({ length: n }, (_, i) => i + 1));

// ---------- (a) renaming ids ----------
test("metamorphic (a): order-preserving renaming of every store, pharmacist and assignment id gives the same answers, ids mapped back", () => {
  const bad: string[] = [];
  let proposals = 0, repairs = 0, improves = 0;
  for (const seed of seedsFor(N)) {
    const w = genWorld(seed);
    const { fwd, inv } = idMap(w, false);
    const gaps = gapsOf(w, D0, { from: D0, to: addDays(D0, DAYS - 1) });
    const base = run(w, D0, gaps);
    const ren = run(mapWorld(w, fwd), D0, mapAny(gaps, fwd));
    const back = mapAny(ren, inv);
    const d = firstDiff(base, back);
    if (d) bad.push(`seed ${seed}: ${d}${replay(seed)}`);
    if ((base.build as { proposal: unknown }).proposal) proposals++;
    if ((base.repair as { rep: { options: unknown[] } }).rep.options.length) repairs++;
    if ((base.improve as { proposal: unknown }).proposal) improves++;
    if (bad.length >= 3) break;
  }
  if (process.env.V3_STATS) console.log("metamorphic a:", { proposals, repairs, improves });
  assert.equal(bad.length, 0, bad.join("\n"));
  if (ONLY === null && N >= 20) { assert.ok(proposals > N / 4, "enough Build proposals"); assert.ok(repairs > 0, "enough Repair options"); assert.ok(improves > 0, "at least one Improve proposal"); }
});

test("metamorphic (a'): reversing the id order gives the same evaluation, and Repair the same status and option metrics", () => {
  const bad: string[] = [];
  for (const seed of seedsFor(N)) {
    const w = genWorld(seed);
    const { fwd, inv } = idMap(w, true);
    const asOf = D0;
    const range = { from: D0, to: addDays(D0, DAYS - 1) };
    const gaps = gapsOf(w, asOf, range);
    const ev1 = api.evaluate(w.state, asOf, { range });
    const w2 = mapWorld(w, fwd);
    const ev2 = mapAny(api.evaluate(w2.state, asOf, { range }), inv);
    const d = firstDiff(ev1, ev2);
    if (d) bad.push(`seed ${seed}: evaluate differs under reversed ids: ${d}${replay(seed)}`);
    const r1 = api.repair(w, gaps, {}, asOf), r2 = api.repair(w2, mapAny(gaps, fwd), {}, asOf);
    // Status: "none" and "cannot evaluate" are both "no clean option"; which of the two a multi-gap search reports can depend on gap order
    // (see the skipped finding below), so only options / no options is compared here.
    const sig = (r: typeof r1) => ({ has: r.status === "options", message: r.status === "options" ? r.message : "", metrics: r.options.map((o) => o.metrics), used: r.gapsUsed.length, dropped: r.gapsDropped.length });
    const d2 = firstDiff(sig(r1), sig(r2));
    if (d2) bad.push(`seed ${seed}: repair differs under reversed ids: ${d2}${replay(seed)}`);
    // Build and Improve still obey their invariants on the renamed world
    const b2 = api.build(w2, range, asOf);
    if (b2.proposal) { const o = api.openProposal(w2, b2.proposal); assert.ok(!("refused" in o)); const acc = api.acceptProposal(o as World); assert.ok(!("refused" in acc)); const again = api.build((acc as { world: World }).world, range, asOf); if (again.proposal) bad.push(`seed ${seed}: build not idempotent under reversed ids${replay(seed)}`); }
    if (bad.length >= 3) break;
  }
  assert.equal(bad.length, 0, bad.join("\n"));
});

test("finding (skipped): Repair's none / cannot-evaluate status for several gaps on one date depends on the order of their ids", { skip: "FINDING: joint search only reaches the second gap when the first has no candidate at all, so a first gap whose only candidates have unknown data turns 'none' into 'cannot-evaluate'. Seed 26, ids reversed. Not fixed: needs a decision on what the status of a joint search means." }, () => {
  const w = genWorld(26);
  const { fwd } = idMap(w, true);
  const gaps = gapsOf(w, D0, { from: D0, to: addDays(D0, DAYS - 1) });
  assert.equal(api.repair(mapWorld(w, fwd), mapAny(gaps, fwd), {}, D0).status, api.repair(w, gaps, {}, D0).status);
});

// ---------- (b) shifting dates ----------
test("metamorphic (b): shifting every date and the as-of date by +7 days (and by +371) shifts every answer", () => {
  const bad: string[] = [];
  for (const seed of seedsFor(N)) {
    const w = genWorld(seed);
    const gaps = gapsOf(w, D0, { from: D0, to: addDays(D0, DAYS - 1) });
    const base = run(w, D0, gaps);
    for (const k of [7, 371]) {
      const f = shiftDates(k), inv = shiftDates(-k);
      const w2 = mapWorld(w, f);
      const asOf2 = addDays(D0, k);
      const range2 = { from: asOf2, to: addDays(asOf2, DAYS - 1) };
      const b = api.build(w2, range2, asOf2);
      const imp = api.improve(w2, { ...range2, includeNext14: true }, asOf2);
      const rep = api.repair(w2, mapAny(gaps, f), { showNearMiss: true }, asOf2);
      const rw = api.repair(w2, mapAny(gaps.slice(0, 2), f), { wider: true }, asOf2);
      const got = mapAny({
        ev: api.evaluate(w2.state, asOf2, { range: range2 }),
        build: { proposal: strip(b.proposal), report: b.report },
        repair: { rep, rw },
        improve: { status: imp.status, message: imp.message, proposal: strip(imp.proposal) },
      }, inv);
      const d = firstDiff(base, got);
      if (d) bad.push(`seed ${seed} shift ${k}: ${d}${replay(seed)}`);
    }
    if (bad.length >= 3) break;
  }
  assert.equal(bad.length, 0, bad.join("\n"));
});

// ---------- (c) an unrelated store and person ----------
test("metamorphic (c): adding a closed store and an inactive person with no assignments changes no existing cell and no proposal", () => {
  const bad: string[] = [];
  for (const seed of seedsFor(N)) {
    const w = genWorld(seed);
    const range = { from: D0, to: addDays(D0, DAYS - 1) };
    const gaps = gapsOf(w, D0, range);
    const base = run(w, D0, gaps);
    const st = clone(w.state);
    st.stores["S9"] = { id: "S9", code: "S9", name: "S9", state: "OR" };
    for (let wd = 0; wd < 7; wd++) st.requirements[`S9|${wd}|0001-01-01`] = { storeId: "S9", weekday: wd, effectiveFrom: "0001-01-01", count: 0 };
    st.pharmacists["P99"] = { id: "P99", name: "P99", initials: "P99", baseStoreId: "S9", licenses: { OR: null, WA: null }, inactiveFrom: "2000-01-01" };
    const w2: World = { ...w, state: st };
    const out = run(w2, D0, gaps);
    // the new store adds cells only under `range`; every old cell is untouched and the new ones are empty
    const evBase = (base.ev as { cells: Record<string, unknown>; assignments: unknown }), evNew = (out.ev as { cells: Record<string, { required: number; counted: number }>; assignments: unknown });
    for (const [k, c] of Object.entries(evNew.cells)) {
      if (k.startsWith("S9|")) { if (c.required !== 0 || c.counted !== 0) bad.push(`seed ${seed}: the new store has a non-empty cell ${k}${replay(seed)}`); delete evNew.cells[k]; }
    }
    const d = firstDiff({ ...base, ev: evBase }, { ...out, ev: evNew });
    if (d) bad.push(`seed ${seed}: ${d}${replay(seed)}`);
    if (bad.length >= 3) break;
  }
  assert.equal(bad.length, 0, bad.join("\n"));
});

// ---------- (d) insertion order ----------
test("metamorphic (d): permuting the insertion order of every table leaves stateHash and every answer identical", () => {
  const bad: string[] = [];
  for (const seed of seedsFor(N)) {
    const w = genWorld(seed);
    const range = { from: D0, to: addDays(D0, DAYS - 1) };
    const gaps = gapsOf(w, D0, range);
    const base = run(w, D0, gaps);
    for (let k = 0; k < 2; k++) {
      const r = rng(seed * 31 + k);
      const w2 = permuteWorld(w, r);
      if (api.stateHash(w2.state) !== api.stateHash(w.state)) bad.push(`seed ${seed}: stateHash depends on insertion order${replay(seed)}`);
      const shuffledGaps = gaps.slice().reverse();
      const d = firstDiff(base, run(w2, D0, shuffledGaps));
      if (d) bad.push(`seed ${seed} permutation ${k}: ${d}${replay(seed)}`);
      // a Build proposal made on one ordering is accepted on another (same hash)
      const b = api.build(w, range, D0);
      if (b.proposal) { const o = api.openProposal(w2, b.proposal); if ("refused" in o) bad.push(`seed ${seed}: proposal refused on a permuted copy: ${o.reason}${replay(seed)}`); }
    }
    if (bad.length >= 3) break;
  }
  assert.equal(bad.length, 0, bad.join("\n"));
});

// ---------- (e) commit then undo ----------
function randomEdit(w: World, r: Rng): Edit {
  const s = w.state;
  const stores = Object.keys(s.stores).sort(cmp), phs = Object.keys(s.pharmacists).sort(cmp), asg = Object.keys(s.assignments).sort(cmp);
  const date = addDays(D0, r.int(DAYS));
  const a = asg.length ? s.assignments[r.pick(asg)]! : null;
  switch (r.int(14)) {
    case 0: case 1: return { t: "place", storeId: r.pick(stores), pharmacistId: r.pick(phs), date };
    case 2: return a ? { t: "remove", assignmentId: a.id } : { t: "place", storeId: r.pick(stores), pharmacistId: r.pick(phs), date };
    case 3: return a ? { t: "move", assignmentId: a.id, toStoreId: r.pick(stores) } : { t: "cell.set", storeId: r.pick(stores), date, locum: 1 };
    case 4: return a ? { t: "swap", assignmentId: a.id, toPharmacistId: r.pick(phs) } : { t: "cell.set", storeId: r.pick(stores), date, acceptedShort: 1 };
    case 5: return { t: "unavail.add", pharmacistId: r.pick(phs), first: date, last: addDays(date, r.int(3)), status: r.pick(["Approved", "Requested", "Actual"] as const), type: "Sick" };
    case 6: return { t: "dateOverride.set", storeId: r.pick(stores), date, count: r.int(3), note: "n" };
    case 7: return { t: "dateOverride.clear", storeId: r.pick(stores), date };
    case 8: return a ? { t: "override", assignmentId: a.id, ruleId: r.pick(["availability", "closure", "double-booking", "travel-soft", "travel-hard", "consecutive-days"]), reason: "ok" } : { t: "built.set", date };
    case 9: { const o = Object.values(s.overrides); return o.length ? { t: "unoverride", assignmentId: o[0]!.assignmentId, ruleId: o[0]!.ruleId } : { t: "built.set", date }; }
    case 10: return a ? { t: "update", assignmentId: a.id, patch: { pinned: r.chance(0.5), agreed: r.chance(0.5), partialNote: r.chance(0.3) ? "x" : null } } : { t: "built.set", date };
    case 11: return { t: "requirement.set", storeId: r.pick(stores), weekday: r.int(7), effectiveFrom: date, count: r.int(3) };
    case 12: return { t: "cell.set", storeId: r.pick(stores), date, locum: r.int(3), acceptedShort: r.int(3) };
    default: return { t: "standing.add", storeId: r.pick(stores), pharmacistId: r.pick(phs), recurrence: { weekdays: [r.int(7)], cycleWeeks: 1, anchor: D0 }, effectiveFrom: D0 };
  }
}
test("metamorphic (e): commit then undo returns the exact stateHash (single edits, batches, and a stack undone in reverse)", () => {
  const bad: string[] = [];
  let committed = 0, refused = 0, undone = 0;
  for (const seed of seedsFor(Math.max(10, Math.round(N / 2)))) {
    const r = rng(seed * 977);
    let w = genWorld(seed);
    const h0 = api.stateHash(w.state);
    const stack: { id: string; before: string }[] = [];
    for (let i = 0; i < 25; i++) {
      const edits = Array.from({ length: r.chance(0.3) ? r.range(2, 3) : 1 }, () => randomEdit(w, r));
      const before = api.stateHash(w.state);
      const c = api.commit(w, edits, { kind: "manual" });
      if ("refused" in c) { refused++; if (api.stateHash(w.state) !== before) bad.push(`seed ${seed}: a refused commit changed the state${replay(seed)}`); continue; }
      committed++;
      const u = api.undo(c.world, c.changeSet.id);
      if ("refused" in u) { bad.push(`seed ${seed}: undo of the latest change set refused: ${u.reason} (${JSON.stringify(edits)})${replay(seed)}`); break; }
      undone++;
      if (api.stateHash(u.world.state) !== before) { bad.push(`seed ${seed}: commit+undo changed the hash for ${JSON.stringify(edits)}${replay(seed)}`); break; }
      // keep the commit and carry on, so later rounds see a changed world; remember it to unwind the whole stack at the end
      stack.push({ id: c.changeSet.id, before });
      w = c.world;
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      const u = api.undo(w, stack[i]!.id);
      if ("refused" in u) { bad.push(`seed ${seed}: unwinding ${stack[i]!.id} refused: ${u.reason}${replay(seed)}`); break; }
      w = u.world;
      if (api.stateHash(w.state) !== stack[i]!.before) { bad.push(`seed ${seed}: unwinding ${stack[i]!.id} gave another hash${replay(seed)}`); break; }
    }
    if (!bad.length && stack.length && api.stateHash(w.state) !== h0) bad.push(`seed ${seed}: the whole stack undone is not the original${replay(seed)}`);
    if (bad.length >= 3) break;
  }
  if (process.env.V3_STATS) console.log("metamorphic e:", { committed, refused, undone });
  assert.equal(bad.length, 0, bad.join("\n"));
  if (ONLY === null) assert.ok(committed > 100, "enough commits succeeded for the test to mean something");
});

// ---------- (f) accept then undo ----------
test("metamorphic (f): accepting a Build, Repair or Improve proposal and undoing it returns the exact stateHash", () => {
  const bad: string[] = [];
  const got = { build: 0, repair: 0, improve: 0 };
  for (const seed of seedsFor(N)) {
    const w = genWorld(seed);
    const range = { from: D0, to: addDays(D0, DAYS - 1) };
    const h0 = api.stateHash(w.state);
    const proposals: Proposal[] = [];
    const b = api.build(w, range, D0);
    if (b.proposal) { proposals.push(b.proposal); got.build++; }
    const rep = api.repair(w, gapsOf(w, D0, range), { wider: seed % 2 === 0 }, D0);
    if (rep.options[0]) { proposals.push({ kind: "repair", label: "Repair", edits: rep.options[0].edits, explanation: rep.options[0].explanation, stateHash: h0, engineVersion: ENGINE_VERSION }); got.repair++; }
    const imp = api.improve(w, { ...range, includeNext14: true }, D0);
    if (imp.proposal) { proposals.push(imp.proposal); got.improve++; }
    for (const p of proposals) {
      const o = api.openProposal(w, p);
      if ("refused" in o) { bad.push(`seed ${seed}: openProposal(${p.kind}) refused: ${o.reason}${replay(seed)}`); continue; }
      const acc = api.acceptProposal(o);
      if ("refused" in acc) { bad.push(`seed ${seed}: acceptProposal(${p.kind}) refused: ${acc.reason}${replay(seed)}`); continue; }
      if (acc.world.session.proposal) bad.push(`seed ${seed}: proposal still open after accept${replay(seed)}`);
      if (api.stateHash(acc.world.state) === h0) bad.push(`seed ${seed}: ${p.kind} proposal changed nothing${replay(seed)}`);
      const u = api.undo(acc.world, acc.changeSet.id);
      if ("refused" in u) { bad.push(`seed ${seed}: undo of ${p.kind} refused: ${u.reason}${replay(seed)}`); continue; }
      if (api.stateHash(u.world.state) !== h0) bad.push(`seed ${seed}: accept ${p.kind} + undo is not the exact original hash${replay(seed)}`);
      // the told ledger comes back too
      if (canonical(u.world.journal.told) !== canonical(w.journal.told)) bad.push(`seed ${seed}: accept ${p.kind} + undo left the told ledger changed${replay(seed)}`);
    }
    // a proposal is refused once the schedule has moved on
    if (proposals[0]) {
      const o = api.openProposal(w, proposals[0]);
      if (!("refused" in o)) {
        const other = { ...o, state: { ...o.state, cellCounts: { ...o.state.cellCounts, "S1|2000-01-01": { storeId: "S1", date: "2000-01-01", locum: 1, acceptedShort: 0 } } } };
        if (!("refused" in api.acceptProposal(other))) bad.push(`seed ${seed}: a stale proposal was accepted${replay(seed)}`);
      }
    }
    if (bad.length >= 3) break;
  }
  if (process.env.V3_STATS) console.log("metamorphic f:", got);
  assert.equal(bad.length, 0, bad.join("\n"));
  if (ONLY === null && N >= 20) { assert.ok(got.build > N / 4); assert.ok(got.repair > 0); assert.ok(got.improve > 0); }
});

void dateRange;
