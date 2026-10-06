// Seeded random worlds and operation sequences. Every run is reproducible from its seed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.ts";
import { seedWorld, type Seed } from "../src/seed.ts";
import { addDays } from "../src/dates.ts";
import { applyEvents } from "../src/changeset.ts";
import { checkIntegrity } from "../src/integrity.ts";
import { canonical, clone } from "../src/canonical.ts";
import type { Edit, World } from "../src/api-types.ts";
import type { DomainState } from "../src/types.ts";

function rng(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(a: T[]): T => a[Math.floor(next() * a.length)]!, chance: (p: number) => next() < p };
}

const START = "2026-06-01";
const DAYS = 14;

function randomSeed(seed: number): Seed {
  const r = rng(seed);
  const nS = 3 + r.int(3), nP = 5 + r.int(5);
  const stores = Array.from({ length: nS }, (_, i) => ({ id: `S${i + 1}`, state: r.chance(0.3) ? ("WA" as const) : ("OR" as const), req: 1, closedWeekdays: [0], twoDays: r.chance(0.3) ? [2] : [] }));
  const pharmacists = Array.from({ length: nP }, (_, i) => ({ id: `P${i + 1}`, base: r.chance(0.9) ? `S${r.int(nS) + 1}` : null, lic: r.chance(0.15) ? null : r.chance(0.3) ? (["OR", "WA"] as ("OR" | "WA")[]) : (["OR"] as ("OR" | "WA")[]) }));
  const assignments: NonNullable<Seed["assignments"]> = [];
  let n = 1;
  for (let d = 0; d < DAYS; d++) for (const s of stores) if (r.chance(0.75)) assignments.push({ id: `A${n}`, seq: n++, store: s.id, ph: `P${r.int(nP) + 1}`, date: addDays(START, d), agreed: r.chance(0.7), pinned: r.chance(0.05) });
  const unavailability = Array.from({ length: r.int(5) }, (_, i) => ({ id: `U${i + 1}`, ph: `P${r.int(nP) + 1}`, first: addDays(START, r.int(DAYS)), last: addDays(START, r.int(DAYS) + 2), status: r.pick(["Approved", "Requested", "Actual", "Denied"] as const) }));
  const travel: [string, string, number, number][] = [];
  for (const a of stores) for (const b of stores) if (a.id !== b.id && r.chance(0.8)) travel.push([a.id, b.id, 10 + r.int(150), 5 + r.int(100)]);
  const standing = Array.from({ length: r.int(4) }, (_, i) => ({ id: `T${i + 1}`, store: `S${r.int(nS) + 1}`, ph: `P${r.int(nP) + 1}`, recurrence: { weekdays: [1 + r.int(5)], cycleWeeks: (1 + r.int(2)) as 1 | 2, anchor: START }, from: START }));
  return { stores, pharmacists, assignments, unavailability: unavailability.map((u) => ({ ...u, last: u.last < u.first ? u.first : u.last })), travel, standing };
}

function randomEdit(w: World, r: ReturnType<typeof rng>): Edit {
  const s = w.state;
  const stores = Object.keys(s.stores), phs = Object.keys(s.pharmacists), asg = Object.keys(s.assignments);
  const date = addDays(START, r.int(DAYS));
  switch (r.int(8)) {
    case 0: return { t: "place", storeId: r.pick(stores), pharmacistId: r.pick(phs), date };
    case 1: return asg.length ? { t: "remove", assignmentId: r.pick(asg) } : { t: "place", storeId: r.pick(stores), pharmacistId: r.pick(phs), date };
    case 2: return asg.length ? { t: "move", assignmentId: r.pick(asg), toStoreId: r.pick(stores) } : { t: "dateOverride.set", storeId: r.pick(stores), date, count: 0, note: "x" };
    case 3: return asg.length ? { t: "swap", assignmentId: r.pick(asg), toPharmacistId: r.pick(phs) } : { t: "dateOverride.clear", storeId: r.pick(stores), date };
    case 4: return { t: "unavail.add", pharmacistId: r.pick(phs), first: date, last: addDays(date, r.int(3)), status: "Approved", type: "Sick" };
    case 5: return { t: "dateOverride.set", storeId: r.pick(stores), date, count: r.int(3), note: "n" };
    case 6: return asg.length ? { t: "override", assignmentId: r.pick(asg), ruleId: r.pick(["availability", "closure", "double-booking", "travel-soft", "consecutive-days"]), reason: "ok" } : { t: "cell.set", storeId: r.pick(stores), date, acceptedShort: 1 };
    default: return asg.length ? { t: "update", assignmentId: r.pick(asg), patch: { pinned: r.chance(0.5), agreed: r.chance(0.5) } } : { t: "cell.set", storeId: r.pick(stores), date, locum: 1 };
  }
}

const STATS = { commits: 0, refused: 0, undos: 0, builds: 0, repairs: 0, repairOptions: 0, improves: 0 };
process.on("exit", () => { if (process.env.V3_STATS) console.log("fuzz stats", JSON.stringify(STATS)); });
const hashOf = (st: DomainState) => api.stateHash(st);

test("fuzz: commits keep integrity, undo restores, replay reproduces, evaluate is deterministic", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed * 7919);
    let w = seedWorld(randomSeed(seed));
    const initial = clone(w.state);
    for (let step = 0; step < 25; step++) {
      const before = hashOf(w.state);
      const res = api.commit(w, [randomEdit(w, r)], { kind: "manual" });
      if ("refused" in res) { STATS.refused++; assert.equal(hashOf(w.state), before, `seed ${seed}: refused commit changed state`); continue; }
      w = res.world; STATS.commits++;
      assert.deepEqual(checkIntegrity(w.state), [], `seed ${seed} step ${step}: integrity`);
      if (r.chance(0.3)) {
        const u = api.undo(w, res.changeSet.id);
        if (!("refused" in u)) { STATS.undos++; assert.equal(hashOf(u.world.state), before, `seed ${seed}: undo did not restore`); w = u.world; }
      }
    }
    // replaying every change set from the start reproduces the final tables
    const replay = clone(initial);
    for (const cs of w.journal.changeSets) applyEvents(replay, cs.events);
    assert.equal(hashOf(replay), hashOf(w.state), `seed ${seed}: replay differs`);
    const range = { from: START, to: addDays(START, DAYS) };
    const e1 = api.evaluate(w.state, START, { range });
    const e2 = api.evaluate(clone(w.state), START, { range });
    assert.equal(canonical(e1), canonical(e2), `seed ${seed}: evaluate not deterministic`);
    // coverage identities
    for (const c of Object.values(e1.cells)) {
      assert.equal(c.covered, c.counted + c.locum);
      assert.equal(c.open, Math.max(0, c.required - c.covered - c.acceptedShort));
      assert.ok(c.open >= 0 && c.surplus >= 0);
    }
  }
});

test("fuzz: Build is idempotent and never touches the past", () => {
  for (let seed = 100; seed < 140; seed++) {
    const w0 = seedWorld(randomSeed(seed));
    const asOf = addDays(START, 3);
    const range = { from: START, to: addDays(START, DAYS) };
    const b1 = api.build(w0, range, asOf);
    let w = w0;
    if (b1.proposal) {
      STATS.builds++;
      const o = api.openProposal(w0, b1.proposal);
      assert.ok(!("refused" in o), `seed ${seed}: open`);
      const c = api.acceptProposal(o as World);
      assert.ok(!("refused" in c), `seed ${seed}: accept`);
      w = (c as { world: World }).world;
      for (const e of b1.proposal.edits) if (e.t === "place") assert.ok(e.date >= asOf, `seed ${seed}: build placed in the past`);
      assert.deepEqual(checkIntegrity(w.state), []);
    }
    const b2 = api.build(w, range, asOf);
    assert.equal(b2.proposal, null, `seed ${seed}: second build changed something: ${JSON.stringify(b2.proposal?.edits.slice(0, 3))}`);
    // past assignments untouched
    for (const a of Object.values(w0.state.assignments)) if (a.date < asOf) assert.deepEqual(w.state.assignments[a.id], a);
  }
});

test("fuzz: Repair options are clean, deterministic, and never move pinned or past assignments", () => {
  for (let seed = 200; seed < 240; seed++) {
    const w = seedWorld(randomSeed(seed));
    const asOf = addDays(START, 2);
    const range = { from: START, to: addDays(START, DAYS) };
    const ev = api.evaluate(w.state, asOf, { range });
    const gaps = Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= asOf).slice(0, 3).map((c) => ({ storeId: c.storeId, date: c.date }));
    if (!gaps.length) continue;
    const a = api.repair(w, gaps, { wider: seed % 2 === 0 }, asOf);
    const b = api.repair(w, gaps, { wider: seed % 2 === 0 }, asOf);
    assert.equal(canonical(a), canonical(b), `seed ${seed}: repair not deterministic`);
    STATS.repairs++; STATS.repairOptions += a.options.length;
    assert.ok(a.options.length <= 3);
    for (const o of a.options) {
      for (const e of o.edits) {
        if (e.t === "move") { const x = w.state.assignments[e.assignmentId]!; assert.ok(!x.pinned && !x.partialNote && x.date >= asOf, `seed ${seed}: moved a protected assignment`); }
      }
      const res = api.commit(w, o.edits, { kind: "repair" });
      assert.ok(!("refused" in res), `seed ${seed}: option does not apply`);
      if ("refused" in res) continue;
      const after = api.evaluate(res.world.state, asOf, { range });
      for (const g of a.gapsUsed) assert.equal(after.cells[`${g.storeId}|${g.date}`]?.open ?? 0, 0, `seed ${seed}: option leaves a used gap open`);
    }
  }
});

test("fuzz: Improve never makes a rule, open or unverified count worse", () => {
  for (let seed = 300; seed < 330; seed++) {
    const w = seedWorld(randomSeed(seed));
    const asOf = START;
    const range = { from: START, to: addDays(START, DAYS) };
    const r = api.improve(w, { ...range, includeNext14: true }, asOf);
    if (!r.proposal) continue;
    STATS.improves++;
    const c = api.commit(w, r.proposal.edits, { kind: "improve" });
    assert.ok(!("refused" in c));
    if ("refused" in c) continue;
    const sum = (st: DomainState) => {
      const ev = api.evaluate(st, asOf, { range });
      const fails: Record<string, number> = {};
      for (const a of Object.values(st.assignments)) for (const x of ev.assignments[a.id]!.results) if (x.verdict === "Fail" && !x.overridden) fails[x.ruleId] = (fails[x.ruleId] ?? 0) + 1;
      return { fails, open: Object.values(ev.cells).reduce((n, c2) => n + c2.open, 0), unv: Object.values(ev.cells).reduce((n, c2) => n + c2.unverified, 0) };
    };
    const b = sum(w.state), a = sum(c.world.state);
    for (const k of Object.keys(a.fails)) assert.ok(a.fails[k]! <= (b.fails[k] ?? 0), `seed ${seed}: ${k} fails rose`);
    assert.ok(a.open <= b.open, `seed ${seed}: open rose`);
    assert.ok(a.unv <= b.unv, `seed ${seed}: unverified rose`);
  }
});

test("fuzz: shuffling every input list changes no output", () => {
  for (let seed = 400; seed < 430; seed++) {
    const base = randomSeed(seed);
    const r = rng(seed);
    const shuffle = <T>(a: T[] | undefined): T[] | undefined => { if (!a) return a; const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = r.int(i + 1); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; };
    const alt: Seed = { ...base, stores: shuffle(base.stores)!, pharmacists: shuffle(base.pharmacists)!, assignments: shuffle(base.assignments), unavailability: shuffle(base.unavailability), travel: shuffle(base.travel), standing: shuffle(base.standing) };
    const w1 = seedWorld(base), w2 = seedWorld(alt);
    const asOf = addDays(START, 1);
    const range = { from: START, to: addDays(START, DAYS) };
    assert.equal(canonical(api.evaluate(w1.state, asOf, { range })), canonical(api.evaluate(w2.state, asOf, { range })), `seed ${seed}: evaluate`);
    assert.equal(canonical(api.build(w1, range, asOf)), canonical(api.build(w2, range, asOf)), `seed ${seed}: build`);
    assert.equal(canonical(api.improve(w1, { ...range, includeNext14: true }, asOf)), canonical(api.improve(w2, { ...range, includeNext14: true }, asOf)), `seed ${seed}: improve`);
  }
});
