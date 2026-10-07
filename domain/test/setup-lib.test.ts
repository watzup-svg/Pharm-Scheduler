// Pure helpers behind the Setup tabs (app3/views/setup/lib.ts): U.S. holidays, a person's week and month, licences, a store's month,
// missing drive times and the pattern preview. Run: node --experimental-strip-types --test domain/test/setup-lib.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedWorld, type Seed } from "../src/seed.ts";
import { evaluate } from "../src/coverage.ts";
import { api } from "../src/api.ts";
import {
  describeWeekdays, dayStatuses, distanceEdits, guessFromNearest, holidayEdit, holidayToggle, indexByCell, indexByPerson, lastWeekdayOf, licenceInfo, missingDistances,
  monthStats, nearestStore, nthWeekdayOf, observedFor, parseMilesText, parseWholeMinutes, personDay, previewPattern, storeMonth, usHolidays, listCsv, peopleList,
} from "../../app3/views/setup/lib.ts";

const dateOf = (year: number, key: string) => usHolidays(year).find((h) => h.key === key)!;

test("floating holidays land on the right Monday or Thursday for many years", () => {
  // Known calendar dates (checked against the federal holiday tables).
  const expect: Record<number, Record<string, string>> = {
    2023: { mlk: "2023-01-16", presidents: "2023-02-20", memorial: "2023-05-29", labor: "2023-09-04", columbus: "2023-10-09", thanksgiving: "2023-11-23" },
    2024: { mlk: "2024-01-15", presidents: "2024-02-19", memorial: "2024-05-27", labor: "2024-09-02", columbus: "2024-10-14", thanksgiving: "2024-11-28" },
    2025: { mlk: "2025-01-20", presidents: "2025-02-17", memorial: "2025-05-26", labor: "2025-09-01", columbus: "2025-10-13", thanksgiving: "2025-11-27" },
    2026: { mlk: "2026-01-19", presidents: "2026-02-16", memorial: "2026-05-25", labor: "2026-09-07", columbus: "2026-10-12", thanksgiving: "2026-11-26" },
    2027: { mlk: "2027-01-18", presidents: "2027-02-15", memorial: "2027-05-31", labor: "2027-09-06", columbus: "2027-10-11", thanksgiving: "2027-11-25" },
    2028: { mlk: "2028-01-17", presidents: "2028-02-21", memorial: "2028-05-29", labor: "2028-09-04", columbus: "2028-10-09", thanksgiving: "2028-11-23" },
  };
  for (const [y, rows] of Object.entries(expect)) for (const [k, d] of Object.entries(rows)) assert.equal(dateOf(Number(y), k).date, d, `${y} ${k}`);
});

test("the Monday holidays are Mondays, Thanksgiving is a Thursday, for every year 1990 to 2100", () => {
  for (let y = 1990; y <= 2100; y++) {
    const day = (k: string) => new Date(`${dateOf(y, k).date}T12:00:00Z`).getUTCDay();
    for (const k of ["mlk", "presidents", "memorial", "labor", "columbus"]) assert.equal(day(k), 1, `${y} ${k}`);
    assert.equal(day("thanksgiving"), 4, `${y} thanksgiving`);
    const d = (k: string) => Number(dateOf(y, k).date.slice(8));
    assert.ok(d("mlk") >= 15 && d("mlk") <= 21);
    assert.ok(d("presidents") >= 15 && d("presidents") <= 21);
    assert.ok(d("memorial") >= 25 && d("memorial") <= 31);
    assert.ok(d("labor") <= 7);
    assert.ok(d("columbus") >= 8 && d("columbus") <= 14);
    assert.ok(d("thanksgiving") >= 22 && d("thanksgiving") <= 28);
    assert.equal(usHolidays(y).length, 11);
  }
});

test("fixed holidays keep their month and day; weekend ones get an observed weekday", () => {
  assert.equal(dateOf(2026, "juneteenth").date, "2026-06-19");
  assert.equal(dateOf(2026, "juneteenth").observed, undefined); // a Friday
  // July 4, 2026 is a Saturday: observed Friday July 3. 2027: Sunday, observed Monday July 5. 2025: Friday, nothing.
  assert.equal(dateOf(2026, "independence").date, "2026-07-04");
  assert.equal(dateOf(2026, "independence").observed, "2026-07-03");
  assert.equal(dateOf(2027, "independence").observed, "2027-07-05");
  assert.equal(dateOf(2025, "independence").observed, undefined);
  // Juneteenth 2027 is a Saturday, 2028 a Monday.
  assert.equal(dateOf(2027, "juneteenth").observed, "2027-06-18");
  assert.equal(dateOf(2028, "juneteenth").observed, undefined);
  assert.equal(dateOf(2027, "christmas").observed, "2027-12-24");
  assert.equal(observedFor("2028-01-01"), "2027-12-31");
  assert.equal(observedFor("2026-11-11"), undefined);
});

test("holidays come back in date order and the helpers agree with each other", () => {
  const list = usHolidays(2026);
  assert.deepEqual(list.map((h) => h.date), [...list.map((h) => h.date)].sort());
  assert.equal(nthWeekdayOf(2026, 11, 4, 4), "2026-11-26");
  assert.equal(lastWeekdayOf(2026, 5, 1), "2026-05-25");
  assert.equal(lastWeekdayOf(2027, 5, 1), "2027-05-31");
  assert.equal(list.find((h) => h.key === "columbus")!.label, "Columbus Day");
});

const seed: Seed = {
  stores: [
    { id: "S1", code: "AAA", name: "Alpha", state: "OR", closedWeekdays: [0, 4, 5, 6] },
    { id: "S2", code: "BBB", name: "Beta", state: "OR", closedWeekdays: [0, 3, 4, 5, 6], twoDays: [2] },
    { id: "S3", code: "CCC", name: "Gamma", state: "WA", closedWeekdays: [0, 1, 2, 3, 5, 6] },
  ],
  pharmacists: [{ id: "P1", name: "Ann Ash", base: "S1", lic: ["OR"] }, { id: "P2", name: "Bo Birch", base: "S2", lic: null }],
  travel: [["S1", "S2", 30, 20], ["S2", "S1", 30, 20], ["S2", "S3", 50, 40]],
};
const world = seedWorld(seed);
const state = world.state;

test("holiday toggle closes the stores that are open, and reopens only what the holiday closed", () => {
  const date = "2026-11-24"; // a Tuesday: AAA 1, BBB 2, CCC shut
  const rows = dayStatuses(state, date);
  assert.deepEqual(rows.map((r) => [r.storeId, r.kind, r.count]), [["S1", "usual", 1], ["S2", "usual", 2], ["S3", "shut", 0]]);
  const t = holidayToggle(state, date, "Test day");
  assert.equal(t.action, "close");
  assert.deepEqual(t.stores, ["S1", "S2"]);
  const r = api.commit(world, t.edits, { kind: "manual" });
  assert.ok(!("refused" in r));
  if ("refused" in r) return;
  assert.equal(r.world.state.dateOverrides["S1|2026-11-24"]!.note, "Test day");
  const again = holidayToggle(r.world.state, date, "Test day");
  assert.equal(again.action, "reopen");
  const back = api.commit(r.world, again.edits, { kind: "manual" });
  if ("refused" in back) throw new Error("refused");
  assert.equal(api.stateHash(back.world.state), api.stateHash(state));
  // a store set to a different note is not reopened by this holiday
  const other = holidayEdit(state, "S1", date, "Flu clinic", { t: "need", n: 3 })!;
  assert.deepEqual(other, { t: "dateOverride.set", storeId: "S1", date, count: 3, note: "Flu clinic" });
  assert.equal(holidayEdit(state, "S1", date, "x", { t: "usual" }), null);
});

test("a person's day: home, covering, time off, waiting, two places", () => {
  let w = world;
  const place = (s: string, p: string, date: string) => {
    const r = api.commit(w, [{ t: "place", storeId: s, pharmacistId: p, date }], { kind: "manual" });
    if ("refused" in r) throw new Error(r.reason);
    w = r.world;
  };
  place("S1", "P1", "2026-10-05"); // Monday at home
  place("S2", "P1", "2026-10-06"); // Tuesday covering
  place("S1", "P2", "2026-10-07");
  const r = api.commit(w, [{ t: "unavail.add", pharmacistId: "P1", first: "2026-10-07", last: "2026-10-07", status: "Approved", type: "Vacation" }, { t: "unavail.add", pharmacistId: "P1", first: "2026-10-08", last: "2026-10-08", status: "Requested", type: "Vacation" }], { kind: "manual" });
  if ("refused" in r) throw new Error(r.reason);
  w = r.world;
  const idx = indexByPerson(w.state);
  const p1 = w.state.pharmacists.P1!;
  assert.equal(personDay(w.state, p1, "2026-10-05", idx).mark, "home");
  assert.equal(personDay(w.state, p1, "2026-10-06", idx).mark, "cover");
  assert.equal(personDay(w.state, p1, "2026-10-07", idx).mark, "off");
  assert.equal(personDay(w.state, p1, "2026-10-08", idx).mark, "waiting");
  assert.equal(personDay(w.state, p1, "2026-10-09", idx).mark, "none");
  const two = api.commit(w, [{ t: "place", storeId: "S3", pharmacistId: "P1", date: "2026-10-06" }], { kind: "manual" });
  if (!("refused" in two)) assert.equal(personDay(two.world.state, p1, "2026-10-06", indexByPerson(two.world.state)).mark, "double");
});

test("month stats count days and the longest run that touches the month", () => {
  const mk = (...dates: string[]) => new Map(dates.map((d) => [d, []]));
  const s = monthStats(mk("2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"), "2026-10");
  assert.equal(s.days, 4);
  assert.equal(s.longest, 4); // Sep 29 to Oct 2 runs across the month edge
  assert.equal(s.from, "2026-09-29");
  assert.equal(monthStats(undefined, "2026-10").longest, 0);
  assert.equal(monthStats(mk("2026-08-01", "2026-08-02"), "2026-10").longest, 0);
});

test("licence state: not recorded, none, expiring, expired, fine", () => {
  const p = (licenses: any) => ({ id: "P", name: "X", initials: "X", baseStoreId: null, ...(licenses === undefined ? {} : { licenses }) });
  assert.equal(licenceInfo(p(undefined), "2026-10-06").attention, "missing");
  assert.equal(licenceInfo(p({}), "2026-10-06").attention, "none");
  assert.equal(licenceInfo(p({ OR: null }), "2026-10-06").attention, null);
  assert.equal(licenceInfo(p({ OR: "2026-12-05" }), "2026-10-06").attention, "expiring"); // 60 days is still inside
  assert.equal(licenceInfo(p({ OR: "2026-12-06" }), "2026-10-06").attention, null);
  assert.equal(licenceInfo(p({ OR: "2026-10-05" }), "2026-10-06").attention, "expired");
  assert.equal(licenceInfo(p({ OR: "2026-10-06", WA: "2030-01-01" }), "2026-10-06").items[0]!.status, "expiring");
});

test("weekday lists read the way a person says them", () => {
  assert.equal(describeWeekdays([1, 2, 3, 4, 5]), "Mon-Fri");
  assert.equal(describeWeekdays([1, 3, 5]), "Mon, Wed, Fri");
  assert.equal(describeWeekdays([6, 0]), "Sat, Sun");
  assert.equal(describeWeekdays([1, 2]), "Mon, Tue");
  assert.equal(describeWeekdays([]), "no days");
});

test("a store's month: closed days, covered, open, and the longest stay", () => {
  let w = world;
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) {
    const r = api.commit(w, [{ t: "place", storeId: "S1", pharmacistId: "P1", date: d }], { kind: "manual" });
    if ("refused" in r) throw new Error(r.reason);
    w = r.world;
  }
  const dates = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-12", "2026-10-13"];
  const ev = evaluate(w.state, "2026-10-01", { range: { from: dates[0]!, to: dates[5]! } });
  const m = storeMonth(ev, "S1", dates, indexByCell(w.state));
  assert.deepEqual(m.ticks.map((t) => t.tick), ["closed", "covered", "covered", "covered", "open", "open"]);
  assert.deepEqual(m.counts, { covered: 3, open: 2, broken: 0, closed: 1 });
  assert.equal(m.longest?.pharmacistId, "P1");
  assert.equal(m.longest?.days, 3);
});

test("missing drive times are listed, never guessed", () => {
  const miss = missingDistances(state, "2026-10-06");
  const forS3 = miss.find((m) => m.storeId === "S3")!;
  assert.deepEqual(forS3.partners.map((p) => [p.otherId, p.missingForward, p.missingBack]), [["S1", true, true], ["S2", true, false]]);
  assert.equal(miss[0]!.storeId === "S3" || miss[0]!.partners.length >= forS3.partners.length, true);
  assert.equal(nearestStore(state, "S3", "2026-10-06"), "S2");
  assert.equal(nearestStore(state, "S1", "2026-10-06"), "S2");
  // The starting guess is the nearest store's own numbers, or nothing at all.
  assert.deepEqual(guessFromNearest(state, "S2", "S1"), { minutes: 30, miles: 20 });
  assert.equal(guessFromNearest(state, "S1", "S3"), null);
  // Only directions that are missing get written.
  const e = distanceEdits(state, "S3", "S2", 55, 41);
  assert.equal(e.length, 1);
  assert.deepEqual(e[0], { t: "travel.set", pair: { fromStoreId: "S3", toStoreId: "S2", minutes: 55, miles: 41 } });
  assert.equal(distanceEdits(state, "S1", "S2", 99, 99).length, 0);
  assert.equal(distanceEdits(state, "S3", "S1", 70, 60).length, 2);
  assert.equal(parseWholeMinutes(""), null);
  assert.equal(parseWholeMinutes("0"), null);
  assert.equal(parseWholeMinutes("45"), 45);
  assert.equal(parseWholeMinutes("-5"), null);
  assert.equal(parseMilesText("12.5"), 12.5);
  assert.equal(parseMilesText("abc"), null);
});

test("the pattern preview shows four weeks and flags closed days and time off", () => {
  const draft = { id: "draft", storeId: "S1", pharmacistId: "P1", recurrence: { weekdays: [1, 4], cycleWeeks: 1 as const, anchor: "2026-10-05" }, effectiveFrom: "2026-10-05" };
  const r = api.commit(world, [{ t: "unavail.add", pharmacistId: "P1", first: "2026-10-12", last: "2026-10-12", status: "Approved", type: "Vacation" }], { kind: "manual" });
  if ("refused" in r) throw new Error(r.reason);
  const p = previewPattern(r.world.state, draft, "2026-10-05", 4);
  assert.equal(p.rows.length, 4);
  assert.equal(p.rows.every((row) => row.length === 7), true);
  assert.equal(p.hits, 8); // Monday and Thursday for four weeks
  const hit = (d: string) => p.rows.flat().find((x) => x.date === d)!;
  assert.equal(hit("2026-10-12").issue, "off");
  assert.equal(hit("2026-10-08").issue, "closed"); // AAA is shut on Thursdays
  assert.equal(hit("2026-10-05").issue, undefined);
  assert.equal(p.flagged, 5); // four Thursdays shut and one Monday off
  // the first week is cut at `from`
  assert.equal(previewPattern(state, draft, "2026-10-08", 4).rows[0]!.filter((d) => d.hit).length, 1);
});

test("lists: CSV never lets a name run as a formula; plain text keeps one line per person", () => {
  const w = api.commit(world, [{ t: "pharmacist.set", pharmacist: { id: "P3", name: "=HYPERLINK(\"x\")\nEvil", initials: "EV", baseStoreId: "S1", licenses: { OR: null } } }], { kind: "manual" });
  if ("refused" in w) throw new Error(w.reason);
  const list = peopleList(w.world.state, "2026-10-06");
  const csv = listCsv(list);
  assert.ok(csv.includes("\"'=HYPERLINK"), csv);
  assert.equal(list.rows.length, 3);
  assert.ok(list.rows.some((r) => r[3] === "not recorded"));
});
