import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCell } from "./grid.ts";
import { applyPerson, applyStore, removePersonDoc, removeStoreDoc } from "./identity.ts";
import { evaluate, issueKey } from "./rules.ts";
import { createSample } from "./sample.ts";
import { getPatternCell, setPatternCell } from "./stamp.ts";
import type { Grid, Pattern, ScheduleDoc } from "./types.ts";

function namesIn(map: Grid | Pattern, who: string): number {
  let n = 0;
  for (const store of Object.values(map)) {
    for (const row of Object.values(store ?? {})) {
      for (const name of Object.values(row ?? {})) {
        if (name === who) n += 1;
      }
    }
  }
  return n;
}

function withJanePattern(doc: ScheduleDoc): ScheduleDoc {
  return {
    ...doc,
    pattern: setPatternCell(doc.pattern, "EST", "pharmacist", 1, "Jane Smith"),
    dayNotes: { EST: { "1": "flu clinic" } },
    holidays: [
      ...doc.holidays,
      { date: "2026-09-10", store: "EST", label: "Inventory", repeat: false },
    ],
  };
}

describe("identity", () => {
  it("delete Susan strips the grid and pattern", () => {
    const seeded = withJanePattern(createSample());
    seeded.pattern = setPatternCell(seeded.pattern, "EST", "pharmacist2", 1, "Susan Brown");
    assert.ok(namesIn(seeded.grid, "Susan Brown") > 0);
    const next = removePersonDoc(seeded, "Susan Brown");
    assert.equal(next.people.some((p) => p.name === "Susan Brown"), false);
    assert.equal(next.timeOff.some((t) => t.name === "Susan Brown"), false);
    assert.equal(namesIn(next.grid, "Susan Brown"), 0);
    assert.equal(namesIn(next.pattern, "Susan Brown"), 0);
    assert.equal(getCell(next.grid, "EST", "pharmacist2", 14), "");
    assert.equal(evaluate(next).byKey[issueKey("EST", 20)]?.leftover, false);
    assert.equal(getCell(next.grid, "EST", "pharmacist", 1), "Jane Smith");
  });

  it("rename Jane updates grid, pattern, and time-off", () => {
    const doc = withJanePattern(createSample());
    const jane = doc.people.find((p) => p.name === "Jane Smith");
    assert.ok(jane);
    const next = applyPerson(doc, "Jane Smith", { ...jane, name: "Jane Watzig" });
    assert.equal(next.people.some((p) => p.name === "Jane Smith"), false);
    assert.equal(next.people.some((p) => p.name === "Jane Watzig"), true);
    assert.equal(getCell(next.grid, "EST", "pharmacist", 1), "Jane Watzig");
    assert.equal(getCell(next.grid, "MOL", "pharmacist2", 4), "Jane Watzig");
    assert.equal(namesIn(next.grid, "Jane Smith"), 0);
    assert.equal(getPatternCell(next.pattern, "EST", "pharmacist", 1), "Jane Watzig");
    assert.equal(next.timeOff.some((t) => t.name === "Jane Watzig"), true);
    assert.equal(next.timeOff.some((t) => t.name === "Jane Smith"), false);
    assert.equal(evaluate(next).doubles, 1);
  });

  it("recode EST moves grid, pattern, homes, holidays, and dayNotes", () => {
    const doc = withJanePattern(createSample());
    const est = doc.stores.find((s) => s.code === "EST");
    assert.ok(est);
    const next = applyStore(doc, "EST", { ...est, code: "ESTA" });
    assert.equal(next.stores.some((s) => s.code === "EST"), false);
    assert.equal(next.stores.some((s) => s.code === "ESTA"), true);
    assert.ok(next.grid.ESTA);
    assert.equal(next.grid.EST, undefined);
    assert.equal(getCell(next.grid, "ESTA", "pharmacist", 1), "Jane Smith");
    assert.equal(getCell(next.grid, "ESTA", "pharmacist2", 14), "Susan Brown");
    assert.equal(getPatternCell(next.pattern, "ESTA", "pharmacist", 1), "Jane Smith");
    assert.equal(next.pattern.EST, undefined);
    assert.equal(next.dayNotes.ESTA?.["1"], "flu clinic");
    assert.equal(next.dayNotes.EST, undefined);
    assert.equal(next.people.find((p) => p.name === "Jane Smith")?.home, "ESTA");
    assert.equal(next.people.find((p) => p.name === "Susan Brown")?.home, "ESTA");
    assert.ok(next.holidays.some((h) => h.store === "ESTA" && h.label === "Inventory"));
    assert.equal(next.holidays.some((h) => h.store === "EST"), false);
    assert.ok(next.holidays.some((h) => h.store === "ALL"));
    assert.equal(evaluate(next).byKey[issueKey("ESTA", 20)]?.leftover, false);
  });

  it("remove store drops pattern and dayNotes for that code", () => {
    const doc = withJanePattern(createSample());
    const next = removeStoreDoc(doc, "EST");
    assert.equal(next.grid.EST, undefined);
    assert.equal(next.pattern.EST, undefined);
    assert.equal(next.dayNotes.EST, undefined);
    assert.equal(next.people.find((p) => p.name === "Jane Smith")?.home, "—");
    assert.equal(next.holidays.some((h) => h.store === "EST"), false);
    assert.ok(next.holidays.some((h) => h.store === "ALL"));
  });
});

describe("accepted problems follow renames", () => {
  it("re-keys a store accept and a person accept", () => {
    const base = createSample();
    const doc: ScheduleDoc = {
      ...base,
      accepted: [
        { key: "hole|EST|14", at: "2026-09-01T00:00:00Z" },
        { key: "double|Jane Smith|9", at: "2026-09-01T00:00:00Z" },
      ],
    };
    const store = doc.stores.find((s) => s.code === "EST")!;
    const a = applyStore(doc, "EST", { ...store, code: "EST2" });
    assert.ok(a.accepted?.some((x) => x.key === "hole|EST2|14"));
    assert.ok(!a.accepted?.some((x) => x.key.includes("|EST|")));
    const person = doc.people.find((p) => p.name === "Jane Smith")!;
    const b = applyPerson(doc, "Jane Smith", { ...person, name: "Jane Doe" });
    assert.ok(b.accepted?.some((x) => x.key === "double|Jane Doe|9"));
  });
});
