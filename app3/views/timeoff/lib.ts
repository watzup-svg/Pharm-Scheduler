// Time off helpers shared by the page and the quick form.
import { api, applyScratch, type DomainState, type ISODate, type Unavailability } from "@domain";
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

/** How many cells would newly be open if this requested record were approved. Nothing is committed. */
export function openIfApproved(state: DomainState, u: Unavailability, asOf: ISODate): number {
  const range = { from: u.first, to: u.last };
  const base = api.evaluate(state, asOf, { range });
  const next = applyScratch(state, [{ t: "unavail.update", id: u.id, patch: { status: "Approved" } }]);
  if ("refused" in next) return 0;
  const ev = api.evaluate(next, asOf, { range });
  let n = 0;
  for (const [k, c] of Object.entries(ev.cells)) if (c.date >= asOf && c.open > (base.cells[k]?.open ?? 0)) n++;
  return n;
}

