// Time off helpers shared by the page and the quick form.
import { api, monthDates, type DomainState, type ISODate, type Unavailability } from "@domain";
import { evaluateCached } from "../../derive.ts";
import { useApp } from "../../store.ts";
import { fmtShort } from "../chrome/shared.tsx";
import { cellsOpenedIfApproved, dayLoads, type Cell, type DayLoad } from "./calc.ts";

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

/** How many cells would newly be open if each of these requested records were approved (by record id), and which. Nothing is committed. */
export function opensIfApprovedAll(state: DomainState, records: Unavailability[], asOf: ISODate): Map<string, Cell[]> {
  if (!records.length) return new Map();
  let from = records[0]!.first, to = records[0]!.last;
  for (const u of records) { if (u.first < from) from = u.first; if (u.last > to) to = u.last; }
  return cellsOpenedIfApproved(state, records, asOf, evaluateCached(state, asOf, { range: { from, to } }));
}

export function openIfApprovedAll(state: DomainState, records: Unavailability[], asOf: ISODate): Map<string, number> {
  return new Map([...opensIfApprovedAll(state, records, asOf)].map(([id, cells]) => [id, cells.length]));
}

// A month's day loads, worked out once per state however many components ask (a state is replaced on every change, so its identity is a safe key).
const loadCache = new WeakMap<DomainState, Map<string, DayLoad[]>>();
export function monthLoads(state: DomainState, asOf: ISODate, ym: string): DayLoad[] {
  let m = loadCache.get(state);
  if (!m) loadCache.set(state, (m = new Map()));
  const key = `${asOf}|${ym}`;
  let hit = m.get(key);
  if (!hit) {
    const dates = monthDates(ym);
    const range = { from: dates[0]!, to: dates[dates.length - 1]! };
    hit = dayLoads(state, evaluateCached(state, asOf, { range }), range.from, range.to);
    if (m.size >= 6) m.delete(m.keys().next().value!);
    m.set(key, hit);
  }
  return hit;
}

/** Why the page cannot change the schedule right now (an open preview or what-if), or null. */
export function useWhyLocked(): string | null {
  const proposal = useApp((s) => s.world?.session.proposal ?? null);
  const scenario = useApp((s) => s.world?.session.scenario ?? null);
  if (proposal) return "Accept or discard the preview first.";
  if (scenario && !scenario.parked) return "A what-if is open. Park or discard it to change the schedule.";
  return null;
}
