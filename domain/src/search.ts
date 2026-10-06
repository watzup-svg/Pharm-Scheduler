// Joint gap search shared by Repair and Build. Exhaustive, deterministic, bounded by a node count.
import { cmp, type ISODate } from "./dates.ts";
import { evaluate } from "./coverage.ts";
import { applyScratch } from "./changeset.ts";
import { expectedOn } from "./patterns.ts";
import { RULE_BY_ID } from "./rules.ts";
import type { Edit, RepairMetrics, RepairOption } from "./api-types.ts";
import type { DomainState, Evaluation } from "./types.ts";

export type Scope = { chain: number; changed: number; offDuty: boolean };
export type Gap = { storeId: string; date: ISODate };

export type SearchOut = {
  clean: RepairOption[]; // sorted, all clean options found (not cut)
  nearMiss: RepairOption | null; // best non-clean
  excludedUnknownTravel: { pharmacistId: string; storeId: string; date: ISODate }[];
  missing: string[];
  limitHit: boolean;
  legalCandidates: number;
};

const ck = (s: string, d: string) => `${s}|${d}`;

function failPairs(state: DomainState, ev: Evaluation, kind: "presence" | "suggestible"): Set<string> {
  const out = new Set<string>();
  for (const a of Object.values(state.assignments)) {
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

type Leaf = { option: RepairOption; clean: boolean; key: string; sortKey: string[] };

export function searchGaps(base: DomainState, gaps: Gap[], scope: Scope, asOf: ISODate, nodeLimit: number): SearchOut {
  const dates = new Set(gaps.map((g) => g.date));
  const sortedDates = [...dates].sort(cmp);
  const range = { from: sortedDates[0]!, to: sortedDates[sortedDates.length - 1]! };
  const ev = (s: DomainState) => evaluate(s, asOf, { range });
  const baseEv = ev(base);
  const baseViol = failPairs(base, baseEv, "presence");
  const baseOver = failPairs(base, baseEv, "suggestible");
  const baseExc = exceptionCount(base, dates);
  const leaves = new Map<string, Leaf>();
  const excluded = new Map<string, { pharmacistId: string; storeId: string; date: ISODate }>();
  const missing = new Set<string>();
  let nodes = 0;
  let limitHit = false;
  let legalCandidates = 0;

  type Pending = { storeId: string; date: ISODate; depth: number };
  type Move = { edit: Edit; ph: string; store: string; date: ISODate; from: string | null };

  const leaf = (state: DomainState, ev: Evaluation, moves: Move[], watch: Set<string>) => {
    const edits = moves.slice().sort((a, b) => cmp(a.ph, b.ph) || cmp(a.store, b.store) || cmp(a.date, b.date));
    const key = edits.map((m) => `${m.ph}|${m.store}|${m.date}`).join(";");
    if (leaves.has(key)) return;
    const viol = [...failPairs(state, ev, "presence")].filter((p) => !baseViol.has(p)).length;
    const over = [...failPairs(state, ev, "suggestible")].filter((p) => !baseOver.has(p)).length;
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
      expl.push(m.from ? `${ini} moves from ${state.stores[m.from]?.code ?? m.from} to ${to} on ${m.date}` : `${ini} takes an extra shift at ${to} on ${m.date}`);
    }
    if (over) expl.push(`Needs ${over} override${over === 1 ? "" : "s"} you would have to accept`);
    const sortKey = [String(viol).padStart(6, "0"), String(open).padStart(6, "0"), String(over).padStart(6, "0"), String(touched.size).padStart(6, "0"), String(metrics.patternNet + 100000).padStart(8, "0"), String(metrics.travelMinutes).padStart(8, "0"), key];
    leaves.set(key, { option: { edits: edits.map((m) => m.edit), metrics, explanation: expl }, clean: viol === 0 && open === 0, key, sortKey });
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
      if (a.storeId === head.storeId || a.pinned || a.partialNote || a.date < asOf || touched.has(`${a.pharmacistId}|${a.date}`)) continue;
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
        if (++nodes > nodeLimit) { limitHit = true; return; }
        const next = applyScratch(state, [c.edit], "repair");
        if ("refused" in next) continue;
        const ev2 = ev(next);
        const mine = c.fromAsg ? next.assignments[c.fromAsg] : Object.values(next.assignments).find((a) => a.pharmacistId === c.ph && a.storeId === head.storeId && a.date === head.date);
        const me = mine && ev2.assignments[mine.id];
        if (!me) continue;
        const unk = me.results.filter((r) => r.verdict === "Unknown");
        if (unk.length) {
          for (const r of unk) {
            if (r.ruleId.startsWith("travel")) excluded.set(`${c.ph}|${head.storeId}|${head.date}`, { pharmacistId: c.ph, storeId: head.storeId, date: head.date });
            else missing.add(`${r.ruleId} for ${state.pharmacists[c.ph]?.initials ?? c.ph}`);
          }
          continue;
        }
        if (!me.counts) continue;
        legalCandidates++;
        const m: Move = { edit: c.edit, ph: c.ph, store: head.storeId, date: head.date, from: c.from };
        const w2 = new Set(watch);
        let np = rest;
        if (c.from) {
          const vk = ck(c.from, head.date);
          w2.add(vk);
          if ((ev2.cells[vk]?.open ?? 0) > (evc.cells[vk]?.open ?? 0)) np = [{ storeId: c.from, date: head.date, depth: head.depth + 1 }, ...rest];
        }
        dfs(next, ev2, [...moves, m], np, w2);
        if (limitHit) return;
      }
    }
    // leave this one open and carry on with the rest
    dfs(state, evc, moves, rest, watch);
  };

  const watch = new Set(gaps.map((g) => ck(g.storeId, g.date)));
  dfs(base, baseEv, [], gaps.map((g) => ({ ...g, depth: 0 })), watch);

  const all = [...leaves.values()].filter((l) => l.option.edits.length > 0);
  const byKey = (a: Leaf, b: Leaf) => {
    for (let i = 0; i < a.sortKey.length; i++) {
      const c = cmp(a.sortKey[i]!, b.sortKey[i]!);
      if (c) return c;
    }
    return 0;
  };
  const clean = all.filter((l) => l.clean).sort(byKey).map((l) => l.option);
  const near = all.filter((l) => !l.clean).sort(byKey)[0]?.option ?? null;
  return {
    clean, nearMiss: near,
    excludedUnknownTravel: [...excluded.values()].sort((a, b) => cmp(a.pharmacistId, b.pharmacistId) || cmp(a.storeId, b.storeId) || cmp(a.date, b.date)),
    missing: [...missing].sort(cmp), limitHit, legalCandidates,
  };
}
