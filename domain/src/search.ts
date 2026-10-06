// Joint gap search shared by Repair and Build. Exhaustive, deterministic, bounded by a node count.
import { cmp, type ISODate } from "./dates.ts";
import { evalDelta, evaluate, makeCtx } from "./coverage.ts";
import { expectedOn } from "./patterns.ts";
import { RULE_BY_ID } from "./rules.ts";
import type { Edit, RepairMetrics, RepairOption } from "./api-types.ts";
import type { Assignment, DomainState, Evaluation } from "./types.ts";

export type Scope = { chain: number; changed: number; offDuty: boolean; /** Which existing assignments the search may move. Default: any unpinned, un-noted one. */ movable?: (a: import("./types.ts").Assignment) => boolean };
export type Gap = { storeId: string; date: ISODate };

export type SearchOut = {
  clean: RepairOption[]; // sorted, all clean options found (not cut)
  nearMiss: RepairOption | null; // best non-clean
  excludedUnknownTravel: { pharmacistId: string; storeId: string; date: ISODate }[];
  missing: string[];
  limitHit: boolean;
  /** Candidates evaluated (a count, never a clock). */
  nodes: number;
  legalCandidates: number;
  /** True when the people-changed budget cut off some candidate, so a bigger budget could find more. */
  prunedByChanged?: boolean;
};

const ck = (s: string, d: string) => `${s}|${d}`;

function failPairs(state: DomainState, ev: Evaluation, kind: "presence" | "suggestible", only?: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const a of Object.values(state.assignments)) {
    if (only && !only.has(a.pharmacistId)) continue;
    const e = ev.assignments[a.id];
    if (!e) continue;
    for (const r of e.results) {
      if (r.verdict !== "Fail" || r.overridden) continue;
      const def = RULE_BY_ID[r.ruleId]!;
      if (kind === "presence" ? def.kind === "presence" : def.kind === "policy" && def.suggestible) out.add(`${a.pharmacistId}|${a.storeId}|${a.date}|${r.ruleId}`);
    }
  }
  return out;
}

function exceptionCount(state: DomainState, dates: Set<ISODate>): number {
  let n = 0;
  const have = new Set(Object.values(state.assignments).map((a) => `${a.pharmacistId}|${a.storeId}|${a.date}`));
  for (const d of dates) for (const e of expectedOn(state, d)) if (!have.has(`${e.pharmacistId}|${e.storeId}|${d}`)) n++;
  return n;
}

function travelTotal(state: DomainState, dates: Set<ISODate>): number {
  let t = 0;
  for (const a of Object.values(state.assignments)) {
    if (!dates.has(a.date)) continue;
    const base = state.pharmacists[a.pharmacistId]?.baseStoreId;
    if (!base || base === a.storeId) continue;
    t += state.travel[`${base}|${a.storeId}`]?.minutes ?? 0;
  }
  return t;
}

type Leaf = { option: RepairOption; clean: boolean; key: string; sortKey: string[]; tuple: [string, string, string][] };

function searchCore(base: DomainState, gaps: Gap[], scope: Scope, asOf: ISODate, nodeLimit: number, wantNearMiss = false): SearchOut {
  const dates = new Set(gaps.map((g) => g.date));
  const sortedDates = [...dates].sort(cmp);
  const range = { from: sortedDates[0]!, to: sortedDates[sortedDates.length - 1]! };
  const ctx = makeCtx(base);
  // Only the gap dates are judged up front; a person who moves is judged in full (evalDelta), and so is their baseline, on demand.
  const baseEv = evaluate(base, asOf, { range, window: range }, ctx);
  const baseFails = new Map<string, Set<string>>();
  const baseFailsFor = (kind: "presence" | "suggestible", phs: Set<string>): Set<string> => {
    const out = new Set<string>();
    for (const ph of phs) {
      const k = `${kind}|${ph}`;
      let set = baseFails.get(k);
      if (!set) { set = failPairs(base, evalDelta(base, ctx, baseEv, [ph], []), kind, new Set([ph])); baseFails.set(k, set); }
      for (const x of set) out.add(x);
    }
    return out;
  };
  const baseExc = exceptionCount(base, dates);
  const leaves = new Map<string, Leaf>();
  const excluded = new Map<string, { pharmacistId: string; storeId: string; date: ISODate }>();
  const missing = new Set<string>();
  let nodes = 0;
  let limitHit = false;
  let legalCandidates = 0;
  let allowSkip = false;
  let prunedByChanged = false;

  type Pending = { storeId: string; date: ISODate; depth: number };
  type Move = { edit: Edit; ph: string; store: string; date: ISODate; from: string | null };

  const leaf = (state: DomainState, ev: Evaluation, moves: Move[], watch: Set<string>) => {
    const edits = moves.slice().sort((a, b) => cmp(a.ph, b.ph) || cmp(a.store, b.store) || cmp(a.date, b.date));
    const key = edits.map((m) => `${m.ph}|${m.store}|${m.date}`).join(";");
    if (leaves.has(key)) return;
    // Only the pharmacists who moved can have new failures: everyone else's rules did not change.
    const movedPh = new Set(moves.map((m) => m.ph));
    const baseViol = baseFailsFor("presence", movedPh);
    const baseOver = baseFailsFor("suggestible", movedPh);
    const viol = [...failPairs(state, ev, "presence", movedPh)].filter((p) => !baseViol.has(p)).length;
    const over = [...failPairs(state, ev, "suggestible", movedPh)].filter((p) => !baseOver.has(p)).length;
    let open = 0;
    for (const k of watch) open += ev.cells[k]?.open ?? 0;
    const touched = new Set(moves.map((m) => `${m.ph}|${m.date}`));
    const metrics: RepairMetrics = {
      violationsIntroduced: viol, openRemaining: open, overridesNeeded: over, changedPharmacistDates: touched.size,
      patternNet: exceptionCount(state, dates) - baseExc, travelMinutes: travelTotal(state, dates),
    };
    const expl: string[] = [];
    for (const m of edits) {
      const ini = state.pharmacists[m.ph]?.initials ?? m.ph;
      const to = state.stores[m.store]?.code ?? m.store;
      expl.push(m.from ? `${ini} moves from ${state.stores[m.from]?.code ?? m.from} to ${to} on ${m.date}` : `${ini} will take an extra shift at ${to} on ${m.date}`);
    }
    if (over) expl.push(`Needs ${over} override${over === 1 ? "" : "s"} you would have to accept`);
    const sortKey = [String(viol).padStart(6, "0"), String(open).padStart(6, "0"), String(over).padStart(6, "0"), String(touched.size).padStart(6, "0"), String(metrics.patternNet + 100000).padStart(8, "0"), String(metrics.travelMinutes).padStart(8, "0"), key];
    leaves.set(key, { option: { edits: edits.map((m) => m.edit), metrics, explanation: expl }, clean: viol === 0 && open === 0, key, sortKey, tuple: edits.map((m) => [m.ph, m.store, m.date] as [string, string, string]) });
  };

  // One private working copy of the assignments table, edited in place and restored after each candidate: no per-node copying.
  const work: DomainState = { ...base, assignments: { ...base.assignments }, nextId: { ...base.nextId } };
  /** Apply one candidate to `work` and return how to take it back (null when it cannot be applied). */
  const applyInPlace = (e: Edit, onDate: Assignment[]): (() => void) | null => {
    if (e.t === "move") {
      const a = work.assignments[e.assignmentId];
      if (!a) return null;
      if (onDate.some((x) => x.id !== a.id && x.storeId === e.toStoreId && x.pharmacistId === a.pharmacistId)) return null;
      const n: Assignment = { ...a, storeId: e.toStoreId, agreed: false, source: "repair" };
      delete (n as { partialNote?: string }).partialNote;
      work.assignments[a.id] = n;
      return () => { work.assignments[a.id] = a; };
    }
    if (e.t === "place") {
      if (onDate.some((x) => x.storeId === e.storeId && x.pharmacistId === e.pharmacistId)) return null;
      const id = `A${work.nextId.assignment++}`;
      const seq = work.nextId.seq++;
      work.assignments[id] = { id, date: e.date, storeId: e.storeId, pharmacistId: e.pharmacistId, placedSeq: seq, source: "repair", agreed: false, pinned: false };
      return () => { delete work.assignments[id]; work.nextId.assignment--; work.nextId.seq--; };
    }
    return null;
  };

  const dfs = (state: DomainState, evc: Evaluation, moves: Move[], pending: Pending[], watch: Set<string>): void => {
    if (limitHit) return;
    let p = pending;
    while (p.length && (evc.cells[ck(p[0]!.storeId, p[0]!.date)]?.open ?? 0) === 0) p = p.slice(1);
    if (!p.length) { leaf(state, evc, moves, watch); return; }
    const head = p[0]!;
    const rest = p.slice(1);
    const touched = new Set(moves.map((m) => `${m.ph}|${m.date}`));
    const onDate = Object.values(state.assignments).filter((a) => a.date === head.date);
    const cands: { ph: string; edit: Edit; from: string | null; fromAsg?: string }[] = [];
    for (const a of onDate.slice().sort((x, y) => cmp(x.pharmacistId, y.pharmacistId) || cmp(x.storeId, y.storeId))) {
      if (a.storeId === head.storeId || a.pinned || a.partialNote || a.date < asOf || touched.has(`${a.pharmacistId}|${a.date}`) || (scope.movable && !scope.movable(a))) continue;
      cands.push({ ph: a.pharmacistId, edit: { t: "move", assignmentId: a.id, toStoreId: head.storeId }, from: a.storeId, fromAsg: a.id });
    }
    if (scope.offDuty) {
      const busy = new Set(onDate.map((a) => a.pharmacistId));
      for (const id of Object.keys(state.pharmacists).sort(cmp)) {
        if (busy.has(id) || touched.has(`${id}|${head.date}`)) continue;
        cands.push({ ph: id, edit: { t: "place", storeId: head.storeId, pharmacistId: id, date: head.date, source: "repair", agreed: false }, from: null });
      }
    }
    if (moves.length < scope.changed && head.depth < scope.chain) {
      for (const c of cands) {
        if (c.from && c.fromAsg && !allowSkip && (head.depth + 1 >= scope.chain || moves.length + 1 >= scope.changed)) {
          // Cheap look-ahead: would leaving the old store open a hole we then could not fill?
          const vc = evc.cells[ck(c.from, head.date)];
          if (vc) {
            const newCovered = vc.covered - (evc.assignments[c.fromAsg]?.counts ? 1 : 0);
            if (Math.max(0, vc.required - newCovered - vc.acceptedShort) > vc.open) { if (moves.length + 1 >= scope.changed) prunedByChanged = true; continue; }
          }
        }
        if (++nodes > nodeLimit) { limitHit = true; return; }
        const undo = applyInPlace(c.edit, onDate);
        if (!undo) continue;
        try {
        const ev2 = evalDelta(state, ctx, evc, [c.ph], c.from ? [ck(head.storeId, head.date), ck(c.from, head.date)] : [ck(head.storeId, head.date)]);
        const mine = c.fromAsg ? state.assignments[c.fromAsg] : Object.values(state.assignments).find((a) => a.pharmacistId === c.ph && a.storeId === head.storeId && a.date === head.date);
        const me = mine && ev2.assignments[mine.id];
        if (!me) continue;
        if (!me.counts) continue; // someone who could never count here is not a "cannot evaluate" case
        const unk = me.results.filter((r) => r.verdict === "Unknown");
        if (unk.length) {
          for (const r of unk) {
            if (r.ruleId.startsWith("travel")) excluded.set(`${c.ph}|${head.storeId}|${head.date}`, { pharmacistId: c.ph, storeId: head.storeId, date: head.date });
            else missing.add(`${r.ruleId} for ${state.pharmacists[c.ph]?.initials ?? c.ph}`);
          }
          continue;
        }
        legalCandidates++;
        const m: Move = { edit: c.edit, ph: c.ph, store: head.storeId, date: head.date, from: c.from };
        const w2 = new Set(watch);
        let np = rest;
        if (c.from) {
          const vk = ck(c.from, head.date);
          w2.add(vk);
          if ((ev2.cells[vk]?.open ?? 0) > (evc.cells[vk]?.open ?? 0)) {
            // The chain must continue to be clean. If it cannot (out of chain length or people), only the nearest-miss pass wants it.
            if (!allowSkip && (head.depth + 1 >= scope.chain || moves.length + 1 >= scope.changed)) { if (moves.length + 1 >= scope.changed) prunedByChanged = true; continue; }
            np = [{ storeId: c.from, date: head.date, depth: head.depth + 1 }, ...rest];
          }
        }
        dfs(state, ev2, [...moves, m], np, w2);
        } finally { undo(); }
        if (limitHit) return;
      }
    }
    if (cands.length && moves.length >= scope.changed) prunedByChanged = true;
    // leave this one open and carry on with the rest
    if (allowSkip) dfs(state, evc, moves, rest, watch);
    else if (!cands.length || moves.length >= scope.changed || head.depth >= scope.chain) dfs(state, evc, moves, rest, watch);
  };

  const watch = new Set(gaps.map((g) => ck(g.storeId, g.date)));
  // A chain of moves can only end where someone can leave without opening a hole (a surplus, accepted-short slack, or a person who
  // does not count anyway) or by bringing in someone off duty. With none of those on the gap dates there is no clean answer at all.
  if (!scope.offDuty && !wantNearMiss) {
    const gapDates = new Set(gaps.map((g) => g.date));
    let closer = false;
    for (const a of Object.values(base.assignments)) {
      if (!gapDates.has(a.date) || a.pinned || a.partialNote || a.date < asOf) continue;
      const cell = baseEv.cells[ck(a.storeId, a.date)];
      const counts = baseEv.assignments[a.id]?.counts ?? false;
      if (!counts || !cell || cell.covered - 1 >= cell.required - cell.acceptedShort) { closer = true; break; }
    }
    if (!closer) return { clean: [], nearMiss: null, excludedUnknownTravel: [], missing: [], limitHit: false, legalCandidates: 0, nodes: 0, prunedByChanged: false };
  }
  const startPending = gaps.map((g) => ({ ...g, depth: 0 }));
  dfs(work, baseEv, [], startPending, watch);
  if (wantNearMiss && ![...leaves.values()].some((l) => l.clean && l.option.edits.length) && !limitHit) {
    allowSkip = true;
    dfs(work, baseEv, [], startPending, watch);
  }

  const all = [...leaves.values()].filter((l) => l.option.edits.length > 0);
  const byKey = (a: Leaf, b: Leaf) => {
    for (let i = 0; i < a.sortKey.length - 1; i++) {
      const c = cmp(a.sortKey[i]!, b.sortKey[i]!);
      if (c) return c;
    }
    for (let i = 0; i < Math.min(a.tuple.length, b.tuple.length); i++) {
      const x = a.tuple[i]!, y = b.tuple[i]!;
      const c = cmp(x[0], y[0]) || cmp(x[1], y[1]) || cmp(x[2], y[2]);
      if (c) return c;
    }
    return a.tuple.length - b.tuple.length;
  };
  const clean = all.filter((l) => l.clean).sort(byKey).map((l) => l.option);
  const near = all.filter((l) => !l.clean).sort(byKey)[0]?.option ?? null;
  return {
    clean, nearMiss: near,
    excludedUnknownTravel: [...excluded.values()].sort((a, b) => cmp(a.pharmacistId, b.pharmacistId) || cmp(a.storeId, b.storeId) || cmp(a.date, b.date)),
    missing: [...missing].sort(cmp), limitHit, nodes, legalCandidates, prunedByChanged,
  };
}

/**
 * Iterative deepening on the number of people changed. The ordering puts fewer changes ahead of everything after violations,
 * open requirements and overrides, so the best three clean options are all found at the smallest budgets; a larger budget only
 * runs when fewer than three clean options exist. Each level is exhaustive, so the answer is the same as one big search.
 */
function searchGroup(base: DomainState, gaps: Gap[], scope: Scope, asOf: ISODate, nodeLimit: number, wantNearMiss = false): SearchOut {
  let last: SearchOut | null = null;
  let spent = 0;
  for (let k = 1; k <= scope.changed; k++) {
    const out = searchCore(base, gaps, { ...scope, changed: k }, asOf, Math.max(1, nodeLimit - spent), false);
    spent += out.nodes;
    last = { ...out, nodes: spent, limitHit: out.limitHit || spent >= nodeLimit };
    if (out.clean.length >= 3 || last.limitHit || !out.prunedByChanged) break;
  }
  if (last && !last.clean.length && wantNearMiss && !last.limitHit) {
    const near = searchCore(base, gaps, scope, asOf, Math.max(1, nodeLimit - spent), true);
    return { ...near, nodes: spent + near.nodes };
  }
  return last ?? searchCore(base, gaps, scope, asOf, nodeLimit, wantNearMiss);
}

function tupleOf(base: DomainState, e: Edit): [string, string, string] {
  if (e.t === "move") { const a = base.assignments[e.assignmentId]!; return [a.pharmacistId, e.toStoreId, a.date]; }
  if (e.t === "place") return [e.pharmacistId, e.storeId, e.date];
  return ["", "", ""];
}

const pad = (n: number, w = 6) => String(n).padStart(w, "0");
function metricKey(m: RepairMetrics): string[] {
  return [pad(m.violationsIntroduced), pad(m.openRemaining), pad(m.overridesNeeded), pad(m.changedPharmacistDates), pad(m.patternNet + 100000, 8), pad(m.travelMinutes, 8)];
}

/**
 * Joint search over the gaps. Moves never leave the gap dates, so gaps on different dates only meet through the shared
 * "people changed" budget and the ordering, which are sums. Each date is searched jointly with its own gaps, then the best few of
 * each date are combined and re-ranked with the same ordering. Same answer as one big search, without the product of branching.
 */
export function searchGaps(base: DomainState, gaps: Gap[], scope: Scope, asOf: ISODate, nodeLimit: number, wantNearMiss = false): SearchOut {
  const byDate = new Map<ISODate, Gap[]>();
  for (const g of gaps) (byDate.get(g.date) ?? byDate.set(g.date, []).get(g.date)!).push(g);
  if (byDate.size <= 1) return searchGroup(base, gaps, scope, asOf, nodeLimit, wantNearMiss);
  const dates = [...byDate.keys()].sort(cmp);
  const parts = dates.map((d) => searchGroup(base, byDate.get(d)!, scope, asOf, nodeLimit, wantNearMiss));
  const excluded = new Map<string, SearchOut["excludedUnknownTravel"][number]>();
  const missing = new Set<string>();
  let legal = 0, limitHit = false, nodesSum = 0;
  for (const p of parts) {
    legal += p.legalCandidates; limitHit ||= p.limitHit; nodesSum += p.nodes;
    for (const x of p.excludedUnknownTravel) excluded.set(`${x.pharmacistId}|${x.storeId}|${x.date}`, x);
    for (const m of p.missing) missing.add(m);
  }
  const common = {
    excludedUnknownTravel: [...excluded.values()].sort((a, b) => cmp(a.pharmacistId, b.pharmacistId) || cmp(a.storeId, b.storeId) || cmp(a.date, b.date)),
    missing: [...missing].sort(cmp), limitHit, legalCandidates: legal, nodes: nodesSum,
  };
  const combine = (lists: RepairOption[][]): RepairOption[] => {
    let acc: RepairOption[] = [{ edits: [], metrics: { violationsIntroduced: 0, openRemaining: 0, overridesNeeded: 0, changedPharmacistDates: 0, patternNet: 0, travelMinutes: 0 }, explanation: [] }];
    for (const list of lists) {
      const next: RepairOption[] = [];
      for (const a of acc) for (const b of list) {
        const m = { violationsIntroduced: a.metrics.violationsIntroduced + b.metrics.violationsIntroduced, openRemaining: a.metrics.openRemaining + b.metrics.openRemaining, overridesNeeded: a.metrics.overridesNeeded + b.metrics.overridesNeeded, changedPharmacistDates: a.metrics.changedPharmacistDates + b.metrics.changedPharmacistDates, patternNet: a.metrics.patternNet + b.metrics.patternNet, travelMinutes: a.metrics.travelMinutes + b.metrics.travelMinutes };
        if (m.changedPharmacistDates > scope.changed) continue;
        next.push({ edits: [...a.edits, ...b.edits], metrics: m, explanation: [...a.explanation, ...b.explanation] });
      }
      acc = next;
    }
    const keyed = acc.map((o) => ({ o, mk: metricKey(o.metrics), tuples: o.edits.map((e) => tupleOf(base, e)).sort((x, y) => cmp(x[0], y[0]) || cmp(x[1], y[1]) || cmp(x[2], y[2])) }));
    keyed.sort((a, b) => {
      for (let i = 0; i < a.mk.length; i++) { const c = cmp(a.mk[i]!, b.mk[i]!); if (c) return c; }
      for (let i = 0; i < Math.min(a.tuples.length, b.tuples.length); i++) { const x = a.tuples[i]!, y = b.tuples[i]!; const c = cmp(x[0], y[0]) || cmp(x[1], y[1]) || cmp(x[2], y[2]); if (c) return c; }
      return a.tuples.length - b.tuples.length;
    });
    // edits in (pharmacist, store, date) order, like a single search
    return keyed.map((k) => ({ ...k.o, edits: k.o.edits.map((e, i) => ({ e, t: tupleOf(base, e), i })).sort((x, y) => cmp(x.t[0], y.t[0]) || cmp(x.t[1], y.t[1]) || cmp(x.t[2], y.t[2])).map((x) => x.e) }));
  };
  // Clean: every date needs a clean answer. Keep the best three of each date (the global best three cannot need more).
  const clean = parts.every((p) => p.clean.length) ? combine(parts.map((p) => p.clean.slice(0, 3))) : [];
  let near: RepairOption | null = null;
  if (!clean.length && wantNearMiss) {
    const per = parts.map((p) => (p.clean[0] ? [p.clean[0]] : p.nearMiss ? [p.nearMiss] : [{ edits: [], metrics: { violationsIntroduced: 0, openRemaining: 0, overridesNeeded: 0, changedPharmacistDates: 0, patternNet: 0, travelMinutes: 0 }, explanation: [] }]));
    near = combine(per).find((o) => o.edits.length > 0) ?? null;
  }
  return { clean, nearMiss: near, ...common };
}
