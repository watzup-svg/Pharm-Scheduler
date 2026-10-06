import { cmp } from "./dates.ts";
import { evaluate } from "./coverage.ts";
import { searchGaps, type Gap, type Scope } from "./search.ts";
import type { RepairOpts, RepairResult, World } from "./api-types.ts";
import type { ISODate } from "./types.ts";

export const SCOPE_DEFAULT: Scope = { chain: 3, changed: 4, offDuty: false };
export const SCOPE_WIDER: Scope = { chain: 5, changed: 8, offDuty: true };
export const MAX_GAPS = 5;

export function repair(world: World, gaps: Gap[], opts: RepairOpts, asOf: ISODate): RepairResult {
  const state = world.state;
  const uniq = new Map<string, Gap>();
  for (const g of gaps) uniq.set(`${g.date}|${g.storeId}`, g);
  const sorted = [...uniq.values()].sort((a, b) => cmp(a.date, b.date) || cmp(a.storeId, b.storeId));
  const dates = sorted.map((g) => g.date);
  const ev = sorted.length ? evaluate(state, asOf, { range: { from: dates[0]!, to: dates[dates.length - 1]! } }) : null;
  const open = sorted.filter((g) => g.date >= asOf && (ev!.cells[`${g.storeId}|${g.date}`]?.open ?? 0) > 0);
  const used = open.slice(0, MAX_GAPS);
  const dropped = open.slice(MAX_GAPS);
  const base: RepairResult = { status: "options", message: "", options: [], excludedUnknownTravel: [], gapsUsed: used, gapsDropped: dropped };
  if (!used.length) return { ...base, message: "Nothing to repair." };

  const out = searchGaps(state, used, opts.wider ? SCOPE_WIDER : SCOPE_DEFAULT, asOf, state.config.searchNodeLimit, opts.showNearMiss === true);
  const r: RepairResult = { ...base, excludedUnknownTravel: out.excludedUnknownTravel, ...(out.limitHit ? { limitHit: true } : {}) };
  if (out.clean.length) {
    r.options = out.clean.slice(0, 3);
    r.message = out.limitHit ? "Search limit reached; these may not be the best options" : "";
  } else if (out.limitHit) {
    r.status = "limit";
    r.message = "Search limit reached; a solution may exist";
  } else if (out.legalCandidates === 0 && (out.missing.length || out.excludedUnknownTravel.length)) {
    r.status = "cannot-evaluate";
    const miss = [...out.missing, ...(out.excludedUnknownTravel.length ? ["drive time for " + out.excludedUnknownTravel.map((x) => `${state.pharmacists[x.pharmacistId]?.initials ?? x.pharmacistId} to ${state.stores[x.storeId]?.code ?? x.storeId}`).join(", ")] : [])];
    r.missing = miss;
    r.message = `Cannot evaluate: ${miss.join("; ")}`;
  } else {
    r.status = "none";
    r.message = "No solution within scope; search complete";
  }
  if (dropped.length) r.message = `${r.message}${r.message ? ". " : ""}Looked at the first ${MAX_GAPS} gaps in date order; ${dropped.length} more not included.`;
  if (opts.showNearMiss && !out.clean.length && out.nearMiss) r.nearMiss = out.nearMiss;
  return r;
}
