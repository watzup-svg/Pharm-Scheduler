// Suggestions in words: the sentence and costs come from the same Choice the button uses, and the edits really fix the gap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyScratch, bestSuggestion, choicesFor, evaluate, seedWorld, suggestionFor } from "../src/index.ts";

const TODAY = "2026-10-06";
const D = "2026-10-07";

/** S1 and S2 each need one. Ann (S1) is off on the 7th, Bo works S2, Cy is free. */
function small() {
  return seedWorld({
    stores: [{ id: "S1", code: "AAA", req: 1 }, { id: "S2", code: "BBB", req: 1 }],
    pharmacists: [{ id: "P1", name: "Ann A", base: "S1" }, { id: "P2", name: "Bo B", base: "S2" }, { id: "P3", name: "Cy C", base: "S2" }],
    assignments: [{ store: "S1", ph: "P1", date: D }, { store: "S2", ph: "P2", date: D }],
    unavailability: [{ ph: "P1", first: D, last: D, status: "Approved" }],
    travel: [["S2", "S1", 20, 10]],
  }).state;
}

test("a free person is a clean suggestion and fixes the gap", () => {
  const s = small();
  const best = bestSuggestion(s, "S1", D, TODAY)!;
  assert.equal(best.choice.pharmacistId, "P3");
  assert.equal(best.sentence, "Cy C is free that day and works AAA.");
  assert.equal(best.detail, "Free that day.");
  assert.equal(best.clean, true);
  const next = applyScratch(s, best.edits);
  assert.ok(!("refused" in next));
  if (!("refused" in next)) assert.equal(evaluate(next, TODAY, { range: { from: D, to: D } }).cells[`S1|${D}`]!.open, 0);
});

test("moving someone who is the only one elsewhere says so and costs a short store", () => {
  const s = small();
  const bo = choicesFor(s, "S1", D, TODAY).find((c) => c.pharmacistId === "P2")!;
  const sg = suggestionFor(s, bo, "S1", D);
  assert.equal(sg.sentence, "Bo B moves from BBB to AAA, leaving BBB short.");
  assert.deepEqual(sg.costs.map((c) => c.kind), ["short", "drive"].filter((k) => sg.costs.some((c) => c.kind === k)));
  assert.ok(sg.costs.some((c) => c.kind === "short" && c.text === "leaves BBB short"));
  assert.equal(sg.detail, "Moves from BBB; leaving BBB short.");
  assert.equal(sg.clean, false);
  assert.deepEqual(sg.edits, [{ t: "move", assignmentId: bo.assignmentId, toStoreId: "S1" }]);
});

test("a swap starts with the removal and names who is replaced", () => {
  const s = small();
  const ann = Object.values(s.assignments).find((a) => a.pharmacistId === "P1")!;
  const cy = choicesFor(s, "S1", D, TODAY).find((c) => c.pharmacistId === "P3")!;
  const sg = suggestionFor(s, cy, "S1", D, ann);
  assert.equal(sg.sentence, "Cy C takes Ann A's place at AAA.");
  assert.equal(sg.detail, "Takes Ann A's place.");
  assert.deepEqual(sg.edits, [{ t: "swap", assignmentId: ann.id, toPharmacistId: "P3" }]);
});
