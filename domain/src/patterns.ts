// Standing-assignment recurrence. Pure date math.
import { cmp, toDayNumber, weekday, weekdayOccurrence, addDays } from "./dates.ts";
import type { DomainState, ISODate, Standing } from "./types.ts";

function floorMod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function standingMatches(t: Standing, date: ISODate): boolean {
  if (date < t.effectiveFrom) return false;
  if (t.effectiveTo !== undefined && date > t.effectiveTo) return false;
  const r = t.recurrence;
  if (!r.weekdays.includes(weekday(date))) return false;
  if (r.nth && !r.nth.includes(weekdayOccurrence(date))) return false;
  const sundayOfAnchor = addDays(r.anchor, -weekday(r.anchor));
  const weekIndex = Math.floor((toDayNumber(date) - toDayNumber(sundayOfAnchor)) / 7);
  return floorMod(weekIndex, r.cycleWeeks) === 0;
}

export type Expectation = { storeId: string; pharmacistId: string; standingId: string };

/** What the patterns say should happen on a date, sorted (pharmacist, store). Duplicates merged. */
export function expectedOn(state: DomainState, date: ISODate): Expectation[] {
  const out: Expectation[] = [];
  const seen = new Set<string>();
  for (const id of Object.keys(state.standing).sort(cmp)) {
    const t = state.standing[id]!;
    if (!standingMatches(t, date)) continue;
    const k = `${t.pharmacistId}|${t.storeId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ storeId: t.storeId, pharmacistId: t.pharmacistId, standingId: t.id });
  }
  return out.sort((a, b) => cmp(a.pharmacistId, b.pharmacistId) || cmp(a.storeId, b.storeId));
}

/** Pharmacists the pattern puts at more than one store on a date. */
export function patternConflicts(exp: Expectation[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of exp) m.set(e.pharmacistId, [...(m.get(e.pharmacistId) ?? []), e.storeId]);
  const out = new Map<string, string[]>();
  for (const [p, stores] of m) if (stores.length > 1) out.set(p, stores.sort(cmp));
  return out;
}
