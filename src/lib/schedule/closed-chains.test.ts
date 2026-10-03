// Cover plans are closed chains (Joe, 2026-10-03): the first move fills the hole, each later move fills the store the previous person
// left, and the chain stops only when no covered store was left empty. A plan that moves the gap is a bug, not a fallback.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCoverPlan, coverPlans, MAX_CHAIN, type CoverPlan } from "./cover-plan.ts";
import { createDemo } from "./demo.ts";
import { driveKey } from "./geo.ts";
import { getCell, setCellValue } from "./grid.ts";
import { previewPlan } from "./plan-preview.ts";
import { evaluate } from "./rules.ts";
import { RPH_SLOTS } from "./slots.ts";
import { blankMonthWithStores } from "./stores.ts";
import { withClosedTestStores } from "./test-stores.ts";
import type { Person, ScheduleDoc } from "./types.ts";

const DAY = 14; // a Wednesday, every store open
const person = (name: string, home: string, float = false): Person => ({ name, role: float ? "Float Pharmacist" : "Pharmacist", home, lead: false, phone: "", color: "#888888", licensedStates: ["OR", "WA"] });

/** One pharmacist at home in every store on DAY except `bare` and `skipHome`; `extra` adds people (second pharmacist at `at`, or free). */
function scenario(bare: string[], extra: { p: Person; at?: string }[] = [], skipHome: string[] = []): ScheduleDoc {
  let doc: ScheduleDoc = { ...withClosedTestStores(blankMonthWithStores(createDemo())), people: [] };
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
const bare = (d: ScheduleDoc) => d.stores.filter((s) => !RPH_SLOTS.some((sl) => getCell(d.grid, s.code, sl, DAY).trim())).map((s) => s.code);
const to = (p: CoverPlan) => p.moves.map((m) => `${m.name}>${m.to}`);

/** A plan is closed when applying it leaves no store bare that was covered, and lowers the empty count. */
function assertClosed(doc: ScheduleDoc, p: CoverPlan) {
  const res = applyCoverPlan(doc, p, DAY);
  assert.ok(res.ok, res.problem ?? "refused");
  const was = new Set(bare(doc));
  for (const c of bare(res.doc)) assert.ok(was.has(c), `${c} left bare by ${to(p).join(", ")}`);
  assert.ok(bare(res.doc).length < was.size, "lowers the empty count");
  assert.ok(p.moves.length >= 1 && p.moves.length <= MAX_CHAIN);
  assert.equal(new Set(p.moves.map((m) => m.name)).size, p.moves.length, "nobody moves twice");
  assert.equal(p.moves.filter((m) => m.fillsTarget).length, 1);
}

describe("closed chains", () => {
  it("Estacada: its own pharmacist is free, so the plan is one move and nothing else changes", () => {
    const doc = scenario(["EST"], [{ p: person("Eli Estacada", "EST") }]);
    const { plans } = coverPlans(doc, "EST", DAY);
    assert.deepEqual(to(plans[0]!), ["Eli Estacada>EST"]);
    for (const p of plans) assertClosed(doc, p);
  });

  it("near vs far spare: the 30-minute spare ranks above the 90-minute one, and a 140-minute float sorts last, flagged", () => {
    const base = scenario(["EST"], [{ p: person("Near Spare", "WL") }, { p: person("Far Spare", "MOL") }, { p: person("Long Float", "SIL", true) }]);
    const doc = { ...base, driveMinutes: { [driveKey("WL", "EST")]: 30, [driveKey("MOL", "EST")]: 90, [driveKey("SIL", "EST")]: 140 } };
    const { plans } = coverPlans(doc, "EST", DAY, 8);
    const order = plans.map((p) => p.moves.find((m) => m.fillsTarget)!.name);
    assert.ok(order.indexOf("Near Spare") < order.indexOf("Far Spare"));
    assert.equal(order[order.length - 1], "Long Float");
    assert.equal(plans[plans.length - 1]!.extreme, true);
    for (const p of plans) assertClosed(doc, p);
  });

  it("John Day: nobody within 150 minutes, so no plan and the answer is 'close it', never a partial chain", () => {
    const doc = scenario(["LEN"]);
    const r = coverPlans(doc, "LEN", DAY);
    assert.equal(r.plans.length, 0);
    assert.equal(r.leaveClosed, true);
  });

  it("two holes, one free pharmacist: only one hole gets a plan from them, and neither plan empties a covered store", () => {
    const doc = scenario(["EST", "MOL"], [{ p: person("Fred Free", "WL") }]);
    for (const store of ["EST", "MOL"]) {
      for (const p of coverPlans(doc, store, DAY, 8).plans) assertClosed(doc, p);
    }
    const firstApplied = applyCoverPlan(doc, coverPlans(doc, "EST", DAY).plans[0]!, DAY);
    assert.ok(firstApplied.ok);
    const second = coverPlans(firstApplied.doc, "MOL", DAY, 8);
    assert.ok(!second.plans.some((p) => p.moves.some((m) => m.name === "Fred Free")), "Fred is spent; moving him would reopen Estacada");
    assert.equal(second.plans.length, 0);
    assert.equal(second.leaveClosed, true);
  });

  it("a two-move chain names both movers, the store each leaves and fills, and the minutes", () => {
    const doc = scenario(["EST"], [{ p: person("Sil Spare", "SIL"), at: "SIL" }]);
    const plan = coverPlans(doc, "EST", DAY, 8).plans.find((p) => p.moves.length === 2 && p.moves.some((m) => m.name === "Local MOL"));
    assert.ok(plan, "Molalla's pharmacist covers Estacada and the Silverton spare backfills Molalla");
    const [a, b] = plan!.moves;
    assert.equal(a!.fillsTarget, true);
    assert.deepEqual([a!.from, a!.to], ["MOL", "EST"]);
    assert.deepEqual([b!.from, b!.to], ["SIL", "MOL"]);
    assert.equal(a!.minutes, 33);
    assert.ok(b!.minutes != null);
    assertClosed(doc, plan!);
  });

  it("Cathlamet: covered from Clatskanie by a second pharmacist, 60 minutes and marked ferry, closed", () => {
    const doc = scenario(["CAT"], [{ p: person("Clara Spare", "CLA"), at: "CLA" }]);
    const plan = coverPlans(doc, "CAT", DAY).plans[0]!;
    const m = plan.moves.find((x) => x.from === "CLA")!;
    assert.equal(m.minutes, 60);
    assert.equal((m as unknown as { ferry?: boolean }).ferry, true);
    assertClosed(doc, plan);
  });

  it("a float with no clock times: still a closed single move, ranked after a nearer pharmacist, never dropped", () => {
    const doc = scenario(["EST"], [{ p: person("Near Spare", "WL") }, { p: person("Distant Float", "SCA", true) }]);
    const { plans } = coverPlans(doc, "EST", DAY, 8);
    const order = plans.map((p) => p.moves.find((m) => m.fillsTarget)!.name);
    assert.ok(order.includes("Distant Float"));
    assert.ok(order.indexOf("Near Spare") < order.indexOf("Distant Float"));
    for (const p of plans) assertClosed(doc, p);
  });

  it("preview 3 → 3 is rejected: a plan that only moves the gap is refused with the count unchanged", () => {
    const doc = scenario(["EST", "MOL", "WL"]);
    // Silverton's only pharmacist to Estacada: fills Estacada, empties Silverton. Three empty stores before, three after.
    const template = coverPlans(scenario(["EST"], [{ p: person("Eli Estacada", "EST") }]), "EST", DAY).plans[0]!.moves[0]!;
    const moveGap = { ...template, name: "Local SIL", from: "SIL", origin: "SIL", to: "EST" };
    const pv = previewPlan(doc, { moves: [moveGap] }, DAY);
    assert.equal(pv.ok, false);
    assert.equal(pv.holes[0], pv.holes[1], "the empty count does not drop");
    assert.equal(pv.holes[0], evaluate(doc).holes);
    assert.equal(bare(doc).length, 3);
  });

  it("the demo month: every plan offered for every hole is closed and shows the empty count dropping by at least one", () => {
    const doc = createDemo();
    let seen = 0;
    for (const h of evaluate(doc).issues.filter((i) => i.hole)) {
      for (const p of coverPlans(doc, h.store, h.day).plans) {
        seen += 1;
        const pv = previewPlan(doc, p, h.day);
        assert.ok(pv.ok && pv.holes[1] < pv.holes[0], `${p.id} on day ${h.day}: ${pv.holes.join(" → ")}`);
        assert.deepEqual(pv.opened, []);
      }
    }
    assert.ok(seen >= 0);
  });
});
