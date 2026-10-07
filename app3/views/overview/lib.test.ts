// node --experimental-strip-types --test app3/views/overview/lib.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, groupProblems, markCounts, monthBounds, nextMonthCard, nextMonthOf, nextProblems, overviewMonth, prevMonthOf, tickState, type ChecklistFacts } from "./lib.ts";

test("month helpers", () => {
  assert.deepEqual(monthBounds("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthBounds("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(nextMonthOf("2026-12"), "2027-01");
  assert.equal(prevMonthOf("2027-01"), "2026-12");
  assert.equal(overviewMonth("2026-10-06", { from: "2026-10-01", to: "2026-10-31" }), "2026-10");
  assert.equal(overviewMonth("2026-10-06", { from: "2026-11-01", to: "2026-11-30" }), "2026-11");
});

test("start next month: shown past mid-month or when next month is empty, leads only when both", () => {
  assert.deepEqual(nextMonthCard("2026-10-06", "2026-10", 40), { show: false, lead: false });
  assert.deepEqual(nextMonthCard("2026-10-06", "2026-10", 0), { show: true, lead: false });
  assert.deepEqual(nextMonthCard("2026-10-15", "2026-10", 40), { show: true, lead: false });
  assert.deepEqual(nextMonthCard("2026-10-20", "2026-10", 0), { show: true, lead: true });
});

test("tick states: a broken rule outranks an open shift; nobody needed and nobody placed is closed", () => {
  assert.equal(tickState(undefined), "closed");
  assert.equal(tickState({ required: 0, open: 0, hasAssignments: false, breaks: false }), "closed");
  assert.equal(tickState({ required: 0, open: 0, hasAssignments: true, breaks: true }), "break");
  assert.equal(tickState({ required: 2, open: 1, hasAssignments: true, breaks: false }), "open");
  assert.equal(tickState({ required: 2, open: 1, hasAssignments: true, breaks: true }), "break");
  assert.equal(tickState({ required: 1, open: 0, hasAssignments: true, breaks: false }), "ok");
});

const issues = [
  { kind: "open" as const, storeId: "S1", date: "2026-10-07", text: "A needs 1 more" },
  { kind: "violation" as const, storeId: "S2", date: "2026-10-08", pharmacistId: "P1", ruleId: "double-booking", text: "P1 at B" },
  { kind: "violation" as const, storeId: "S3", date: "2026-10-08", pharmacistId: "P1", ruleId: "double-booking", text: "P1 at C" },
  { kind: "warning" as const, storeId: "S1", date: "2026-10-09", pharmacistId: "P2", ruleId: "travel-soft", text: "long drive" },
  { kind: "open" as const, storeId: "S1", date: "2026-10-12", text: "A needs 2 more" },
];

test("one person at two stores is one problem that marks two cells", () => {
  const ps = groupProblems(issues);
  assert.equal(ps.length, 3);
  assert.deepEqual(ps[1]!.storeIds, ["S2", "S3"]);
  const m = markCounts(ps, (p) => (p.kind === "open" ? "open" : "double"));
  assert.deepEqual(m.byKind["open"], { problems: 2, cells: 2 });
  assert.deepEqual(m.byKind["double"], { problems: 1, cells: 2 });
  assert.equal(m.problems, 3);
  assert.equal(m.cells, 4);
});

test("next problems are the first n on or after the date", () => {
  const ps = groupProblems(issues);
  assert.deepEqual(nextProblems(ps, "2026-10-08", 5).map((p) => p.date), ["2026-10-08", "2026-10-12"]);
  assert.equal(nextProblems(ps, "2026-10-01", 2).length, 2);
});

const base: ChecklistFacts = { licencesMissing: 0, driveTimesMissing: 0, waiting: 0, openShifts: 0, ruleBreaks: 0, firstProblem: null, postedRevision: 2, changedDays: 0, fileSaved: true, fileDetail: "Saved" };
test("checklist ticks from the facts", () => {
  assert.ok(buildChecklist(base).every((i) => i.done));
  const bad = buildChecklist({ ...base, licencesMissing: 1, driveTimesMissing: 2, waiting: 3, openShifts: 4, ruleBreaks: 5, firstProblem: { storeId: "S1", date: "2026-10-07" }, postedRevision: null, fileSaved: false, fileDetail: "Not saved to a file yet" });
  assert.ok(bad.every((i) => !i.done));
  assert.equal(bad[0]!.detail, "1 licence missing, 2 drive times missing");
  assert.equal(bad[4]!.detail, "Not posted yet");
  assert.deepEqual(bad[2]!.where, { to: "problem", storeId: "S1", date: "2026-10-07" });
  const changed = buildChecklist({ ...base, changedDays: 3 });
  assert.equal(changed[4]!.done, false);
  assert.equal(changed[4]!.detail, "Changed since posting: 3 days");
  assert.deepEqual(changed[4]!.where, { to: "print" });
});
