// Grok's fill-logic cases (reviewed 2026-10-02), as Joe adopted them: a long drive is offered up to 150 minutes and ranked last,
// "leave this store closed" is offered when nobody can cover without uncovering a store, a plan is a CLOSED chain (it never leaves
// another store bare; Joe, 2026-10-03, replacing the earlier "one follow-on hole" rule), a chain is at most three moves, and the Cathlamet to Clatskanie ferry is a 60-minute leg that says ferry. Real stores and the measured drive table.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverPlans, type CoverPlan } from "./cover-plan.ts";
import { createDemo } from "./demo.ts";
import { setCellValue } from "./grid.ts";
import { blankMonthWithStores } from "./stores.ts";
import { withClosedTestStores } from "./test-stores.ts";
import type { Person, ScheduleDoc } from "./types.ts";

const DAY = 14; // Wednesday, Oct 2026: every store is open
const person = (name: string, home: string, float = false): Person => ({ name, role: float ? "Float Pharmacist" : "Pharmacist", home, lead: false, phone: "", color: "#888888" });

/** Every store has one pharmacist at home on DAY, except `bare`. `extra` adds people: placed at a store (second pharmacist) or free. */
function scenario(opts: { bare: string[]; extra?: { p: Person; at?: string }[]; skipHome?: string[] }): ScheduleDoc {
  const base = withClosedTestStores(blankMonthWithStores(createDemo()));
  let doc: ScheduleDoc = { ...base, people: [] };
  for (const s of doc.stores) {
    if (opts.bare.includes(s.code) || opts.skipHome?.includes(s.code)) continue;
    const p = person(`Local ${s.code}`, s.code);
    doc = { ...doc, people: [...doc.people, p], grid: setCellValue(doc.grid, s.code, "pharmacist", DAY, p.name) };
  }
  for (const { p, at } of opts.extra ?? []) {
    doc = { ...doc, people: [...doc.people, p] };
    if (at) doc = { ...doc, grid: setCellValue(doc.grid, at, "pharmacist2", DAY, p.name) };
  }
  return doc;
}
const who = (p: CoverPlan) => p.moves.map((m) => `${m.name}>${m.to}`);
const closeCard = (r: unknown) => Boolean((r as { leaveClosed?: boolean }).leaveClosed);

describe("Grok's fill cases", () => {
  it("1. Estacada hole, its own pharmacist and a float are both free: own pharmacist first, float second", () => {
    const doc = scenario({ bare: ["EST"], extra: [{ p: person("Eli Estacada", "EST") }, { p: person("Flora Float", "WL", true) }] });
    const { plans } = coverPlans(doc, "EST", DAY);
    assert.deepEqual(who(plans[0]!), ["Eli Estacada>EST"]);
    assert.deepEqual(who(plans[1]!), ["Flora Float>EST"]);
  });

  it("2. Estacada's own pharmacist is out; West Linn has two (one a float) and Molalla one: move the West Linn float, leave Molalla alone", () => {
    const doc = scenario({ bare: ["EST"], extra: [{ p: person("Wendy WestLinnFloat", "WL", true), at: "WL" }] });
    const { plans } = coverPlans(doc, "EST", DAY);
    assert.deepEqual(who(plans[0]!), ["Wendy WestLinnFloat>EST"]);
    assert.ok(!plans[0]!.moves.some((m) => m.name === "Local MOL"));
  });

  it("3. Estacada's own is out; the only spare is 3 hours away, a solo neighbor 33 minutes away: the neighbor is NOT offered (it would leave its store bare), so the leave-closed card is", () => {
    const doc = scenario({ bare: ["EST"], extra: [{ p: person("Far Spare", "FLO"), at: "FLO" }] });
    const { plans } = coverPlans(doc, "EST", DAY);
    assert.equal(plans.length, 0, "no closed chain exists");
    assert.equal(closeCard(coverPlans(doc, "EST", DAY)), true);
    assert.ok(!plans.some((p) => p.moves.some((m) => m.name === "Far Spare")), "3 hours is past the 2.5-hour cutoff");
  });

  it("4. John Day cannot be reached within 2.5 hours: no drive offered, the leave-closed card is", () => {
    const doc = scenario({ bare: ["LEN"] });
    const r = coverPlans(doc, "LEN", DAY);
    assert.equal(r.plans.length, 0);
    assert.equal(closeCard(r), true);
  });

  it("5. Two holes, one free pharmacist: the cluster is staffed, John Day (isolated) gets the leave-closed card, nobody central is taken", () => {
    const doc = scenario({ bare: ["EST", "LEN"], extra: [{ p: person("Fred Free", "WL") }] });
    const est = coverPlans(doc, "EST", DAY);
    assert.deepEqual(who(est.plans[0]!), ["Fred Free>EST"]);
    const cav = coverPlans(doc, "LEN", DAY);
    assert.equal(cav.plans.length, 0);
    assert.equal(closeCard(cav), true);
  });

  it("6. Cathlamet covered from Clatskanie: 60 minutes and it says ferry, not a 15-minute drive", () => {
    const doc = scenario({ bare: ["CAT"], extra: [{ p: { ...person("Clara Spare", "CLA"), licensedStates: ["OR", "WA"] }, at: "CLA" }] });
    const m = coverPlans(doc, "CAT", DAY).plans[0]!.moves.find((x) => x.from === "CLA")!;
    assert.equal(m.minutes, 60);
    assert.equal((m as unknown as { ferry?: boolean }).ferry, true);
  });

  it("7. No clock entered: an 84-minute free float is not dropped, but ranks below a free pharmacist 30 minutes away", () => {
    const doc = scenario({ bare: ["EST"], skipHome: ["WL"], extra: [{ p: person("Near Spare", "WL") }, { p: person("Distant Float", "SCA", true) }] });
    const { plans } = coverPlans(doc, "EST", DAY, 8); // the screen shows three; the float is still among the options found
    const order = plans.map((p) => p.moves.find((m) => m.fillsTarget)!.name);
    assert.ok(order.includes("Distant Float"), "kept");
    assert.ok(order.indexOf("Near Spare") < order.indexOf("Distant Float"), "ranked lower");
  });

  it("a chain is at most three moves", () => {
    const doc = scenario({ bare: ["EST"], extra: [{ p: person("Wendy Float", "WL", true), at: "WL" }] });
    for (const p of coverPlans(doc, "EST", DAY).plans) assert.ok(p.moves.length <= 3);
  });
});
