// evaluate(): the single place that decides what counts. Everything else asks this.
import { cmp, dateOk, dateRange, toDayNumber, weekday } from "./dates.ts";
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
export type EvalCtx = { reqIdx: ReqIndex; unavByP: UnavIndex; ovByAR: Map<string, Override>; /** What each store needs on each day, worked out once per context (the state's requirements do not change while a context is in use). */ reqMemo: Map<string, Map<ISODate, number>> };

function requiredMemo(state: DomainState, ctx: EvalCtx, storeId: string, date: ISODate): number {
  let m = ctx.reqMemo.get(storeId);
  if (!m) ctx.reqMemo.set(storeId, (m = new Map()));
  let n = m.get(date);
  if (n === undefined) m.set(date, (n = requiredFor(state, ctx.reqIdx, storeId, date)));
  return n;
}

export function makeCtx(state: DomainState, opts: EvalOptions = {}): EvalCtx {
  const ovByAR = new Map<string, Override>();
  for (const oid of Object.keys(state.overrides).sort(cmp)) {
    const o = state.overrides[oid]!;
    ovByAR.set(`${o.assignmentId}|${o.ruleId}`, o);
  }
  return { reqIdx: indexRequirements(state), unavByP: indexUnavailability(state, opts.includeRequested === true), ovByAR, reqMemo: new Map() };
}

/** Where each rule's result sits in an assignment's results: alphabetical by rule id, as the sorted list always was. */
const SLOT: Record<string, number> = { availability: 0, closure: 1, "consecutive-days": 2, "double-booking": 3, licensing: 4, "travel-hard": 5, "travel-soft": 6 };
const RULE_SLOTS = 7;

/** Rule results for every assignment of one pharmacist (their own list is all that double booking and day runs need). */
function evalPharmacist(state: DomainState, ctx: EvalCtx, list: Assignment[], emit: (a: Assignment) => boolean): AssignmentEval[] {
  const cfg = state.config;
  // The search judges one date of a pharmacist at a time, so what shares a date with an emitted assignment is looked up when asked for
  // (a plain scan of the list) rather than laying out every date of the month first. A full evaluation emits nearly everything and builds the table once.
  const emitted = list.filter(emit);
  const few = emitted.length <= 3;
  let byDateAll: Map<ISODate, Assignment[]> | null = null;
  const membersOn = (date: ISODate): Assignment[] => {
    if (few) return list.filter((x) => x.date === date);
    if (!byDateAll) { byDateAll = new Map(); for (const a of list) (byDateAll.get(a.date) ?? byDateAll.set(a.date, []).get(a.date)!).push(a); }
    return byDateAll.get(date) ?? [];
  };
  const groupMemo = new Map<ISODate, boolean | undefined>();
  const groupResolvedOn = (d: ISODate): boolean | undefined => {
    if (groupMemo.has(d)) return groupMemo.get(d);
    const members = membersOn(d);
    let out: boolean | undefined;
    if (members.length >= 2) {
      const sorted = members.slice().sort((a, b) => a.placedSeq - b.placedSeq || cmp(a.id, b.id));
      const sig = sorted.map((m) => m.storeId).sort(cmp).join(",");
      let resolved = true;
      for (const m of sorted.slice(1)) {
        const o = ctx.ovByAR.get(`${m.id}|double-booking`);
        if (!o || o.signature !== sig) resolved = false;
      }
      out = resolved;
    }
    groupMemo.set(d, out);
    return out;
  };
  // Runs of consecutive days are only looked up for the dates that are emitted (the search asks for one date at a time), by walking out from that
  // day in a set of day numbers, instead of laying out every run of the pharmacist's whole list.
  let daySet: Set<number> | null = null;
  const runMemo = new Map<number, { index: number; length: number }>();
  const runOf = (date: ISODate): { index: number; length: number } => {
    const dn = toDayNumber(date);
    const hit = runMemo.get(dn);
    if (hit) return hit;
    if (!daySet) { daySet = new Set<number>(); for (const x of list) daySet.add(toDayNumber(x.date)); }
    let lo = dn;
    while (daySet.has(lo - 1)) lo--;
    let hi = dn;
    while (daySet.has(hi + 1)) hi++;
    const length = hi - lo + 1;
    for (let j = lo; j <= hi; j++) runMemo.set(j, { index: j - lo, length });
    return runMemo.get(dn)!;
  };
  const out: AssignmentEval[] = [];
  for (const a of emitted) {
    const store = state.stores[a.storeId];
    const ph = state.pharmacists[a.pharmacistId];
    // Results are laid out in rule-id order as they are made, so no sort is needed.
    const results: RuleResult[] = new Array(RULE_SLOTS);
    const put = (r: RuleResult) => { results[SLOT[r.ruleId]!] = r; };
    const required = requiredMemo(state, ctx, a.storeId, a.date);
    put(required === 0 ? result("closure", "Fail", "closed", "Store is closed that day") : result("closure", "Pass", "open", "Store is open"));

    if (!ph || !store) put(result("licensing", "Unknown", "unrecorded", "Missing pharmacist or store"));
    else if (store.state === null) put(result("licensing", "NotApplicable", "", "Store state not recorded"));
    else if (!ph.licenses) put(result("licensing", "Unknown", `${ph.id}|${store.state}|unrecorded`, "Licensing not recorded"));
    else if (!(store.state in ph.licenses)) put(result("licensing", "Fail", `${ph.id}|${store.state}|none`, `Not licensed in ${store.state}`));
    else {
      const exp = ph.licenses[store.state];
      if (exp !== null && exp !== undefined && exp < a.date) put(result("licensing", "Fail", `${ph.id}|${store.state}|expired`, `License expired ${exp}`));
      else put(result("licensing", "Pass", `${ph.id}|${store.state}|ok`, "Licensed"));
    }

    {
      // The signature is coarse on purpose: adding a second overlapping record does not make an earlier acceptance outdated.
      const why: string[] = [];
      if (ph && ((ph.activeFrom !== undefined && ph.activeFrom > a.date) || (ph.inactiveFrom !== undefined && ph.inactiveFrom <= a.date))) why.push("inactive");
      let off = false;
      for (const u of ctx.unavByP.get(a.pharmacistId) ?? []) if (u.first <= a.date && a.date <= u.last && (u.scope === undefined || u.scope === a.storeId)) off = true;
      if (off) why.push("unavailable");
      put(why.length ? result("availability", "Fail", why.join(","), "Not available") : result("availability", "Pass", "", "Available"));
    }

    {
      const members = membersOn(a.date);
      if (members.length < 2) put(result("double-booking", "NotApplicable", "", "Only one assignment"));
      else {
        const sorted = members.slice().sort((x, y) => x.placedSeq - y.placedSeq || cmp(x.id, y.id));
        const sig = sorted.map((m) => m.storeId).sort(cmp).join(",");
        if (groupResolvedOn(a.date) && sorted[0]!.id === a.id) put(result("double-booking", "Pass", sig, "Earliest placed; the others are overridden"));
        else put(result("double-booking", "Fail", sig, "Booked at two stores"));
      }
    }

    for (const [id, limit] of [["travel-soft", cfg.travelSoftMinutes], ["travel-hard", cfg.travelHardMinutes]] as const) {
      if (!ph || ph.baseStoreId === null) put(result(id, "NotApplicable", "", "No base store"));
      else if (ph.baseStoreId === a.storeId) put(result(id, "Pass", "0", "At base store"));
      else {
        const pair = state.travel[`${ph.baseStoreId}|${a.storeId}`];
        if (!pair) put(result(id, "Unknown", "unknown", "Drive time not known"));
        else if (pair.minutes > limit) put(result(id, "Fail", String(pair.minutes), `${pair.minutes} min drive`));
        else put(result(id, "Pass", String(pair.minutes), `${pair.minutes} min drive`));
      }
    }

    {
      const info = runOf(a.date);
      if (info && info.index >= cfg.maxConsecutiveDays) put(result("consecutive-days", "Fail", String(info.length), `Day ${info.index + 1} in a row`));
      else put(result("consecutive-days", "Pass", String(info?.length ?? 1), "Within the limit"));
    }

    let unresolved = false;
    let unknown = false;
    for (const r of results) {
      const def = RULE_BY_ID[r.ruleId];
      // A row for a non-overridable rule (licensing, I-1) can only come from loaded data: commit refuses to create one. It never resolves a Fail.
      if (r.verdict === "Fail" && def?.overridable !== false) {
        const o = ctx.ovByAR.get(`${a.id}|${r.ruleId}`);
        if (o) {
          if (o.signature === r.signature) r.overridden = r.ruleId === "double-booking" ? groupResolvedOn(a.date) === true : true;
          else r.outdated = true;
        }
      }
      if (def?.kind === "presence") {
        if (r.verdict === "Fail" && !r.overridden) unresolved = true;
        if (r.verdict === "Unknown") unknown = true;
      }
    }
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
    storeId, date, required: requiredMemo(state, ctx, storeId, date), counted: 0, unverified: 0,
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
export function evalDelta(state: DomainState, ctx: EvalCtx, prev: Evaluation, pharmacists: string[], cellKeys: string[], idx?: AsgIndex, only?: (a: Assignment) => boolean, flat = false): Evaluation {
  // Prototype chaining instead of copying: callers only read by key, and each result adds a few entries over its parent's. When the parent is small (a search over a day or two)
  // a plain copy is faster, because V8 is slow to make every parent into a prototype; `flat` asks for the copy.
  const assignments: Record<string, AssignmentEval> = flat ? { ...prev.assignments } : Object.create(prev.assignments);
  const wanted = new Set(pharmacists);
  const lists = new Map<string, Assignment[]>();
  if (idx) for (const ph of wanted) lists.set(ph, [...idx.ofPharmacist(ph)]);
  else for (const a of Object.values(state.assignments)) if (wanted.has(a.pharmacistId)) (lists.get(a.pharmacistId) ?? lists.set(a.pharmacistId, []).get(a.pharmacistId)!).push(a);
  for (const l of lists.values()) {
    // A list read from the caller's index is judged as it comes: nothing in the results depends on the order (the order of the keys in the result object is not read by the callers that pass an index).
    if (!idx) l.sort((x, y) => cmp(x.id, y.id));
    for (const e of evalPharmacist(state, ctx, l, only ?? (() => true))) assignments[e.assignmentId] = e;
  }
  const cells: Record<string, CellCoverage> = flat ? { ...prev.cells } : Object.create(prev.cells);
  for (const k of new Set(cellKeys)) {
    const [storeId, date] = k.split("|") as [string, ISODate];
    cells[k] = buildCell(state, ctx, assignments, storeId, date, idx?.onDate(date));
  }
  return { asOf: prev.asOf, assignments, cells };
}
