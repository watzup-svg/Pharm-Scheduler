import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { fixSteps } from "./fix.ts";
import { setCellValue } from "./grid.ts";
import { anchorOf, currentIssue, issueOrder, issueTitle, nextAfter, ordinal, stepFrom, stepKey } from "./issue-cursor.ts";
import { evaluate } from "./rules.ts";
import { serializeDoc } from "./file.ts";

const doc = createDemo();
const steps = fixSteps(doc, evaluate(doc));
const ordered = issueOrder(doc, steps);

describe("issue order", () => {
  it("keeps every issue and walks them by date", () => {
    assert.equal(ordered.length, steps.length);
    assert.equal(new Set(ordered.map(stepKey)).size, steps.length);
    for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i - 1]!.day <= ordered[i]!.day);
    assert.equal(ordered[0]!.day, 9);
  });

  it("puts same-day issues in store-list order", () => {
    const rank = (c: string) => doc.stores.findIndex((s) => s.code === c);
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1]!;
      const b = ordered[i]!;
      if (a.day === b.day) assert.ok(rank(a.store) <= rank(b.store));
    }
  });
});

describe("issue cursor", () => {
  it("starts at the first issue going forward and the last going back", () => {
    assert.equal(stepFrom(doc, ordered, null, 1), ordered[0]);
    assert.equal(stepFrom(doc, ordered, null, -1), ordered[ordered.length - 1]);
  });

  it("wraps at both ends", () => {
    const last = anchorOf(ordered[ordered.length - 1]!);
    assert.equal(stepFrom(doc, ordered, last, 1), ordered[0]);
    assert.equal(stepFrom(doc, ordered, anchorOf(ordered[0]!), -1), ordered[ordered.length - 1]);
  });

  it("stepping forward through the month visits every issue once", () => {
    let at = anchorOf(ordered[0]!);
    const seen = new Set([at.key]);
    for (let i = 1; i < ordered.length; i++) {
      at = anchorOf(stepFrom(doc, ordered, at, 1)!);
      seen.add(at.key);
    }
    assert.equal(seen.size, ordered.length);
  });

  it("never changes the schedule", () => {
    const before = serializeDoc(doc);
    let at = null as ReturnType<typeof anchorOf> | null;
    for (let i = 0; i < ordered.length * 2; i++) at = anchorOf(stepFrom(doc, ordered, at, i % 3 ? 1 : -1)!);
    currentIssue(doc, ordered, at);
    issueTitle(doc, ordered[0]!);
    assert.equal(serializeDoc(doc), before);
  });

  it("lands on the next issue after the current one is fixed", () => {
    const hole = ordered.find((s) => s.kind === "hole")!;
    const i = ordered.indexOf(hole);
    const anchor = anchorOf(hole);
    const fixedDoc = { ...doc, grid: setCellValue(doc.grid, hole.store, "pharmacist", hole.day, "Relief Pharmacist") };
    const after = issueOrder(fixedDoc, fixSteps(fixedDoc, evaluate(fixedDoc)));
    assert.ok(!after.some((s) => stepKey(s) === anchor.key));
    assert.equal(stepKey(currentIssue(fixedDoc, after, anchor)!), stepKey(ordered[i + 1]!));
    assert.equal(stepKey(stepFrom(fixedDoc, after, anchor, 1)!), stepKey(ordered[i + 1]!));
    assert.equal(stepKey(stepFrom(fixedDoc, after, anchor, -1)!), stepKey(ordered[i - 1]!));
    assert.equal(stepKey(nextAfter(fixedDoc, after, hole.day, hole.store)!), stepKey(ordered[i + 1]!));
  });

  it("keeps its place when an unrelated cell changes", () => {
    const target = ordered[3]!;
    const otherDoc = { ...doc, dayNotes: { ...doc.dayNotes, [target.store]: { "1": "note" } } };
    const again = issueOrder(otherDoc, fixSteps(otherDoc, evaluate(otherDoc)));
    assert.equal(stepKey(currentIssue(otherDoc, again, anchorOf(target))!), stepKey(target));
  });

  it("has nothing to stand on when there are no issues", () => {
    assert.equal(stepFrom(doc, [], null, 1), null);
    assert.equal(currentIssue(doc, [], anchorOf(ordered[0]!)), null);
    assert.equal(nextAfter(doc, [], 1, "CAT"), null);
  });
});

describe("issue titles", () => {
  const title = (kind: string) => issueTitle(doc, ordered.find((s) => s.kind === kind)!);

  it("names the store for no coverage and closed-day names", () => {
    assert.equal(title("hole"), "No coverage · Waldport · Wed Oct 14");
    assert.equal(title("leftover"), "Name on a closed day · Cathlamet · Sat Oct 10");
  });

  it("names the person for two places and licences", () => {
    assert.equal(title("double"), "Two places · Gideon Ashcroft · Fri Oct 9");
    assert.equal(title("license"), "Not licensed · Fenn Ritter · Tue Oct 13");
  });

  it("uses the short name form only when the full title is long", () => {
    const step = { ...ordered.find((s) => s.kind === "license")!, names: ["Bartholomew Featherstonehaugh"] };
    assert.equal(issueTitle(doc, step, (n) => `${n[0]}. ${n.split(" ").slice(1).join(" ")}`), "Not licensed · B. Featherstonehaugh · Tue Oct 13");
  });
});

describe("ordinal", () => {
  it("reads the way a date is said", () => {
    assert.deepEqual([1, 2, 3, 4, 6, 11, 12, 13, 21, 22, 23, 31].map(ordinal), ["1st", "2nd", "3rd", "4th", "6th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
  });
});
