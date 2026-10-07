// What the Overview reads from the schedule. Everything here is derived; nothing is written.
import { useMemo } from "react";
import { api, type Evaluation, type ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { buildIssues, evaluateCached, useViewState } from "../../derive.ts";
import { RULE_MARK } from "../../ui/icons.tsx";
import { buildChecks } from "../checks/buildChecks.ts";
import { useSaveStatus } from "../SaveControls.tsx";
import {
  buildChecklist, groupProblems, markCounts, monthBounds, nextMonthOf, overviewMonth, type ChecklistFacts, type ChecklistItem, type Problem,
} from "./lib.ts";

/** The mark a problem carries on the wall: open shifts are "open", a broken rule maps to its own mark. */
export const markOfProblem = (p: Problem): string => (p.kind === "open" ? "open" : RULE_MARK[p.ruleId ?? ""] ?? "closure");

export type MonthFacts = {
  ym: string;
  bounds: { from: ISODate; to: ISODate };
  asOf: ISODate;
  ev: Evaluation;
  problems: Problem[];
  /** Open positions (a store can need two on one day). */
  openShifts: number;
  openCells: number;
  ruleBreaks: number;
  marks: ReturnType<typeof markCounts>;
  waiting: number;
  outToday: string[];
};

/** The month the Overview talks about, with its counts. Same month as the dial. */
export function useMonthFacts(): MonthFacts | null {
  const vs = useViewState();
  const asOf = useApp((s) => s.asOf);
  const win = useApp((s) => s.window);
  const ym = overviewMonth(asOf, win);
  return useMemo(() => {
    if (!vs) return null;
    const bounds = monthBounds(ym);
    const ev = evaluateCached(vs.state, asOf, { range: bounds, includeRequested: vs.scenario });
    const issues = buildIssues(vs.state, ev, bounds, asOf);
    const problems = groupProblems(issues);
    let openShifts = 0, openCells = 0;
    for (const p of problems) if (p.kind === "open") { openCells += 1; openShifts += ev.cells[`${p.storeIds[0]}|${p.date}`]?.open ?? 1; }
    const ruleBreaks = problems.filter((p) => p.kind === "violation").length;
    const marks = markCounts(problems, markOfProblem);
    const recs = Object.values(vs.state.unavailability);
    const waiting = recs.filter((u) => u.status === "Requested" && u.last >= asOf).length;
    const out = new Set<string>();
    for (const u of recs) if ((u.status === "Approved" || u.status === "Actual") && u.type !== "Turned-down" && u.first <= asOf && u.last >= asOf) out.add(vs.state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId);
    return { ym, bounds, asOf, ev, problems, openShifts, openCells, ruleBreaks, marks, waiting, outToday: [...out].sort() };
  }, [vs, asOf, ym]);
}

/** The month checklist: each item ticks itself from the schedule. */
export function useChecklist(m: MonthFacts | null): ChecklistItem[] {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const win = useApp((s) => s.window);
  const save = useSaveStatus();
  return useMemo(() => {
    if (!world || !m) return [];
    const checks = buildChecks(world.state, asOf, win);
    const snaps = world.journal.snapshots.filter((s) => s.from <= m.bounds.to && s.to >= m.bounds.from);
    const posted = snaps.length ? Math.max(...snaps.map((s) => s.revision)) : null;
    const unsaved = save.unsavedChanges;
    const fileSaved = !(save.neverSaved || unsaved > 0 || save.error || save.needsPermission);
    const fileDetail = save.error ? "Not saved" : save.needsPermission ? "Needs permission" : save.neverSaved ? "Not saved to a file yet" : unsaved > 0 ? `${unsaved} ${unsaved === 1 ? "change" : "changes"} not saved` : save.lastSavedAt ? "Saved" : "Nothing to save yet";
    const first = m.problems[0];
    const facts: ChecklistFacts = {
      licencesMissing: checks.filter((c) => c.id.startsWith("lic|")).length,
      driveTimesMissing: checks.filter((c) => c.id.startsWith("travel|")).length,
      waiting: m.waiting,
      openShifts: m.openShifts,
      ruleBreaks: m.ruleBreaks,
      firstProblem: first ? { storeId: first.storeIds[0]!, date: first.date } : null,
      postedRevision: posted,
      changedDays: posted === null ? 0 : api.changedSincePosting(world).length,
      fileSaved, fileDetail,
    };
    return buildChecklist(facts);
  }, [world, m, asOf, win, save]);
}

/** How many shifts are already placed in the month after this one. */
export function useNextMonth(ym: string): { ym: string; bounds: { from: ISODate; to: ISODate }; shifts: number } {
  const world = useApp((s) => s.world);
  return useMemo(() => {
    const next = nextMonthOf(ym);
    const bounds = monthBounds(next);
    let shifts = 0;
    if (world) for (const a of Object.values(world.state.assignments)) if (a.date >= bounds.from && a.date <= bounds.to) shifts += 1;
    return { ym: next, bounds, shifts };
  }, [world, ym]);
}
