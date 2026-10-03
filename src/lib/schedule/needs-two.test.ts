import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acceptKeys, openProblemKeys, pruneAccepted } from "./accept.ts";
import { fixSteps } from "./fix.ts";
import { parseDoc, serializeDoc } from "./file.ts";
import { applyStore, removeStoreDoc } from "./identity.ts";
import { dayRange, isMarkedTwo, sameWeekdayDays, setNeedsTwo } from "./needs-two.ts";
import { evaluate, issueKey, secondKey } from "./rules.ts";
import { createSample } from "./sample.ts";
import { PROBLEM_KINDS, PROBLEM_NAME } from "./problem-kinds.ts";
import { RPH_SLOTS } from "./slots.ts";
import { getCell, setCellValue } from "./grid.ts";
import type { ScheduleDoc } from "./types.ts";

/** An open store-day with exactly one pharmacist, a day with two, and one with none. */
function pick(doc: ScheduleDoc) {
  const ev = evaluate(doc);
  const count = (store: string, day: number) => RPH_SLOTS.filter((s) => getCell(doc.grid, store, s, day).trim()).length;
  const open = ev.issues.filter((i) => i.open);
  const one = open.find((i) => count(i.store, i.day) === 1)!;
  const none = open.find((i) => count(i.store, i.day) === 0);
  return { one, none };
}

describe("needs two pharmacists", () => {
  const base = createSample();

  it("nothing is marked in a file that never used it, and nothing changes", () => {
    const ev = evaluate(base);
    assert.equal(ev.seconds, 0);
    assert.equal(ev.issues.some((i) => i.second || i.marked), false);
  });

  it("a marked day with one pharmacist is its own problem, and blocks printing", () => {
    const { one } = pick(base);
    const doc = setNeedsTwo(base, one.store, [one.day], true);
    const ev = evaluate(doc);
    const i = ev.byKey[issueKey(one.store, one.day)]!;
    assert.equal(i.second, true);
    assert.equal(i.hole, false);
    assert.equal(ev.seconds, 1);
    assert.equal(ev.holes, evaluate(base).holes);
    assert.match(i.why, /two pharmacists/);
    const steps = fixSteps(doc, ev);
    const step = steps.find((s) => s.kind === "second")!;
    assert.ok(step);
    assert.match(step.headline, /needs two pharmacists/);
    assert.ok(!getCell(doc.grid, step.store, step.slot, step.day).trim(), "points at the empty pharmacist row");
  });

  it("a second pharmacist clears it; nobody is placed for her", () => {
    const { one } = pick(base);
    const doc = setNeedsTwo(base, one.store, [one.day], true);
    const grid = JSON.stringify(doc.grid);
    evaluate(doc);
    assert.equal(JSON.stringify(doc.grid), grid);
    const extra = { name: "Pat Extra", role: "Pharmacist" as const, home: one.store, lead: false, phone: "", color: "" };
    const free = extra;
    doc.people = [...doc.people, extra];
    const two = { ...doc, grid: setCellValue(doc.grid, one.store, "pharmacist2", one.day, free.name) };
    assert.equal(evaluate(two).byKey[issueKey(one.store, one.day)]!.second, false);
  });

  it("a marked day with nobody is the normal hole, not this problem", () => {
    const { none } = pick(base);
    if (!none) return;
    const doc = setNeedsTwo(base, none.store, [none.day], true);
    const i = evaluate(doc).byKey[issueKey(none.store, none.day)]!;
    assert.equal(i.hole, true);
    assert.equal(i.second, false);
  });

  it("can be left as is, and the accept follows the problem", () => {
    const { one } = pick(base);
    let doc = setNeedsTwo(base, one.store, [one.day], true);
    assert.ok(openProblemKeys(doc).includes(secondKey(one.store, one.day)));
    doc = acceptKeys(doc, [secondKey(one.store, one.day)]);
    const ev = evaluate(doc);
    assert.equal(ev.seconds, 0);
    assert.equal(ev.byKey[issueKey(one.store, one.day)]!.secondAccepted, true);
    assert.equal(ev.accepted, evaluate(base).accepted + 1);
    // Unmarking drops the accept.
    const cleared = pruneAccepted(setNeedsTwo(doc, one.store, [one.day], false));
    assert.equal(cleared.accepted, undefined);
  });

  it("is listed as a problem kind with its own name", () => {
    assert.ok(PROBLEM_KINDS.includes("second"));
    assert.equal(PROBLEM_NAME.second, "Needs a second");
    assert.notEqual(PROBLEM_NAME.second, PROBLEM_NAME.hole);
  });

  it("closed days are never marked; the weekday and range helpers cover the month", () => {
    const sun = sameWeekdayDays(base, 1);
    assert.ok(sun.length >= 4);
    assert.deepEqual(dayRange(5, 3), [3, 4, 5]);
    const closed = base.stores[0]!;
    const sundays = sameWeekdayDays(base, [...Array(28).keys()].map((d) => d + 1).find((d) => new Date(base.year, base.month - 1, d).getDay() === 0)!);
    const marked = setNeedsTwo(base, closed.code, sundays, true);
    if (!closed.sunOpen) assert.equal(marked.needsTwo, undefined);
  });

  it("the weekday reminder gives way to a marked day: one signal per store-day", () => {
    const store = base.stores[0]!.code;
    const { one } = pick(base);
    const doc = { ...base, stores: base.stores.map((s) => (s.code === one.store ? { ...s, twoPharmacistDays: [0, 1, 2, 3, 4, 5, 6] } : s)) };
    assert.equal(evaluate(doc).byKey[issueKey(one.store, one.day)]!.needsSecond, true);
    const marked = setNeedsTwo(doc, one.store, [one.day], true);
    const i = evaluate(marked).byKey[issueKey(one.store, one.day)]!;
    assert.equal(i.needsSecond, false);
    assert.equal(i.second, true);
    void store;
  });

  it("saves, opens again, and an old file without it opens as before", () => {
    const { one } = pick(base);
    const doc = setNeedsTwo(base, one.store, [one.day], true);
    const text = serializeDoc(doc);
    const back = parseDoc(text);
    assert.deepEqual(back.needsTwo, { [one.store]: [one.day] });
    assert.equal(serializeDoc(parseDoc(serializeDoc(back))), serializeDoc(back));
    assert.equal(parseDoc(serializeDoc(base)).needsTwo, undefined);
    assert.equal(isMarkedTwo(back, one.store, one.day), true);
    // Unknown stores and repeats in a hand-edited file are dropped.
    const edited = JSON.parse(text);
    edited.needsTwo = { [one.store]: [one.day, one.day], NOPE: [3] };
    assert.deepEqual(parseDoc(JSON.stringify(edited)).needsTwo, { [one.store]: [one.day] });
  });

  it("follows a renamed store and goes with a removed one", () => {
    const { one } = pick(base);
    const doc = setNeedsTwo(base, one.store, [one.day], true);
    const store = doc.stores.find((s) => s.code === one.store)!;
    const renamed = applyStore(doc, one.store, { ...store, code: "ZZZ" });
    assert.deepEqual(renamed.needsTwo, { ZZZ: [one.day] });
    assert.equal(removeStoreDoc(doc, one.store).needsTwo, undefined);
  });
});
