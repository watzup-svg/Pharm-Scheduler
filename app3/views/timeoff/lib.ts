// Time off helpers shared by the page and the quick form.
import { api, evalDelta, isValidDate, makeCtx, type Assignment, type DomainState, type ISODate, type Unavailability } from "@domain";
import { evaluateCached } from "../../derive.ts";
import { fmtShort } from "../chrome/shared.tsx";

export const span = (u: { first: ISODate; last: ISODate }) => (u.first === u.last ? fmtShort(u.first) : `${fmtShort(u.first)} to ${fmtShort(u.last)}`);

/** Assignments of this person inside the record's dates that fail availability once the record counts. */
export function affectedBy(state: DomainState, u: Unavailability, asOf: ISODate, withRequested: boolean) {
  const ev = api.evaluate(state, asOf, { range: { from: u.first, to: u.last }, includeRequested: withRequested });
  const out: { storeId: string; date: ISODate }[] = [];
  for (const a of Object.values(state.assignments)) {
    if (a.pharmacistId !== u.pharmacistId || a.date < u.first || a.date > u.last) continue;
    const r = ev.assignments[a.id]?.results.find((x) => x.ruleId === "availability");
    if (r && r.verdict === "Fail" && !r.overridden) out.push({ storeId: a.storeId, date: a.date });
  }
  return out;
}

/**
 * How many cells would newly be open if each of these requested records were approved (by record id). Nothing is committed.
 * Approving a record can only change that person's own assignments inside its dates, so each record is judged with evalDelta against one
 * shared evaluation instead of evaluating a copy of the whole schedule twice per record.
 */
export function openIfApprovedAll(state: DomainState, records: Unavailability[], asOf: ISODate): Map<string, number> {
  const out = new Map<string, number>();
  if (!records.length) return out;
  let from = records[0]!.first, to = records[0]!.last;
  for (const u of records) { if (u.first < from) from = u.first; if (u.last > to) to = u.last; }
  const base = evaluateCached(state, asOf, { range: { from, to } });
  const ctx = makeCtx(state);
  const ofPh = new Map<string, Assignment[]>();
  const byDate = new Map<string, Assignment[]>();
  for (const a of Object.values(state.assignments)) {
    (ofPh.get(a.pharmacistId) ?? ofPh.set(a.pharmacistId, []).get(a.pharmacistId)!).push(a);
    (byDate.get(a.date) ?? byDate.set(a.date, []).get(a.date)!).push(a);
  }
  for (const u of records) {
    // The edit is refused (and counts as nothing) when the record's dates are not valid.
    if (!isValidDate(u.first) || !isValidDate(u.last) || u.last < u.first || (u.type === "Turned-down" && u.first !== u.last)) { out.set(u.id, 0); continue; }
    const list = ofPh.get(u.pharmacistId) ?? [];
    const inRange = (a: Assignment) => a.date >= u.first && a.date <= u.last;
    const keys = [...new Set(list.filter(inRange).map((a) => `${a.storeId}|${a.date}`))];
    if (!keys.length) { out.set(u.id, 0); continue; }
    const unavByP = new Map(ctx.unavByP);
    unavByP.set(u.pharmacistId, [...(ctx.unavByP.get(u.pharmacistId) ?? []).filter((x) => x.id !== u.id), { id: u.id, first: u.first, last: u.last, ...(u.scopeStoreId ? { scope: u.scopeStoreId } : {}) }]);
    const ev = evalDelta(state, { ...ctx, unavByP }, base, [u.pharmacistId], keys, { ofPharmacist: () => list, onDate: (d) => byDate.get(d) ?? [] }, inRange);
    let n = 0;
    for (const k of keys) if (k.slice(k.indexOf("|") + 1) >= asOf && (ev.cells[k]?.open ?? 0) > (base.cells[k]?.open ?? 0)) n++;
    out.set(u.id, n);
  }
  return out;
}
