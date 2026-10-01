import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collapsedSlots, visibleSlots } from "./coverage.ts";
import { personDayCell, timeOffJump } from "./jump.ts";
import { createSample } from "./sample.ts";

describe("visible slots", () => {
  it("shows Pharmacist and a used Pharmacist 2, and nothing else", () => {
    const doc = createSample();
    const ids = visibleSlots(doc, "EST").map((s) => s.id);
    assert.deepEqual(ids, ["pharmacist", "pharmacist2"]);
    assert.deepEqual(collapsedSlots(doc, "EST").map((s) => s.id), []);
    assert.deepEqual(visibleSlots(doc, "WL").map((s) => s.id), ["pharmacist"]);
  });

  it("keeps Pharmacist even when the month has no RPh names", () => {
    const doc = createSample();
    const empty = {
      ...doc,
      grid: { ...doc.grid, EST: { ...doc.grid.EST, pharmacist: {}, pharmacist2: {} } },
    };
    const ids = visibleSlots(empty, "EST").map((s) => s.id);
    assert.ok(ids.includes("pharmacist"));
    assert.ok(!ids.includes("pharmacist2"));
  });

  it("does not show technician or cashier rows", () => {
    const doc = createSample();
    const ids = visibleSlots(doc, "EST", [], ["RPh"]).map((s) => s.id);
    assert.deepEqual(ids, ["pharmacist", "pharmacist2"]);
    assert.deepEqual(visibleSlots(doc, "EST", [], ["Tech", "Cash"]).map((s) => s.id), []);
  });

  it("reveals Pharmacist 2 on a store that has not used it", () => {
    const doc = createSample();
    const ids = visibleSlots(doc, "WL", ["pharmacist2"]).map((s) => s.id);
    assert.deepEqual(ids, ["pharmacist", "pharmacist2"]);
  });
});

describe("time off jump", () => {
  it("lands unplaced Jane on home-store Pharmacist the first PTO day", () => {
    const doc = createSample();
    const ref = timeOffJump(doc, "Jane Smith", ["2026-09-14", "2026-09-15"]);
    assert.equal(ref.store, "EST");
    assert.equal(ref.slot, "pharmacist");
    assert.equal(ref.day, 14);
  });
});

describe("person day jump", () => {
  it("lands Susan on Pharmacist 2, not the empty Pharmacist cell", () => {
    const doc = createSample();
    const ref = personDayCell(doc, "Susan Brown", 14);
    assert.equal(ref.store, "EST");
    assert.equal(ref.slot, "pharmacist2");
    assert.equal(ref.day, 14);
  });
});
