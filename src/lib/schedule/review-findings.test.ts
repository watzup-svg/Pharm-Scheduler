// Grok's code review of the public repo (2026-10-02): five findings, each reproduced here as a test before it was fixed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCoverPlan, coverPlans, type CoverPlan } from "./cover-plan.ts";
import { createDemo } from "./demo.ts";
import { dropName } from "./drag.ts";
import { driveBetween, driveKey, pairMiles } from "./geo.ts";
import { getCell, setCellValue } from "./grid.ts";
import { copyWeekdayColumn } from "./stamp.ts";
import { blankMonthWithStores } from "./stores.ts";
import type { Person, ScheduleDoc } from "./types.ts";

const DAY = 14; // Wednesday, Oct 2026
const person = (name: string, home: string, float = false): Person => ({ name, role: float ? "Float Pharmacist" : "Pharmacist", home, lead: false, phone: "", color: "#888888" });
/** Every store has one pharmacist at home on DAY, except `bare`. */
function scenario(bare: string[], extra: { p: Person; at?: { store: string; slot?: "pharmacist" | "pharmacist2" }[] }[] = []): ScheduleDoc {
  let doc: ScheduleDoc = { ...blankMonthWithStores(createDemo()), people: [] };
  for (const s of doc.stores) {
    if (bare.includes(s.code)) continue;
    const p = person(`Local ${s.code}`, s.code);
    doc = { ...doc, people: [...doc.people, p], grid: setCellValue(doc.grid, s.code, "pharmacist", DAY, p.name) };
  }
  for (const { p, at } of extra) {
    doc = { ...doc, people: [...doc.people, p] };
    for (const a of at ?? []) doc = { ...doc, grid: setCellValue(doc.grid, a.store, a.slot ?? "pharmacist2", DAY, p.name) };
  }
  return doc;
}
const fillerOf = (p: CoverPlan) => p.moves.find((m) => m.fillsTarget)!.name;

describe("Grok review: finding 1, a person booked at two stores", () => {
  it("applying a plan changes only what the plan names", () => {
    const doc = scenario(["EST"], [{ p: person("Ned Double", "MOL"), at: [{ store: "MOL" }, { store: "SIL" }] }]);
    const plan = coverPlans(doc, "EST", DAY, 8).plans.find((p) => p.moves.some((m) => m.name === "Ned Double"));
    assert.ok(plan, "Ned is offered");
    const named = plan!.moves.filter((m) => m.name === "Ned Double").map((m) => m.from);
    const out = applyCoverPlan(doc, plan!, DAY);
    assert.ok(out.ok);
    for (const code of ["MOL", "SIL"]) {
      const had = getCell(doc.grid, code, "pharmacist2", DAY);
      const has = getCell(out.doc.grid, code, "pharmacist2", DAY);
      if (named.includes(code)) assert.equal(has, "", `${code} is named, so it is cleared`);
      else assert.equal(has, had, `${code} is not named, so it must not change`);
    }
  });
});

describe("Grok review: finding 2, a drop that does nothing", () => {
  const theoDoc = () => {
    let doc = scenario([], [{ p: person("Theo", "EST"), at: [{ store: "EST" }] }]);
    doc = { ...doc, grid: setCellValue(doc.grid, "MOL", "pharmacist", DAY, "Theo") }; // Theo is also in Molalla's first row
    return doc;
  };
  it("dragging Theo from Estacada onto Molalla's second row, where he already is, leaves Estacada alone", () => {
    const doc = theoDoc();
    const out = dropName(doc, { store: "MOL", slot: "pharmacist2", day: DAY }, { name: "Theo", from: { store: "EST", slot: "pharmacist2", day: DAY } }, false);
    assert.equal(getCell(out.grid, "EST", "pharmacist2", DAY), "Theo");
  });
  it("copying a weekday onto a day where the person is already in the other row of that store drops nobody and keeps them there", () => {
    let doc = scenario([], [{ p: person("Theo", "EST"), at: [{ store: "EST" }] }]);
    doc = { ...doc, grid: setCellValue(doc.grid, "EST", "pharmacist", 21, "Theo") }; // next Wednesday, first row
    const res = copyWeekdayColumn(doc, DAY);
    assert.deepEqual(res.dropped.filter((d) => d.name === "Theo"), []);
    const rows = ["pharmacist", "pharmacist2"].map((s) => getCell(res.doc.grid, "EST", s as "pharmacist", 21));
    assert.equal(rows.filter((n) => n === "Theo").length, 1, "once, never twice");
  });
});

describe("Grok review: finding 3, hand-entered miles or minutes", () => {
  const doc = createDemo();
  it("miles entered by hand keep the measured minutes (Molalla to Estacada is 33)", () => {
    const d = driveBetween({ ...doc, driveMiles: { [driveKey("MOL", "EST")]: 21.2 } }, "MOL", "EST")!;
    assert.equal(d.minutes, 33);
    assert.equal(d.estimated, false);
  });
  it("minutes entered by hand keep the ferry flag (Cathlamet to Clatskanie)", () => {
    const d = driveBetween({ ...doc, driveMinutes: { [driveKey("CAT", "CLA")]: 70 } }, "CAT", "CLA")!;
    assert.equal(d.minutes, 70);
    assert.equal(d.ferry, true);
  });
  it("miles entered by hand, with no table for the pair, still estimate minutes", () => {
    const moved = { ...doc, stores: doc.stores.map((s) => ({ ...s, address: `${s.address} (test)` })), driveMiles: { [driveKey("MOL", "EST")]: 30 } };
    const d = driveBetween(moved, "MOL", "EST")!;
    assert.equal(d.minutes, 40);
    assert.equal(d.estimated, true);
    assert.equal(pairMiles(moved, "MOL", "EST").miles, 30);
  });
});

describe("Grok review: finding 4, someone already working today", () => {
  it("is not charged a day they are already working: moving Ada costs the same as moving Bea", () => {
    // Silverton is open Saturdays, so its people may work six days a week.
    let doc = scenario(["EST"], [{ p: person("Ada Busy", "SIL"), at: [{ store: "SIL" }] }, { p: person("Bea Free", "SIL") }]);
    const put = (name: string, days: number[]) => { for (const d of days) doc = { ...doc, grid: setCellValue(doc.grid, "SIL", "pharmacist2", d, name) }; };
    put("Ada Busy", [12, 13, 15, 16, 17]); // plus today: six days, the most a Saturday-open store allows
    put("Bea Free", [12, 13, 15, 16, 17]); // five days, free today: moving her makes six
    const plans = coverPlans(doc, "EST", DAY, 8).plans;
    const ada = plans.find((p) => fillerOf(p) === "Ada Busy");
    const bea = plans.find((p) => fillerOf(p) === "Bea Free");
    assert.ok(ada && bea);
    assert.equal(Math.round(ada!.cost), Math.round(bea!.cost));
  });
});

describe("Grok review: finding 5, the tilde belongs to the long leg only if the long leg is the estimate", () => {
  it("a measured long leg is not marked estimated because a short leg is", () => {
    const doc = scenario(["EST"], [{ p: person("Ivy Free", "IND") }]);
    const moved = { ...doc, stores: doc.stores.map((s) => (s.code === "EST" ? { ...s, address: `${s.address} (moved)` } : s)) };
    const plans = coverPlans(moved, "EST", DAY, 8).plans.filter((p) => p.moves.length > 1 && p.moves.some((m) => m.estimated) && p.moves.some((m) => !m.estimated));
    assert.ok(plans.length > 0, "a mixed chain exists in this fixture");
    for (const p of plans) {
      const longLeg = p.moves.reduce((a, m) => ((m.minutes ?? 0) > (a.minutes ?? 0) ? m : a));
      assert.equal(p.longestEstimated, longLeg.estimated);
    }
  });
});
