// evaluate(): the single place that decides what counts. Everything else asks this.
import { cmp, dateOk, dateRange, fromDayNumber, toDayNumber, weekday } from "./dates.ts";
import type { EvalOptions } from "./api-types.ts";
import type {
  Assignment, AssignmentEval, CellCoverage, DomainState, Evaluation, ISODate, Override, RuleResult, Verdict,
} from "./types.ts";
import { RULE_BY_ID } from "./rules.ts";

const cellKey = (storeId: string, date: ISODate) => `${storeId}|${date}`;

export function requiredFor(state: DomainState, idx: ReqIndex, storeId: string, date: ISODate): number {
  const st = state.stores[storeId];
  if (!st) return 0;
  if (st.inactiveFrom !== undefined && st.inactiveFrom <= date) return 0;
  if (st.activeFrom !== undefined && st.activeFrom > date) return 0;
  const o = state.dateOverrides[cellKey(storeId, date)];
  if (o) return o.count;
  const rows = idx.get(`${storeId}|${weekday(date)}`);
  if (!rows) return 0;
  let n = 0;
  for (const r of rows) {
    if (r.effectiveFrom <= date) n = r.count;
    else break;
  }
  return n;
}

export type ReqIndex = Map<string, { effectiveFrom: ISODate; count: number }[]>;

/** Built per call, never cached by object identity (tables are mutated in place during a commit). */
export function indexRequirements(state: DomainState): ReqIndex {
  const idx: ReqIndex = new Map();
  for (const key of Object.keys(state.requirements).sort(cmp)) {
    const r = state.requirements[key]!;
    const k = `${r.storeId}|${r.weekday}`;
    const arr = idx.get(k) ?? [];
    arr.push({ effectiveFrom: r.effectiveFrom, count: r.count });
    idx.set(k, arr);
  }
  for (const arr of idx.values()) arr.sort((a, b) => cmp(a.effectiveFrom, b.effectiveFrom));
  return idx;
}

function result(ruleId: string, verdict: Verdict, signature: string, detail: string): RuleResult {
  return { ruleId, verdict, signature, detail, overridden: false, outdated: false };
}

type UnavIndex = Map<string, { id: string; first: ISODate; last: ISODate; scope?: string }[]>;
function indexUnavailability(state: DomainState, includeRequested: boolean): UnavIndex {
  const m: UnavIndex = new Map();
  for (const uid of Object.keys(state.unavailability).sort(cmp)) {
    const u = state.unavailability[uid]!;
    const ok = u.status === "Approved" || u.status === "Actual" || (includeRequested && u.status === "Requested");
    if (!ok) continue;
    const arr = m.get(u.pharmacistId) ?? [];
    arr.push({ id: u.id, first: u.first, last: u.last, ...(u.scopeStoreId ? { scope: u.scopeStoreId } : {}) });
    m.set(u.pharmacistId, arr);
  }
  return m;
}

/** Everything about a state that does not depend on which assignments exist. Reusable while only assignments change (search). */
export type EvalCtx = { reqIdx: ReqIndex; unavByP: UnavIndex; ovByAR: Map<string, Override> };

export function makeCtx(state: DomainState, opts: EvalOptions = {}): EvalCtx {
  const ovByAR = new Map<string, Override>();
  for (const oid of Object.keys(state.overrides).sort(cmp)) {
    const o = state.overrides[oid]!;
    ovByAR.set(`${o.assignmentId}|${o.ruleId}`, o);
  }
  return { reqIdx: indexRequirements(state), unavByP: indexUnavailability(state, opts.includeRequested === true), ovByAR };
}

/** Rule results for every assignment of one pharmacist (their own list is all that double booking and day runs need). */
function evalPharmacist(state: DomainState, ctx: EvalCtx, list: Assignment[], emit: (a: Assignment) => boolean): AssignmentEval[] {
  const cfg = state.config;
  const byDate = new Map<ISODate, Assignment[]>();
  for (const a of list) (byDate.get(a.date) ?? byDate.set(a.date, []).get(a.date)!).push(a);
  const groupResolved = new Map<ISODate, boolean>();
  for (const [d, members] of byDate) {
    if (members.length < 2) continue;
    const sorted = members.slice().sort((a, b) => a.placedSeq - b.placedSeq || cmp(a.id, b.id));
    const sig = sorted.map((m) => m.storeId).sort(cmp).join(",");
    let resolved = true;
    for (const m of sorted.slice(1)) {
      const o = ctx.ovByAR.get(`${m.id}|double-booking`);
      if (!o || o.signature !== sig) resolved = false;
    }
    groupResolved.set(d, resolved);
  }
  const runInfo = new Map<ISODate, { index: number; length: number }>();
  const days = [...byDate.keys()].map(toDayNumber).sort((x, y) => x - y);
  let start = 0;
  for (let i = 0; i <= days.length; i++) {
    if (i === days.length || (i > 0 && days[i]! !== days[i - 1]! + 1)) {
      const length = i - start;
      for (let j = start; j < i; j++) runInfo.set(fromDayNumber(days[j]!), { index: j - start, length });
      start = i;
    }
  }
  const out: AssignmentEval[] = [];
  for (const a of list) {
    if (!emit(a)) continue;
    const store = state.stores[a.storeId];
    const ph = state.pharmacists[a.pharmacistId];
    const results: RuleResult[] = [];
    const required = requiredFor(state, ctx.reqIdx, a.storeId, a.date);
    results.push(required === 0 ? result("closure", "Fail", "closed", "Store is closed that day") : result("closure", "Pass", "open", "Store is open"));

    if (!ph || !store) results.push(result("licensing", "Unknown", "unrecorded", "Missing pharmacist or store"));
    else if (store.state === null) results.push(result("licensing", "NotApplicable", "", "Store state not recorded"));
    else if (!ph.licenses) results.push(result("licensing", "Unknown", `${ph.id}|${store.state}|unrecorded`, "Licensing not recorded"));
    else if (!(store.state in ph.licenses)) results.push(result("licensing", "Fail", `${ph.id}|${store.state}|none`, `Not licensed in ${store.state}`));
    else {
      const exp = ph.licenses[store.state];
      if (exp !== null && exp !== undefined && exp < a.date) results.push(result("licensing", "Fail", `${ph.id}|${store.state}|expired`, `License expired ${exp}`));
      else results.push(result("licensing", "Pass", `${ph.id}|${store.state}|ok`, "Licensed"));
    }

    {
      // The signature is coarse on purpose: adding a second overlapping record does not make an earlier acceptance outdated.
      const why: string[] = [];
      if (ph && ((ph.activeFrom !== undefined && ph.activeFrom > a.date) || (ph.inactiveFrom !== undefined && ph.inactiveFrom <= a.date))) why.push("inactive");
      let off = false;
      for (const u of ctx.unavByP.get(a.pharmacistId) ?? []) if (u.first <= a.date && a.date <= u.last && (u.scope === undefined || u.scope === a.storeId)) off = true;
      if (off) why.push("unavailable");
      results.push(why.length ? result("availability", "Fail", why.join(","), "Not available") : result("availability", "Pass", "", "Available"));
    }

    {
      const members = byDate.get(a.date) ?? [a];
      if (members.length < 2) results.push(result("double-booking", "NotApplicable", "", "Only one assignment"));
      else {
        const sorted = members.slice().sort((x, y) => x.placedSeq - y.placedSeq || cmp(x.id, y.id));
        const sig = sorted.map((m) => m.storeId).sort(cmp).join(",");
        if (groupResolved.get(a.date) && sorted[0]!.id === a.id) results.push(result("double-booking", "Pass", sig, "Earliest placed; the others are overridden"));
        else results.push(result("double-booking", "Fail", sig, "Booked at two stores"));
      }
    }

    for (const [id, limit] of [["travel-soft", cfg.travelSoftMinutes], ["travel-hard", cfg.travelHardMinutes]] as const) {
      if (!ph || ph.baseStoreId === null) results.push(result(id, "NotApplicable", "", "No base store"));
      else if (ph.baseStoreId === a.storeId) results.push(result(id, "Pass", "0", "At base store"));
      else {
        const pair = state.travel[`${ph.baseStoreId}|${a.storeId}`];
        if (!pair) results.push(result(id, "Unknown", "unknown", "Drive time not known"));
        else if (pair.minutes > limit) results.push(result(id, "Fail", String(pair.minutes), `${pair.minutes} min drive`));
        else results.push(result(id, "Pass", String(pair.minutes), `${pair.minutes} min drive`));
      }
    }

    {
      const info = runInfo.get(a.date);
      if (info && info.index >= cfg.maxConsecutiveDays) results.push(result("consecutive-days", "Fail", String(info.length), `Day ${info.index + 1} in a row`));
      else results.push(result("consecutive-days", "Pass", String(info?.length ?? 1), "Within the limit"));
    }

    let unresolved = false;
    let unknown = false;
    for (const r of results) {
      const def = RULE_BY_ID[r.ruleId];
      const o = ctx.ovByAR.get(`${a.id}|${r.ruleId}`);
      if (r.verdict === "Fail" && o) {
        if (o.signature === r.signature) r.overridden = r.ruleId === "double-booking" ? groupResolved.get(a.date) === true : true;
        else r.outdated = true;
      }
      if (def?.kind === "presence") {
        if (r.verdict === "Fail" && !r.overridden) unresolved = true;
        if (r.verdict === "Unknown") unknown = true;
      }
    }
    results.sort((x, y) => cmp(x.ruleId, y.ruleId));
    const counts = !unresolved;
    out.push({ assignmentId: a.id, results, counts, unverified: counts && unknown });
  }
  return out;
}

/** Lookups a caller that already keeps its assignments indexed can hand to evalDelta, to skip scanning the whole table. */
export type AsgIndex = { ofPharmacist(id: string): Iterable<Assignment>; onDate(date: ISODate): Iterable<Assignment> };

function buildCell(state: DomainState, ctx: EvalCtx, evals: Record<string, AssignmentEval>, storeId: string, date: ISODate, onDate?: Iterable<Assignment>): CellCoverage {
  const c = state.cellCounts[cellKey(storeId, date)];
  const cell: CellCoverage = {
    storeId, date, required: requiredFor(state, ctx.reqIdx, storeId, date), counted: 0, unverified: 0,
    locum: c?.locum ?? 0, acceptedShort: c?.acceptedShort ?? 0, covered: 0, open: 0, surplus: 0,
  };
  for (const a of onDate ?? Object.values(state.assignments)) {
    if (a.storeId !== storeId || a.date !== date) continue;
    const e = evals[a.id];
    if (!e) continue;
    if (e.counts) cell.counted++;
    if (e.unverified) cell.unverified++;
  }
  return finishCell(cell);
}
function finishCell(cell: CellCoverage): CellCoverage {
  cell.covered = cell.counted + cell.locum;
  cell.open = Math.max(0, cell.required - cell.covered - cell.acceptedShort);
  cell.surplus = Math.max(0, cell.covered - cell.required);
  return cell;
}

export function evaluate(state: DomainState, asOf: ISODate, opts: EvalOptions = {}, ctxIn?: EvalCtx): Evaluation {
  const ctx = ctxIn ?? makeCtx(state, opts);
  // A caller-supplied window or range with a bad date is ignored rather than thrown on.
  const win = opts.window && dateOk(opts.window.from) && dateOk(opts.window.to) ? opts.window : undefined;
  const range = opts.range && dateOk(opts.range.from) && dateOk(opts.range.to) ? opts.range : undefined;
  const byPh = new Map<string, Assignment[]>();
  for (const id of Object.keys(state.assignments).sort(cmp)) {
    const a = state.assignments[id]!;
    (byPh.get(a.pharmacistId) ?? byPh.set(a.pharmacistId, []).get(a.pharmacistId)!).push(a);
  }
  const raw: Record<string, AssignmentEval> = {};
  const inWin = (a: Assignment) => !win || (a.date >= win.from && a.date <= win.to);
  // Someone with nothing inside the window cannot contribute an emitted result: skip their whole list (a run of days needs their full list only when they have a day in the window).
  for (const list of byPh.values()) if (!win || list.some(inWin)) for (const e of evalPharmacist(state, ctx, list, inWin)) raw[e.assignmentId] = e;
  const evals: Record<string, AssignmentEval> = {};
  for (const id of Object.keys(raw).sort(cmp)) evals[id] = raw[id]!;

  const cells: Record<string, CellCoverage> = {};
  const touch = (storeId: string, date: ISODate) => {
    const k = cellKey(storeId, date);
    if (cells[k]) return cells[k]!;
    const c = state.cellCounts[k];
    return (cells[k] = { storeId, date, required: requiredFor(state, ctx.reqIdx, storeId, date), counted: 0, unverified: 0, locum: c?.locum ?? 0, acceptedShort: c?.acceptedShort ?? 0, covered: 0, open: 0, surplus: 0 });
  };
  if (range) for (const sid of Object.keys(state.stores).sort(cmp)) for (const d of dateRange(range.from, range.to)) touch(sid, d);
  for (const k of Object.keys(state.cellCounts).sort(cmp)) touch(state.cellCounts[k]!.storeId, state.cellCounts[k]!.date);
  for (const id of Object.keys(evals)) {
    const a = state.assignments[id], e = evals[id];
    if (!a || !e) continue;
    const cell = touch(a.storeId, a.date);
    if (e.counts) cell.counted++;
    if (e.unverified) cell.unverified++;
  }
  for (const cell of Object.values(cells)) finishCell(cell);
  const sortedCells: Record<string, CellCoverage> = {};
  for (const k of Object.keys(cells).sort(cmp)) sortedCells[k] = cells[k]!;
  return { asOf, assignments: evals, cells: sortedCells };
}

/** Re-judge only what changed (with `only`, just the assignments it accepts, such as one date: right when they kept the same set of days, as a move between stores does): the listed pharmacists' assignments (their double booking and day runs) and the listed cells. Used by search; the rest is reused from `prev`. */
export function evalDelta(state: DomainState, ctx: EvalCtx, prev: Evaluation, pharmacists: string[], cellKeys: string[], idx?: AsgIndex, only?: (a: Assignment) => boolean): Evaluation {
  // Prototype chaining instead of copying: the search only reads by key, and each node adds a few entries over its parent's.
  const assignments: Record<string, AssignmentEval> = Object.create(prev.assignments);
  const wanted = new Set(pharmacists);
  const lists = new Map<string, Assignment[]>();
  if (idx) for (const ph of wanted) lists.set(ph, [...idx.ofPharmacist(ph)]);
  else for (const a of Object.values(state.assignments)) if (wanted.has(a.pharmacistId)) (lists.get(a.pharmacistId) ?? lists.set(a.pharmacistId, []).get(a.pharmacistId)!).push(a);
  for (const l of lists.values()) {
    l.sort((x, y) => cmp(x.id, y.id));
    for (const e of evalPharmacist(state, ctx, l, only ?? (() => true))) assignments[e.assignmentId] = e;
  }
  const cells: Record<string, CellCoverage> = Object.create(prev.cells);
  for (const k of new Set(cellKeys)) {
    const [storeId, date] = k.split("|") as [string, ISODate];
    cells[k] = buildCell(state, ctx, assignments, storeId, date, idx?.onDate(date));
  }
  return { asOf: prev.asOf, assignments, cells };
}
