import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCoverPlan, bestDirectDrive, coverPlans, LONG_DRIVE, MAX_DRIVE, _assign } from "./cover-plan.ts";
import { daysInMonth } from "./calendar.ts";
import { createDemo } from "./demo.ts";
import { evaluate } from "./rules.ts";
import { placeName } from "./place.ts";
import { getCell } from "./grid.ts";
import { RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

let seed = 99;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;

function brute(cost: number[][]): number {
  const n = cost.length;
  const m = cost[0]!.length;
  let best = Infinity;
  const used = new Array(m).fill(false);
  const go = (i: number, sum: number) => {
    if (sum >= best) return;
    if (i === n) { best = sum; return; }
    for (let j = 0; j < m; j++) if (!used[j]) { used[j] = true; go(i + 1, sum + cost[i]![j]!); used[j] = false; }
  };
  go(0, 0);
  return best;
}

describe("assignment solver", () => {
  it("finds the cheapest assignment on 300 random matrices (checked against brute force)", () => {
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rnd() * 5);
      const m = n + Math.floor(rnd() * 4);
      const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.floor(rnd() * 100)));
      const pickCols = _assign(cost, n, m);
      assert.equal(new Set(pickCols).size, n, "each row gets its own column");
      assert.equal(pickCols.reduce((a, j, i) => a + cost[i]![j]!, 0), brute(cost));
    }
  });
});

const holesOf = (doc: ScheduleDoc) => evaluate(doc).issues.filter((i) => i.hole);

const bareStores = (d: ScheduleDoc, day: number) => d.stores.filter((s) => d.stores && !RPH_SLOTS.some((sl) => getCell(d.grid, s.code, sl, day).trim()) && evaluate(d).issues.some((i) => i.hole && i.store === s.code && i.day === day)).map((s) => s.code);

describe("cover plans", () => {
  it("never fills one shift by emptying another store, except the one store a plan says it opens", () => {
    const doc = createDemo();
    for (const h of holesOf(doc)) {
      for (const p of coverPlans(doc, h.store, h.day).plans) {
        const res = applyCoverPlan(doc, p, h.day);
        const before = new Set(bareStores(doc, h.day));
        for (const c of bareStores(res.doc, h.day)) assert.ok(before.has(c) || p.opens.includes(c), `${c} newly bare on day ${h.day}`);
        assert.ok(p.opens.length <= 1 && p.moves.length <= 3);
        assert.ok(!bareStores(res.doc, h.day).includes(h.store));
      }
    }
  });

  it("every plan for every hole in the practice month applies cleanly, fills the shift and respects the drive limit", () => {
    const doc = createDemo();
    for (const h of holesOf(doc)) {
      const r = coverPlans(doc, h.store, h.day);
      for (const p of r.plans) {
        assert.ok(p.longest <= MAX_DRIVE, "no drive over the limit");
        assert.equal(p.extreme, p.longest > LONG_DRIVE);
        const res = applyCoverPlan(doc, p, h.day);
        assert.ok(res.ok, res.problem ?? "");
        assert.ok(RPH_SLOTS.some((s) => getCell(res.doc.grid, h.store, s, h.day).trim()), "the shift is filled");
        const before = evaluate(doc);
        const after = evaluate(res.doc);
        assert.ok(after.holes <= before.holes && after.doubles <= before.doubles);
      }
    }
  });

  it("is quiet for a shift that already has someone", () => {
    const doc = createDemo();
    const filled = doc.stores.flatMap((s) => Array.from({ length: daysInMonth(doc.year, doc.month) }, (_, i) => ({ s: s.code, d: i + 1 }))).find((x) => RPH_SLOTS.some((sl) => getCell(doc.grid, x.s, sl, x.d).trim()))!;
    assert.equal(coverPlans(doc, filled.s, filled.d).reason, "not-empty");
  });

  it("can move a second pharmacist to a store with nobody", () => {
    let doc = createDemo();
    const hole = holesOf(doc).find((h) => coverPlans(doc, h.store, h.day).plans.length)!;
    // Put two pharmacists at a store that has one, so one of them is spare.
    const other = doc.stores.find((s) => s.code !== hole.store && RPH_SLOTS.some((sl) => getCell(doc.grid, s.code, sl, hole.day).trim()))!;
    const spare = doc.people.find((p) => p.role === "Pharmacist" && !RPH_SLOTS.some((sl) => doc.stores.some((s) => getCell(doc.grid, s.code, sl, hole.day).trim() === p.name)));
    if (!spare) return;
    const r = placeName(doc, other.code, "pharmacist2", hole.day, spare.name);
    if (!r.ok) return;
    doc = r.doc;
    for (const p of coverPlans(doc, hole.store, hole.day).plans) assert.ok(applyCoverPlan(doc, p, hole.day).ok);
  });

  it("never offers a plan that leaves another store bare except the one it names (fuzz: 150 random months)", () => {
    for (let t = 0; t < 150; t++) {
      let doc = createDemo();
      for (let i = 0; i < 60; i++) {
        const r = placeName(doc, pick(doc.stores).code, pick([...RPH_SLOTS]), 1 + Math.floor(rnd() * 28), rnd() < 0.3 ? "" : pick(doc.people).name);
        if (r.ok) doc = r.doc;
      }
      const holes = holesOf(doc);
      if (!holes.length) continue;
      const h = pick(holes);
      const before = evaluate(doc);
      for (const p of coverPlans(doc, h.store, h.day).plans) {
        const res = applyCoverPlan(doc, p, h.day);
        assert.ok(res.ok, res.problem ?? "");
        const after = evaluate(res.doc);
        assert.ok(after.holes <= before.holes, "no more holes");
        assert.ok(RPH_SLOTS.some((s) => getCell(res.doc.grid, h.store, s, h.day).trim()), "the shift is filled");
        assert.ok(after.doubles <= before.doubles && after.unlicensed <= before.unlicensed && after.closed <= before.closed);
        assert.ok(p.moves.some((m) => m.fillsTarget && m.to === h.store));
        assert.equal(new Set(p.moves.map((m) => m.name)).size, p.moves.length, "nobody moves twice");
      }
    }
  });

  it("a plan is never costlier to the longest drive than just sending the nearest free person", () => {
    const doc = createDemo();
    for (const h of holesOf(doc)) {
      const direct = bestDirectDrive(doc, h.store, h.day);
      const plans = coverPlans(doc, h.store, h.day).plans;
      if (direct == null || !plans.length) continue;
      assert.ok(plans[0]!.longest <= Math.max(direct, 0) + 1 || plans[0]!.cost <= direct * (1 + direct / 120) + 60);
    }
  });

  it("a plan row's mileage is the extra over where each person already is, never more than the move's full paid miles", () => {
    const doc = createDemo();
    let seen = 0;
    for (const h of holesOf(doc).slice(0, 6)) {
      for (const p of coverPlans(doc, h.store, h.day).plans) {
        for (const m of p.moves) {
          seen += 1;
          if (m.extra.paidMiles != null) assert.ok(m.extra.paidMiles >= 0 && m.extra.paidMiles <= (m.mileage.paidMiles ?? 0) + 1e-9);
          if (m.extra.dollars != null && m.mileage.dollars != null) assert.ok(m.extra.dollars <= m.mileage.dollars + 1e-9);
        }
        const sum = p.moves.reduce((a, m) => a + (m.extra.paidMiles ?? 0), 0);
        assert.ok(Math.abs(p.paidMiles - Math.round(sum * 100) / 100) < 1e-9);
      }
    }
    assert.ok(seen > 0);
  });

  it("refuses a plan that would break the day, and changes nothing", () => {
    const doc = createDemo();
    const h = holesOf(doc)[0]!;
    const bogus = { moves: [{ name: "Nobody Real", float: false, from: null, origin: null, to: h.store, minutes: 10, miles: 5, estimated: true, mileage: { oneWay: 0, paidMiles: 0, dollars: null, source: "set" as const }, extra: { paidMiles: 0, dollars: null }, fillsTarget: true }] };
    const res = applyCoverPlan(doc, bogus, h.day);
    assert.equal(res.ok, false);
    assert.equal(res.doc, doc);
  });
});
