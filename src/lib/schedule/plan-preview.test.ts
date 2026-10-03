import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverPlans } from "./cover-plan.ts";
import { createDemo } from "./demo.ts";
import { setCellValue } from "./grid.ts";
import { previewPlan } from "./plan-preview.ts";
import { evaluate } from "./rules.ts";
import { blankMonthWithStores } from "./stores.ts";
import type { Person, ScheduleDoc } from "./types.ts";

const DAY = 14;
const person = (name: string, home: string): Person => ({ name, role: "Pharmacist", home, lead: false, phone: "", color: "#888888" });
function scenario(bare: string[], extra: { p: Person; at?: string }[] = []): ScheduleDoc {
  let doc: ScheduleDoc = { ...blankMonthWithStores(createDemo()), people: [] };
  for (const s of doc.stores) {
    if (bare.includes(s.code)) continue;
    const p = person(`Local ${s.code}`, s.code);
    doc = { ...doc, people: [...doc.people, p], grid: setCellValue(doc.grid, s.code, "pharmacist", DAY, p.name) };
  }
  for (const { p, at } of extra) {
    doc = { ...doc, people: [...doc.people, p] };
    if (at) doc = { ...doc, grid: setCellValue(doc.grid, at, "pharmacist2", DAY, p.name) };
  }
  return doc;
}

describe("plan preview (dry run)", () => {
  it("counts holes before and after and never touches the real schedule", () => {
    const doc = scenario(["EST"], [{ p: person("Eli", "EST") }]);
    const snap = JSON.stringify(doc);
    const plan = coverPlans(doc, "EST", DAY).plans[0]!;
    const pv = previewPlan(doc, plan, DAY);
    assert.ok(pv.ok);
    assert.equal(pv.holes[0], evaluate(doc).holes);
    assert.equal(pv.holes[1], pv.holes[0] - 1);
    assert.deepEqual(pv.opened, []);
    assert.equal(JSON.stringify(doc), snap);
  });

  it("names the store a plan leaves empty, and a two-pharmacist day it leaves short", () => {
    const base = scenario(["EST"]);
    const doc = { ...base, stores: base.stores.map((s) => (s.code === "MOL" ? { ...s, twoPharmacistDays: [3] } : s)) }; // Wednesday
    const plan = coverPlans(doc, "EST", DAY, 8).plans.find((p) => p.opens.includes("MOL"));
    assert.ok(plan, "a plan that leaves Molalla bare is offered");
    const pv = previewPlan(doc, plan!, DAY);
    assert.ok(pv.ok);
    assert.deepEqual(pv.opened, [{ store: "MOL", day: DAY }]);
    assert.equal(pv.holes[1], pv.holes[0], "one hole filled, one opened");
  });

  it("says why when the copy refuses", () => {
    const doc = scenario(["EST"]);
    const bad = previewPlan(doc, { moves: [{ name: "Nobody Here", float: false, from: null, origin: null, to: "EST", minutes: 10, miles: 1, estimated: false, mileage: { paidMiles: 0, dollars: 0 } as never, extra: { paidMiles: 0, dollars: 0 }, fillsTarget: true }], opens: [] }, DAY);
    assert.equal(bad.ok, false);
    assert.ok(bad.problem);
  });
});
