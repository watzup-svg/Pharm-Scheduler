import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { dropName } from "./drag.ts";
import { fixSteps } from "./fix.ts";
import { getCell, setCellValue } from "./grid.ts";
import { dropSameStoreRepeats, placeName, swapCells } from "./place.ts";
import { evaluate } from "./rules.ts";
import type { ScheduleDoc } from "./types.ts";

const demo = createDemo();
// An open weekday with one pharmacist at a store, and the second row empty.
const at = (() => {
  for (const s of demo.stores)
    for (let day = 1; day <= 28; day++) {
      const one = getCell(demo.grid, s.code, "pharmacist", day).trim();
      if (one && !getCell(demo.grid, s.code, "pharmacist2", day).trim() && placeName(demo, s.code, "pharmacist2", day, "").ok) return { store: s.code, day, name: one };
    }
  throw new Error("no single-pharmacist day in the demo");
})();
const rows = (d: ScheduleDoc) => [getCell(d.grid, at.store, "pharmacist", at.day), getCell(d.grid, at.store, "pharmacist2", at.day)];

describe("one person, once per store per day", () => {
  it("the sample month has nobody twice at one store", () => {
    assert.equal(dropSameStoreRepeats(demo).removed.length, 0);
    assert.ok(!fixSteps(demo, evaluate(demo)).some((s) => s.kind === "double" && s.stores.length < 2));
  });

  it("writing the same person into the other row changes nothing", () => {
    const r = placeName(demo, at.store, "pharmacist2", at.day, at.name);
    assert.equal(r.doc, demo);
    assert.deepEqual(rows(r.doc), [at.name, ""]);
  });

  it("two different stores on one day are still allowed, and still flagged", () => {
    const other = demo.stores.find((s) => s.code !== at.store && placeName(demo, s.code, "pharmacist2", at.day, at.name).doc !== demo)!;
    const doc = placeName(demo, other.code, "pharmacist2", at.day, at.name).doc;
    assert.equal(getCell(doc.grid, other.code, "pharmacist2", at.day), at.name);
    assert.ok(fixSteps(doc, evaluate(doc)).some((s) => s.kind === "double" && s.day === at.day && s.names.includes(at.name)));
  });

  it("moving a name to the other row of the same day moves it", () => {
    const from = { store: at.store, slot: "pharmacist" as const, day: at.day };
    const to = { store: at.store, slot: "pharmacist2" as const, day: at.day };
    assert.deepEqual(rows(dropName(demo, to, { name: at.name, from }, false)), ["", at.name]);
  });

  it("swapping the two rows of one day swaps them", () => {
    const other = demo.people.find((p) => p.name !== at.name && placeName(demo, at.store, "pharmacist2", at.day, p.name).doc !== demo)!.name;
    const two = placeName(demo, at.store, "pharmacist2", at.day, other).doc;
    const swapped = swapCells(two, { store: at.store, slot: "pharmacist", day: at.day }, { store: at.store, slot: "pharmacist2", day: at.day });
    assert.deepEqual(rows(swapped), [other, at.name]);
  });

  it("an older file with a repeat keeps the first row and says what it cleared", () => {
    const old = { ...demo, grid: setCellValue(demo.grid, at.store, "pharmacist2", at.day, at.name) };
    const { doc, removed } = dropSameStoreRepeats(old);
    assert.deepEqual(removed, [{ store: at.store, day: at.day, name: at.name }]);
    assert.deepEqual(rows(doc), [at.name, ""]);
    assert.equal(dropSameStoreRepeats(doc).doc, doc);
  });
});
