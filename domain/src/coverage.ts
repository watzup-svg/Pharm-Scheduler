// evaluate(): the single place that decides what counts. Everything else asks this.
import { cmp, dateRange, fromDayNumber, toDayNumber, weekday } from "./dates.ts";
import type { EvalOptions } from "./api-types.ts";
import type {
  Assignment, AssignmentEval, CellCoverage, DomainState, Evaluation, ISODate, Override, RuleResult, Verdict,
} from "./types.ts";
import { RULES } from "./rules.ts";

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

export function evaluate(state: DomainState, asOf: ISODate, opts: EvalOptions = {}): Evaluation {
  const reqIdx = indexRequirements(state);
  const ids = Object.keys(state.assignments).sort(cmp);
  const asg = ids.map((id) => state.assignments[id]!);

  // indexes
  const byPD = new Map<string, Assignment[]>();
  for (const a of asg) {
    const k = `${a.pharmacistId}|${a.date}`;
    const arr = byPD.get(k) ?? [];
    arr.push(a);
    byPD.set(k, arr);
  }
  const ovByAR = new Map<string, Override>();
  for (const oid of Object.keys(state.overrides).sort(cmp)) {
    const o = state.overrides[oid]!;
    ovByAR.set(`${o.assignmentId}|${o.ruleId}`, o);
  }
  const unavByP = new Map<string, { id: string; first: ISODate; last: ISODate; scope?: string }[]>();
  for (const uid of Object.keys(state.unavailability).sort(cmp)) {
    const u = state.unavailability[uid]!;
    const ok = u.status === "Approved" || u.status === "Actual" || (opts.includeRequested === true && u.status === "Requested");
    if (!ok) continue;
    const arr = unavByP.get(u.pharmacistId) ?? [];
    arr.push({ id: u.id, first: u.first, last: u.last, ...(u.scopeStoreId ? { scope: u.scopeStoreId } : {}) });
    unavByP.set(u.pharmacistId, arr);
  }
  // consecutive-day runs per pharmacist
  const runInfo = new Map<string, { index: number; length: number }>(); // key p|date
  const datesByP = new Map<string, Set<ISODate>>();
  for (const a of asg) {
    const s = datesByP.get(a.pharmacistId) ?? new Set<ISODate>();
    s.add(a.date);
    datesByP.set(a.pharmacistId, s);
  }
  for (const [p, set] of datesByP) {
    const days = [...set].map(toDayNumber).sort((x, y) => x - y);
    let start = 0;
    for (let i = 0; i <= days.length; i++) {
      if (i === days.length || (i > 0 && days[i]! !== days[i - 1]! + 1)) {
        const length = i - start;
        for (let j = start; j < i; j++) runInfo.set(`${p}|${fromDayNumber(days[j]!)}`, { index: j - start, length });
        start = i;
      }
    }
  }

  const cfg = state.config;
  const evals: Record<string, AssignmentEval> = {};

  // double-booking groups resolved?
  const groupResolved = new Map<string, boolean>();
  for (const [k, members] of byPD) {
    if (members.length < 2) continue;
    const sorted = members.slice().sort((a, b) => a.placedSeq - b.placedSeq || cmp(a.id, b.id));
    const sig = sorted.map((m) => m.storeId).sort(cmp).join(",");
    let resolved = true;
    for (const m of sorted.slice(1)) {
      const o = ovByAR.get(`${m.id}|double-booking`);
      if (!o || o.signature !== sig) resolved = false;
    }
    groupResolved.set(k, resolved);
  }

  for (const a of asg) {
    const store = state.stores[a.storeId];
    const ph = state.pharmacists[a.pharmacistId];
    const results: RuleResult[] = [];

    // closure
    const required = requiredFor(state, reqIdx, a.storeId, a.date);
    results.push(required === 0 ? result("closure", "Fail", "closed", "Store is closed that day") : result("closure", "Pass", "open", "Store is open"));

    // licensing
    if (!ph || !store) results.push(result("licensing", "Unknown", "unrecorded", "Missing pharmacist or store"));
    else if (store.state === null) results.push(result("licensing", "NotApplicable", "", "Store state not recorded"));
    else if (!ph.licenses) results.push(result("licensing", "Unknown", `${ph.id}|${store.state}|unrecorded`, "Licensing not recorded"));
    else if (!(store.state in ph.licenses)) results.push(result("licensing", "Fail", `${ph.id}|${store.state}|none`, `Not licensed in ${store.state}`));
    else {
      const exp = ph.licenses[store.state];
      if (exp !== null && exp !== undefined && exp < a.date) results.push(result("licensing", "Fail", `${ph.id}|${store.state}|expired`, `License expired ${exp}`));
      else results.push(result("licensing", "Pass", `${ph.id}|${store.state}|ok`, "Licensed"));
    }

    // availability
    {
      const parts: string[] = [];
      if (ph) {
        if ((ph.activeFrom !== undefined && ph.activeFrom > a.date) || (ph.inactiveFrom !== undefined && ph.inactiveFrom <= a.date)) parts.push("inactive");
      }
      for (const u of unavByP.get(a.pharmacistId) ?? []) {
        if (u.first <= a.date && a.date <= u.last && (u.scope === undefined || u.scope === a.storeId)) parts.push(u.id);
      }
      results.push(parts.length ? result("availability", "Fail", parts.join(","), "Not available") : result("availability", "Pass", "", "Available"));
    }

    // double-booking
    {
      const k = `${a.pharmacistId}|${a.date}`;
      const members = byPD.get(k) ?? [a];
      if (members.length < 2) results.push(result("double-booking", "NotApplicable", "", "Only one assignment"));
      else {
        const sorted = members.slice().sort((x, y) => x.placedSeq - y.placedSeq || cmp(x.id, y.id));
        const sig = sorted.map((m) => m.storeId).sort(cmp).join(",");
        if (groupResolved.get(k) && sorted[0]!.id === a.id) results.push(result("double-booking", "Pass", sig, "Earliest placed; the others are overridden"));
        else results.push(result("double-booking", "Fail", sig, "Booked at two stores"));
      }
    }

    // travel
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

    // consecutive days
    {
      const info = runInfo.get(`${a.pharmacistId}|${a.date}`);
      if (info && info.index >= cfg.maxConsecutiveDays) results.push(result("consecutive-days", "Fail", String(info.length), `Day ${info.index + 1} in a row`));
      else results.push(result("consecutive-days", "Pass", String(info?.length ?? 1), "Within the limit"));
    }

    // overrides
    let unresolved = false;
    let unknown = false;
    for (const r of results) {
      const def = RULES.find((d) => d.id === r.ruleId)!;
      const o = ovByAR.get(`${a.id}|${r.ruleId}`);
      if (r.verdict === "Fail" && o) {
        if (o.signature === r.signature) r.overridden = r.ruleId === "double-booking" ? groupResolved.get(`${a.pharmacistId}|${a.date}`) === true : true;
        else r.outdated = true;
      }
      if (def.kind === "presence") {
        if (r.verdict === "Fail" && !r.overridden) unresolved = true;
        if (r.verdict === "Unknown") unknown = true;
      }
    }
    results.sort((x, y) => cmp(x.ruleId, y.ruleId));
    const counts = !unresolved;
    evals[a.id] = { assignmentId: a.id, results, counts, unverified: counts && unknown };
  }

  // cells
  const cells: Record<string, CellCoverage> = {};
  const touch = (storeId: string, date: ISODate) => {
    const k = cellKey(storeId, date);
    if (cells[k]) return cells[k]!;
    const c = state.cellCounts[k];
    const cell: CellCoverage = {
      storeId, date, required: requiredFor(state, reqIdx, storeId, date), counted: 0, unverified: 0,
      locum: c?.locum ?? 0, acceptedShort: c?.acceptedShort ?? 0, covered: 0, open: 0, surplus: 0,
    };
    cells[k] = cell;
    return cell;
  };
  if (opts.range) {
    for (const sid of Object.keys(state.stores).sort(cmp)) for (const d of dateRange(opts.range.from, opts.range.to)) touch(sid, d);
  }
  for (const k of Object.keys(state.cellCounts).sort(cmp)) {
    const c = state.cellCounts[k]!;
    touch(c.storeId, c.date);
  }
  for (const a of asg) {
    const cell = touch(a.storeId, a.date);
    const ev = evals[a.id]!;
    if (ev.counts) cell.counted++;
    if (ev.unverified) cell.unverified++;
  }
  for (const cell of Object.values(cells)) {
    cell.covered = cell.counted + cell.locum;
    cell.open = Math.max(0, cell.required - cell.covered - cell.acceptedShort);
    cell.surplus = Math.max(0, cell.covered - cell.required);
  }
  const sortedCells: Record<string, CellCoverage> = {};
  for (const k of Object.keys(cells).sort(cmp)) sortedCells[k] = cells[k]!;
  return { asOf, assignments: evals, cells: sortedCells };
}
