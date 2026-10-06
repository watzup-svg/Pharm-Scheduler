// Derived views over the world. Pure; memoize at the call site with useMemo.
import { useMemo } from "react";
import {
  api, applyScratch, cmp, dateRange, RULE_BY_ID, type Assignment, type CellCoverage, type DomainState, type Evaluation, type ISODate, type Proposal,
} from "@domain";
import { useApp } from "./store.ts";

/** The state the screen shows: the scenario's what-if while one is open and not parked, otherwise the live schedule. */
type WorldT = NonNullable<ReturnType<typeof useApp.getState>["world"]>;
type ViewStateT = { state: DomainState; scenario: boolean };
// A world is replaced, never edited, so what it shows is worked out once and shared by every component that asks.
const viewCache = new WeakMap<WorldT, ViewStateT>();
export function viewState(world: WorldT): ViewStateT {
  const hit = viewCache.get(world);
  if (hit) return hit;
  let out: ViewStateT = { state: world.state, scenario: false };
  const sc = world.session.scenario;
  if (sc && !sc.parked) {
    const s = applyScratch(world.state, sc.edits);
    if (!("refused" in s)) out = { state: s, scenario: true };
  }
  viewCache.set(world, out);
  return out;
}

// One evaluation per (state, as-of, range, window, requested) however many screens ask for it. A state is replaced on every change (commit
// clones it), so its identity is a safe key; callers must treat the result as read-only.
const evalCache = new WeakMap<DomainState, Map<string, Evaluation>>();
export function evaluateCached(state: DomainState, asOf: ISODate, opts: { range?: { from: ISODate; to: ISODate }; window?: { from: ISODate; to: ISODate }; includeRequested?: boolean } = {}): Evaluation {
  const key = `${asOf}|${opts.range ? `${opts.range.from}~${opts.range.to}` : ""}|${opts.window ? `${opts.window.from}~${opts.window.to}` : ""}|${opts.includeRequested === true ? 1 : 0}`;
  let m = evalCache.get(state);
  if (!m) evalCache.set(state, (m = new Map()));
  let ev = m.get(key);
  if (!ev) {
    if (m.size >= 12) m.delete(m.keys().next().value!);
    m.set(key, (ev = api.evaluate(state, asOf, { ...(opts.range ? { range: opts.range } : {}), ...(opts.window ? { window: opts.window } : {}), ...(opts.includeRequested === true ? { includeRequested: true } : {}) })));
  }
  return ev;
}

export function useViewState(): { state: DomainState; scenario: boolean } | null {
  const world = useApp((s) => s.world);
  return useMemo(() => (world ? viewState(world) : null), [world]);
}

export function useEvaluation(): Evaluation | null {
  const vs = useViewState();
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  return useMemo(() => (vs ? evaluateCached(vs.state, asOf, { range: win, includeRequested: vs.scenario }) : null), [vs, win, asOf]);
}

export type CellAssignment = {
  id: string;
  pharmacistId: string;
  initials: string;
  name: string;
  counts: boolean;
  unverified: boolean;
  pinned: boolean;
  agreed: boolean;
  partialNote: string | undefined;
  source: Assignment["source"];
  /** Presence rules that fail and are not overridden. */
  blocks: string[];
  /** Policy rules that fail and are not overridden. */
  warns: string[];
  overridden: string[];
  outdated: string[];
};

export type CellView = {
  storeId: string;
  date: ISODate;
  required: number;
  assignments: CellAssignment[];
  cov: CellCoverage | undefined;
  /** Closed: requirement 0. */
  closed: boolean;
  open: number;
  acceptedShort: number;
  locum: number;
  marker: "serious" | "warning" | "info" | null;
};

export function buildCellView(state: DomainState, ev: Evaluation, storeId: string, date: ISODate, byCell?: Map<string, Assignment[]>): CellView {
  const cov = ev.cells[`${storeId}|${date}`];
  const list = (byCell ? byCell.get(`${storeId}|${date}`) : Object.values(state.assignments).filter((a) => a.storeId === storeId && a.date === date)) ?? [];
  const assignments: CellAssignment[] = list
    .slice()
    .sort((a, b) => a.placedSeq - b.placedSeq || cmp(a.id, b.id))
    .map((a) => {
      const e = ev.assignments[a.id];
      const results = e?.results ?? [];
      const ph = state.pharmacists[a.pharmacistId];
      const fails = results.filter((r) => r.verdict === "Fail" && !r.overridden);
      return {
        id: a.id, pharmacistId: a.pharmacistId, initials: ph?.initials ?? a.pharmacistId, name: ph?.name ?? a.pharmacistId,
        counts: e?.counts ?? false, unverified: e?.unverified ?? false, pinned: a.pinned, agreed: a.agreed, partialNote: a.partialNote, source: a.source,
        blocks: fails.filter((r) => RULE_BY_ID[r.ruleId]?.kind === "presence").map((r) => r.ruleId),
        warns: fails.filter((r) => RULE_BY_ID[r.ruleId]?.kind === "policy").map((r) => r.ruleId),
        overridden: results.filter((r) => r.overridden).map((r) => r.ruleId),
        outdated: results.filter((r) => r.outdated).map((r) => r.ruleId),
      };
    });
  const required = cov?.required ?? 0;
  const open = cov?.open ?? 0;
  const serious = open > 0 || assignments.some((a) => a.blocks.length > 0);
  const warning = assignments.some((a) => a.warns.length > 0);
  const info = assignments.some((a) => a.unverified || a.outdated.length > 0);
  return {
    storeId, date, required, assignments, cov, closed: required === 0, open,
    acceptedShort: cov?.acceptedShort ?? 0, locum: cov?.locum ?? 0,
    marker: serious ? "serious" : warning ? "warning" : info ? "info" : null,
  };
}

export type IssueKind = "open" | "violation" | "warning";
export type Issue = {
  id: string;
  kind: IssueKind;
  severity: "serious" | "warning";
  storeId: string;
  date: ISODate;
  pharmacistId?: string;
  ruleId?: string;
  text: string;
};

/** Everything needing a look in the window, from asOf on. Date order, then store code. */
export function buildIssues(state: DomainState, ev: Evaluation, win: { from: ISODate; to: ISODate }, asOf: ISODate): Issue[] {
  const out: Issue[] = [];
  const code = (id: string) => state.stores[id]?.code ?? id;
  for (const c of Object.values(ev.cells)) {
    if (c.date < asOf || c.date < win.from || c.date > win.to) continue;
    if (c.open > 0) out.push({ id: `open|${c.storeId}|${c.date}`, kind: "open", severity: "serious", storeId: c.storeId, date: c.date, text: `${code(c.storeId)} needs ${c.open} more` });
  }
  for (const a of Object.values(state.assignments)) {
    if (a.date < asOf || a.date < win.from || a.date > win.to) continue;
    const e = ev.assignments[a.id];
    if (!e) continue;
    for (const r of e.results) {
      if (r.verdict !== "Fail" || r.overridden) continue;
      const def = RULE_BY_ID[r.ruleId];
      if (!def) continue;
      const who = state.pharmacists[a.pharmacistId]?.name ?? a.pharmacistId;
      out.push({
        id: `${def.kind}|${a.storeId}|${a.date}|${a.pharmacistId}|${r.ruleId}`,
        kind: def.kind === "presence" ? "violation" : "warning", severity: def.kind === "presence" ? "serious" : "warning",
        storeId: a.storeId, date: a.date, pharmacistId: a.pharmacistId, ruleId: r.ruleId,
        text: `${who} at ${code(a.storeId)}: ${r.detail}`,
      });
    }
  }
  return out.sort((a, b) => cmp(a.date, b.date) || cmp(code(a.storeId), code(b.storeId)) || (a.severity === b.severity ? 0 : a.severity === "serious" ? -1 : 1) || cmp(a.id, b.id));
}

export function useIssues(): Issue[] {
  const vs = useViewState();
  const ev = useEvaluation();
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  return useMemo(() => (vs && ev ? buildIssues(vs.state, ev, win, asOf) : []), [vs, ev, win, asOf]);
}

/** What a proposal would change, per store-date cell, for ghost previews on the wall. */
export type Ghost = { add: string[]; remove: string[] };
export function proposalGhosts(live: DomainState, p: Proposal): Map<string, Ghost> {
  const edits = [...p.edits, ...(p.builtDates ?? []).map((date) => ({ t: "built.set" as const, date }))];
  const next = applyScratch(live, edits);
  const out = new Map<string, Ghost>();
  if ("refused" in next) return out;
  const key = (a: Assignment) => `${a.storeId}|${a.date}`;
  const before = new Map<string, Set<string>>();
  const after = new Map<string, Set<string>>();
  for (const a of Object.values(live.assignments)) (before.get(key(a)) ?? before.set(key(a), new Set()).get(key(a))!).add(a.pharmacistId);
  for (const a of Object.values(next.assignments)) (after.get(key(a)) ?? after.set(key(a), new Set()).get(key(a))!).add(a.pharmacistId);
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(k) ?? new Set<string>();
    const a = after.get(k) ?? new Set<string>();
    const add = [...a].filter((x) => !b.has(x)).sort(cmp);
    const remove = [...b].filter((x) => !a.has(x)).sort(cmp);
    if (add.length || remove.length) out.set(k, { add, remove });
  }
  return out;
}

export function useGhosts(): Map<string, Ghost> {
  const world = useApp((s) => s.world);
  return useMemo(() => (world?.session.proposal ? proposalGhosts(world.state, world.session.proposal) : new Map()), [world]);
}

export function useWindowDates(): ISODate[] {
  const win = useApp((s) => s.window);
  return useMemo(() => dateRange(win.from, win.to), [win]);
}
