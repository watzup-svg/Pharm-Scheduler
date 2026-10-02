import { monthName, weekdayShort } from "./calendar.ts";
import { storeLabel, type FixStep } from "./fix.ts";
import type { ScheduleDoc } from "./types.ts";
import { PROBLEM_NAME } from "./problem-kinds.ts";

/**
 * The issue navigator's order and cursor. Pure: it only reads the problem list, it never changes the schedule.
 *
 * Issues are walked in date order (then store order as the stores are listed), so stepping moves through the month the
 * way she reads it. The cursor is a stable key plus where it was, not an index: after a fix removes the current issue,
 * the next step lands on the issue that came after it.
 */

/** Where the cursor is. `day` and `store` are kept so the next issue can still be found once this one is fixed. */
export type IssueAnchor = { key: string; day: number; store: string };

/** The same issue keeps the same key across edits elsewhere in the month. */
export function stepKey(step: FixStep): string {
  return `${step.kind}|${step.day}|${step.store}|${[...step.names].sort().join(",")}`;
}

export function anchorOf(step: FixStep): IssueAnchor {
  return { key: stepKey(step), day: step.day, store: step.store };
}

function storeRank(doc: ScheduleDoc): (code: string) => number {
  const at = new Map(doc.stores.map((s, i) => [s.code, i] as const));
  return (code) => at.get(code) ?? Number.MAX_SAFE_INTEGER;
}

/** The problem list in date order, then store order. Ties keep the list's own order (most serious kind first). */
export function issueOrder(doc: ScheduleDoc, steps: FixStep[]): FixStep[] {
  const rank = storeRank(doc);
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.day - b.s.day || rank(a.s.store) - rank(b.s.store) || a.i - b.i)
    .map((x) => x.s);
}

/** Position of the anchored issue in an ordered list, or -1 when it is gone (fixed, or never existed). */
export function indexOf(ordered: FixStep[], anchor: IssueAnchor | null): number {
  if (!anchor) return -1;
  return ordered.findIndex((s) => stepKey(s) === anchor.key);
}

/** The first issue that comes after a place in the month (wrapping to the start), for when the anchored one is gone. */
function firstAfter(doc: ScheduleDoc, ordered: FixStep[], day: number, store: string): number {
  const rank = storeRank(doc);
  const at = ordered.findIndex((s) => s.day > day || (s.day === day && rank(s.store) > rank(store)));
  return at >= 0 ? at : 0;
}

/**
 * The issue the cursor stands on. If its issue was fixed, the one that came after it. Null when there are no issues or
 * no cursor.
 */
export function currentIssue(doc: ScheduleDoc, ordered: FixStep[], anchor: IssueAnchor | null): FixStep | null {
  if (!anchor || !ordered.length) return null;
  const i = indexOf(ordered, anchor);
  if (i >= 0) return ordered[i]!;
  return ordered[firstAfter(doc, ordered, anchor.day, anchor.store)]!;
}

/**
 * One step forward (+1) or back (-1), wrapping at either end. With no cursor, forward starts at the first issue and
 * back at the last. If the anchored issue is gone, forward lands on the one after it and back on the one before it.
 */
export function stepFrom(doc: ScheduleDoc, ordered: FixStep[], anchor: IssueAnchor | null, dir: 1 | -1): FixStep | null {
  const n = ordered.length;
  if (!n) return null;
  if (!anchor) return dir === 1 ? ordered[0]! : ordered[n - 1]!;
  const i = indexOf(ordered, anchor);
  if (i >= 0) return ordered[(i + dir + n) % n]!;
  const after = firstAfter(doc, ordered, anchor.day, anchor.store);
  return dir === 1 ? ordered[after]! : ordered[(after - 1 + n) % n]!;
}

/** The issue after a place in the month, for "fix and go to the next one" when the place no longer has an issue. */
export function nextAfter(doc: ScheduleDoc, ordered: FixStep[], day: number, store: string): FixStep | null {
  if (!ordered.length) return null;
  return ordered[firstAfter(doc, ordered, day, store)]!;
}

const KIND_TITLE: Record<FixStep["kind"], string> = PROBLEM_NAME;

/** Longest title that keeps full names; past this the house short form ("M. Quenby") is used. */
export const TITLE_FULL_NAME_MAX = 40;

/**
 * The short title for one issue, e.g. "No coverage · Rick's · Wed Oct 21" or "Two places · Gideon Ashcroft · Fri Oct 9".
 * Problems about a store name the store; problems about a person name the person. `short` is the house name rule
 * (`shortNames` in components/day-view.ts); full names are kept when the whole title stays short.
 */
export function issueTitle(doc: ScheduleDoc, step: FixStep, short: (name: string) => string = (n) => n): string {
  const date = `${weekdayShort(doc.year, doc.month, step.day)} ${monthName(doc.year, doc.month).slice(0, 3)} ${step.day}`;
  const kind = KIND_TITLE[step.kind];
  const byPerson = (step.kind === "double" || step.kind === "license") && step.names.length > 0;
  if (!byPerson) return `${kind} · ${storeLabel(doc, step.store)} · ${date}`;
  const full = `${kind} · ${step.names.join(", ")} · ${date}`;
  if (full.length <= TITLE_FULL_NAME_MAX) return full;
  return `${kind} · ${step.names.map(short).join(", ")} · ${date}`;
}

/** "6th", "21st", "22nd", "13th". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}
