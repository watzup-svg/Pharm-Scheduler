// Rule oracle: a deliberately simple second implementation of the coverage rules, written from docs/v3/DOMAIN_SPEC.md (sections 1-4),
// compared with evaluate() on thousands of random small worlds. It shares no code with domain/src/coverage.ts and does its date
// maths with the built-in Date (UTC), so it also cross-checks dates.ts. ORACLE_N scales the number of worlds, ORACLE_SEED replays one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.ts";
import { seedWorld, type Seed } from "../src/seed.ts";
import type { DomainState, Override } from "../src/types.ts";

// ---------- tiny seeded rng ----------
function rng(seed: number) {
  let x = (Math.imul(seed >>> 0 || 1, 2654435761) >>> 0) || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = 0; i < 4; i++) next();
  return { next, int: (n: number) => Math.floor(next() * n), chance: (p: number) => next() < p, pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]!, range: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) };
}

// ---------- dates via Date (UTC), never the domain's own ----------
const MS = 86_400_000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const dayNum = (s: string) => { const [y, m, d] = s.split("-").map(Number) as [number, number, number]; return Date.UTC(y, m - 1, d) / MS; };
const iso = (n: number) => { const d = new Date(n * MS); return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const dow = (s: string) => new Date(dayNum(s) * MS).getUTCDay();
const plus = (s: string, k: number) => iso(dayNum(s) + k);
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); // ASCII ids and dates only

// ---------- the oracle ----------
type Verdict = "Pass" | "Fail" | "Unknown" | "NotApplicable";
type R = { verdict: Verdict; sig: string };
type OEval = { rules: Record<string, R>; overridden: Record<string, boolean>; outdated: Record<string, boolean>; counts: boolean; unverified: boolean };
type OCell = { required: number; counted: number; unverified: number; locum: number; acceptedShort: number; covered: number; open: number; surplus: number };

const PRESENCE = ["availability", "closure", "double-booking", "licensing"];
const OVERRIDABLE: Record<string, boolean> = { availability: true, closure: true, "double-booking": true, licensing: false, "travel-soft": true, "travel-hard": true, "consecutive-days": true };

function requiredCount(st: DomainState, storeId: string, date: string): number {
  const store = st.stores[storeId]!;
  if (store.inactiveFrom !== undefined && store.inactiveFrom <= date) return 0;
  if (store.activeFrom !== undefined && store.activeFrom > date) return 0;
  for (const o of Object.values(st.dateOverrides)) if (o.storeId === storeId && o.date === date) return o.count;
  let best: { effectiveFrom: string; count: number } | null = null;
  for (const r of Object.values(st.requirements)) {
    if (r.storeId !== storeId || r.weekday !== dow(date) || r.effectiveFrom > date) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best ? best.count : 0;
}

function oracle(st: DomainState, includeRequested: boolean): { asg: Record<string, OEval>; cell: (s: string, d: string) => OCell } {
  const asgs = Object.values(st.assignments);
  const out: Record<string, OEval> = {};
  const cfg = st.config;
  // per pharmacist per date: the group
  const group = (a: { pharmacistId: string; date: string }) => asgs.filter((x) => x.pharmacistId === a.pharmacistId && x.date === a.date);
  const hasOverride = (aid: string, rule: string) => Object.values(st.overrides).find((o) => o.assignmentId === aid && o.ruleId === rule);
  // runs: dates with any assignment, per pharmacist
  const runIndex = (ph: string, date: string): { index: number; length: number } => {
    const days = new Set(asgs.filter((x) => x.pharmacistId === ph).map((x) => dayNum(x.date)));
    const n = dayNum(date);
    let lo = n; while (days.has(lo - 1)) lo--;
    let hi = n; while (days.has(hi + 1)) hi++;
    return { index: n - lo, length: hi - lo + 1 };
  };
  for (const a of asgs) {
    const store = st.stores[a.storeId]!, ph = st.pharmacists[a.pharmacistId]!;
    const rules: Record<string, R> = {};
    // closure
    rules["closure"] = requiredCount(st, a.storeId, a.date) === 0 ? { verdict: "Fail", sig: "closed" } : { verdict: "Pass", sig: "open" };
    // licensing
    if (store.state === null) rules["licensing"] = { verdict: "NotApplicable", sig: "" };
    else if (ph.licenses === undefined) rules["licensing"] = { verdict: "Unknown", sig: "" };
    else if (!Object.prototype.hasOwnProperty.call(ph.licenses, store.state)) rules["licensing"] = { verdict: "Fail", sig: `${ph.id}|${store.state}|none` };
    else {
      const exp = ph.licenses[store.state];
      rules["licensing"] = exp !== null && exp !== undefined && exp < a.date ? { verdict: "Fail", sig: `${ph.id}|${store.state}|expired` } : { verdict: "Pass", sig: "" };
    }
    // availability
    const why: string[] = [];
    if ((ph.activeFrom !== undefined && a.date < ph.activeFrom) || (ph.inactiveFrom !== undefined && a.date >= ph.inactiveFrom)) why.push("inactive");
    const off = Object.values(st.unavailability).some((u) =>
      u.pharmacistId === a.pharmacistId && u.first <= a.date && a.date <= u.last &&
      (u.status === "Approved" || u.status === "Actual" || (includeRequested && u.status === "Requested")) &&
      (u.scopeStoreId === undefined || u.scopeStoreId === a.storeId));
    if (off) why.push("unavailable");
    rules["availability"] = why.length ? { verdict: "Fail", sig: why.join(",") } : { verdict: "Pass", sig: "" };
    // double booking
    const g = group(a);
    const gsig = g.map((x) => x.storeId).sort(cmpStr).join(",");
    let groupResolved = false;
    if (g.length < 2) rules["double-booking"] = { verdict: "NotApplicable", sig: "" };
    else {
      const ordered = g.slice().sort((x, y) => x.placedSeq - y.placedSeq);
      groupResolved = ordered.slice(1).every((m) => hasOverride(m.id, "double-booking")?.signature === gsig);
      rules["double-booking"] = groupResolved && ordered[0]!.id === a.id ? { verdict: "Pass", sig: gsig } : { verdict: "Fail", sig: gsig };
    }
    // travel
    for (const [id, lim] of [["travel-soft", cfg.travelSoftMinutes], ["travel-hard", cfg.travelHardMinutes]] as const) {
      if (ph.baseStoreId === null) rules[id] = { verdict: "NotApplicable", sig: "" };
      else if (ph.baseStoreId === a.storeId) rules[id] = { verdict: "Pass", sig: "0" };
      else {
        const pair = Object.values(st.travel).find((t) => t.fromStoreId === ph.baseStoreId && t.toStoreId === a.storeId);
        rules[id] = !pair ? { verdict: "Unknown", sig: "" } : pair.minutes > lim ? { verdict: "Fail", sig: String(pair.minutes) } : { verdict: "Pass", sig: String(pair.minutes) };
      }
    }
    // consecutive days
    const run = runIndex(a.pharmacistId, a.date);
    rules["consecutive-days"] = run.index + 1 > cfg.maxConsecutiveDays ? { verdict: "Fail", sig: String(run.length) } : { verdict: "Pass", sig: "" };

    const overridden: Record<string, boolean> = {}, outdated: Record<string, boolean> = {};
    let unresolved = false, unknown = false;
    for (const [id, r] of Object.entries(rules)) {
      overridden[id] = false; outdated[id] = false;
      const o = r.verdict === "Fail" ? hasOverride(a.id, id) : undefined;
      // spec section 2 / I-1: licensing can never be overridden, even by a row that is already in the data (inert: neither overridden nor outdated)
      if (o && OVERRIDABLE[id]) {
        if (o.signature !== r.sig) outdated[id] = true;
        else overridden[id] = id === "double-booking" ? groupResolved : true;
      }
      if (PRESENCE.includes(id)) {
        if (r.verdict === "Fail" && !overridden[id]) unresolved = true;
        if (r.verdict === "Unknown") unknown = true;
      }
    }
    out[a.id] = { rules, overridden, outdated, counts: !unresolved, unverified: !unresolved && unknown };
  }
  const cell = (s: string, d: string): OCell => {
    const c = Object.values(st.cellCounts).find((x) => x.storeId === s && x.date === d);
    const mine = asgs.filter((a) => a.storeId === s && a.date === d);
    const counted = mine.filter((a) => out[a.id]!.counts).length;
    const required = requiredCount(st, s, d);
    const locum = c?.locum ?? 0, acceptedShort = c?.acceptedShort ?? 0;
    const covered = counted + locum;
    return { required, counted, unverified: mine.filter((a) => out[a.id]!.unverified).length, locum, acceptedShort, covered, open: Math.max(0, required - covered - acceptedShort), surplus: Math.max(0, covered - required) };
  };
  return { asg: out, cell };
}

// ---------- world generator (independent of scripts/v3-pressure) ----------
const STARTS = ["2026-02-24", "2026-12-27", "2028-02-25", "2026-05-29", "2027-01-01", "2026-10-06", "2100-02-26", "2026-08-30", "2024-12-30", "2026-03-01"];

function genWorld(seed: number): DomainState {
  const r = rng(seed);
  const nS = r.range(3, 8), nP = r.range(4, 15), days = r.range(1, 14);
  const start = r.pick(STARTS);
  const day = (k: number) => plus(start, k);
  const randDay = () => day(r.int(days + 4) - 2);
  const sd: Seed = {
    stores: Array.from({ length: nS }, (_, i) => ({
      id: `S${i + 1}`, state: r.chance(0.1) ? null : r.chance(0.35) ? "WA" : "OR", req: r.range(0, 2),
      closedWeekdays: r.chance(0.3) ? [0, 6] : r.chance(0.5) ? [0] : [], twoDays: r.chance(0.3) ? [r.int(7)] : [],
      ...(r.chance(0.12) ? { inactiveFrom: randDay() } : {}), ...(r.chance(0.1) ? { activeFrom: randDay() } : {}),
    })),
    pharmacists: Array.from({ length: nP }, (_, i) => ({
      id: `P${i + 1}`, base: r.chance(0.12) ? null : `S${r.int(nS) + 1}`,
      lic: r.chance(0.1) ? null : r.chance(0.5) ? ["OR", "WA"] : r.chance(0.7) ? ["OR"] : r.chance(0.5) ? ["WA"] : [],
      ...(r.chance(0.2) ? { licExpires: { OR: randDay() } } : {}),
      ...(r.chance(0.08) ? { activeFrom: randDay() } : {}), ...(r.chance(0.1) ? { inactiveFrom: randDay() } : {}),
    })),
    travel: [],
  };
  for (let a = 1; a <= nS; a++) for (let b = 1; b <= nS; b++) if (a !== b && r.chance(0.7)) sd.travel!.push([`S${a}`, `S${b}`, r.chance(0.3) ? r.pick([89, 90, 91, 149, 150, 151]) : r.int(200), r.int(100)]);
  const asg: NonNullable<Seed["assignments"]> = [];
  let seq = 1;
  for (let d = 0; d < days; d++) {
    const date = day(d);
    for (let s = 1; s <= nS; s++) if (r.chance(0.6)) for (let k = r.range(1, r.chance(0.2) ? 3 : 1); k > 0; k--) asg.push({ store: `S${s}`, ph: `P${r.int(nP) + 1}`, date, seq: 0, agreed: r.chance(0.5) });
  }
  const seen = new Set<string>();
  const uniq = asg.filter((a) => { const k = `${a.store}|${a.ph}|${a.date}`; if (seen.has(k) && !r.chance(0.03)) return false; seen.add(k); return true; }); // a rare exact duplicate stays
  // shuffled, unique placement order
  const order = uniq.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = r.int(i + 1); [order[i], order[j]] = [order[j]!, order[i]!]; }
  uniq.forEach((a, i) => { a.seq = order[i]! + 1; seq++; });
  sd.assignments = uniq;
  sd.unavailability = Array.from({ length: r.int(nP) }, () => {
    const first = randDay();
    const status = r.pick(["Approved", "Approved", "Requested", "Actual", "Denied"] as const);
    const turned = r.chance(0.15);
    return { ph: `P${r.int(nP) + 1}`, first, last: turned ? first : plus(first, r.int(4)), status, type: turned ? "Turned-down" as const : "Vacation" as const, ...(turned ? { scope: `S${r.int(nS) + 1}` } : {}) };
  });
  sd.dateOverrides = Array.from({ length: r.int(4) }, () => ({ store: `S${r.int(nS) + 1}`, date: day(r.int(days)), count: r.pick([0, 0, 1, 2, 3]) }));
  sd.cells = Array.from({ length: r.int(4) }, () => ({ store: `S${r.int(nS) + 1}`, date: day(r.int(days)), locum: r.int(3), acceptedShort: r.int(3) }));
  const world = seedWorld(sd);
  const st = world.state;
  // dated requirement rows (changed weekly requirement over time), added on top of the seed's epoch rows
  for (let i = r.int(5); i > 0; i--) {
    const storeId = `S${r.int(nS) + 1}`, weekday = r.int(7), effectiveFrom = day(r.int(days + 6) - 3);
    st.requirements[`${storeId}|${weekday}|${effectiveFrom}`] = { storeId, weekday, effectiveFrom, count: r.int(4) };
  }
  for (const p of Object.values(st.pharmacists)) {
    if (p.licenses && r.chance(0.1)) p.licenses = { ...p.licenses, WA: r.chance(0.5) ? null : randDay() };
    if (p.licenses && r.chance(0.05)) p.licenses = { ...p.licenses, OR: undefined as unknown as null }; // key present, value undefined: no expiry per type docs
  }
  if (r.chance(0.2)) st.config = { ...st.config, maxConsecutiveDays: r.range(1, 4) };
  if (r.chance(0.15)) st.config = { ...st.config, travelSoftMinutes: r.int(120), travelHardMinutes: 60 + r.int(120) };
  // overrides: computed against the oracle's own current signatures so some match, some are stale
  const o = oracle(st, false);
  let n = 1;
  const add = (assignmentId: string, ruleId: string, signature: string) => { const id = `O${n++}`; (st.overrides as Record<string, Override>)[id] = { id, assignmentId, ruleId, signature, reason: "why" }; };
  for (const a of Object.values(st.assignments)) {
    if (!r.chance(0.35)) continue;
    for (const [rule, res] of Object.entries(o.asg[a.id]!.rules)) {
      if (!r.chance(0.35)) continue;
      if (res.verdict === "Fail") add(a.id, rule, r.chance(0.7) ? res.sig : res.sig + "~");
      else if (r.chance(0.1)) add(a.id, rule, "stale"); // moot override on a passing rule
    }
  }
  // fully resolved double-booking groups
  for (const a of Object.values(st.assignments)) {
    const g = Object.values(st.assignments).filter((x) => x.pharmacistId === a.pharmacistId && x.date === a.date);
    if (g.length < 2 || !r.chance(0.3)) continue;
    const sig = g.map((x) => x.storeId).sort(cmpStr).join(",");
    const first = g.slice().sort((x, y) => x.placedSeq - y.placedSeq)[0]!;
    for (const m of g) if (m !== first && !Object.values(st.overrides).some((x) => x.assignmentId === m.id && x.ruleId === "double-booking")) add(m.id, "double-booking", sig);
  }
  st.nextId.override = n;
  return st;
}

// ---------- comparison ----------
function compare(seed: number, st: DomainState, includeRequested: boolean, useRange: boolean): string | null {
  const o = oracle(st, includeRequested);
  const dates = Object.values(st.assignments).map((a) => a.date).sort();
  const from = dates[0] ?? "2026-10-01";
  const range = { from: plus(from, -1), to: plus(from, 16) };
  const ev = api.evaluate(st, "2026-01-01", { includeRequested, ...(useRange ? { range } : {}) });
  const tag = `seed ${seed} includeRequested=${includeRequested} range=${useRange}`;
  const ids = Object.keys(st.assignments);
  if (Object.keys(ev.assignments).length !== ids.length) return `${tag}: assignment count ${Object.keys(ev.assignments).length} != ${ids.length}`;
  for (const id of ids) {
    const a = st.assignments[id]!, e = ev.assignments[id], x = o.asg[id]!;
    if (!e) return `${tag}: ${id} missing from evaluation`;
    const where = `${tag}: ${id} (${a.pharmacistId}@${a.storeId} ${a.date})`;
    for (const r of e.results) {
      const want = x.rules[r.ruleId];
      if (!want) return `${where}: engine has unknown rule ${r.ruleId}`;
      if (r.verdict !== want.verdict) return `${where}: ${r.ruleId}.verdict engine=${r.verdict} oracle=${want.verdict}`;
      if (r.verdict === "Fail" && r.signature !== want.sig) return `${where}: ${r.ruleId}.signature engine=${JSON.stringify(r.signature)} oracle=${JSON.stringify(want.sig)}`;
      if (r.overridden !== x.overridden[r.ruleId]) return `${where}: ${r.ruleId}.overridden engine=${r.overridden} oracle=${x.overridden[r.ruleId]}`;
      if (r.outdated !== x.outdated[r.ruleId]) return `${where}: ${r.ruleId}.outdated engine=${r.outdated} oracle=${x.outdated[r.ruleId]}`;
    }
    if (e.results.length !== 7) return `${where}: ${e.results.length} rule results, expected 7`;
    if (e.counts !== x.counts) return `${where}: counts engine=${e.counts} oracle=${x.counts}`;
    if (e.unverified !== x.unverified) return `${where}: unverified engine=${e.unverified} oracle=${x.unverified}`;
  }
  const expectKeys = new Set<string>();
  for (const a of Object.values(st.assignments)) expectKeys.add(`${a.storeId}|${a.date}`);
  for (const c of Object.values(st.cellCounts)) expectKeys.add(`${c.storeId}|${c.date}`);
  if (useRange) for (const s of Object.keys(st.stores)) for (let n = dayNum(range.from); n <= dayNum(range.to); n++) expectKeys.add(`${s}|${iso(n)}`);
  for (const k of expectKeys) {
    const c = ev.cells[k];
    if (!c) return `${tag}: cell ${k} missing`;
    const [s, d] = k.split("|") as [string, string];
    const w = o.cell(s, d);
    for (const f of Object.keys(w) as (keyof OCell)[]) if (c[f] !== w[f]) return `${tag}: cell ${k}.${f} engine=${c[f]} oracle=${w[f]}`;
  }
  for (const k of Object.keys(ev.cells)) if (!expectKeys.has(k)) return `${tag}: unexpected cell ${k}`;
  return null;
}

const N = Number(process.env.ORACLE_N ?? 1500);
const ONLY = process.env.ORACLE_SEED ? Number(process.env.ORACLE_SEED) : null;

test(`oracle: evaluate() agrees with the independent rules on ${ONLY ?? N} random small worlds`, () => {
  const bad: string[] = [];
  const seeds = ONLY !== null ? [ONLY] : Array.from({ length: N }, (_, i) => i + 1);
  let assignmentsChecked = 0, fails = 0, overridden = 0, outdated = 0, unknown = 0;
  for (const seed of seeds) {
    const st = genWorld(seed);
    assignmentsChecked += Object.keys(st.assignments).length;
    const o = oracle(st, false);
    for (const e of Object.values(o.asg)) for (const [id, r] of Object.entries(e.rules)) { if (r.verdict === "Fail") fails++; if (r.verdict === "Unknown") unknown++; if (e.overridden[id]) overridden++; if (e.outdated[id]) outdated++; }
    for (const [inc, rg] of [[false, false], [true, true], [false, true]] as const) {
      const m = compare(seed, st, inc, rg);
      if (m) { bad.push(m + `\n  replay: ORACLE_SEED=${seed} node --experimental-strip-types --test domain/test/rule-oracle.test.ts`); break; }
    }
    if (bad.length >= 5) break;
  }
  if (process.env.V3_STATS) console.log(`oracle: ${seeds.length} worlds, ${assignmentsChecked} assignments, ${fails} fails, ${overridden} overridden, ${outdated} outdated, ${unknown} unknown`);
  assert.equal(bad.length, 0, bad.join("\n"));
  // the generator must really exercise the corners, or the test proves nothing
  if (ONLY === null && N >= 500) { assert.ok(fails > N, "enough Fail verdicts"); assert.ok(overridden > N / 10, "enough overridden"); assert.ok(outdated > N / 20, "enough outdated"); assert.ok(unknown > N / 20, "enough Unknown"); }
});

test("oracle: commit refuses an override on licensing (non-overridable) and requires a reason", () => {
  const w = seedWorld({
    stores: [{ id: "S1", state: "OR", closedWeekdays: [] }, { id: "S2", state: "WA", closedWeekdays: [] }],
    pharmacists: [{ id: "P1", base: "S1", lic: ["OR"] }],
    assignments: [{ id: "A1", store: "S2", ph: "P1", date: "2026-10-07", agreed: true }],
  });
  const r = api.commit(w, [{ t: "override", assignmentId: "A1", ruleId: "licensing", reason: "trust me" }], { kind: "manual" });
  assert.ok("refused" in r, "licensing override refused");
  const ev = api.evaluate(w.state, "2026-10-01");
  assert.equal(ev.assignments["A1"]!.counts, false);
});

test("oracle sanity: hand-computed cases", () => {
  // 2026-12-31 Thursday -> 2027-01-01 Friday: requirement dated change across the year boundary, override beats it, closure from override 0
  const w = seedWorld({
    stores: [{ id: "S1", state: "OR", req: 1, closedWeekdays: [] }],
    pharmacists: [{ id: "P1", base: "S1" }, { id: "P2", base: "S1" }],
    assignments: [{ store: "S1", ph: "P1", date: "2026-12-31" }, { store: "S1", ph: "P1", date: "2027-01-01" }, { store: "S1", ph: "P2", date: "2027-01-01" }],
    dateOverrides: [{ store: "S1", date: "2027-01-02", count: 0 }],
  });
  w.state.requirements["S1|5|2027-01-01"] = { storeId: "S1", weekday: 5, effectiveFrom: "2027-01-01", count: 2 };
  const ev = api.evaluate(w.state, "2026-12-01", { range: { from: "2026-12-31", to: "2027-01-02" } });
  assert.equal(ev.cells["S1|2026-12-31"]!.required, 1);
  assert.equal(ev.cells["S1|2027-01-01"]!.required, 2);
  assert.equal(ev.cells["S1|2027-01-01"]!.counted, 2);
  assert.equal(ev.cells["S1|2027-01-02"]!.required, 0);
  assert.equal(compare(0, w.state, false, true), null);
});

test("regression: a licensing override row that is already in the data never restores the count", () => {
  const w = seedWorld({
    stores: [{ id: "S1", state: "OR", closedWeekdays: [] }, { id: "S2", state: "WA", closedWeekdays: [] }],
    pharmacists: [{ id: "P1", base: "S1", lic: ["OR"] }],
    assignments: [{ id: "A1", store: "S2", ph: "P1", date: "2026-10-07", agreed: true }],
  });
  w.state.overrides["O1"] = { id: "O1", assignmentId: "A1", ruleId: "licensing", signature: "P1|WA|none", reason: "loaded from a file" };
  const ev = api.evaluate(w.state, "2026-10-01", { range: { from: "2026-10-07", to: "2026-10-07" } });
  const lic = ev.assignments["A1"]!.results.find((r) => r.ruleId === "licensing")!;
  assert.equal(lic.verdict, "Fail");
  assert.equal(lic.overridden, false);
  assert.equal(ev.assignments["A1"]!.counts, false);
  assert.equal(ev.cells["S2|2026-10-07"]!.covered, 0);
});
