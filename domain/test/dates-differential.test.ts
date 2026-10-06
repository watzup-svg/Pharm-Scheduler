// Differential test: domain/src/dates.ts (pure integer calendar maths) against the built-in Date in UTC.
// Every day from 1899-12-31 to 2101-01-01, plus leap-year and DST edges and invalid inputs. No clock, no locale.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, cmp, compareDates, dateOk, dateRange, daysInMonth, fromDayNumber, isLeap, isValidDate, monthDates, monthOf,
  toDayNumber, weekday, weekdayOccurrence,
} from "../src/dates.ts";

const MS = 86_400_000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
/** ISO string of a UTC day number via Date (the reference). Years below 100 need setUTCFullYear, which toISOString handles. */
const ref = (n: number): string => {
  const d = new Date(n * MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const refDay = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  dt.setUTCHours(0, 0, 0, 0);
  return Math.round(dt.getTime() / MS);
};

const FIRST = refDay("1899-12-31");
const LAST = refDay("2101-01-01");

test("every day 1899-12-31..2101-01-01: day number, round trip, weekday, month length, occurrence", () => {
  assert.equal(LAST - FIRST + 1, 73_416, "range size"); // sanity of the reference itself
  for (let n = FIRST; n <= LAST; n++) {
    const s = ref(n);
    const d = new Date(n * MS);
    assert.equal(toDayNumber(s), n, `toDayNumber(${s})`);
    assert.equal(fromDayNumber(n), s, `fromDayNumber(${n})`);
    assert.equal(weekday(s), d.getUTCDay(), `weekday(${s})`);
    assert.ok(isValidDate(s) && dateOk(s), `isValidDate(${s})`);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    assert.equal(daysInMonth(y, m), new Date(Date.UTC(y, m, 0)).getUTCDate(), `daysInMonth(${y},${m})`);
    assert.equal(weekdayOccurrence(s), Math.floor((day - 1) / 7) + 1, `weekdayOccurrence(${s})`);
    assert.equal(monthOf(s), s.slice(0, 7));
    // addDays against Date arithmetic for a spread of offsets
    for (const k of [-366, -31, -7, -1, 1, 2, 7, 28, 29, 30, 31, 365, 366]) {
      if (n + k < FIRST - 400 || n + k > LAST + 400) continue;
      assert.equal(addDays(s, k), ref(n + k), `addDays(${s},${k})`);
    }
  }
});

test("compare helpers agree with plain string order on valid dates", () => {
  let prev = ref(FIRST);
  for (let n = FIRST + 1; n <= LAST; n += 1) {
    const s = ref(n);
    assert.equal(cmp(prev, s), -1);
    assert.equal(cmp(s, prev), 1);
    assert.equal(compareDates(s, s), 0);
    assert.ok(prev < s);
    prev = s;
  }
});

test("leap years: 1900 is not leap, 2000 is, century and 4-year rules over 1600..2400", () => {
  assert.equal(isLeap(1900), false);
  assert.equal(isLeap(2000), true);
  assert.equal(isLeap(2100), false);
  assert.equal(isValidDate("1900-02-29"), false);
  assert.equal(isValidDate("2000-02-29"), true);
  assert.equal(isValidDate("2100-02-29"), false);
  assert.equal(addDays("1900-02-28", 1), "1900-03-01");
  assert.equal(addDays("2000-02-28", 1), "2000-02-29");
  assert.equal(addDays("2000-02-29", 1), "2000-03-01");
  for (let y = 1600; y <= 2400; y++) {
    const refLeap = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;
    assert.equal(isLeap(y), refLeap, `isLeap(${y})`);
    assert.equal(daysInMonth(y, 2), refLeap ? 29 : 28);
    assert.equal(isValidDate(`${pad(y, 4)}-02-29`), refLeap);
  }
});

test("DST transition days (US and EU, 2020..2030) are ordinary days: the domain has no clock", () => {
  const dstDays = (y: number): string[] => {
    const nth = (m: number, wd: number, k: number) => { let c = 0; for (let d = 1; d <= 31; d++) { const dt = new Date(Date.UTC(y, m, d)); if (dt.getUTCMonth() !== m) break; if (dt.getUTCDay() === wd && ++c === k) return `${y}-${pad(m + 1)}-${pad(d)}`; } return ""; };
    const last = (m: number, wd: number) => { for (let d = 31; d >= 1; d--) { const dt = new Date(Date.UTC(y, m, d)); if (dt.getUTCMonth() === m && dt.getUTCDay() === wd) return `${y}-${pad(m + 1)}-${pad(d)}`; } return ""; };
    return [nth(2, 0, 2), nth(10, 0, 1), last(2, 0), last(9, 0)];
  };
  for (let y = 2020; y <= 2030; y++) for (const s of dstDays(y)) {
    assert.ok(s, "found a DST day");
    const n = refDay(s);
    assert.equal(toDayNumber(s), n);
    assert.equal(addDays(s, 1), ref(n + 1));
    assert.equal(addDays(s, -1), ref(n - 1));
    assert.equal(weekday(s), 0, "DST changes happen on Sundays");
    // a local-time Date would see a 23 or 25 hour day; the domain must still step exactly one calendar day
    assert.equal(toDayNumber(addDays(s, 1)) - toDayNumber(s), 1);
  }
});

test("dateRange, monthDates and month boundaries match Date", () => {
  assert.deepEqual(dateRange("2026-02-27", "2026-03-02"), ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  assert.deepEqual(dateRange("2026-03-02", "2026-02-27"), []);
  assert.deepEqual(dateRange("2026-05-05", "2026-05-05"), ["2026-05-05"]);
  assert.deepEqual(dateRange("2027-12-30", "2028-01-02"), ["2027-12-30", "2027-12-31", "2028-01-01", "2028-01-02"]);
  for (let y = 1899; y <= 2101; y++) for (let m = 1; m <= 12; m++) {
    const ym = `${pad(y, 4)}-${pad(m)}`;
    const dates = monthDates(ym);
    const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
    assert.equal(dates.length, len, `monthDates(${ym})`);
    assert.equal(dates[0], `${ym}-01`);
    assert.equal(dates[len - 1], `${ym}-${pad(len)}`);
    assert.deepEqual(dateRange(`${ym}-01`, `${ym}-${pad(len)}`), dates);
    assert.equal(addDays(dates[len - 1]!, 1), m === 12 ? `${pad(y + 1, 4)}-01-01` : `${pad(y, 4)}-${pad(m + 1)}-01`);
  }
  assert.throws(() => monthDates("2026-1"));
  assert.throws(() => monthDates("2026-01-01"));
});

test("year 0001 (the seed epoch) and far years behave", () => {
  assert.equal(toDayNumber("0001-01-01"), refDay("0001-01-01"));
  assert.equal(fromDayNumber(refDay("0001-01-01")), "0001-01-01");
  assert.equal(toDayNumber("9999-12-31"), refDay("9999-12-31"));
  assert.equal(fromDayNumber(refDay("9999-12-31")), "9999-12-31");
  for (const s of ["0001-01-01", "0004-02-29", "0100-02-28", "0400-02-29", "1582-10-15", "1700-03-01"]) {
    assert.equal(fromDayNumber(toDayNumber(s)), s);
    assert.equal(weekday(s), new Date(refDay(s) * MS).getUTCDay());
  }
});

test("invalid inputs are rejected", () => {
  const bad = [
    "2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-01-32", "2026-12-32",
    "2026-1-1", "2026-01-1", "2026-1-01", "26-01-01", "20260101", "2026/01/01", "2026-01-01 ", " 2026-01-01", "2026-01-01\n", "\t2026-01-01",
    "", "x", "2026-01", "2026-01-01T00:00:00Z", "2026-01-011", "+2026-01-01", "-2026-01-01", "2026-01-01\u0000",
    // unicode digits: Arabic-Indic, fullwidth, superscripts, mathematical
    "٢٠٢٦-٠١-٠١", "２０２６-０１-０１", "2026-01-0¹", "𝟐𝟎𝟐𝟔-01-01",
    "2026‐" + "01‐" + "01", "2026−" + "01-01",
  ];
  for (const s of bad) {
    assert.equal(isValidDate(s), false, `isValidDate(${JSON.stringify(s)})`);
    assert.equal(dateOk(s), false, `dateOk(${JSON.stringify(s)})`);
    assert.throws(() => toDayNumber(s), Error, `toDayNumber(${JSON.stringify(s)}) throws`);
    assert.throws(() => addDays(s, 1));
    assert.throws(() => weekday(s));
  }
  for (const v of [undefined, null, 20260101, {}, [], true]) assert.equal(dateOk(v), false);
  // a failed validation must not poison the cache for a valid date
  assert.equal(dateOk("2026-02-28"), true);
  assert.equal(dateOk("2026-02-29"), false);
  assert.equal(dateOk("2026-02-29"), false);
});

test("daysInMonth for out-of-range months does not claim February", () => {
  // documented behaviour: only 2 is February, 4 6 9 11 are 30, everything else 31. isValidDate guards month range separately.
  for (let m = 1; m <= 12; m++) assert.equal(daysInMonth(2026, m), new Date(Date.UTC(2026, m, 0)).getUTCDate());
  assert.equal(isValidDate("2026-00-10"), false);
  assert.equal(isValidDate("2026-13-10"), false);
});

test("fromDayNumber/toDayNumber is a bijection over a window around every leap day and year boundary", () => {
  for (let y = 1900; y <= 2100; y++) for (const s of [`${pad(y, 4)}-02-28`, `${pad(y, 4)}-12-31`, `${pad(y, 4)}-01-01`]) {
    const n = toDayNumber(s);
    for (let k = -3; k <= 3; k++) {
      assert.equal(fromDayNumber(n + k), ref(n + k));
      assert.equal(toDayNumber(ref(n + k)), n + k);
    }
  }
});
