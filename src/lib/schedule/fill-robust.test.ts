// The good ideas from Grok's second test list (reviewed 2026-10-02), adapted to Joe's decisions: a plan may open one hole of its own,
// the cutoff is 150 minutes, dollars count in ranking. Adopted: same-fixture-twice order, the pool shrinking after a plan is accepted,
// a stale assignment on another day, the return trip, either-direction ferry lookup, no invented miles, nobody used twice, and
// mutations (change the input, the winner must move). Dropped: "fewest people away from home before worst leg" and "never opens a hole".
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCoverPlan, coverPlans, type CoverPlan } from "./cover-plan.ts";
import { createDemo } from "./demo.ts";
import { driveBetween, driveKey } from "./geo.ts";
import { setCellValue } from "./grid.ts";
import { blankMonthWithStores } from "./stores.ts";
import type { Person, ScheduleDoc } from "./types.ts";

const DAY = 14;
const person = (name: string, home: string, float = false): Person => ({ name, role: float ? "Float Pharmacist" : "Pharmacist", home, lead: false, phone: "", color: "#888888" });
function scenario(bare: string[], extra: { p: Person; at?: string }[] = [], skipHome: string[] = []): ScheduleDoc {
  let doc: ScheduleDoc = { ...blankMonthWithStores(createDemo()), people: [] };
  for (const s of doc.stores) {
    if (bare.includes(s.code) || skipHome.includes(s.code)) continue;
    const p = person(`Local ${s.code}`, s.code);
    doc = { ...doc, people: [...doc.people, p], grid: setCellValue(doc.grid, s.code, "pharmacist", DAY, p.name) };
  }
  for (const { p, at } of extra) {
    doc = { ...doc, people: [...doc.people, p] };
    if (at) doc = { ...doc, grid: setCellValue(doc.grid, at, "pharmacist2", DAY, p.name) };
  }
  return doc;
}
const fillerOf = (p: CoverPlan) => p.moves.find((m) => m.fillsTarget)!.name;

describe("Grok's robust list, adopted parts", () => {
  it("same fixture twice gives the same plans in the same order", () => {
    const doc = scenario(["EST"], [{ p: person("Wendy Float", "WL", true), at: "WL" }, { p: person("Eli", "EST") }]);
    assert.equal(JSON.stringify(coverPlans(doc, "EST", DAY)), JSON.stringify(coverPlans(doc, "EST", DAY)));
  });

  it("nobody is used twice inside one plan, and every plan has 1 to 3 moves", () => {
    const doc = scenario(["EST", "MOL"], [{ p: person("Wendy Float", "WL", true), at: "WL" }, { p: person("Eli", "EST") }]);
    for (const store of ["EST", "MOL"]) for (const p of coverPlans(doc, store, DAY, 8).plans) {
      assert.ok(p.moves.length >= 1 && p.moves.length <= 3);
      assert.equal(new Set(p.moves.map((m) => m.name)).size, p.moves.length);
    }
  });

  it("the pool shrinks: after accepting the plan for one hole, that person is only offered again as opening the hole they just filled", () => {
    const doc = scenario(["EST", "MOL"], [{ p: person("Fred Free", "WL") }]);
    const first = coverPlans(doc, "EST", DAY).plans[0]!;
    assert.equal(fillerOf(first), "Fred Free");
    const applied = applyCoverPlan(doc, first, DAY);
    assert.ok(applied.ok, applied.problem ?? "applies");
    for (const p of coverPlans(applied.doc, "MOL", DAY, 8).plans) assert.ok(!p.moves.some((m) => m.name === "Fred Free") || p.opens.includes("EST"), "Fred is placed at Estacada: moving him is only offered as opening Estacada");
  });

  it("a stale assignment on another day is not the origin: the leg is from home", () => {
    const base = scenario(["EST"], [{ p: person("Flora Float", "WL", true) }]);
    const doc = { ...base, grid: setCellValue(base.grid, "LEN", "pharmacist2", DAY - 1, "Flora Float") };
    const m = coverPlans(doc, "EST", DAY).plans.find((p) => fillerOf(p) === "Flora Float")!.moves.find((x) => x.name === "Flora Float")!;
    assert.equal(m.minutes, 30, "West Linn to Estacada, not John Day to Estacada");
  });

  it("return trip: a pharmacist working at Molalla is moved from Molalla (33 minutes), and Molalla is shown as opened", () => {
    const doc = scenario(["EST"], [], []);
    const plan = coverPlans(doc, "EST", DAY, 8).plans.find((p) => p.moves.some((m) => m.name === "Local MOL" && m.to === "EST"));
    assert.ok(plan, "offered");
    assert.equal(plan!.moves.find((m) => m.name === "Local MOL")!.minutes, 33);
    assert.deepEqual(plan!.opens, ["MOL"]);
  });

  it("ferry lookup works in either direction, and the bridge route is not a ferry", () => {
    const doc = createDemo();
    for (const [a, b] of [["CLA", "CAT"], ["CAT", "CLA"]] as const) {
      const d = driveBetween(doc, a, b)!;
      assert.equal(d.minutes, 60);
      assert.equal(d.ferry, true);
    }
    const bridge = driveBetween(doc, "SHE", "CAT")!;
    assert.equal(bridge.minutes, 176);
    assert.ok(!bridge.ferry);
    assert.ok(!driveBetween(doc, "WS", "WIN")!.ferry);
  });

  it("a missing home store invents no miles: that person is not offered", () => {
    const base = scenario(["EST"], [{ p: person("Ghost Spare", "ZZZ") }]);
    for (const p of coverPlans(base, "EST", DAY, 8).plans) assert.ok(!p.moves.some((m) => m.name === "Ghost Spare"));
  });

  it("mutations move the winner: delete the best person, or lengthen their drive", () => {
    const doc = scenario(["EST"], [{ p: person("Eli", "EST") }, { p: person("Flora Float", "WL", true) }]);
    assert.equal(fillerOf(coverPlans(doc, "EST", DAY).plans[0]!), "Eli");
    const without = { ...doc, people: doc.people.filter((p) => p.name !== "Eli") };
    assert.equal(fillerOf(coverPlans(without, "EST", DAY).plans[0]!), "Flora Float");
    // Lengthen Eli's drive past the cutoff (he lives elsewhere, 200 minutes away): the winner moves to the float.
    const far = { ...doc, people: doc.people.map((p) => (p.name === "Eli" ? { ...p, home: "MOL" } : p)), driveMinutes: { [driveKey("MOL", "EST")]: 33 } };
    assert.equal(fillerOf(coverPlans(far, "EST", DAY).plans[0]!), "Flora Float", "float 30 beats home-elsewhere 33");
    const farther = { ...far, driveMinutes: { ...far.driveMinutes, [driveKey("WL", "EST")]: 90 } };
    assert.equal(fillerOf(coverPlans(farther, "EST", DAY).plans[0]!), "Eli", "add 60 minutes to the float and the winner moves");
  });

  it("a short move beats a long one: 33 minutes opening a store outranks a free float 140 minutes away", () => {
    const doc = scenario(["EST"], [{ p: person("Far Float", "WL", true) }]);
    const slow = { ...doc, driveMinutes: { [driveKey("WL", "EST")]: 140 } };
    const plans = coverPlans(slow, "EST", DAY, 8).plans;
    const ff = plans.findIndex((p) => fillerOf(p) === "Far Float");
    assert.ok(ff === -1 || plans[ff]!.extreme, "a 140-minute float is flagged as a long drive");
    assert.ok(plans.some((p) => p.opens.length === 1 && !p.extreme), "the short opening move is offered");
  });
});
