import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateClosedForPerson,
  enumerateIsoRange,
  formatDateList,
  keepOpenPtoDates,
  normalizeTimeOff,
  personOnPto,
} from "./pto.ts";
import { createSample } from "./sample.ts";

describe("time off dates", () => {
  it("expands a from–to range and formats contiguous days", () => {
    const row = normalizeTimeOff({
      name: "Jane Smith",
      from: "2026-09-14",
      to: "2026-09-15",
      note: "",
    });
    assert.deepEqual(row.dates, ["2026-09-14", "2026-09-15"]);
    assert.equal(formatDateList(row.dates), "Sep 14–Sep 15");
    assert.equal(personOnPto([row], "Jane Smith", "2026-09-14"), true);
    assert.equal(personOnPto([row], "Jane Smith", "2026-09-16"), false);
  });

  it("skips Labor Day and Sundays at Jane’s home store", () => {
    const doc = createSample();
    const { kept, skipped } = keepOpenPtoDates(doc, "Jane Smith", [
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
    ]);
    assert.deepEqual(kept, ["2026-09-08"]);
    assert.ok(skipped.includes("2026-09-06"));
    assert.ok(skipped.includes("2026-09-07"));
    assert.equal(dateClosedForPerson(doc, "Jane Smith", "2026-09-07"), true);
  });

  it("Jane Sep 12–16 keeps the open Saturday, drops Sunday, keeps the weekdays", () => {
    const doc = createSample();
    const { kept, skipped } = keepOpenPtoDates(
      doc,
      "Jane Smith",
      enumerateIsoRange("2026-09-12", "2026-09-16"),
    );
    assert.deepEqual(kept, ["2026-09-12", "2026-09-14", "2026-09-15", "2026-09-16"]);
    assert.deepEqual(skipped, ["2026-09-13"]);
  });
  it("keeps scattered individual days", () => {
    assert.deepEqual(enumerateIsoRange("2026-09-02", "2026-09-02"), ["2026-09-02"]);
    assert.equal(formatDateList(["2026-09-02", "2026-09-09", "2026-09-16"]), "Sep 2, Sep 9, Sep 16");
  });
});
