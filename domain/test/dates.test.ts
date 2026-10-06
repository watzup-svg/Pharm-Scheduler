import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, cmp, dateRange, daysInMonth, fromDayNumber, hhmmToMinutes, isValidDate,
  minutesToHhmm, monthDates, toDayNumber, weekday, weekdayOccurrence,
} from "../src/dates.ts";

test("epoch and round trip", () => {
  assert.equal(toDayNumber("1970-01-01"), 0);
  for (const s of ["1999-12-31", "2000-02-29", "2026-10-06", "2100-03-01", "1900-02-28"]) {
    assert.equal(fromDayNumber(toDayNumber(s)), s);
  }
});

test("every day of 2024-2028 round-trips and weekdays advance by one", () => {
  const a = toDayNumber("2024-01-01");
  const b = toDayNumber("2028-12-31");
  let prev = -1;
  for (let n = a; n <= b; n++) {
    const s = fromDayNumber(n);
    assert.equal(toDayNumber(s), n);
    assert.ok(isValidDate(s));
    const w = weekday(s);
    if (prev >= 0) assert.equal(w, (prev + 1) % 7);
    prev = w;
  }
});

test("known weekdays", () => {
  assert.equal(weekday("2026-03-21"), 6); // Sadie's birthday, Saturday
  assert.equal(weekday("2026-10-06"), 2); // Tuesday
  assert.equal(weekday("2000-01-01"), 6);
});

test("addDays crosses month, year, leap day", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("validity", () => {
  assert.ok(!isValidDate("2026-02-29"));
  assert.ok(isValidDate("2028-02-29"));
  assert.ok(!isValidDate("2026-13-01"));
  assert.ok(!isValidDate("2026-1-01"));
  assert.equal(daysInMonth(2100, 2), 28);
  assert.equal(daysInMonth(2000, 2), 29);
});

test("month dates and ranges", () => {
  assert.equal(monthDates("2026-02").length, 28);
  assert.deepEqual(dateRange("2026-01-30", "2026-02-02"), ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
  assert.deepEqual(dateRange("2026-02-02", "2026-02-01"), []);
});

test("weekday occurrence", () => {
  assert.equal(weekdayOccurrence("2026-10-01"), 1);
  assert.equal(weekdayOccurrence("2026-10-07"), 1);
  assert.equal(weekdayOccurrence("2026-10-08"), 2);
  assert.equal(weekdayOccurrence("2026-10-29"), 5);
});

test("cmp is code-point order, not locale order", () => {
  assert.equal(cmp("a", "B"), 1); // 'B' (66) < 'a' (97)
  assert.equal(cmp("B", "a"), -1);
  assert.equal(cmp("é", "f"), 1);
  assert.equal(cmp("ab", "ab"), 0);
  assert.equal(cmp("ab", "abc"), -1);
  assert.deepEqual(["b", "A", "a", "B"].sort(cmp), ["A", "B", "a", "b"]);
});

test("minutes", () => {
  assert.equal(hhmmToMinutes("09:30"), 570);
  assert.equal(minutesToHhmm(570), "09:30");
  assert.throws(() => hhmmToMinutes("9:30"));
});
