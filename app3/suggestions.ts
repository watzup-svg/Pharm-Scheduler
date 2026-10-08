// The best single person for each gap, remembered per schedule: one cheap answer per (state, list of gaps), dropped with the state it was made from.
// Gaps are taken in the order given and each assumes the earlier suggestions were accepted, so one person is never offered for two stores on one day.
import { applyScratch, bestSuggestion, type DomainState, type ISODate, type Suggestion } from "@domain";

type Gap = { storeId: string; date: ISODate };
const memo = new WeakMap<DomainState, Map<string, (Suggestion | null)[]>>();

export function greedyBest(state: DomainState, asOf: ISODate, gaps: Gap[]): (Suggestion | null)[] {
  let m = memo.get(state);
  if (!m) memo.set(state, (m = new Map()));
  const key = `${asOf}|${gaps.map((g) => `${g.storeId}@${g.date}`).join(",")}`;
  const hit = m.get(key);
  if (hit) return hit;
  // A longer list shares its start with a shorter one asked for earlier, so start from the longest prefix already known.
  let out: (Suggestion | null)[] = [];
  let st = state;
  for (let n = gaps.length - 1; n > 0 && !out.length; n--) {
    const pre = m.get(`${asOf}|${gaps.slice(0, n).map((g) => `${g.storeId}@${g.date}`).join(",")}`);
    if (pre) { out = pre.slice(); for (const s of out) if (s) { const nx = applyScratch(st, s.edits); if (!("refused" in nx)) st = nx; } }
  }
  for (let i = out.length; i < gaps.length; i++) {
    const g = gaps[i]!;
    const sg = g.date < asOf ? null : bestSuggestion(st, g.storeId, g.date, asOf);
    out.push(sg);
    if (sg) { const nx = applyScratch(st, sg.edits); if (!("refused" in nx)) st = nx; }
  }
  m.set(key, out);
  return out;
}
