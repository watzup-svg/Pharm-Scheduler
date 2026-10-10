import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { isoDate } from "./calendar.ts";
import { holidayDays, nextHoliday } from "./timeoff-view.ts";
import { getCell } from "./grid.ts";
import { RPH_SLOTS } from "./slots.ts";

describe("holidayDays", () => {
  const demo = createDemo();
  const base = { ...demo, holidays: [] };

  it("lists nothing when no holiday falls in the month", () => {
    assert.deepEqual(holidayDays(base), []);
  });

  it("names a holiday and the stores it shuts", () => {
    const doc = { ...base, holidays: [{ date: isoDate(base.year, base.month, 14), store: "ALL", label: "Test Day", repeat: false }] };
    const days = holidayDays(doc);
    assert.equal(days.length, 1);
    assert.equal(days[0]!.day, 14);
    assert.deepEqual(days[0]!.labels, ["Test Day"]);
    assert.equal(days[0]!.closed.length, doc.stores.length);
  });

  it("flags a pharmacist who is still named at a shut store, and not an empty day", () => {
    const day = 14;
    const doc = { ...base, holidays: [{ date: isoDate(base.year, base.month, day), store: "ALL", label: "Test Day", repeat: false }] };
    const named = doc.stores.some((s) => RPH_SLOTS.some((sl) => getCell(doc.grid, s.code, sl, day).trim()));
    const found = holidayDays(doc)[0]!.scheduled;
    assert.equal(found !== null, named);
  });

  it("ignores district closures; those are not holidays", () => {
    const doc = { ...base, holidays: [{ date: isoDate(base.year, base.month, 9), store: base.stores[0]!.code, label: "Weather", repeat: false, closure: true }] };
    assert.deepEqual(holidayDays(doc), []);
    assert.equal(nextHoliday(doc), null);
  });
});
