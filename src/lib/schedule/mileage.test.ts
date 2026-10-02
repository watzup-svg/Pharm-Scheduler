import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverPlans } from "./cover-plan.ts";
import { createDemo } from "./demo.ts";
import { parseDoc, serializeDoc } from "./file.ts";
import { pairMiles, driveKey } from "./geo.ts";
import { applyStore } from "./identity.ts";
import { evaluate } from "./rules.ts";
import { FEDERAL_RATE, mileageFor, paidMilesFor } from "./mileage.ts";
import type { ScheduleDoc } from "./types.ts";

// The built-in measured table applies only to the stores' real addresses; these tests are about the estimate and hand-set numbers,
// so they move every address (see drive-table.test.ts for the table itself).
const base = (): ScheduleDoc => {
  const d = createDemo();
  return { ...d, stores: d.stores.map((s) => ({ ...s, address: `${s.address} (test)` })) };
};
const withMiles = (doc: ScheduleDoc, a: string, b: string, miles: number, rate?: number): ScheduleDoc => ({
  ...doc,
  driveMiles: { ...(doc.driveMiles ?? {}), [driveKey(a, b)]: miles },
  ...(rate != null ? { mileage: { rate } } : {}),
});

describe("mileage pay math", () => {
  it("pays 2 x (one-way miles - 20), never below zero", () => {
    const table: [number, number][] = [[0, 0], [19.9, 0], [20, 0], [20.1, 0.2], [25, 10], [30, 20], [45, 50], [90, 140]];
    for (const [oneWay, paid] of table) assert.equal(paidMilesFor(oneWay), paid, `${oneWay} mi`);
  });

  it("pays nothing at the home store, and with no home store", () => {
    const doc = base();
    const [a] = doc.stores;
    assert.equal(mileageFor(doc, a!.code, a!.code).paidMiles, 0);
    assert.equal(mileageFor(doc, null, a!.code).paidMiles, 0);
    assert.equal(mileageFor(doc, "—", a!.code).paidMiles, 0);
  });

  it("uses the hand-set miles, and dollars scale with the rate and round to cents", () => {
    const [a, b] = base().stores;
    const doc = withMiles(base(), a!.code, b!.code, 25, 0.7);
    const m = mileageFor(doc, a!.code, b!.code);
    assert.equal(m.source, "set");
    assert.equal(m.paidMiles, 10);
    assert.equal(m.dollars, 7);
    assert.equal(mileageFor({ ...doc, mileage: { rate: 0.725 } }, a!.code, b!.code).dollars, 7.25);
    assert.equal(mileageFor({ ...doc, mileage: { rate: 0.333 } }, b!.code, a!.code).dollars, 3.33); // symmetric
  });

  it("with no rate entered, uses the federal rate (72.5 cents for 2026), and the manager's own rate replaces it", () => {
    const [a, b] = base().stores;
    const doc = withMiles(base(), a!.code, b!.code, 30);
    const m = mileageFor(doc, a!.code, b!.code);
    assert.equal(m.paidMiles, 20);
    assert.equal(FEDERAL_RATE.dollarsPerMile, 0.725);
    assert.equal(m.dollars, 14.5);
    assert.equal(mileageFor({ ...doc, mileage: { rate: 0.7 } }, a!.code, b!.code).dollars, 14);
  });

  it("an unknown distance is unknown, never zero", () => {
    const doc = base();
    const [a, b] = doc.stores;
    const stripped = { ...doc, stores: doc.stores.map((s) => (s.code === b!.code ? { ...s, lat: undefined, lng: undefined } : s)) };
    const m = mileageFor(stripped, a!.code, b!.code);
    assert.equal(m.source, "missing");
    assert.equal(m.paidMiles, null);
    assert.equal(m.dollars, null);
    assert.equal(pairMiles(stripped, a!.code, b!.code).miles, null);
  });
});

describe("mileage in the saved file and renames", () => {
  it("round trips, and an old file without the fields opens unchanged", () => {
    const [a, b] = base().stores;
    const doc = withMiles(base(), a!.code, b!.code, 33.5, 0.7);
    const back = parseDoc(serializeDoc(doc));
    assert.deepEqual(back.driveMiles, doc.driveMiles);
    assert.deepEqual(back.mileage, { rate: 0.7 });
    const old = parseDoc(serializeDoc(base()));
    assert.equal(old.driveMiles, undefined);
    assert.equal(old.mileage, undefined);
  });

  it("rejects absurd values instead of loading them", () => {
    const [a, b] = base().stores;
    const text = JSON.parse(serializeDoc(withMiles(base(), a!.code, b!.code, 30)));
    text.driveMiles[driveKey(a!.code, b!.code)] = -5;
    assert.throws(() => parseDoc(JSON.stringify(text)));
  });

  it("follows a store when its code changes", () => {
    const doc = base();
    const [a, b] = doc.stores;
    const withSet = withMiles(doc, a!.code, b!.code, 40);
    const next = applyStore(withSet, a!.code, { ...a!, code: "ZZZ" });
    assert.equal(next.driveMiles?.[driveKey("ZZZ", b!.code)], 40);
    assert.equal(next.driveMiles?.[driveKey(a!.code, b!.code)], undefined);
  });
});

describe("mileage in cover plans", () => {
  const firstHole = (doc: ScheduleDoc) => evaluate(doc).issues.find((i) => i.hole && coverPlans(doc, i.store, i.day).plans.length > 1);

  it("every move carries its home-store mileage, and plan totals add up", () => {
    const doc = { ...base(), mileage: { rate: 0.7 } };
    let seen = 0;
    for (const h of evaluate(doc).issues.filter((i) => i.hole)) {
      for (const p of coverPlans(doc, h.store, h.day).plans) {
        seen++;
        const paid = p.moves.reduce((a, m) => a + (m.mileage.paidMiles ?? 0), 0);
        assert.ok(Math.abs(p.paidMiles - paid) < 0.011);
        if (!p.mileageUnknown) assert.ok(p.mileageDollars != null && Math.abs(p.mileageDollars - Math.round(paid * 0.7 * 100) / 100) < 0.05 * p.moves.length);
      }
    }
    assert.ok(seen > 0, "the practice month has holes with plans");
  });

  it("heavy mileage for the cheapest filler puts the other filler first", () => {
    // WAL day 14 is an empty shift in the practice month. Lena (home IND) is the best fill; Bram is moved to a different home store
    // so the two are priced on different store pairs.
    const doc = { ...base(), people: base().people.map((p) => (p.name === "Bram Okafor" ? { ...p, home: "CLA" } : p)) };
    const fillerOf = (p: ReturnType<typeof coverPlans>["plans"][number]) => p.moves.find((m) => m.fillsTarget)!.name;
    const before = coverPlans(doc, "WAL", 14).plans;
    assert.equal(fillerOf(before[0]!), "Lena Sorensen");
    assert.ok(before.some((p) => fillerOf(p) === "Bram Okafor"), "Bram is an option");
    const costly = withMiles({ ...doc, driveMinutes: { [driveKey("IND", "WAL")]: 40 } }, "IND", "WAL", 150, 0.7);
    const after = coverPlans(costly, "WAL", 14).plans;
    assert.equal(fillerOf(after[0]!), "Bram Okafor");
    assert.ok(after.some((p) => fillerOf(p) === "Lena Sorensen"), "Lena is still offered, only ranked lower");
  });

  it("is deterministic and never changes a schedule", () => {
    const doc = base();
    const h = firstHole(doc)!;
    const snap = JSON.stringify(doc);
    const a = JSON.stringify(coverPlans(doc, h.store, h.day));
    const b = JSON.stringify(coverPlans(doc, h.store, h.day));
    assert.equal(a, b);
    assert.equal(JSON.stringify(doc), snap);
  });
});
