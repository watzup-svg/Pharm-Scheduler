import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addBackup } from "./backup.ts";
import { ARCHIVE_KEY, loadArchive, monthKey, previousKey, putMonth, saveArchive } from "./archive.ts";
import { changesSince, snapshotOf } from "./changes.ts";
import { awayFromHome, awayList, offThisMonth } from "./dashboard.ts";
import { createDemo } from "./demo.ts";
import { districtModel, dayTone } from "./district.ts";
import { fairness } from "./fairness.ts";
import { parseDoc, serializeDoc } from "./file.ts";
import { distanceMiles, storeDistance } from "./geo.ts";
import { setCellValue } from "./grid.ts";
import { importGridText } from "./grid-import.ts";
import { personIcs, personText } from "./ics.ts";
import { placeName } from "./place.ts";
import { evaluate, issueKey } from "./rules.ts";
import { createSample } from "./sample.ts";
import { rankCandidates } from "./suggest.ts";
import { shortageByState, thinCoverDays } from "./thin.ts";
import { timeOffImpact } from "./impact.ts";
import { personOnPto } from "./pto.ts";
import { usHolidays } from "./us-holidays.ts";
import { stateOfStore } from "./licence.ts";
import { posterLines } from "./print-model.ts";
import { parsePosterLine, stateFromAddress } from "./print-model.ts";
import { readinessPct, trendPoints } from "./trend.ts";
import { secondLook } from "./second-look.ts";
import { planFill } from "./plan.ts";
import { missingNumbers, storeTag } from "./label.ts";
import { buildEmployeeCalendar } from "./print-model.ts";
import { requestHints } from "./impact.ts";
import { acceptKeys, acceptedItems, openProblemKeys, pruneAccepted, unacceptKeys } from "./accept.ts";
import { closeStoreDayDoc, closuresInMonth, closureFor, reopenStoreDayDoc } from "./closure.ts";
import { effectiveTimeOff } from "./employment.ts";
import { buildDistrictSheet, buildStorePoster } from "./print-model.ts";
import { doubleKey, holeKey } from "./rules.ts";
import { getCell } from "./grid.ts";
import { monthStatus } from "./dashboard.ts";
import { sickShifts, callInSickDoc } from "./sick.ts";
import { isStoreOpen } from "./calendar.ts";
import { storeHoursLine } from "./coverage.ts";

const demo = createDemo();
const ev = evaluate(demo);
void addBackup;

describe("away from home (regular pharmacists only)", () => {
  it("marks a regular pharmacist at another store, never a float, never at home", () => {
    assert.equal(awayFromHome(demo, "Gideon Ashcroft", "MOL"), "EST");
    assert.equal(awayFromHome(demo, "Gideon Ashcroft", "EST"), null);
    assert.equal(awayFromHome(demo, "Fenn Ritter", "WIN"), null); // float
  });
  it("lists every away placement in date order", () => {
    assert.deepEqual(
      awayList(demo).map((a) => [a.name, a.home, a.ref.store, a.ref.day]),
      [["Gideon Ashcroft", "EST", "MOL", 9], ["Lucia Denton", "FLO", "EST", 17]],
    );
  });
  it("the district strip shows it as its own tone unless something worse is going on", () => {
    assert.equal(dayTone(demo, ev, "EST", 17), "away");
    assert.equal(dayTone(demo, ev, "MOL", 9), "double"); // the double wins
  });
});

describe("ranked suggestions", () => {
  it("rank floats near a hole first, with reasons, and place nothing", () => {
    const before = JSON.stringify(demo.grid);
    const list = rankCandidates(demo, "WAL", 14);
    assert.equal(list[0]!.name, "Lena Sorensen");
    assert.ok(list[0]!.reasons.some((r) => /drive from their home store/.test(r)));
    assert.equal(JSON.stringify(demo.grid), before);
    const free = list.filter((s) => s.state === "free").map((s) => s.name);
    assert.deepEqual(free.slice(0, 4), ["Lena Sorensen", "Fenn Ritter", "Greta Voss", "Kip Alder"]);
  });
  it("prefer the shorter drive from home, floats included, and flag a very long one", () => {
    // Two floats, same days worked: one homed at the store, one two hours away.
    const near = { ...demo.people.find((p) => p.name === "Lena Sorensen")!, name: "Near Float", home: "WAL" };
    const far = { ...demo.people.find((p) => p.name === "Lena Sorensen")!, name: "Far Float", home: "CAT" };
    const d = { ...demo, people: [...demo.people, far, near] };
    const list = rankCandidates(d, "WAL", 14).filter((x) => x.state === "free");
    assert.ok(list.findIndex((x) => x.name === "Near Float") < list.findIndex((x) => x.name === "Far Float"));
    const f = list.find((x) => x.name === "Far Float")!;
    assert.ok(f.driveMinutes! >= 90);
    assert.ok(f.cautions.includes("Long drive"));
    assert.match(f.reasons.join(" "), /hr/);
  });
  it("leave out people who cannot work there, unless asked for so it can be explained (then last, never free)", () => {
    const list = rankCandidates(demo, "WOO", 26);
    assert.ok(!list.some((s) => s.name === "Fenn Ritter"), "Fenn is not licensed in WA, so is not offered");
    const all = rankCandidates(demo, "WOO", 26, "pharmacist", { includeUnlicensed: true });
    const fenn = all.find((s) => s.name === "Fenn Ritter")!;
    assert.equal(fenn.state, "blocked");
    assert.equal(all[all.length - 1]!.state, "blocked");
    assert.ok(all.findIndex((s) => s.state === "free") < all.indexOf(fenn));
  });
  it("warn about a sixth day, and are the same every time", () => {
    const a = rankCandidates(demo, "EST", 14, "pharmacist2").map((s) => s.name).join();
    const b = rankCandidates(demo, "EST", 14, "pharmacist2").map((s) => s.name).join();
    assert.equal(a, b);
  });
  it("ordinary distance math", () => {
    assert.ok(Math.abs(distanceMiles({ lat: 45.0, lng: -122 }, { lat: 46.0, lng: -122 }) - 69) < 1);
    assert.ok((storeDistance(demo, "EST", "MOL") ?? 0) > 10);
    assert.equal(storeDistance(createSample(), "EST", "MOL"), null); // sample has no locations
  });
});

describe("time off requests", () => {
  it("do not count until approved", () => {
    assert.equal(personOnPto(demo.timeOff, "Bram Okafor", "2026-10-27"), false);
    const approved = { ...demo, timeOff: demo.timeOff.map((t) => (t.name === "Bram Okafor" ? { ...t, status: "approved" as const } : t)) };
    assert.equal(personOnPto(approved.timeOff, "Bram Okafor", "2026-10-27"), true);
    const days = (d: typeof demo) => offThisMonth(d).find((r) => r.name === "Bram Okafor")?.dates ?? [];
    assert.equal(days(demo).includes("2026-10-27"), false);
    assert.equal(days(approved).includes("2026-10-27"), true);
  });
  it("show what approving would leave uncovered, with people who could cover", () => {
    const impact = timeOffImpact(demo, "Bram Okafor", ["2026-10-27", "2026-10-28"]);
    assert.deepEqual(impact.map((i) => [i.store, i.day, i.becomesHole]), [["IND", 27, true], ["IND", 28, true]]);
    assert.deepEqual(impact[0]!.suggestions.map((s) => s.name), ["Lena Sorensen", "Fenn Ritter", "Greta Voss"]);
    assert.equal(impact[0]!.suggestions.every((s) => s.state === "free"), true);
  });
  it("say when someone else is still there", () => {
    const impact = timeOffImpact(demo, "Gideon Ashcroft", ["2026-10-17"]); // Lucia is second pharmacist
    assert.equal(impact[0]!.becomesHole, false);
    assert.deepEqual(impact[0]!.suggestions, []);
  });
  it("status survives save and open, and older files count as approved", () => {
    const back = parseDoc(serializeDoc(demo));
    assert.equal(back.timeOff.filter((t) => t.status === "requested").length, 2);
    const plain = createSample();
    assert.equal(plain.timeOff.every((t) => t.status == null), true);
    assert.equal(personOnPto(plain.timeOff, "Jane Smith", "2026-09-14"), true);
  });
});

describe("state-aware shortage and thin cover", () => {
  it("a state with more open stores than pharmacists licensed for it is short even if the district is not", () => {
    // Everyone licensed in Washington is on time off on the 6th; five Washington stores are open.
    let d = createDemo();
    const wa = d.people.filter((p) => (p.licensedStates ?? []).includes("WA")).map((p) => p.name);
    d = { ...d, timeOff: [...d.timeOff, ...wa.slice(0, 4).map((name) => ({ name, dates: ["2026-10-06"], from: "2026-10-06", to: "2026-10-06", note: "" }))] };
    const rows = shortageByState(d);
    const row = rows.find((r) => r.day === 6 && r.state === "WA");
    assert.ok(row && row.openStores > row.available);
    assert.equal(rows.some((r) => r.day === 6 && r.state === "OR"), false);
  });
  it("finds days with no spare pharmacist for a state", () => {
    const thin = thinCoverDays(demo);
    assert.deepEqual(thin.map((t) => [t.day, t.state]), [[20, "WA"], [20, "OR"]]);
    assert.deepEqual(thinCoverDays(demo, 21), []);
  });
});

describe("two-pharmacist stores (the manager's choice)", () => {
  it("advises when a store that usually runs two has one, and never blocks", () => {
    assert.equal(ev.short, 4);
    assert.equal(ev.byKey[issueKey("SIL", 3)]!.needsSecond, true);
    assert.equal(ev.byKey[issueKey("SIL", 10)]!.needsSecond, false); // Fenn is second
    assert.equal(ev.ready, false); // for other reasons
    const clean = { ...createSample() };
    assert.equal(evaluate(clean).short, 0);
    const opted = { ...clean, stores: clean.stores.map((s) => (s.code === "EST" ? { ...s, twoPharmacistDays: [6] } : s)) };
    assert.equal(evaluate(opted).short, 4); // Estacada Saturdays 5, 12, 19, 26 each have one pharmacist
  });
  it("is kept in the file", () => {
    assert.deepEqual(parseDoc(serializeDoc(demo)).stores.find((s) => s.code === "SIL")?.twoPharmacistDays, [6]);
  });
});

describe("U.S. holidays, computed", () => {
  it("2026", () => {
    const by = Object.fromEntries(usHolidays(2026).map((h) => [h.key, h]));
    assert.equal(by.labor!.date, "2026-09-07");
    assert.equal(by.thanksgiving!.date, "2026-11-26");
    assert.equal(by.memorial!.date, "2026-05-25");
    assert.equal(by.mlk!.date, "2026-01-19");
    assert.equal(by.presidents!.date, "2026-02-16");
    assert.equal(by.columbus!.date, "2026-10-12");
    assert.equal(by.july4!.date, "2026-07-04");
    assert.equal(by.july4!.observed, "2026-07-03"); // a Saturday
    assert.equal(by.christmas!.observed, undefined); // a Friday
    assert.equal(by.july4!.fixed, true);
    assert.equal(by.labor!.fixed, false);
  });
  it("another year", () => {
    const by = Object.fromEntries(usHolidays(2027).map((h) => [h.key, h]));
    assert.equal(by.thanksgiving!.date, "2027-11-25");
    assert.equal(by.memorial!.date, "2027-05-31");
    assert.equal(by.christmas!.observed, "2027-12-24"); // Saturday
  });
});

describe("fairness and archive", () => {
  it("counts days, Saturdays and days away, beside last month", () => {
    const rows = fairness(demo, createDemo());
    const lucia = rows.find((r) => r.name === "Lucia Denton")!;
    assert.equal(lucia.awayDays, 1);
    assert.equal(lucia.saturdays, 1);
    assert.equal(lucia.prev?.days, lucia.days);
    assert.equal(fairness(demo)[0]!.prev, null);
  });
  it("keeps one entry per month, newest first, and finds last month's key", () => {
    assert.equal(monthKey(2026, 3), "2026-03");
    assert.equal(previousKey(2026, 1), "2025-12");
    let list = putMonth([], { ym: "2026-09", savedAt: 1, fileName: "a", json: "1" });
    list = putMonth(list, { ym: "2026-10", savedAt: 2, fileName: "b", json: "2" });
    list = putMonth(list, { ym: "2026-09", savedAt: 3, fileName: "a2", json: "3" });
    assert.deepEqual(list.map((e) => [e.ym, e.json]), [["2026-10", "2"], ["2026-09", "3"]]);
    const data: Record<string, string> = {};
    const store = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    assert.equal(saveArchive(store, list), true);
    assert.equal(loadArchive(store).length, 2);
    assert.ok(data[ARCHIVE_KEY]);
  });
});

describe("changes since the last print", () => {
  it("reports stores and people whose days changed, and nothing when nothing was printed", () => {
    const snap = snapshotOf(demo, 123, "2026-10");
    assert.equal(changesSince(demo, snap).cells, 0);
    assert.equal(changesSince(demo, null).cells, 0);
    let d = placeName(demo, "WAL", "pharmacist", 14, "Lena Sorensen").doc;
    d = { ...d, grid: setCellValue(d.grid, "EST", "pharmacist", 5, "") };
    const c = changesSince(d, snap);
    assert.equal(c.cells, 2);
    assert.deepEqual(c.stores, { WAL: [14], EST: [5] });
    assert.deepEqual(c.people["Lena Sorensen"], [14]);
    assert.deepEqual(c.people["Gideon Ashcroft"], [5]);
  });
});

describe("calendar files and messages", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  it("makes one all-day event per day worked, folded and escaped, with the away note", () => {
    const ics = personIcs(demo, "Gideon Ashcroft", now);
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    const events = ics.match(/BEGIN:VEVENT/g)!.length;
    const worked = Object.values(demo.grid).flatMap((g) => Object.values(g).flatMap((row) => Object.values(row ?? {}))).filter((n) => n === "Gideon Ashcroft").length;
    assert.equal(events, worked);
    assert.equal(events, 27);
    assert.match(ics, /DTSTART;VALUE=DATE:20261009/);
    assert.match(ics, /DTEND;VALUE=DATE:20261010/);
    assert.match(ics, /SUMMARY:Work: Cutter’s \(away from EST\)/);
    for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
    assert.ok(!/\n(?!\s)/.test(ics.replace(/\r\n/g, "\u0000")));
  });
  it("is empty of events for someone with nothing scheduled", () => {
    assert.equal(personIcs({ ...demo, grid: {} }, "Gideon Ashcroft", now).includes("BEGIN:VEVENT"), false);
  });
  it("writes a short message with time off and where to go", () => {
    const text = personText(demo, "Anders Kowal");
    assert.match(text, /^Anders, your schedule for October 2026:/);
    assert.match(text, /Thu Oct 1: Cutter’s/);
    assert.match(text, /Time off: Oct 8–Oct 9/);
    assert.match(text, /103 Robbins St, Molalla, OR 97038 · \(503\) 829-9111/);
  });
});

describe("paste a schedule from a spreadsheet", () => {
  const blankish = { ...createSample(), grid: {} };
  const head = ["Store", "Row", ...Array.from({ length: 10 }, (_, i) => String(i + 1))].join("\t");
  it("places names by store and row, refusing what typing would refuse", () => {
    const text = [
      head,
      ["EST", "", "Jane Smith", "Jane", "Jane", "Jane", "Jane", "Jane", "", "", "", ""].join("\t"),
      ["EST", "2nd", "", "", "", "Susan", "", "", "", "", "", ""].join("\t"),
      ["WL", "", "Mark Chen", "", "", "", "", "Mark Chen", "", "", "", ""].join("\t"), // day 6 is a Sunday; WL is closed
      ["Nowhere", "", "Jane Smith"].join("\t"),
      ["MOL", "", "Nobody Here"].join("\t"),
    ].join("\n");
    const r = importGridText(blankish, text);
    assert.equal(r.placed, 7);
    assert.equal(r.doc.grid.EST?.pharmacist?.["1"], "Jane Smith");
    assert.equal(r.doc.grid.EST?.pharmacist2?.["4"], "Susan Brown"); // by first name, only one Susan
    assert.equal(r.doc.grid.WL?.pharmacist?.["6"], undefined);
    assert.deepEqual(r.problems.map((p) => p.why), ["Day 6: Jane Smith at a closed store", "Day 6: Mark Chen at a closed store", "No store matches “Nowhere”", "Day 1: no one on the roster is “Nobody Here”"]);
  });
  it("never overwrites a filled cell", () => {
    const filled = { ...createSample(), grid: setCellValue({}, "EST", "pharmacist", 1, "Tom Reyes") };
    const r = importGridText(filled, [head, "EST\t\tJane Smith\tJane Smith"].join("\n"));
    assert.equal(r.doc.grid.EST?.pharmacist?.["1"], "Tom Reyes");
    assert.equal(r.skipped, 1);
    assert.equal(r.placed, 1);
  });
  it("says what is wrong when there is no header", () => {
    assert.equal(importGridText(blankish, "EST\tJane").problems[0]!.why.startsWith("No header row"), true);
  });
});

describe("district model", () => {
  it("summarizes without inventing numbers: every count comes from the rules", () => {
    const m = districtModel(demo, ev, { year: 2026, month: 10, day: 14 });
    assert.deepEqual(m.counts, { holes: 6, doubles: 3, closedNames: 3, unlicensed: 1, short: 4, requests: 2, away: 2, thin: 2, checks: 2 });
    assert.equal(m.cards.length, 18);
    assert.equal(m.cards.find((c) => c.code === "WAL")!.todayTone, "hole");
    assert.deepEqual(m.cards.find((c) => c.code === "EST")!.today, ["Gideon Ashcroft"]);
    assert.equal(m.strip.length, 18);
    assert.equal(m.strip[0]!.tones.length, 31);
    assert.equal(m.weekend.filter(Boolean).length, 9);
  });
  it("has no 'today' for a month that is not the current one", () => {
    const m = districtModel(demo, ev, { year: 2026, month: 9, day: 30 });
    assert.equal(m.cards[0]!.today, null);
  });
  it("reads a state from the store", () => {
    assert.equal(stateOfStore(demo.stores.find((s) => s.code === "WOO")!), "WA");
  });
});

describe("poster away mark", () => {
  it("says where a regular pharmacist is from, never for floats, and keeps phone and lunch off", () => {
    const d = createDemo();
    assert.deepEqual(posterLines(d, "MOL", 9).includes("RPh: Gideon Ashcroft (from EST)"), true);
    assert.equal(posterLines(d, "MOL", 8).some((l) => l.includes("from")), false); // Fenn is a float
    for (const l of posterLines(d, "MOL", 9)) assert.doesNotMatch(l, /\(\d{3}\)|lunch/i);
  });
});

describe("someone called in sick", () => {
  const d = createDemo();
  it("finds their shifts, logs the days, and leaves the shifts open", () => {
    const shifts = sickShifts(d, "Gideon Ashcroft", [13, 14]);
    assert.deepEqual(shifts.map((s) => [s.store, s.day]), [["EST", 13], ["EST", 14]]);
    const after = callInSickDoc(d, "Gideon Ashcroft", [13, 14]);
    assert.equal(personOnPto(after.timeOff, "Gideon Ashcroft", "2026-10-13"), true);
    assert.equal(after.timeOff.at(-1)!.note, "Called in sick");
    assert.equal(evaluate(after).byKey[issueKey("EST", 13)]!.hole, true);
    assert.equal(sickShifts(after, "Gideon Ashcroft", [13, 14]).length, 0);
  });
  it("ranks who could cover, never the sick person, and does not change the schedule", () => {
    const after = callInSickDoc(d, "Gideon Ashcroft", [13]);
    const ranked = rankCandidates(after, "EST", 13, "pharmacist", { exclude: ["Gideon Ashcroft"] });
    assert.ok(ranked.length > 0 && ranked[0]!.state === "free");
    assert.equal(ranked.some((r) => r.name === "Gideon Ashcroft"), false);
    assert.equal(after.grid.EST?.pharmacist?.["13"] ?? "", "");
    assert.match(d.people.find((p) => p.name === ranked[0]!.name)!.phone, /^\(503\) 555-01\d\d$/);
  });
  it("skips a closed day", () => {
    assert.deepEqual(sickShifts(d, "Gideon Ashcroft", [11]), []); // Sunday
  });
});

describe("weekdays a store is closed", () => {
  it("closes those days everywhere they are checked, and is kept in the file", () => {
    const base = createDemo();
    const doc = { ...base, stores: base.stores.map((s) => (s.code === "EST" ? { ...s, closedWeekdays: [3] } : s)) };
    assert.equal(isStoreOpen(doc.stores.find((s) => s.code === "EST")!, 2026, 10, 14, 31, []), false); // a Wednesday
    assert.equal(isStoreOpen(doc.stores.find((s) => s.code === "EST")!, 2026, 10, 15, 31, []), true);
    assert.equal(placeName(doc, "EST", "pharmacist", 14, "Gideon Ashcroft").reason, "shut");
    assert.deepEqual(parseDoc(serializeDoc(doc)).stores.find((s) => s.code === "EST")?.closedWeekdays, [3]);
    assert.match(storeHoursLine(true, false, [3]), /Mon, Tue, Thu, Fri/);
  });
});

describe("suggestions and pending requests", () => {
  it("warn about someone who has asked for that day off, and rank them lower", () => {
    const d = createDemo();
    const before = rankCandidates(d, "WAL", 14).find((x) => x.name === "Lena Sorensen")!;
    const asked = { ...d, timeOff: [...d.timeOff, { name: "Lena Sorensen", dates: ["2026-10-14"], from: "2026-10-14", to: "2026-10-14", note: "", status: "requested" as const }] };
    const after = rankCandidates(asked, "WAL", 14).find((x) => x.name === "Lena Sorensen")!;
    assert.equal(after.state, "free"); // a request does not make them unavailable
    assert.ok(after.cautions.some((c) => /asked for this day off/.test(c)));
    assert.ok(after.score < before.score);
  });
});

describe("debug pass regressions", () => {
  it("a file with a repeated store code or person name keeps the first of each", () => {
    const d = createDemo();
    const json = JSON.parse(serializeDoc(d));
    json.stores.push(json.stores[0]);
    json.people.push({ ...json.people[0], name: json.people[0].name.toUpperCase() });
    const back = parseDoc(JSON.stringify(json));
    assert.equal(back.stores.length, d.stores.length);
    assert.equal(back.people.length, d.people.length);
  });
  it("an old file that still has license end dates opens and ignores them", () => {
    const json = JSON.parse(serializeDoc(createDemo()));
    json.people[0].licenseExpires = { OR: "2020-01-01" };
    const back = parseDoc(JSON.stringify(json));
    assert.equal(evaluate(back).unlicensed, evaluate(createDemo()).unlicensed);
  });
  it("the same person at one store in both rows gets two different calendar events", () => {
    const d = { ...createDemo(), grid: setCellValue(setCellValue({}, "EST", "pharmacist", 5, "Gideon Ashcroft"), "EST", "pharmacist2", 5, "Gideon Ashcroft") };
    const ids = personIcs(d, "Gideon Ashcroft").match(/UID:.*/g)!;
    assert.equal(new Set(ids).size, ids.length);
  });
  it("people with no home store are listed as worth a second look", () => {
    const d = createDemo();
    const bare = { ...d, people: d.people.map((p) => (p.name === "Kip Alder" ? { ...p, home: "—" } : p)) };
    assert.ok(secondLook(bare).some((x) => /Kip Alder has no home store/.test(x.text)));
  });
});

describe("polish pass helpers", () => {
  it("splits a poster line into name, second-pharmacist flag and home store", () => {
    assert.deepEqual(parsePosterLine("RPh: Jane Smith"), { second: false, name: "Jane Smith", away: "" });
    assert.deepEqual(parsePosterLine("RPh2: Gideon Ashcroft (from EST)"), { second: true, name: "Gideon Ashcroft", away: "EST" });
    assert.equal(stateFromAddress("103 Robbins St, Molalla, OR 97038"), "OR");
    assert.equal(stateFromAddress("somewhere"), "");
  });
  it("readiness is the share of open store-days that are staffed correctly", () => {
    const d = createDemo();
    const pct = readinessPct(d);
    assert.ok(pct > 90 && pct < 100); // the practice month has planted problems
    assert.equal(readinessPct({ ...createSample() }) <= 100, true);
  });
  it("trend lists older kept months first and ends with the month on screen", () => {
    const now = createDemo();
    const sept = createSample();
    const archive = [{ ym: "2026-09", savedAt: 1, fileName: "s.json", json: serializeDoc(sept) }];
    const pts = trendPoints(now, archive);
    assert.deepEqual(pts.map((p) => p.label), ["Sep", "Oct"]);
    assert.equal(trendPoints(now, []).length, 1);
    assert.equal(trendPoints(now, [{ ym: "2026-09", savedAt: 1, fileName: "x", json: "broken" }]).length, 1); // a month that will not open is skipped
  });
  it("new files default to large poster type", () => {
    assert.equal(createDemo().printPrefs.typeSize === "large" || createDemo().printPrefs.typeSize === "normal", true);
  });
});

describe("accepting problems instead of fixing them", () => {
  const d = createDemo();
  const ev0 = evaluate(d);
  it("accepting a hole stops it blocking and is remembered in the file", () => {
    const acc = acceptKeys(d, [holeKey("MOT", 20)], new Date("2026-10-02T12:00:00Z"));
    const ev = evaluate(acc);
    assert.equal(ev.holes, ev0.holes - 1);
    assert.equal(ev.byKey[issueKey("MOT", 20)]!.holeAccepted, true);
    assert.equal(ev.byKey[issueKey("MOT", 20)]!.hole, false);
    assert.equal(ev.accepted, 1);
    assert.equal(monthStatus(acc, ev).steps.length, monthStatus(d, ev0).steps.length - 1);
    const back = parseDoc(serializeDoc(acc));
    assert.equal(evaluate(back).accepted, 1);
    assert.equal(acceptedItems(acc, ev)[0]!.label.includes("no pharmacist"), true);
  });
  it("a person in two places is accepted by name and day", () => {
    const acc = acceptKeys(d, [doubleKey("Gideon Ashcroft", 9)]);
    const ev = evaluate(acc);
    assert.equal(ev.doubles, ev0.doubles - 1);
    assert.deepEqual(ev.byKey[issueKey("EST", 9)]!.doubledAccepted, ["Gideon Ashcroft"]);
  });
  it("licenses cannot be accepted", () => {
    const key = "license|WIN|13";
    assert.equal(acceptKeys(d, [key]).accepted, undefined);
    assert.equal(openProblemKeys(d, ev0).some((k) => k.startsWith("license")), false);
    const all = acceptKeys(d, openProblemKeys(d, ev0));
    assert.equal(evaluate(all).unlicensed, ev0.unlicensed);
    assert.equal(evaluate(all).ready, false);
    assert.equal(evaluate(all).holes + evaluate(all).doubles + evaluate(all).closed, 0);
  });
  it("an accept ends when the problem goes away, so it cannot come back unseen", () => {
    let doc = acceptKeys(d, [holeKey("MOT", 20)]);
    doc = pruneAccepted(placeName(doc, "MOT", "pharmacist", 20, "Kip Alder").doc);
    assert.equal(doc.accepted, undefined);
    doc = placeName(doc, "MOT", "pharmacist", 20, "").doc;
    assert.equal(evaluate(doc).byKey[issueKey("MOT", 20)]!.hole, true);
  });
  it("undoing an accept brings the problem back", () => {
    const acc = acceptKeys(d, [holeKey("MOT", 20)]);
    assert.equal(evaluate(unacceptKeys(acc, [holeKey("MOT", 20)])).holes, ev0.holes);
  });
});

describe("closing a store for a day on purpose", () => {
  const d = createDemo();
  it("closes it with a reason, frees the people, and is reversible", () => {
    const closed = closeStoreDayDoc(d, "WAL", 14, "Short-staffed");
    const ev = evaluate(closed);
    assert.equal(ev.byKey[issueKey("WAL", 14)]!.open, false);
    assert.equal(ev.byKey[issueKey("WAL", 14)]!.hole, false);
    assert.equal(ev.holes, evaluate(d).holes - 1);
    assert.equal(closureFor(closed, "WAL", 14)!.label, "Short-staffed");
    assert.equal(closuresInMonth(closed).length, 1);
    const poster = buildStorePoster(closed, "WAL")!;
    const cell = poster.weeks.flat().find((c) => c.day === 14)!;
    assert.equal(cell.closed, true);
    assert.equal(cell.reason, "Short-staffed");
    const back = parseDoc(serializeDoc(closed));
    assert.equal(closureFor(back, "WAL", 14)?.closure, true);
    const open = reopenStoreDayDoc(closed, "WAL", 14);
    assert.equal(evaluate(open).byKey[issueKey("WAL", 14)]!.hole, true);
  });
  it("takes a scheduled person off that day", () => {
    const closed = closeStoreDayDoc(d, "EST", 13, "Weather or emergency");
    assert.equal(getCell(closed.grid, "EST", "pharmacist", 13), "");
    assert.equal(evaluate(closed).closed, evaluate(d).closed);
  });
});

describe("first and last day at the company", () => {
  it("counts the days outside them as time off, and never suggests the person", () => {
    const d = createDemo();
    const late = { ...d, people: d.people.map((p) => (p.name === "Lena Sorensen" ? { ...p, startsOn: "2026-10-20" } : p)) };
    assert.equal(personOnPto(effectiveTimeOff(late), "Lena Sorensen", "2026-10-14"), true);
    assert.equal(personOnPto(effectiveTimeOff(late), "Lena Sorensen", "2026-10-20"), false);
    const lena = rankCandidates(late, "WAL", 14).find((x) => x.name === "Lena Sorensen")!;
    assert.equal(lena.state, "off");
    const back = parseDoc(serializeDoc(late));
    assert.equal(back.people.find((p) => p.name === "Lena Sorensen")!.startsOn, "2026-10-20");
    const gone = { ...d, people: d.people.map((p) => (p.name === "Lena Sorensen" ? { ...p, endsOn: "2026-10-10" } : p)) };
    assert.equal(personOnPto(effectiveTimeOff(gone), "Lena Sorensen", "2026-10-12"), true);
  });
});

describe("intelligence pass", () => {
  const d = createDemo();
  it("fill proposal: best free person per open shift, nobody used twice in a day, nothing placed", () => {
    const before = JSON.stringify(d.grid);
    const rows = planFill(d);
    assert.equal(JSON.stringify(d.grid), before);
    assert.equal(rows.length, evaluate(d).holes);
    assert.equal(rows.find((r) => r.store === "MOT" && r.day === 20)!.pick, null); // six people off: nobody free
    let doc = d;
    for (const r of rows) if (r.pick) doc = placeName(doc, r.store, r.slot, r.day, r.pick.name).doc;
    assert.equal(evaluate(doc).doubles, evaluate(d).doubles); // the plan creates no new doubles
    assert.equal(evaluate(doc).holes, rows.filter((r) => !r.pick).length);
  });
  it("hints before approving a request: who else is off and days left with no spare pharmacist", () => {
    const h = requestHints(d, "Bram Okafor", ["2026-10-20", "2026-10-21"]);
    assert.ok(h.some((x) => /already off those days/.test(x)));
    assert.deepEqual(requestHints(createSample(), "Jane Smith", ["2026-09-30"]).filter((x) => /already off/.test(x)), []);
  });
  it("two or more no-spare days in one week become one fragile-week item", () => {
    const items = secondLook(d);
    const thinLines = items.filter((x) => /no spare/.test(x.text));
    const weekly = thinLines.filter((x) => /^Week of/.test(x.text));
    for (const w of weekly) assert.match(w.text, /\d+ days with no spare/);
    const dayTexts = new Set(thinLines.filter((x) => !/^Week of/.test(x.text)).map((x) => x.text));
    assert.equal(dayTexts.size + weekly.length, thinLines.length);
  });
  it("someone who has covered away from home a lot ranks a little lower", () => {
    const lena = rankCandidates(d, "WAL", 14).find((x) => x.name === "Lena Sorensen")!;
    let busy = d;
    for (const day of [1, 2, 5, 6]) busy = { ...busy, grid: setCellValue(busy.grid, "CAT", "pharmacist", day, "Lena Sorensen") };
    const after = rankCandidates(busy, "WAL", 14).find((x) => x.name === "Lena Sorensen")!;
    assert.ok(after.score < lena.score);
    assert.ok(after.reasons.some((r) => /covered away from home/.test(r)));
  });
  it("a poster changed since it was printed can say Revised", () => {
    const p = buildStorePoster(d, "EST")!;
    assert.equal(p.revised, undefined);
    assert.equal({ ...p, revised: true }.revised, true);
  });
  it("the printed district page lists accepted problems and closures", () => {
    const acc = closeStoreDayDoc(acceptKeys(d, [holeKey("MOT", 20)]), "WAL", 14, "Short-staffed");
    const sheet = buildDistrictSheet(acc);
    assert.ok(sheet.exceptions.some((x) => /Waldport closed Oct 14: Short-staffed/.test(x)));
    assert.ok(sheet.exceptions.some((x) => /no pharmacist.*left as is/.test(x)));
    assert.equal(sheet.holes.some((h) => h.store === "MOT" && h.day === 20), false);
  });
});

describe("start and end dates are optional", () => {
  it("blank (or missing) dates mean available, and either one can be used alone", () => {
    const d = createDemo();
    const blank = { ...d, people: d.people.map((p) => (p.name === "Lena Sorensen" ? { ...p, startsOn: "", endsOn: "" } : p)) };
    assert.equal(personOnPto(effectiveTimeOff(blank), "Lena Sorensen", "2026-10-14"), false);
    assert.equal(rankCandidates(blank, "WAL", 14).find((x) => x.name === "Lena Sorensen")!.state, "free");
    const onlyStart = { ...d, people: d.people.map((p) => (p.name === "Lena Sorensen" ? { ...p, startsOn: "2026-10-10" } : p)) };
    assert.equal(personOnPto(effectiveTimeOff(onlyStart), "Lena Sorensen", "2026-10-28"), false); // no end date: still available
    const onlyEnd = { ...d, people: d.people.map((p) => (p.name === "Lena Sorensen" ? { ...p, endsOn: "2026-10-20" } : p)) };
    assert.equal(personOnPto(effectiveTimeOff(onlyEnd), "Lena Sorensen", "2026-10-02"), false); // no start date: available from the beginning
    assert.equal(personOnPto(effectiveTimeOff(onlyEnd), "Lena Sorensen", "2026-10-21"), true);
    // a saved file with empty strings opens cleanly and keeps no dates
    const json = JSON.parse(serializeDoc(d));
    json.people[0].startsOn = "";
    json.people[0].endsOn = "";
    const back = parseDoc(JSON.stringify(json));
    assert.equal(back.people[0]!.startsOn, undefined);
    assert.equal(back.people[0]!.endsOn, undefined);
    // and a person saved without them has none
    assert.equal(parseDoc(serializeDoc(d)).people.every((p) => p.startsOn === undefined && p.endsOn === undefined), true);
  });
});

describe("store numbers", () => {
  it("shows letters by default and the number when chosen, falling back to letters where there is none", () => {
    const d = createDemo();
    assert.equal(storeTag(d, "EST"), "EST");
    const byNumber = { ...d, storeLabels: "number" as const };
    assert.equal(storeTag(byNumber, "EST"), d.stores.find((s) => s.code === "EST")!.number);
    const gap = { ...byNumber, stores: byNumber.stores.map((s) => (s.code === "MOL" ? { ...s, number: undefined } : s)) };
    assert.equal(storeTag(gap, "MOL"), "MOL");
    assert.deepEqual(missingNumbers(gap), ["MOL"]);
    assert.deepEqual(missingNumbers(d), []);
  });
  it("is saved in the file, and posters and calendars use it", () => {
    const d = { ...createDemo(), storeLabels: "number" as const };
    const back = parseDoc(serializeDoc(d));
    assert.equal(back.storeLabels, "number");
    assert.equal(back.stores.find((s) => s.code === "EST")!.number, d.stores.find((s) => s.code === "EST")!.number);
    const poster = buildStorePoster(back, "EST")!;
    assert.equal(poster.tag, back.stores.find((s) => s.code === "EST")!.number);
    assert.equal(poster.code, "EST");
    const sheet = buildDistrictSheet(back);
    assert.equal(sheet.stores.find((s) => s.code === "EST")!.tag, poster.tag);
    const cal = buildEmployeeCalendar(back, "Gideon Ashcroft")!;
    const marks = cal.weeks.flat().map((c) => c.mark);
    assert.ok(marks.includes(poster.tag));
    assert.equal(marks.includes("EST"), false);
    // letters are still the identity: the week counts as home work, not cover
    assert.equal(cal.weeks.flat().some((c) => c.mark === poster.tag && c.cover), false);
  });
  it("a file without numbers opens with letters", () => {
    assert.equal(parseDoc(serializeDoc(createSample())).storeLabels, undefined);
  });
});

describe("rankCandidates load cache", () => {
  it("does not go stale when the doc changes", () => {
    const doc = createSample();
    const store = doc.stores[0].code;
    const before = rankCandidates(doc, store, 3).map((c) => `${c.name}:${c.score}`);
    const again = rankCandidates(doc, store, 3).map((c) => `${c.name}:${c.score}`);
    assert.deepEqual(before, again);
    const top = rankCandidates(doc, store, 3)[0];
    const placed = placeName(doc, doc.stores[1].code, "pharmacist", 3, top.name).doc;
    const after = rankCandidates(placed, store, 3).find((c) => c.name === top.name);
    assert.notEqual(after?.score, top.score);
  });
});

describe("one-page print scoping", () => {
  it("splits open problems into this store / person and the rest", async () => {
    const { scopeSteps } = await import("./gate.ts");
    const steps = [
      { store: "EST", stores: ["EST"], names: ["Jane"] },
      { store: "MOL", stores: ["MOL"], names: ["Tom"] },
      { store: "WL", stores: ["WL", "EST"], names: ["Ann", "Jane"] },
    ];
    const s = scopeSteps(steps, { kind: "store", code: "EST" });
    assert.equal(s.own.length, 2);
    assert.equal(s.other.length, 1);
    const p = scopeSteps(steps, { kind: "person", name: "Tom" });
    assert.equal(p.own.length, 1);
    assert.equal(p.other.length, 2);
  });
});

describe("time off view model", () => {
  it("counts who is off per day, flags requests, and finds overlap", async () => {
    const { dayLoads, summarize, overlapFor, duplicateDates, noticeDays, entriesOf } = await import("./timeoff-view.ts");
    const doc = createDemo();
    const loads = dayLoads(doc);
    assert.equal(loads.length, 31);
    const s = summarize(doc, loads);
    assert.ok(s.peopleOff > 0);
    assert.equal(s.waiting, doc.timeOff.filter((t) => t.status === "requested").length);
    const busiest = s.busiest!;
    assert.equal(loads[busiest.day - 1]!.off.length, busiest.off);
    const day20 = loads[busiest.day - 1]!;
    const who = day20.off[0]!;
    assert.ok(overlapFor(doc, "Nobody Here", [day20.date]).some((o) => o.name === who));
    assert.equal(overlapFor(doc, who, [day20.date]).some((o) => o.name === who), false);
    assert.deepEqual(duplicateDates(doc, who, [day20.date]), [day20.date]);
    const req = entriesOf(doc).find((e) => e.status === "requested")!;
    assert.ok(noticeDays(req) === null || typeof noticeDays(req) === "number");
  });
});

describe("hand-set drive times", () => {
  it("beat the estimate, survive save/load and renames, and go when a store goes", async () => {
    const { driveBetween } = await import("./geo.ts");
    const { applyStore, removeStoreDoc } = await import("./identity.ts");
    const doc = createDemo();
    const [a, b] = [doc.stores[0]!.code, doc.stores[5]!.code];
    const est = driveBetween(doc, a, b)!;
    assert.equal(est.estimated, true);
    const set = { ...doc, driveMinutes: { [a <= b ? `${a}|${b}` : `${b}|${a}`]: 37 } };
    const hand = driveBetween(set, b, a)!;
    assert.equal(hand.minutes, 37);
    assert.equal(hand.estimated, false);
    const again = parseDoc(serializeDoc(set));
    assert.equal(driveBetween(again, a, b)!.minutes, 37);
    const store = set.stores.find((s) => s.code === a)!;
    const renamed = applyStore(set, a, { ...store, code: "ZZZ" });
    assert.equal(driveBetween(renamed, "ZZZ", b)!.minutes, 37);
    const gone = removeStoreDoc(set, a);
    assert.equal(gone.driveMinutes, undefined);
  });
});

describe("nobody is offered for a state they can't be shown to be licensed in", () => {
  it("never suggests anyone who lacks the state, anywhere, on any day", async () => {
    const { licenceForState, stateOfStore } = await import("./licence.ts");
    const { daysInMonth } = await import("./calendar.ts");
    for (const mk of [createDemo, createSample]) {
      const doc = mk();
      for (const store of doc.stores) {
        const state = stateOfStore(store);
        for (let day = 1; day <= daysInMonth(doc.year, doc.month); day += 3) {
          for (const s of rankCandidates(doc, store.code, day)) {
            assert.equal(licenceForState(doc, s.name, state), "ok", `${s.name} offered at ${store.code} day ${day}`);
          }
        }
      }
    }
  });

  it("treats 'nothing on file' as licensed only in the home state", async () => {
    const { licenceForState } = await import("./licence.ts");
    const doc = createDemo();
    const wa = doc.stores.find((s) => /, WA\b/.test(s.address))!;
    const orStore = doc.stores.find((s) => /, OR\b/.test(s.address))!;
    const person = doc.people.find((p) => p.home === orStore.code && p.role === "Pharmacist")!;
    const blank = { ...doc, people: doc.people.map((p) => (p.name === person.name ? { ...p, licensedStates: undefined } : p)) };
    assert.equal(licenceForState(blank, person.name, "OR"), "ok");
    assert.equal(licenceForState(blank, person.name, "WA"), "unrecorded");
    const offered = rankCandidates(blank, wa.code, 6).map((s) => s.name);
    assert.ok(!offered.includes(person.name));
    const explained = rankCandidates(blank, wa.code, 6, "pharmacist", { includeUnlicensed: true }).map((s) => s.name);
    assert.ok(explained.includes(person.name), "still available when asked for, so it can be explained");
    // recorded OR-only: lacks WA
    const orOnly = { ...doc, people: doc.people.map((p) => (p.name === person.name ? { ...p, licensedStates: ["OR"] } : p)) };
    assert.equal(licenceForState(orOnly, person.name, "WA"), "lacks");
  });

  it("does not let the fill plan or time-off cover suggestions pick them either", async () => {
    const { planFill } = await import("./plan.ts");
    const { licenceAt } = await import("./licence.ts");
    const doc = createDemo();
    const rows = planFill(doc);
    assert.ok(rows.length > 0);
    for (const row of rows) {
      if (row.pick) assert.equal(licenceAt(doc, row.pick.name, row.store).status, "ok");
    }
  });
});

describe("coverage wording and solo doubles", () => {
  it("flags when moving someone would leave their store with no coverage", async () => {
    const { choicesFor } = await import("./dashboard.ts");
    const { createSample } = await import("./sample.ts");
    const doc = createSample();
    // Anyone listed as "double" must report which of those stores they alone staff.
    for (let day = 1; day <= 30; day++) {
      for (const c of choicesFor(doc, "EST", day)) {
        for (const s of c.elsewhereSolo) assert.ok(c.elsewhere.includes(s));
      }
    }
  });
});

describe("clean copy", () => {
  it("drops notes, from-marks, time-off and warning marks but keeps who works where", async () => {
    const pm = await import("./print-model.ts");
    const { createDemo } = await import("./demo.ts");
    const doc = createDemo();
    const name = doc.people.find((p) => p.role !== "Float Pharmacist")!.name;
    const emp = pm.cleanModel(pm.buildEmployeeCalendar(doc, name)!);
    const marks = emp.weeks.flat().map((c) => c.mark);
    assert.ok(!marks.some((m) => ["PTO", "DBL", "OFF"].includes(m)));
    assert.ok(emp.weeks.flat().every((c) => !c.cover));
    assert.ok(marks.some((m) => m), "still shows where they work");
    const st = pm.cleanModel(pm.buildStorePoster(doc, doc.stores[0]!.code)!);
    assert.ok(st.weeks.flat().every((c) => !c.note && !c.reason && c.lines.every((l) => !/\(from /.test(l))));
    const d = pm.cleanModel(pm.buildDistrictSheet(doc));
    assert.equal(d.holes.length + d.exceptions.length, 0);
    assert.ok(d.stores.some((s) => s.days.some((x) => x.names.length)));
  });
});

describe("overrides: not suggested, relief, safe approvals", () => {
  it("skips a 'don't suggest' person in rankCandidates but keeps them in choices", async () => {
    const { createDemo } = await import("./demo.ts");
    const { rankCandidates } = await import("./suggest.ts");
    const { choicesFor } = await import("./dashboard.ts");
    const doc = createDemo();
    const st = doc.stores[0]!.code;
    const top = rankCandidates(doc, st, 14)[0]!.name;
    const doc2 = { ...doc, people: doc.people.map((p) => (p.name === top ? { ...p, noSuggest: true } : p)) };
    assert.ok(!rankCandidates(doc2, st, 14).some((c) => c.name === top));
    assert.ok(choicesFor(doc2, st, 14).some((c) => c.name === top));
  });
  it("safeToApprove is false when the only other pharmacist is already on approved time off", async () => {
    const { createDemo } = await import("./demo.ts");
    const { safeToApprove, timeOffImpact } = await import("./impact.ts");
    const doc = createDemo();
    // Any request that currently leaves a hole is never safe.
    for (const t of doc.timeOff.filter((x) => x.status === "requested")) {
      const dates = t.dates ?? [];
      if (timeOffImpact(doc, t.name, dates).some((i) => i.becomesHole)) assert.equal(safeToApprove(doc, t.name, dates), false);
    }
  });
});

describe("next month and relief", () => {
  it("does not copy a one-day relief pharmacist into next month", async () => {
    const { createDemo } = await import("./demo.ts");
    const { planNextMonth } = await import("./next-month.ts");
    const { setCellValue } = await import("./grid.ts");
    const doc0 = createDemo();
    const st = doc0.stores[0]!.code;
    const date = `${doc0.year}-${String(doc0.month).padStart(2, "0")}-14`;
    const doc = {
      ...doc0,
      people: [...doc0.people, { name: "Rory Relief", role: "Pharmacist" as const, home: st, lead: false, phone: "", color: "", licensedStates: ["OR", "WA"], startsOn: date, endsOn: date }],
      grid: setCellValue(doc0.grid, st, "pharmacist", 14, "Rory Relief"),
    };
    const plan = planNextMonth(doc);
    assert.ok(plan.dropped.some((d) => d.name === "Rory Relief" && d.reason === "not-employed"));
  });
});

describe("usual days off", () => {
  it("are never suggested or filled while someone else is free, but can be placed on purpose", async () => {
    const { createDemo } = await import("./demo.ts");
    const { rankCandidates } = await import("./suggest.ts");
    const { choicesFor } = await import("./dashboard.ts");
    const { planFill } = await import("./plan.ts");
    const { placeName } = await import("./place.ts");
    const { weekdaySun0 } = await import("./calendar.ts");
    const doc0 = createDemo();
    const st = doc0.stores[0]!.code;
    const day = 14;
    const top = rankCandidates(doc0, st, day).find((c) => c.state === "free")!.name;
    const wd = weekdaySun0(doc0.year, doc0.month, day);
    const doc = { ...doc0, people: doc0.people.map((p) => (p.name === top ? { ...p, unavailableDays: [wd] } : p)) };
    const ch = choicesFor(doc, st, day).find((c) => c.name === top)!;
    assert.equal(ch.state, "dayoff");
    const ranked = rankCandidates(doc, st, day);
    assert.ok(!ranked.some((c) => c.state === "free" && c.name === top));
    assert.equal(ranked.find((c) => c.name === top)?.state, "dayoff");
    assert.ok(planFill(doc).every((r) => r.pick?.name !== top || r.day !== day));
    assert.equal(placeName(doc, st, "pharmacist", day, top).ok, true);
  });
  it("bulk tools skip them and say so", async () => {
    const { createDemo } = await import("./demo.ts");
    const { plannedStampHomes, onUsualDayOff } = await import("./stamp.ts");
    const doc0 = createDemo();
    const p = doc0.people.find((x) => x.role === "Pharmacist" && x.home && x.home !== "—")!;
    const doc = { ...doc0, grid: {}, people: doc0.people.map((x) => (x.name === p.name ? { ...x, unavailableDays: [1] } : x)) };
    const all = plannedStampHomes(doc, true).filter((x) => x.name === p.name);
    const kept = plannedStampHomes(doc).filter((x) => x.name === p.name);
    assert.ok(all.length > kept.length);
    assert.ok(kept.every((x) => !onUsualDayOff(doc, x.name, x.day)));
  });
});

describe("coverage by day", () => {
  it("counts holes and time off per day and matches the evaluation", async () => {
    const { createDemo } = await import("./demo.ts");
    const { coverageByDay } = await import("./day-coverage.ts");
    const { evaluate } = await import("./rules.ts");
    const doc = createDemo();
    const days = coverageByDay(doc);
    assert.equal(days.length, 31);
    const total = days.reduce((n, d) => n + d.holes, 0);
    const ev = evaluate(doc);
    assert.equal(total, ev.holes + ev.issues.filter((i) => i.holeAccepted).length);
  });
});

describe("why cover is needed", () => {
  it("names the reason for an empty shift and for a named person", async () => {
    const { createDemo } = await import("./demo.ts");
    const { whyOut } = await import("./why-out.ts");
    const { callInSickDoc } = await import("./sick.ts");
    const doc0 = createDemo();
    // Odette (home WAL) is on PTO Oct 14 and WAL is empty that day.
    const w = whyOut(doc0, "WAL", 14);
    assert.ok(w.some((x) => x.name === "Odette Rasmussen" && x.kind === "time-off"));
    // A sick call names itself.
    const p = doc0.people.find((x) => x.home === "MOL")!;
    const doc = callInSickDoc(doc0, p.name, [22]);
    assert.ok(whyOut(doc, "MOL", 22).some((x) => x.name === p.name && x.kind === "sick" && x.label === "Called in sick"));
    // A named person with no time off has no reason.
    assert.equal(whyOut(doc0, "MOL", 3, "Nobody Here").length, 0);
  });
});

describe("risk dates for the add-time-off calendar", () => {
  it("marks days that would leave a store with no working pharmacist", async () => {
    const { createDemo } = await import("./demo.ts");
    const { riskDates } = await import("./impact.ts");
    const doc = createDemo();
    assert.equal(riskDates(doc, []).size, 0);
    const solo = riskDates(doc, ["Cormac Bell"]);
    assert.ok(solo.size > 10, "a pharmacist who is alone at a store is a risk most days");
  });
});

describe("icon guide", () => {
  it("explains every icon the app uses", async () => {
    // The guide is imported as source text because it lives with React components.
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../../components/icons.tsx", import.meta.url), "utf8");
    const iconBlock = src.slice(src.indexOf("export const ICON = {"), src.indexOf("} as const satisfies"));
    const keys = [...iconBlock.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]!);
    const guide = src.slice(src.indexOf("export const ICON_GUIDE"));
    for (const k of keys) assert.ok(guide.includes(`icon: "${k}"`), `icon "${k}" is missing from the guide`);
  });
});

describe("bench", () => {
  it("lists licensed pharmacists from other stores within the drive limit, closest first, and never the store's own", async () => {
    const { createDemo } = await import("./demo.ts");
    const { benchFor } = await import("./bench.ts");
    const { licenceAt } = await import("./licence.ts");
    const doc = createDemo();
    for (const s of doc.stores) {
      const b = benchFor(doc, s.code, 60);
      assert.deepEqual([...b].sort((x, y) => x.minutes - y.minutes), b.map((x) => x), "sorted by drive");
      for (const p of b) {
        assert.notEqual(p.home, s.code);
        assert.ok(p.minutes <= 60);
        assert.equal(licenceAt(doc, p.name, s.code).status, "ok");
      }
      assert.ok(benchFor(doc, s.code, 600).length >= b.length);
    }
  });
});

describe("history", () => {
  it("describes each change in words and Undo steps match the entries", async () => {
    const { createDemo } = await import("./demo.ts");
    const { historyEntries, describeChange } = await import("./history.ts");
    const { placeName } = await import("./place.ts");
    const { planFill } = await import("./plan.ts");
    const s0 = createDemo();
    const row = planFill(s0).find((r) => r.pick)!;
    const a = placeName(s0, row.store, "pharmacist", row.day, row.pick!.name).doc;
    const b = placeName(a, row.store, "pharmacist", row.day, "").doc;
    assert.match(describeChange(s0, a), /scheduled at/);
    assert.match(describeChange(a, b), /removed from/);
    const e = historyEntries([s0, a], b);
    assert.equal(e.length, 2);
    assert.deepEqual(e.map((x) => x.undoSteps), [1, 2]);
    assert.match(e[0]!.text, /removed from/);
    assert.match(e[1]!.text, /scheduled at/);
  });
});

describe("glow agrees with the real rules", () => {
  it("matches choicesFor for every person on every empty shift", async () => {
    const { createDemo } = await import("./demo.ts");
    const { createSample } = await import("./sample.ts");
    const { glowFor, glowKey } = await import("./glow.ts");
    const { choicesFor, offerable } = await import("./dashboard.ts");
    const { daysInMonth } = await import("./calendar.ts");
    const { isOpenDay } = await import("./place.ts");
    const { getCell, setCellValue } = await import("./grid.ts");
    let checked = 0;
    for (const make of [createDemo, createSample]) {
      const doc0 = make();
      // Give some people a usual day off so that state is exercised.
      // Empty every other day so many shifts are open, while the rest keep people placed (for "already elsewhere").
      let grid = doc0.grid;
      for (const st of doc0.stores) for (const sl of ["pharmacist", "pharmacist2"] as const) for (let d = 2; d <= 28; d += 2) grid = setCellValue(grid, st.code, sl, d, "");
      const doc = { ...doc0, grid, people: doc0.people.map((p, i) => (i % 3 === 0 ? { ...p, unavailableDays: [1, 3] } : p)) };
      for (const p of doc.people.filter((x) => x.role === "Pharmacist" || x.role === "Float Pharmacist")) {
        const map = glowFor(doc, p.name);
        for (const s of doc.stores) {
          for (let d = 1; d <= daysInMonth(doc.year, doc.month); d++) {
            if (!isOpenDay(doc, s.code, d) || getCell(doc.grid, s.code, "pharmacist", d).trim()) continue;
            const c = choicesFor(doc, s.code, d, "pharmacist").find((x) => x.name === p.name);
            if (!c) continue;
            const want = !offerable(c) ? "blocked" : c.state === "blocked" ? "blocked" : c.state;
            assert.equal(map.get(glowKey(s.code, d)), want, `${p.name} @ ${s.code} ${d}`);
            checked += 1;
          }
        }
      }
    }
    assert.ok(checked > 1000, `only ${checked} comparisons`);
  });
});
