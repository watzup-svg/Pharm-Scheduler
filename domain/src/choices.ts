// Who could work a store-date, and what each choice would do. Same legality as evaluate(): nothing is re-derived here.
import { cmp, isValidDate, type ISODate } from "./dates.ts";
import { evalDelta, evaluate, makeCtx, type EvalCtx } from "./coverage.ts";
import { RULE_BY_ID } from "./rules.ts";
import type { Assignment, DomainState, Evaluation, PharmacistId, StoreId } from "./types.ts";

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

/** What judging candidates for one day shares: the day's evaluation, the rule context and the assignments indexed once. */
export type ChoiceBase = {
  state: DomainState; date: ISODate; asOf: ISODate; base: Evaluation; was: Evaluation; ctx: EvalCtx;
  onDate: Assignment[]; ofPh: Map<string, Assignment[]>; placedSeq: number; newId: string;
};

/** `was` is the evaluation a move's "leaves the store short" is compared with (default: the plain one of that day). */
export function prepareChoices(state: DomainState, date: ISODate, asOf: ISODate, was?: Evaluation): ChoiceBase {
  const one = { from: date, to: date };
  const onDate: Assignment[] = [];
  const ofPh = new Map<string, Assignment[]>();
  for (const a of Object.values(state.assignments)) {
    (ofPh.get(a.pharmacistId) ?? ofPh.set(a.pharmacistId, []).get(a.pharmacistId)!).push(a);
    if (a.date === date) onDate.push(a);
  }
  const base = evaluate(state, asOf, { range: one, window: one });
  return { state, date, asOf, base, was: was ?? base, ctx: makeCtx(state), onDate, ofPh, placedSeq: state.nextId.seq, newId: `A${state.nextId.assignment}` };
}

/**
 * The effect of putting one person at `storeId` on the prepared day (a move when they are at exactly one other store, otherwise a place), or null
 * when that edit would be refused. The edit is the one applyScratch makes, but only that person's list (their double booking and runs of days)
 * and the cell they leave can change, so it is judged with evalDelta against the shared base instead of copying and evaluating the schedule.
 */
export function judgeChoice(cb: ChoiceBase, id: PharmacistId, storeId: StoreId): Choice | null {
  const { state, date, base, ctx, onDate } = cb;
  if (!isValidDate(date) || !state.stores[storeId] || !state.pharmacists[id]) return null;
  const mine = onDate.filter((a) => a.pharmacistId === id);
  if (mine.some((a) => a.storeId === storeId)) return null;
  const move = mine.length === 1 ? mine[0]! : null;
  let a: Assignment;
  let list: Assignment[];
  let day: Assignment[] = onDate;
  if (move) {
    a = { ...move, storeId, agreed: false };
    delete (a as { partialNote?: string }).partialNote;
    list = cb.ofPh.get(id)!.map((x) => (x.id === move.id ? a : x));
    day = onDate.map((x) => (x.id === move.id ? a : x));
  } else {
    a = { id: cb.newId, date, storeId, pharmacistId: id, placedSeq: cb.placedSeq, source: "manual", agreed: false, pinned: false };
    list = [...(cb.ofPh.get(id) ?? []), a];
  }
  const ev = evalDelta(state, ctx, base, [id], move ? [`${move.storeId}|${date}`] : [], { ofPharmacist: () => list, onDate: () => day }, (x) => x.date === date);
  const res = ev.assignments[a.id];
  if (!res) return null;
  const fails = res.results.filter((r) => r.verdict === "Fail" && !r.overridden);
  const blocks = fails.filter((r) => RULE_BY_ID[r.ruleId]?.kind === "presence").map((r) => r.ruleId);
  const warns = fails.filter((r) => RULE_BY_ID[r.ruleId]?.kind === "policy").map((r) => r.ruleId);
  const unknown = res.results.filter((r) => r.verdict === "Unknown").map((r) => r.ruleId);
  const base0 = state.pharmacists[id]?.baseStoreId ?? null;
  const pair = base0 && base0 !== storeId ? state.travel[`${base0}|${storeId}`] : null;
  const travelMinutes = base0 === storeId ? 0 : pair ? pair.minutes : null;
  let leavesShort: Choice["leavesShort"] = null;
  if (move) {
    const was = cb.was.cells[`${move.storeId}|${date}`]?.open ?? 0;
    const now = ev.cells[`${move.storeId}|${date}`]?.open ?? 0;
    if (now > was) leavesShort = { storeId: move.storeId, open: now };
  }
  const unavailable = res.results.some((r) => r.ruleId === "availability" && r.verdict === "Fail");
  return {
    pharmacistId: id, currently: mine.length ? mine.map((m) => m.storeId).sort(cmp).join(",") : "off",
    blocks, warns, unknown, travelMinutes, counts: res.counts, leavesShort, action: move ? "move" : "place",
    ...(move ? { assignmentId: move.id } : {}), unavailable,
  };
}

/** Every active pharmacist, with the effect of putting them at `storeId` on `date`. Sorted: counts first, fewer warnings, then name. */
export function choicesFor(state: DomainState, storeId: StoreId, date: ISODate, asOf: ISODate): Choice[] {
  const cb = prepareChoices(state, date, asOf);
  const out: Choice[] = [];
  for (const id of Object.keys(state.pharmacists).sort(cmp)) {
    const c = judgeChoice(cb, id, storeId);
    if (c) out.push(c);
  }
  const rank = (c: Choice) => (c.counts ? 0 : 1) * 1000 + (c.leavesShort ? 100 : 0) + c.warns.length * 10 + c.unknown.length + (c.currently === "off" ? 0 : 5);
  return out.sort((a, b) => rank(a) - rank(b) || (a.travelMinutes ?? 9999) - (b.travelMinutes ?? 9999) || cmp(a.pharmacistId, b.pharmacistId));
}
