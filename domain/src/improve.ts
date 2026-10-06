// Improve: explicit trigger only. Re-deals pharmacists among existing slots on one date. Never adds shifts.
import { addDays, cmp, dateRange, type ISODate } from "./dates.ts";
import { evaluate } from "./coverage.ts";
import { applyScratch, ENGINE_VERSION, stateHash } from "./changeset.ts";
import { expectedOn, patternConflicts } from "./patterns.ts";
import type { Edit, ImproveOpts, ImproveResult, World } from "./api-types.ts";
import type { Assignment, DomainState } from "./types.ts";

type Metrics = { fails: Record<string, number>; failTotal: number; overrides: number; open: number; unverified: number; exceptions: number; travel: number };

function metrics(state: DomainState, asOf: ISODate, dates: ISODate[]): Metrics {
  const ev = evaluate(state, asOf, { range: { from: dates[0]!, to: dates[dates.length - 1]! } });
  const fails: Record<string, number> = {};
  let failTotal = 0;
  const inRange = new Set(dates);
  for (const a of Object.values(state.assignments)) {
    if (!inRange.has(a.date)) continue;
    for (const r of ev.assignments[a.id]!.results) if (r.verdict === "Fail" && !r.overridden) { fails[r.ruleId] = (fails[r.ruleId] ?? 0) + 1; failTotal++; }
  }
  let open = 0, unverified = 0;
  for (const c of Object.values(ev.cells)) { open += c.open; unverified += c.unverified; }
  const have = new Set(Object.values(state.assignments).map((a) => `${a.pharmacistId}|${a.storeId}|${a.date}`));
  let exceptions = 0;
  for (const d of dates) for (const e of expectedOn(state, d)) if (!have.has(`${e.pharmacistId}|${e.storeId}|${d}`)) exceptions++;
  let travel = 0;
  for (const a of Object.values(state.assignments)) {
    if (!inRange.has(a.date)) continue;
    const base = state.pharmacists[a.pharmacistId]?.baseStoreId;
    if (base && base !== a.storeId) travel += state.travel[`${base}|${a.storeId}`]?.minutes ?? 0;
  }
  const overrides = Object.values(state.overrides).filter((o) => { const a = state.assignments[o.assignmentId]; return a && inRange.has(a.date); }).length;
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
  const earliest = opts.includeNext14 ? asOf : addDays(asOf, cfg.excludeNextDays);
  const dates = dateRange(opts.from, opts.to).filter((d) => d >= earliest);
  if (!dates.length) return nothing;

  const original = world.state;
  let cur = original;
  const base = metrics(original, asOf, dates);
  let curM = base;
  const movable = (a: Assignment) => a.agreed && a.source !== "emergency" && !a.pinned && !a.partialNote && a.date >= earliest;
  const changedNet = (s: DomainState) => Object.values(original.assignments).filter((a) => s.assignments[a.id]?.pharmacistId !== a.pharmacistId).length;

  const tryApply = (edits: Edit[]): boolean => {
    const next = applyScratch(cur, edits);
    if ("refused" in next) return false;
    if (changedNet(next) > cfg.maxChanged) return false;
    const ev = evaluate(next, asOf);
    for (const e of edits) {
      if (e.t !== "swap") continue;
      if (ev.assignments[e.assignmentId]!.results.some((r) => r.verdict === "Unknown")) return false;
    }
    const m = metrics(next, asOf, dates);
    if (!notWorse(curM, m) || !better(curM, m)) return false;
    cur = next;
    curM = m;
    return true;
  };

  for (const date of dates) {
    const slots = () => Object.values(cur.assignments).filter((a) => a.date === date && movable(a)).sort((a, b) => cmp(a.id, b.id));
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
    for (let i = 0; i < S.length; i++) {
      for (let j = i + 1; j < S.length; j++) {
        const x = cur.assignments[S[i]!.id], y = cur.assignments[S[j]!.id];
        if (!x || !y || x.pharmacistId === y.pharmacistId || x.storeId === y.storeId) continue;
        tryApply([{ t: "swap", assignmentId: x.id, toPharmacistId: y.pharmacistId }, { t: "swap", assignmentId: y.id, toPharmacistId: x.pharmacistId }]);
      }
    }
  }

  const removed = base.failTotal + base.overrides - (curM.failTotal + curM.overrides);
  const restored = base.exceptions - curM.exceptions;
  const saved = base.travel - curM.travel;
  const meaningful = removed > 0 || restored >= cfg.minRestoredStanding || saved >= cfg.minTravelSavedMinutes;
  if (!meaningful) return nothing;

  const edits: Edit[] = Object.values(original.assignments)
    .filter((a) => cur.assignments[a.id]?.pharmacistId !== a.pharmacistId)
    .sort((a, b) => cmp(cur.assignments[a.id]!.pharmacistId, cur.assignments[b.id]!.pharmacistId) || cmp(a.storeId, b.storeId) || cmp(a.date, b.date))
    .map((a) => ({ t: "swap", assignmentId: a.id, toPharmacistId: cur.assignments[a.id]!.pharmacistId }));
  const explanation: string[] = [];
  if (removed > 0) explanation.push(`Removes ${removed} violation${removed === 1 ? "" : "s"} or override${removed === 1 ? "" : "s"}`);
  if (restored > 0) explanation.push(`Restores ${restored} standing assignment${restored === 1 ? "" : "s"}`);
  if (saved > 0) explanation.push(`Saves ${saved} minutes of driving`);
  return {
    status: "changes", message: "",
    proposal: { kind: "improve", label: "Improve", edits, explanation, stateHash: stateHash(original), engineVersion: ENGINE_VERSION },
  };
}
