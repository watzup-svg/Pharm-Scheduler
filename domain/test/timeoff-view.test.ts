// The Time off page's pure thinking (app3/views/timeoff/calc.ts): holidays, how heavy each day is, what approving or adding would open,
// who could be called and why. The "what approving would open" answer is compared with the plain definition: approve on a copy, evaluate, count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyScratch, evaluate, problemsWorld, seedWorld, api, type DomainState, type ISODate } from "../src/index.ts";
import {
  callers, cellsOpenedIfApproved, consequenceText, dayLoads, holidayOn, previewNewRecord, safeToApprove, troubleDay, usHolidays,
} from "../../app3/views/timeoff/calc.ts";

const TODAY = "2026-10-06";
const range = { from: "2026-10-01", to: "2026-10-31" };

test("US holidays are computed offline for any year", () => {
  const h = usHolidays(2026);
  assert.equal(h.get("2026-01-19"), "Martin Luther King Jr. Day");
  assert.equal(h.get("2026-05-25"), "Memorial Day");
  assert.equal(h.get("2026-09-07"), "Labor Day");
  assert.equal(h.get("2026-10-12"), "Columbus Day");
  assert.equal(h.get("2026-11-26"), "Thanksgiving");
  assert.equal(h.get("2026-12-25"), "Christmas Day");
  assert.equal(holidayOn("2027-07-04"), "Independence Day");
  assert.equal(holidayOn("2026-10-13"), null);
  assert.equal(h.size, 11);
});

/** Two stores that each need one pharmacist; A works at S1, B at S2, C floats; A is off on the 7th. */
function small() {
  return seedWorld({
    stores: [{ id: "S1", code: "AAA", req: 1 }, { id: "S2", code: "BBB", req: 1 }],
    pharmacists: [{ id: "P1", name: "Ann A", base: "S1" }, { id: "P2", name: "Bo B", base: "S2" }, { id: "P3", name: "Cy C", base: "S2" }],
    assignments: [
      { store: "S1", ph: "P1", date: "2026-10-07" }, { store: "S2", ph: "P2", date: "2026-10-07" },
      { store: "S1", ph: "P1", date: "2026-10-08" }, { store: "S2", ph: "P2", date: "2026-10-08" },
    ],
    unavailability: [{ ph: "P1", first: "2026-10-07", last: "2026-10-07", status: "Approved" }, { ph: "P2", first: "2026-10-08", last: "2026-10-08", status: "Requested" }],
    travel: [["S2", "S1", 20, 10]],
  }).state;
}

test("day loads: who is off, who asked, and the stores left empty", () => {
  const s = small();
  const loads = dayLoads(s, evaluate(s, TODAY, { range }), range.from, range.to);
  assert.equal(loads.length, 31);
  const d7 = loads.find((l) => l.date === "2026-10-07")!;
  assert.deepEqual(d7.off, ["P1"]);
  assert.deepEqual(d7.waiting, []);
  assert.deepEqual(d7.short.map((x) => [x.storeId, x.empty, x.offIds]), [["S1", true, ["P1"]]]);
  assert.equal(d7.score, 3);
  const d8 = loads.find((l) => l.date === "2026-10-08")!;
  assert.deepEqual(d8.off, []);
  assert.deepEqual(d8.waiting, ["P2"]);
  assert.equal(d8.short.length, 0, "a waiting request does not leave anything short");
  assert.equal(troubleDay(loads)?.date, "2026-10-07");
  assert.equal(troubleDay(loads.filter((l) => l.date !== "2026-10-07")), null);
});

test("what approving would open equals approving on a copy and counting", () => {
  const s = small();
  const rec = s.unavailability[Object.keys(s.unavailability).find((k) => s.unavailability[k]!.status === "Requested")!]!;
  const base = evaluate(s, TODAY, { range });
  const got = cellsOpenedIfApproved(s, [rec], TODAY, base).get(rec.id)!;
  assert.deepEqual(got, [{ storeId: "S2", date: "2026-10-08" }]);
  const after = applyScratch(s, [{ t: "unavail.update", id: rec.id, patch: { status: "Approved" } }]) as DomainState;
  const was = evaluate(s, TODAY, { range }), now = evaluate(after, TODAY, { range });
  const ref = Object.values(now.cells).filter((c) => c.open > (was.cells[`${c.storeId}|${c.date}`]?.open ?? 0)).map((c) => ({ storeId: c.storeId, date: c.date }));
  assert.deepEqual(got, ref);
});

test("on the practice month with problems every waiting request matches the plain definition, and nothing is committed", () => {
  const { world } = problemsWorld(TODAY);
  const s = world.state;
  const before = api.stateHash(s);
  const waiting = Object.values(s.unavailability).filter((u) => u.status === "Requested");
  assert.ok(waiting.length >= 3);
  const base = evaluate(s, TODAY, { range: { from: TODAY, to: "2026-12-31" } });
  const got = cellsOpenedIfApproved(s, waiting, TODAY, base);
  for (const u of waiting) {
    const after = applyScratch(s, [{ t: "unavail.update", id: u.id, patch: { status: "Approved" } }]) as DomainState;
    const r = { from: u.first, to: u.last };
    const was = evaluate(s, TODAY, { range: r }), now = evaluate(after, TODAY, { range: r });
    const ref = Object.values(now.cells).filter((c) => c.date >= TODAY && c.open > (was.cells[`${c.storeId}|${c.date}`]?.open ?? 0)).map((c) => `${c.storeId}|${c.date}`).sort();
    assert.deepEqual(got.get(u.id)!.map((c) => `${c.storeId}|${c.date}`).sort(), ref, `request ${u.id}`);
  }
  assert.equal(api.stateHash(s), before);
  // the safe set can all be approved together without opening anything
  const safe = safeToApprove(s, waiting, TODAY);
  const all = applyScratch(s, safe.map((id) => ({ t: "unavail.update" as const, id, patch: { status: "Approved" as const } }))) as DomainState;
  const r = { from: TODAY, to: "2026-12-31" };
  const was = evaluate(s, TODAY, { range: r }), now = evaluate(all, TODAY, { range: r });
  const worse = Object.values(now.cells).filter((c) => c.open > (was.cells[`${c.storeId}|${c.date}`]?.open ?? 0));
  assert.deepEqual(worse, [], "approving the safe ones together opens nothing");
});

test("previewing a new record: a waiting one is judged as if approved, and an invalid one is refused", () => {
  const s = small();
  const p = previewNewRecord(s, TODAY, { pharmacistId: "P2", first: "2026-10-07", last: "2026-10-08", status: "Requested", type: "Vacation" });
  assert.deepEqual(p?.cells, [{ storeId: "S2", date: "2026-10-07" }, { storeId: "S2", date: "2026-10-08" }]);
  assert.equal(p?.shifts, 2);
  assert.equal(previewNewRecord(s, TODAY, { pharmacistId: "P2", first: "2026-10-09", last: "2026-10-08", status: "Approved", type: "Sick" }), null);
  const none = previewNewRecord(s, TODAY, { pharmacistId: "P3", first: "2026-10-07", last: "2026-10-07", status: "Approved", type: "Sick" });
  assert.deepEqual(none?.cells, []);
  assert.equal(none?.shifts, 0);
});

test("who could be called: only people who would count, with the old reason words", () => {
  const s = small();
  const list = callers(s, "S1", "2026-10-07", TODAY);
  const ids = list.map((c) => c.pharmacistId);
  assert.ok(!ids.includes("P1"), "the person who is off is not offered");
  assert.ok(ids.includes("P3"));
  const cy = list.find((c) => c.pharmacistId === "P3")!;
  assert.ok(cy.good.includes("Free that day"));
  assert.ok(cy.good.includes("Close by (20 min)"));
  assert.ok(cy.good.includes("Was off yesterday"));
  const bo = list.find((c) => c.pharmacistId === "P2")!;
  assert.ok(bo.caution.some((x) => /would leave it short/.test(x)), "moving Bo leaves BBB short");
  assert.equal(bo.edit.t, "move");
  assert.equal(cy.edit.t, "place");
  assert.ok(list.findIndex((c) => c.pharmacistId === "P3") < list.findIndex((c) => c.pharmacistId === "P2"), "free people come before people who must be moved");
});

test("six days in a row is said in words", () => {
  const dates: ISODate[] = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
  const s = seedWorld({
    stores: [{ id: "S1", code: "AAA", req: 1, closedWeekdays: [] }], pharmacists: [{ id: "P1", name: "Ann A", base: "S1" }, { id: "P2", name: "Bo B", base: "S1" }],
    assignments: [...dates.map((d) => ({ store: "S1", ph: "P1", date: d })), { store: "S1", ph: "P2", date: "2026-10-11" }],
    unavailability: [{ ph: "P2", first: "2026-10-11" }],
  }).state;
  const c = callers(s, "S1", "2026-10-11", TODAY).find((x) => x.pharmacistId === "P1");
  assert.ok(c, "Ann could cover");
  assert.ok(c!.caution.includes("Would be 7th day in a row"), c!.caution.join("|"));
});

test("the consequence sentence", () => {
  const code = (id: string) => ({ S1: "WIN" })[id] ?? id;
  assert.equal(consequenceText(code, [], 0), "Approving leaves every store covered.");
  assert.equal(consequenceText(code, [{ storeId: "S1", date: "2026-10-13" }], 2), "Approving opens WIN on Tue Oct 13; 2 people could cover.");
  assert.equal(consequenceText(code, [{ storeId: "S1", date: "2026-10-13" }], 1), "Approving opens WIN on Tue Oct 13; 1 person could cover.");
  assert.equal(consequenceText(code, [{ storeId: "S1", date: "2026-10-13" }], 0), "Approving opens WIN on Tue Oct 13; nobody is free to cover.");
  assert.equal(consequenceText(code, [{ storeId: "S1", date: "2026-10-13" }, { storeId: "S1", date: "2026-10-14" }, { storeId: "S1", date: "2026-10-15" }], 0), "Approving opens WIN on Tue Oct 13 and 2 more. Nobody is free to cover the first.");
});
