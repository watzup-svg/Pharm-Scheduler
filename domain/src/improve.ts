// Improve: explicit trigger only. Re-deals pharmacists among existing slots on one date. Never adds shifts.
import { addDays, cmp, dateOk, dateRange, type ISODate } from "./dates.ts";
import { evalDelta, evaluate, makeCtx } from "./coverage.ts";
import type { Evaluation } from "./types.ts";
import { ENGINE_VERSION, stateHash } from "./changeset.ts";
import { expectedOn, patternConflicts } from "./patterns.ts";
import type { Edit, ImproveOpts, ImproveResult, World } from "./api-types.ts";
import type { Assignment, DomainState } from "./types.ts";

type Metrics = { fails: Record<string, number>; failTotal: number; overrides: number; open: number; unverified: number; exceptions: number; travel: number };

/** Assignments grouped by date, so the per-date scans below touch only the dates asked for. */
type ByDate = Map<ISODate, Map<string, Assignment>>;

function metrics(state: DomainState, ev: Evaluation, dates: ISODate[], byDate: ByDate): Metrics {
  const fails: Record<string, number> = {};
  let failTotal = 0;
  const inRange = new Set(dates);
  const inDates: Assignment[] = [];
  for (const d of dates) for (const a of byDate.get(d)?.values() ?? []) inDates.push(a);
  for (const a of inDates) {
    for (const r of ev.assignments[a.id]?.results ?? []) if (r.verdict === "Fail" && !r.overridden) { fails[r.ruleId] = (fails[r.ruleId] ?? 0) + 1; failTotal++; }
  }
  let open = 0, unverified = 0;
  for (const c of Object.values(ev.cells)) { if (!inRange.has(c.date)) continue; open += c.open; unverified += c.unverified; }
  const have = new Set(inDates.map((a) => `${a.pharmacistId}|${a.storeId}|${a.date}`));
  let exceptions = 0;
  for (const d of dates) for (const e of expectedOn(state, d)) if (!have.has(`${e.pharmacistId}|${e.storeId}|${d}`)) exceptions++;
  let travel = 0;
  for (const a of inDates) {
    const base = state.pharmacists[a.pharmacistId]?.baseStoreId;
    if (base && base !== a.storeId) travel += state.travel[`${base}|${a.storeId}`]?.minutes ?? 0;
  }
  // An override counts only while its rule still fails (a moot one would be dropped on commit).
  const overrides = Object.values(state.overrides).filter((o) => {
    const a = state.assignments[o.assignmentId];
    return a && inRange.has(a.date) && ev.assignments[a.id]?.results.some((r) => r.ruleId === o.ruleId && r.verdict === "Fail");
  }).length;
  return { fails, failTotal, overrides, open, unverified, exceptions, travel };
}

function notWorse(a: Metrics, b: Metrics): boolean {
  for (const k of new Set([...Object.keys(a.fails), ...Object.keys(b.fails)])) if ((b.fails[k] ?? 0) > (a.fails[k] ?? 0)) return false;
  return b.overrides <= a.overrides && b.open <= a.open && b.unverified <= a.unverified;
}

function better(a: Metrics, b: Metrics): boolean {
  return b.failTotal < a.failTotal || b.overrides < a.overrides || b.exceptions < a.exceptions || b.travel < a.travel;
}

export function improve(world: World, opts: ImproveOpts, asOf: ISODate): ImproveResult {
  const nothing: ImproveResult = { status: "nothing", message: "Nothing to improve.", proposal: null };
  const cfg = world.state.config.improve;
  if (!dateOk(opts.from) || !dateOk(opts.to) || !dateOk(asOf)) return nothing;
  const earliest = opts.includeNext14 ? asOf : addDays(asOf, cfg.excludeNextDays);
  const dates = dateRange(opts.from, opts.to).filter((d) => d >= earliest);
  if (!dates.length) return { status: "nothing", message: !opts.includeNext14 && dateRange(opts.from, opts.to).some((d) => d >= asOf && d < earliest) ? "Nothing to improve: the next 14 days are left alone. Include them to look there." : "Nothing to improve.", proposal: null };

  const original = world.state;
  // One working copy of the assignments table, edited in place and put back when a try is rejected (rows are replaced, never mutated).
  const work: DomainState = { ...original, assignments: { ...original.assignments } };
  const byDate: ByDate = new Map();
  const indexRow = (a: Assignment) => (byDate.get(a.date) ?? byDate.set(a.date, new Map()).get(a.date)!).set(a.id, a);
  for (const a of Object.values(original.assignments)) indexRow(a);
  const putRow = (a: Assignment) => { work.assignments[a.id] = a; indexRow(a); };
  const cur = work;
  const range = { from: dates[0]!, to: dates[dates.length - 1]! };
  const ctx = makeCtx(original);
  let curEv = evaluate(original, asOf, { range }, ctx);
  const base = metrics(original, curEv, dates, byDate);
  let curM = base;
  const origPh = new Map(Object.values(original.assignments).map((a) => [a.id, a.pharmacistId]));
  let changed = new Set<string>();
  const movable = (a: Assignment) => a.agreed && a.source !== "emergency" && !a.pinned && !a.partialNote && a.date >= earliest;

  let day: ISODate[] = [dates[0]!];
  let dayM = curM;
  const tryApply = (edits: Edit[]): boolean => {
    // Same checks as applyEdit's "swap", applied one after another to the working copy.
    const undo: Assignment[] = [];
    const rollback = () => { for (let i = undo.length - 1; i >= 0; i--) putRow(undo[i]!); };
    for (const e of edits) {
      if (e.t !== "swap") { rollback(); return false; }
      const a = cur.assignments[e.assignmentId];
      if (!a || !cur.pharmacists[e.toPharmacistId]) { rollback(); return false; }
      for (const x of byDate.get(a.date)?.values() ?? []) if (x.id !== a.id && x.storeId === a.storeId && x.pharmacistId === e.toPharmacistId) { rollback(); return false; }
      const n: Assignment = { ...a, pharmacistId: e.toPharmacistId, agreed: false };
      delete (n as { partialNote?: string }).partialNote;
      undo.push(a);
      putRow(n);
    }
    const nextChanged = new Set(changed);
    const phs = new Set<string>();
    const cells = new Set<string>();
    for (let i = 0; i < edits.length; i++) {
      const e = edits[i] as Extract<Edit, { t: "swap" }>;
      const was = undo[i]!; // the row as it was before this try
      phs.add(was.pharmacistId); phs.add(e.toPharmacistId);
      cells.add(`${was.storeId}|${was.date}`);
      if (origPh.get(e.assignmentId) === e.toPharmacistId) nextChanged.delete(e.assignmentId); else nextChanged.add(e.assignmentId);
    }
    if (nextChanged.size > cfg.maxChanged) { rollback(); return false; }
    const ev = evalDelta(cur, ctx, curEv, [...phs], [...cells]);
    for (const e of edits) {
      if (e.t !== "swap") continue;
      const r = ev.assignments[e.assignmentId];
      // Every slot we touched must end up legal and fully checkable.
      if (!r || !r.counts || r.results.some((x) => x.verdict === "Unknown")) { rollback(); return false; }
    }
    const m = metrics(cur, ev, day, byDate);
    if (!notWorse(dayM, m) || !better(dayM, m)) { rollback(); return false; }
    curEv = ev;
    changed = nextChanged;
    dayM = m;
    return true;
  };

  for (const date of dates) {
    day = [date];
    dayM = metrics(cur, curEv, day, byDate);
    const slots = () => [...(byDate.get(date)?.values() ?? [])].filter(movable).sort((a, b) => cmp(a.id, b.id));
    // 1. restore standing assignments: follow desired slots until the chain closes
    const exp = expectedOn(cur, date);
    const conf = patternConflicts(exp);
    const want = new Map<string, string>();
    for (const e of exp) if (!conf.has(e.pharmacistId)) want.set(e.pharmacistId, e.storeId);
    for (const start of slots().map((s) => s.pharmacistId).sort(cmp)) {
      const S = slots();
      const slotOf = new Map(S.map((s) => [s.pharmacistId, s]));
      const first = slotOf.get(start);
      const target = want.get(start);
      if (!first || !target || first.storeId === target) continue;
      const path: Assignment[] = [first];
      let who = start;
      let closed = false;
      for (let guard = 0; guard < cfg.maxChanged + 1; guard++) {
        const wantStore = want.get(who);
        const mine = slotOf.get(who)!;
        if (!wantStore || mine.storeId === wantStore) break;
        const d = S.find((s) => s.storeId === wantStore && !path.includes(s));
        if (!d) break;
        path.push(d);
        who = d.pharmacistId;
        const wantNext = want.get(who);
        if (!wantNext || d.storeId === wantNext) { closed = true; break; }
        if (d === first) { closed = true; break; }
      }
      if (!closed || path.length < 2) continue;
      // path[i] receives the pharmacist of path[i-1]; path[0] receives the last one
      const phs = path.map((s) => s.pharmacistId);
      const edits: Edit[] = path.map((s, i) => ({ t: "swap", assignmentId: s.id, toPharmacistId: phs[(i + phs.length - 1) % phs.length]! }));
      tryApply(edits);
    }
    // 2. pair swaps for travel and violations
    const S = slots();
    const bad = (id: string) => curEv.assignments[id]?.results.some((r) => r.verdict === "Fail" || r.overridden) ?? false;
    const drive = (ph: string, store: string): number | null => {
      const b = cur.pharmacists[ph]?.baseStoreId;
      if (!b) return 0;
      if (b === store) return 0;
      return cur.travel[`${b}|${store}`]?.minutes ?? null;
    };
    const useful = (x: Assignment, y: Assignment): boolean => {
      if (bad(x.id) || bad(y.id)) return true;
      if (want.get(x.pharmacistId) === y.storeId || want.get(y.pharmacistId) === x.storeId) return true;
      const a = [drive(x.pharmacistId, x.storeId), drive(y.pharmacistId, y.storeId), drive(x.pharmacistId, y.storeId), drive(y.pharmacistId, x.storeId)];
      if (a.some((v) => v === null)) return false;
      return a[2]! + a[3]! < a[0]! + a[1]!;
    };
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        const x = cur.assignments[S[i]!.id], y = cur.assignments[S[j]!.id];
        if (!x || !y || x.pharmacistId === y.pharmacistId || x.storeId === y.storeId || !useful(x, y)) continue;
        tryApply([{ t: "swap", assignmentId: x.id, toPharmacistId: y.pharmacistId }, { t: "swap", assignmentId: y.id, toPharmacistId: x.pharmacistId }]);
      }
    }
  }

  curM = metrics(cur, curEv, dates, byDate);
  const removed = base.failTotal + base.overrides - (curM.failTotal + curM.overrides);
  const restored = base.exceptions - curM.exceptions;
  const saved = base.travel - curM.travel;
  const meaningful = removed > 0 || restored >= cfg.minRestoredStanding || saved >= cfg.minTravelSavedMinutes;
  if (!meaningful) return nothing;

  const edits: Edit[] = Object.values(original.assignments)
    .filter((a) => cur.assignments[a.id]?.pharmacistId !== a.pharmacistId)
    .sort((a, b) => cmp(cur.assignments[a.id]?.pharmacistId ?? "", cur.assignments[b.id]?.pharmacistId ?? "") || cmp(a.storeId, b.storeId) || cmp(a.date, b.date))
    .map((a) => ({ t: "swap", assignmentId: a.id, toPharmacistId: cur.assignments[a.id]?.pharmacistId ?? a.pharmacistId }));
  const explanation: string[] = [];
  if (removed > 0) explanation.push(`Removes ${removed} violation${removed === 1 ? "" : "s"} or override${removed === 1 ? "" : "s"}`);
  if (restored > 0) explanation.push(`Restores ${restored} standing assignment${restored === 1 ? "" : "s"}`);
  if (saved > 0) explanation.push(`Saves ${saved} minutes of driving`);
  return {
    status: "changes", message: "",
    proposal: { kind: "improve", label: "Improve", edits, explanation, stateHash: stateHash(original), engineVersion: ENGINE_VERSION },
  };
}
