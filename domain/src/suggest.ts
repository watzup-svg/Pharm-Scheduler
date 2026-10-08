// What a candidate would do, in words: the edits that make it happen, one sentence, and what it costs. Built only from a Choice, so the sentence
// can never disagree with what pressing the button does.
import { choicesFor, type Choice } from "./choices.ts";
import type { ISODate } from "./dates.ts";
import { RULE_BY_ID } from "./rules.ts";
import type { Edit } from "./api-types.ts";
import type { Assignment, DomainState, PharmacistId, StoreId } from "./types.ts";

export type CostKind = "short" | "drive" | "streak" | "asked" | "unverified" | "blocked";
export type Cost = { kind: CostKind; text: string };

export type Suggestion = {
  choice: Choice;
  edits: Edit[];
  /** "Greta Voss moves from CAV to CLA, and CAV stays covered." */
  sentence: string;
  /** The same without the name: "Moves from CAV; CAV stays covered." */
  detail: string;
  /** Everything that makes this less than free of side effects. Empty = clean. */
  costs: Cost[];
  /** Counts here and does no harm anywhere: no store left short, no warning, nothing unchecked. */
  clean: boolean;
};

const code = (s: DomainState, id: StoreId) => s.stores[id]?.code ?? id;
const nameOf = (s: DomainState, id: PharmacistId) => s.pharmacists[id]?.name ?? id;

/** The edits pressing the button makes. `replace` is the assignment being swapped out (the removal always comes first). */
export function editsFor(c: Choice, storeId: StoreId, date: ISODate, replace?: Pick<Assignment, "id" | "pharmacistId"> | null): Edit[] {
  const mv = c.action === "move" && c.assignmentId;
  if (replace) return mv ? [{ t: "remove", assignmentId: replace.id }, { t: "move", assignmentId: c.assignmentId!, toStoreId: storeId }] : [{ t: "swap", assignmentId: replace.id, toPharmacistId: c.pharmacistId }];
  return mv ? [{ t: "move", assignmentId: c.assignmentId!, toStoreId: storeId }] : [{ t: "place", storeId, pharmacistId: c.pharmacistId, date }];
}

/** Every reason this choice is not free of side effects, in a few words each. */
export function costsOf(state: DomainState, c: Choice, storeId: StoreId, date: ISODate): Cost[] {
  const out: Cost[] = [];
  for (const r of c.blocks) out.push({ kind: "blocked", text: r === "availability" ? "off that day" : r === "double-booking" ? "already booked that day" : r === "closure" ? "store closed" : RULE_BY_ID[r]?.message ?? r });
  if (c.leavesShort) out.push({ kind: "short", text: `leaves ${code(state, c.leavesShort.storeId)} short` });
  if (c.warns.some((w) => w.startsWith("travel"))) out.push({ kind: "drive", text: `${c.travelMinutes ?? "?"}-minute drive` });
  if (c.warns.includes("consecutive-days")) out.push({ kind: "streak", text: "many days in a row" });
  const asked = Object.values(state.unavailability).some((u) => u.pharmacistId === c.pharmacistId && u.status === "Requested" && u.first <= date && date <= u.last && (!u.scopeStoreId || u.scopeStoreId === storeId));
  if (asked) out.push({ kind: "asked", text: "asked for time off" });
  if (c.unknown.length) out.push({ kind: "unverified", text: "not fully checked" });
  return out;
}

/** What happens, without the person's name (the row already shows it): "Moves from CAV, leaving CAV short." */
export function describeDetail(state: DomainState, c: Choice, replace?: Pick<Assignment, "id" | "pharmacistId"> | null): string {
  const lead = replace ? `Takes ${nameOf(state, replace.pharmacistId)}'s place` : null;
  if (c.action === "move") {
    const src = code(state, c.currently);
    const tail = c.leavesShort ? `leaving ${src} short` : `${src} stays covered`;
    return lead ? `${lead}; ${tail}.` : `Moves from ${src}; ${tail}.`;
  }
  return lead ? `${lead}.` : "Free that day.";
}

/** The same thing as a full sentence. */
export function describeMove(state: DomainState, c: Choice, storeId: StoreId, replace?: Pick<Assignment, "id" | "pharmacistId"> | null): string {
  const who = nameOf(state, c.pharmacistId);
  const dst = code(state, storeId);
  const lead = replace ? `${who} takes ${nameOf(state, replace.pharmacistId)}'s place at ${dst}` : null;
  if (c.action === "move") {
    const src = code(state, c.currently);
    const tail = c.leavesShort ? `leaving ${src} short` : `${src} stays covered`;
    return lead ? `${lead} and leaves ${src}${c.leavesShort ? " short" : ", which stays covered"}.` : `${who} moves from ${src} to ${dst}, ${c.leavesShort ? tail : `and ${tail}`}.`;
  }
  return lead ? `${lead}.` : `${who} is free that day and works ${dst}.`;
}

export function suggestionFor(state: DomainState, c: Choice, storeId: StoreId, date: ISODate, replace?: Pick<Assignment, "id" | "pharmacistId"> | null): Suggestion {
  const costs = costsOf(state, c, storeId, date);
  return { choice: c, edits: editsFor(c, storeId, date, replace), sentence: describeMove(state, c, storeId, replace), detail: describeDetail(state, c, replace), costs, clean: c.counts && costs.length === 0 };
}

/** The best single person for a gap: the first the ranking puts forward that counts and is not stopped by licensing. Null when nobody counts. */
export function bestSuggestion(state: DomainState, storeId: StoreId, date: ISODate, asOf: ISODate): Suggestion | null {
  const c = choicesFor(state, storeId, date, asOf).find((x) => x.counts && !x.blocks.includes("licensing"));
  return c ? suggestionFor(state, c, storeId, date) : null;
}
