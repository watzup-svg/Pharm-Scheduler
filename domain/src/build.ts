// Build and Reset to Pattern. Both return proposals; nothing is applied here.
import { cmp, dateRange, type ISODate } from "./dates.ts";
import { clone } from "./canonical.ts";
import { evaluate } from "./coverage.ts";
import { applyScratch, ENGINE_VERSION, stateHash } from "./changeset.ts";
import { expectedOn, patternConflicts } from "./patterns.ts";
import { searchGaps, type Gap, type Scope } from "./search.ts";
import { PRESENCE_RULES } from "./rules.ts";
import type { BuildReport, BuildResult, Edit, Proposal, World } from "./api-types.ts";
import type { DomainState, Evaluation, RuleResult } from "./types.ts";

const BUILD_SCOPE: Scope = { chain: 3, changed: 4, offDuty: false };
/** Build solves at most this many same-date gaps together (Repair allows 5): it runs over a whole month and the DM reviews the result. */
const MAX_GROUP = 2;

const emptyReport = (): BuildReport => ({
  edits: 0, instantiated: 0, patternCannotApply: [], exceptionsCreatedGaps: [], patternConflicts: [],
  conflictsRemoved: [], conflictsLeft: [], unresolvedGaps: [],
});

function firstFail(ev: Evaluation, id: string): RuleResult | undefined {
  return ev.assignments[id]?.results.find((r) => r.verdict === "Fail" && PRESENCE_RULES.includes(r.ruleId) && !r.overridden);
}

function must(r: DomainState | { refused: true; reason: string }): DomainState {
  if ("refused" in r) throw new Error(`internal edit refused: ${r.reason}`);
  return r;
}

export function build(world: World, range: { from: ISODate; to: ISODate }, asOf: ISODate): BuildResult {
  const baseState = world.state;
  let W = clone(baseState);
  const edits: Edit[] = [];
  const report = emptyReport();
  const builtDates: ISODate[] = [];
  const apply = (es: Edit[]) => {
    W = must(applyScratch(W, es, "build"));
    edits.push(...es);
  };
  const dates = dateRange(range.from, range.to).filter((d) => d >= asOf);

  // 1. Instantiate patterns on dates not yet built.
  for (const date of dates) {
    if (W.built[date]) continue;
    const exp = expectedOn(W, date);
    const conf = patternConflicts(exp);
    for (const [ph, stores] of [...conf].sort((a, b) => cmp(a[0], b[0]))) report.patternConflicts.push({ pharmacistId: ph, date, storeIds: stores });
    const have = new Set(Object.values(W.assignments).map((a) => `${a.pharmacistId}|${a.storeId}|${date === a.date ? "" : a.date}`));
    const cands = exp.filter((e) => !conf.has(e.pharmacistId) && !Object.values(W.assignments).some((a) => a.date === date && a.pharmacistId === e.pharmacistId && a.storeId === e.storeId));
    void have;
    if (cands.length) {
      const places: Edit[] = cands.map((e) => ({ t: "place", storeId: e.storeId, pharmacistId: e.pharmacistId, date, source: "pattern", agreed: true }));
      const scratch = must(applyScratch(W, places, "build"));
      const ev = evaluate(scratch, asOf);
      const ok: Edit[] = [];
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i]!;
        const a = Object.values(scratch.assignments).find((x) => x.date === date && x.pharmacistId === c.pharmacistId && x.storeId === c.storeId)!;
        if (ev.assignments[a.id]!.counts) ok.push(places[i]!);
        else report.patternCannotApply.push({ storeId: c.storeId, pharmacistId: c.pharmacistId, date, why: firstFail(ev, a.id)?.detail ?? "Not legal" });
      }
      if (ok.length) apply(ok);
      report.instantiated += ok.length;
    }
    W = must(applyScratch(W, [{ t: "built.set", date }], "build"));
    builtDates.push(date);
  }

  // 2. Remove illegal assignments we are allowed to touch; list the rest.
  for (;;) {
    const ev = evaluate(W, asOf);
    const bad = Object.values(W.assignments)
      .filter((a) => a.date >= range.from && a.date <= range.to && a.date >= asOf && !ev.assignments[a.id]!.counts)
      .sort((a, b) => cmp(a.date, b.date) || b.placedSeq - a.placedSeq || cmp(a.id, b.id));
    const target = bad.find((a) => !a.pinned && !a.partialNote && a.source !== "manual" && a.source !== "emergency");
    if (!target) {
      for (const a of bad) report.conflictsLeft.push({ storeId: a.storeId, pharmacistId: a.pharmacistId, date: a.date, why: firstFail(ev, a.id)?.detail ?? "Not legal" });
      break;
    }
    const why = firstFail(ev, target.id)?.detail ?? "Not legal";
    (target.source === "pattern" ? report.patternCannotApply : []).push({ storeId: target.storeId, pharmacistId: target.pharmacistId, date: target.date, why });
    report.conflictsRemoved.push({ storeId: target.storeId, pharmacistId: target.pharmacistId, date: target.date, why });
    apply([{ t: "remove", assignmentId: target.id }]);
  }
  report.conflictsLeft.sort((a, b) => cmp(a.date, b.date) || cmp(a.storeId, b.storeId) || cmp(a.pharmacistId, b.pharmacistId));

  // 3. Exceptions that created gaps (pattern says someone, live does not, and the cell is short).
  const openCells = (): Gap[] => {
    const ev = evaluate(W, asOf, { range });
    return Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= asOf).map((c) => ({ storeId: c.storeId, date: c.date })).sort((a, b) => cmp(a.date, b.date) || cmp(a.storeId, b.storeId));
  };
  for (const g of openCells()) {
    const exp = expectedOn(W, g.date).filter((e) => e.storeId === g.storeId);
    if (exp.some((e) => !Object.values(W.assignments).some((a) => a.date === g.date && a.storeId === g.storeId && a.pharmacistId === e.pharmacistId))) report.exceptionsCreatedGaps.push(g);
  }

  // 4. Fill gaps jointly until a full pass makes no progress.
  const asBuild = (es: Edit[]): Edit[] => es.map((e) => (e.t === "place" ? { ...e, source: "build" as const } : e));
  // Moves never leave a gap's date, so each date is solved on its own (jointly across that date's gaps) and a date that has no
  // clean answer never gets one later: nothing else changes it.
  const datesWithGaps = [...new Set(openCells().map((g) => g.date))].sort(cmp);
  for (const date of datesWithGaps) {
    for (let guard = 0; guard < 20; guard++) {
      const ev = evaluate(W, asOf, { range: { from: date, to: date } });
      const gs: Gap[] = Object.values(ev.cells).filter((c) => c.open > 0).map((c) => ({ storeId: c.storeId, date })).sort((a, b) => cmp(a.storeId, b.storeId));
      if (!gs.length) break;
      let done = false;
      const joint = searchGaps(W, gs.slice(0, MAX_GROUP), BUILD_SCOPE, asOf, W.config.searchNodeLimit);
      if (joint.clean.length) { apply(asBuild(joint.clean[0]!.edits)); done = true; }
      else if (gs.length > 1) {
        for (const g of gs) {
          const one = searchGaps(W, [g], BUILD_SCOPE, asOf, W.config.searchNodeLimit);
          if (one.clean.length) { apply(asBuild(one.clean[0]!.edits)); done = true; break; }
        }
      }
      if (!done) break;
    }
  }
  report.unresolvedGaps = openCells();

  // Dates marked built are bookkeeping; a build that only marks dates still counts as a change the first time.
  report.edits = edits.length;
  if (!edits.length) return { proposal: null, report };
  const proposal: Proposal = {
    kind: "build", label: "Build", edits, builtDates, stateHash: stateHash(baseState), engineVersion: ENGINE_VERSION,
    explanation: [
      `${report.instantiated} pattern assignment${report.instantiated === 1 ? "" : "s"} placed`,
      `${report.conflictsRemoved.length} illegal assignment${report.conflictsRemoved.length === 1 ? "" : "s"} removed`,
      `${report.unresolvedGaps.length} gap${report.unresolvedGaps.length === 1 ? "" : "s"} left`,
    ],
  };
  return { proposal, report };
}

export function resetToPattern(world: World, range: { from: ISODate; to: ISODate }, storeIds: string[] | null, asOf: ISODate): BuildResult {
  const baseState = world.state;
  let W = clone(baseState);
  const edits: Edit[] = [];
  const report = emptyReport();
  const viol = (s: DomainState) => {
    const ev = evaluate(s, asOf);
    const set = new Set<string>();
    for (const a of Object.values(s.assignments)) for (const r of ev.assignments[a.id]!.results) if (r.verdict === "Fail" && !r.overridden && PRESENCE_RULES.includes(r.ruleId)) set.add(`${a.pharmacistId}|${a.storeId}|${a.date}|${r.ruleId}`);
    return set;
  };
  for (const date of dateRange(range.from, range.to)) {
    if (date < asOf) continue;
    const exp = expectedOn(W, date);
    const conf = patternConflicts(exp);
    for (const e of exp) {
      if (conf.has(e.pharmacistId)) continue;
      if (storeIds && !storeIds.includes(e.storeId)) continue;
      const mine = Object.values(W.assignments).filter((a) => a.date === date && a.pharmacistId === e.pharmacistId);
      if (mine.some((a) => a.storeId === e.storeId)) continue;
      if (mine.some((a) => a.pinned || a.partialNote || a.dontRestore)) continue;
      const edit: Edit = mine.length === 1 ? { t: "move", assignmentId: mine[0]!.id, toStoreId: e.storeId } : mine.length === 0 ? { t: "place", storeId: e.storeId, pharmacistId: e.pharmacistId, date, source: "pattern", agreed: true } : null as never;
      if (mine.length > 1) continue;
      const before = viol(W);
      const next = applyScratch(W, [edit], "build");
      if ("refused" in next) continue;
      const after = viol(next);
      const worse = [...after].filter((k) => !before.has(k));
      if (worse.length) { report.patternCannotApply.push({ storeId: e.storeId, pharmacistId: e.pharmacistId, date, why: "Would break a rule" }); continue; }
      W = next;
      edits.push(edit);
      report.instantiated++;
    }
  }
  report.edits = edits.length;
  if (!edits.length) return { proposal: null, report };
  return {
    proposal: { kind: "reset", label: "Reset to pattern", edits, stateHash: stateHash(baseState), engineVersion: ENGINE_VERSION, explanation: [`${report.instantiated} assignment${report.instantiated === 1 ? "" : "s"} restored to the pattern`] },
    report,
  };
}
