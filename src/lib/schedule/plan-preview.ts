// A dry run of one fill plan: apply it to a copy through the same write gate, then compare the whole month before and after.
// Read-only. Nothing here writes to the real schedule; "Use this plan" does that, as one undo.
import { applyCoverPlan, type CoverPlan } from "./cover-plan.ts";
import { evaluate } from "./rules.ts";
import type { ScheduleDoc } from "./types.ts";

export type PlanPreview = {
  ok: boolean;
  /** Why the copy refused, when it did. */
  problem?: string;
  /** Empty shifts in the month, before and after. */
  holes: [number, number];
  /** Stores (code, day) that were fine and would be empty after. */
  opened: { store: string; day: number }[];
  /** Two-pharmacist days that would be left with one pharmacist. */
  shortened: { store: string; day: number }[];
};

const keyOf = (i: { store: string; day: number }) => `${i.store}|${i.day}`;

export function previewPlan(doc: ScheduleDoc, plan: Pick<CoverPlan, "moves">, day: number): PlanPreview {
  const before = evaluate(doc);
  const res = applyCoverPlan(doc, plan, day);
  if (!res.ok) return { ok: false, problem: res.problem, holes: [before.holes, before.holes], opened: [], shortened: [] };
  const after = evaluate(res.doc);
  const wasHole = new Set(before.issues.filter((i) => i.hole).map(keyOf));
  const wasShort = new Set(before.issues.filter((i) => i.needsSecond).map(keyOf));
  return {
    ok: true,
    holes: [before.holes, after.holes],
    opened: after.issues.filter((i) => i.hole && !wasHole.has(keyOf(i))).map((i) => ({ store: i.store, day: i.day })),
    shortened: after.issues.filter((i) => i.needsSecond && !wasShort.has(keyOf(i))).map((i) => ({ store: i.store, day: i.day })),
  };
}
