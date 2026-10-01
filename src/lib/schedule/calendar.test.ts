import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { monthWeeks, suggestedMonth } from "./calendar.ts";

describe("monthWeeks", () => {
  it("lays September 2026 out Sunday-first with the 1st on Tuesday", () => {
    const weeks = monthWeeks(2026, 9);
    assert.equal(weeks.length, 5);
    assert.deepEqual(weeks[0], [null, null, 1, 2, 3, 4, 5]);
    assert.deepEqual(weeks[4], [27, 28, 29, 30, null, null, null]);
    assert.equal(weeks.flat().filter((d) => d != null).length, 30);
  });
});

describe("suggestedMonth", () => {
  it("is this month early and mid month, and the next month in the last week", () => {
    assert.deepEqual(suggestedMonth({ year: 2026, month: 9, day: 3 }), { year: 2026, month: 9 });
    assert.deepEqual(suggestedMonth({ year: 2026, month: 9, day: 23 }), { year: 2026, month: 9 });
    assert.deepEqual(suggestedMonth({ year: 2026, month: 9, day: 24 }), { year: 2026, month: 10 });
    assert.deepEqual(suggestedMonth({ year: 2026, month: 9, day: 30 }), { year: 2026, month: 10 });
    assert.deepEqual(suggestedMonth({ year: 2026, month: 12, day: 28 }), { year: 2027, month: 1 });
  });
});
