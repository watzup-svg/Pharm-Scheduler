import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { districtModel } from "./district.ts";
import { evaluate } from "./rules.ts";
import { applyNextMonthPlan, planNextMonth } from "./next-month.ts";
import { normalizeTimeOff } from "./pto.ts";
import { isWaiting, olderRequests, summarize } from "./timeoff-view.ts";

const oct = createDemo();
const nov = applyNextMonthPlan(oct, planNextMonth(oct));

describe("requests waiting", () => {
  it("counts the practice month's two undecided October requests in October", () => {
    assert.equal(summarize(oct).waiting, 2);
    assert.equal(olderRequests(oct).length, 0);
  });

  it("stops counting them once the month moves on to November", () => {
    assert.equal(nov.timeOff.filter((t) => t.status === "requested").length, 2, "the requests themselves are kept");
    assert.equal(summarize(nov).waiting, 0);
    assert.equal(olderRequests(nov).length, 2);
    assert.equal(districtModel(nov, evaluate(nov), { year: 2026, month: 11, day: 1 }).counts.requests, 0);
  });

  it("still counts a request for this month, a later month, or one that runs into this month", () => {
    const ask = (dates: string[]) => normalizeTimeOff({ name: "Anders Kowal", dates, status: "requested", requestedOn: "2026-10-01" });
    assert.equal(isWaiting(nov, ask(["2026-11-03"])), true);
    assert.equal(isWaiting(nov, ask(["2026-12-24"])), true);
    assert.equal(isWaiting(nov, ask(["2026-10-31", "2026-11-01"])), true);
    assert.equal(isWaiting(nov, ask(["2026-10-30"])), false);
  });

  it("never counts approved or declined time off as waiting", () => {
    assert.equal(isWaiting(nov, normalizeTimeOff({ name: "Anders Kowal", dates: ["2026-11-03"] })), false);
    assert.equal(isWaiting(nov, normalizeTimeOff({ name: "Anders Kowal", dates: ["2026-11-03"], status: "declined" })), false);
  });
});
