// Who could work a store-date, and what each choice would do. Same legality as evaluate(): nothing is re-derived here.
import { cmp, type ISODate } from "./dates.ts";
import { evaluate } from "./coverage.ts";
import { applyScratch } from "./changeset.ts";
import { RULE_BY_ID } from "./rules.ts";
import type { DomainState, PharmacistId, StoreId } from "./types.ts";

export type Choice = {
  pharmacistId: PharmacistId;
  /** Where they are that date now: "off" or the store(s) they are placed at, joined with ",". */
  currently: string;
  /** Moving or placing them here: the presence rules that would fail (they would not count). */
  blocks: string[];
  /** Policy rules that would fail (still count): long drive, too many days in a row. */
  warns: string[];
  /** Rules that cannot be judged (missing data). */
  unknown: string[];
  /** Drive minutes from their base store, null if unknown or no base. */
  travelMinutes: number | null;
  /** True when they would count here. */
  counts: boolean;
  /** If they are placed elsewhere that day and moving them leaves that store short. */
  leavesShort: { storeId: StoreId; open: number } | null;
  /** The edit that would do it. */
  action: "place" | "move";
  /** For a move: the assignment moved. */
  assignmentId?: string;
  /** True when this person is on a record that makes them unavailable here (Approved/Actual). */
  unavailable: boolean;
};

/** Every active pharmacist, with the effect of putting them at `storeId` on `date`. Sorted: counts first, fewer warnings, then name. */
export function choicesFor(state: DomainState, storeId: StoreId, date: ISODate, asOf: ISODate): Choice[] {
  const base = evaluate(state, asOf, { range: { from: date, to: date } });
  const out: Choice[] = [];
  const onDate = Object.values(state.assignments).filter((a) => a.date === date);
  for (const id of Object.keys(state.pharmacists).sort(cmp)) {
    const mine = onDate.filter((a) => a.pharmacistId === id);
    if (mine.some((a) => a.storeId === storeId)) continue;
    const move = mine.length === 1 ? mine[0]! : null;
    const edit = move ? ({ t: "move", assignmentId: move.id, toStoreId: storeId } as const) : ({ t: "place", storeId, pharmacistId: id, date } as const);
    const next = applyScratch(state, [edit]);
    if ("refused" in next) continue;
    const ev = evaluate(next, asOf, { range: { from: date, to: date } });
    const a = move ? next.assignments[move.id]! : Object.values(next.assignments).find((x) => x.pharmacistId === id && x.storeId === storeId && x.date === date)!;
    const res = ev.assignments[a.id]!;
    const fails = res.results.filter((r) => r.verdict === "Fail" && !r.overridden);
    const blocks = fails.filter((r) => RULE_BY_ID[r.ruleId]!.kind === "presence").map((r) => r.ruleId);
    const warns = fails.filter((r) => RULE_BY_ID[r.ruleId]!.kind === "policy").map((r) => r.ruleId);
    const unknown = res.results.filter((r) => r.verdict === "Unknown").map((r) => r.ruleId);
    const base0 = state.pharmacists[id]!.baseStoreId;
    const pair = base0 && base0 !== storeId ? state.travel[`${base0}|${storeId}`] : null;
    const travelMinutes = base0 === storeId ? 0 : pair ? pair.minutes : null;
    let leavesShort: Choice["leavesShort"] = null;
    if (move) {
      const was = base.cells[`${move.storeId}|${date}`]?.open ?? 0;
      const now = ev.cells[`${move.storeId}|${date}`]?.open ?? 0;
      if (now > was) leavesShort = { storeId: move.storeId, open: now };
    }
    const unavailable = res.results.some((r) => r.ruleId === "availability" && r.verdict === "Fail");
    out.push({
      pharmacistId: id, currently: mine.length ? mine.map((m) => m.storeId).sort(cmp).join(",") : "off",
      blocks, warns, unknown, travelMinutes, counts: res.counts, leavesShort, action: move ? "move" : "place",
      ...(move ? { assignmentId: move.id } : {}), unavailable,
    });
  }
  const rank = (c: Choice) => (c.counts ? 0 : 1) * 1000 + (c.leavesShort ? 100 : 0) + c.warns.length * 10 + c.unknown.length + (c.currently === "off" ? 0 : 5);
  return out.sort((a, b) => rank(a) - rank(b) || (a.travelMinutes ?? 9999) - (b.travelMinutes ?? 9999) || cmp(a.pharmacistId, b.pharmacistId));
}
