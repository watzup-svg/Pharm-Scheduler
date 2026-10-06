// Run: node --experimental-strip-types --test app3/mileage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedWorld, type Seed } from "../domain/src/seed.ts";
import { dollars, mileageCsv, mileageReport, rateOn, tripCents } from "./mileage.ts";

const base: Seed = {
  stores: [{ id: "S1", code: "EST" }, { id: "S2", code: "CAT" }, { id: "S3", code: "WIN" }],
  pharmacists: [{ id: "P1", name: "Ann Ash", base: "S1" }, { id: "P2", name: "Bo Birch", base: "S2" }],
  // S1 -> S2 is 102.1 miles (over the 20 free miles); S2 -> S3 is 15 (under). S1 -> S3 is missing on purpose.
  travel: [["S1", "S2", 82, 102.1], ["S2", "S1", 82, 102.1], ["S2", "S3", 10, 15]],
  config: { mileageFreeMiles: 20, mileageRates: [{ effectiveFrom: "2026-01-01", centsPerMile: 70 }] },
};
const withA = (assignments: NonNullable<Seed["assignments"]>, extra: Partial<Seed> = {}) => seedWorld({ ...base, ...extra, assignments }).state;

test("over the free miles: 2 x (miles - free) x rate, in whole cents", () => {
  const s = withA([{ store: "S2", ph: "P1", date: "2026-10-06" }]);
  const r = mileageReport(s, "2026-10");
  // 2 x (102.1 - 20) x 70 = 11494
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]!.trips[0]!.cents, 11494);
  assert.equal(r.totals.cents, 11494);
  assert.equal(r.totals.trips, 1);
  assert.deepEqual(r.unknown, []);
});

test("under or at the free miles pays nothing but is still a trip", () => {
  const s = withA([{ store: "S3", ph: "P2", date: "2026-10-06" }]);
  const r = mileageReport(s, "2026-10");
  assert.equal(r.rows[0]!.trips.length, 1);
  assert.equal(r.rows[0]!.trips[0]!.cents, 0);
  assert.equal(r.totals.cents, 0);
  assert.equal(tripCents(20, 20, 70), 0);
  assert.equal(tripCents(20.1, 20, 100), 20);
});

test("a pharmacist at the base store has no trip", () => {
  const s = withA([{ store: "S1", ph: "P1", date: "2026-10-06" }]);
  const r = mileageReport(s, "2026-10");
  assert.equal(r.rows.length, 0);
  assert.equal(r.unknown.length, 0);
  assert.equal(r.totals.trips, 0);
});

test("rate change in the middle of the month: each day uses the rate in effect that day", () => {
  const s = withA(
    [{ store: "S2", ph: "P1", date: "2026-10-09" }, { store: "S2", ph: "P1", date: "2026-10-12" }],
    { config: { mileageFreeMiles: 20, mileageRates: [{ effectiveFrom: "2026-01-01", centsPerMile: 70 }, { effectiveFrom: "2026-10-10", centsPerMile: 80 }] } },
  );
  const r = mileageReport(s, "2026-10");
  const t = r.rows[0]!.trips;
  assert.equal(t[0]!.rateCents, 70);
  assert.equal(t[0]!.cents, 11494);
  assert.equal(t[1]!.rateCents, 80);
  assert.equal(t[1]!.cents, 13136); // 2 x 82.1 x 80
  assert.equal(r.totals.cents, 11494 + 13136);
  assert.equal(rateOn(s.config.mileageRates, "2026-10-10")!.centsPerMile, 80);
  assert.equal(rateOn(s.config.mileageRates, "2025-12-31"), undefined);
});

test("unknown pair is listed apart and never counted as zero", () => {
  const s = withA([{ store: "S3", ph: "P1", date: "2026-10-06" }, { store: "S2", ph: "P1", date: "2026-10-07" }]);
  const r = mileageReport(s, "2026-10");
  assert.equal(r.unknown.length, 1);
  assert.equal(r.unknown[0]!.reason, "miles");
  assert.equal(r.unknown[0]!.storeId, "S3");
  assert.equal(r.totals.unknown, 1);
  assert.equal(r.totals.trips, 1); // only the known one
  assert.equal(r.totals.cents, 11494);
});

test("two assignments the same day count once per assignment", () => {
  const s = withA([{ store: "S2", ph: "P1", date: "2026-10-06" }, { store: "S3", ph: "P1", date: "2026-10-06" }], {
    travel: [["S1", "S2", 82, 102.1], ["S1", "S3", 60, 50]],
  });
  const r = mileageReport(s, "2026-10");
  assert.equal(r.rows[0]!.trips.length, 2);
  // 102.1 -> 11494; 50 -> 2 x 30 x 70 = 4200
  assert.equal(r.totals.cents, 11494 + 4200);
});

test("only the chosen month counts", () => {
  const s = withA([{ store: "S2", ph: "P1", date: "2026-09-30" }, { store: "S2", ph: "P1", date: "2026-10-01" }, { store: "S2", ph: "P1", date: "2026-11-01" }]);
  assert.equal(mileageReport(s, "2026-10").totals.trips, 1);
});

test("no rate in effect and no base store are reported, not guessed", () => {
  const s = withA([{ store: "S2", ph: "P1", date: "2026-10-06" }, { store: "S2", ph: "P3", date: "2026-10-06" }], {
    pharmacists: [...base.pharmacists, { id: "P3", name: "Cy Cedar", base: null }],
    config: { mileageFreeMiles: 20, mileageRates: [] },
  });
  const r = mileageReport(s, "2026-10");
  assert.deepEqual(r.unknown.map((u) => u.reason).sort(), ["base", "rate"]);
  assert.equal(r.totals.cents, 0);
});

test("csv has a line per trip, blank miles for unknown, and a total", () => {
  const s = withA([{ store: "S2", ph: "P1", date: "2026-10-06" }, { store: "S3", ph: "P1", date: "2026-10-07" }]);
  const csv = mileageCsv(s, mileageReport(s, "2026-10"));
  const lines = csv.split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[1]!.startsWith("Ann Ash,EST,2026-10-06,CAT,102.1,20,70,114.94"));
  assert.ok(lines[2]!.includes("Miles not known"));
  assert.ok(lines[3]!.startsWith("Total,") && lines[3]!.includes("114.94"));
  assert.equal(dollars(11494), "$114.94");
  assert.equal(dollars(5), "$0.05");
});
