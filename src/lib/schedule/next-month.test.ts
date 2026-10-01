import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { weekdayLong, weekdaySun0 } from "./calendar.ts";
import { groupHolesByDay, holeSteps } from "./fix.ts";
import { getCell, setCellValue } from "./grid.ts";
import {
  applyNextMonthPlan,
  dayForOccurrence,
  dropLine,
  planNextMonth,
  weekdayOccurrence,
} from "./next-month.ts";
import { evaluate } from "./rules.ts";
import { createDemo } from "./demo.ts";
import { createSample } from "./sample.ts";

describe("next month copies by weekday, not 1–31", () => {
  const doc = createSample();
  const plan = planNextMonth(doc);

  it("advances September 2026 to October 2026", () => {
    assert.equal(plan.year, 2026);
    assert.equal(plan.month, 10);
    assert.equal(plan.monthLabel, "October 2026");
  });

  it("maps the 3rd Wednesday (Sep 16 hole) to Oct 21 and leaves it empty", () => {
    assert.equal(weekdayLong(2026, 9, 16), "Wednesday");
    assert.equal(weekdayOccurrence(16), 3);
    assert.equal(dayForOccurrence(2026, 10, 3, 3), 21);
    assert.equal(getCell(plan.grid, "EST", "pharmacist", 21), "");
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 16), "");
  });

  it("places Jane from Tuesday Sep 1 onto Tuesday Oct 6, not onto the 1st", () => {
    assert.equal(weekdayLong(2026, 9, 1), "Tuesday");
    assert.equal(weekdayLong(2026, 10, 1), "Thursday");
    assert.equal(weekdayLong(2026, 10, 6), "Tuesday");
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 1), "Jane Smith");
    assert.equal(getCell(plan.grid, "EST", "pharmacist", 6), "Jane Smith");
    // Oct 1 is Thursday ← first Thursday Sep 3, not Sep 1
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 3), "Jane Smith");
    assert.equal(getCell(plan.grid, "EST", "pharmacist", 1), "Jane Smith");
  });

  it("does not keep names by calendar date index", () => {
    // Sep 6 is Sunday and empty. Day-number copy would put that emptiness on Oct 6.
    // Weekday copy puts Tuesday Sep 1 Jane on Tuesday Oct 6.
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 6), "");
    assert.equal(getCell(plan.grid, "EST", "pharmacist", 6), "Jane Smith");
  });

  it("drops a pharmacist left on a shut Saturday so they do not land on the next shut Saturday", () => {
    const seeded = {
      ...doc,
      grid: setCellValue(doc.grid, "WL", "pharmacist", 5, "Mark Chen"),
    };
    const shut = planNextMonth(seeded);
    assert.equal(weekdaySun0(2026, 9, 5), 6);
    assert.equal(getCell(seeded.grid, "WL", "pharmacist", 5), "Mark Chen");
    assert.equal(dayForOccurrence(2026, 10, 6, weekdayOccurrence(5)), 3);
    assert.equal(getCell(shut.grid, "WL", "pharmacist", 3), "");
    const mark = shut.dropped.find(
      (d) => d.name === "Mark Chen" && d.store === "WL" && d.fromDay === 5,
    );
    assert.ok(mark);
    assert.equal(mark.reason, "shut");
    assert.equal(mark.toDay, 3);
    assert.match(dropLine(mark), /shut/);
    assert.doesNotMatch(dropLine(mark), /RPh/); // the message says "pharmacist", not the internal code
  });

  it("drops 5th-weekday names when October has no 5th Tuesday or Wednesday", () => {
    assert.equal(weekdayOccurrence(29), 5);
    assert.equal(dayForOccurrence(2026, 10, weekdaySun0(2026, 9, 29), 5), null);
    const janeTue = plan.dropped.find(
      (d) => d.name === "Jane Smith" && d.store === "EST" && d.fromDay === 29,
    );
    assert.ok(janeTue);
    assert.equal(janeTue.reason, "no-day");
    assert.equal(getCell(plan.grid, "EST", "pharmacist", 29), "");
  });

  it("does not auto-fill empty source days", () => {
    assert.equal(getCell(doc.grid, "EST", "pharmacist2", 1), "");
    assert.equal(getCell(plan.grid, "EST", "pharmacist2", 6), "");
  });

  it("lists Estacada Wednesday 21 as a new hole after Start next month", () => {
    const next = applyNextMonthPlan(doc, plan);
    const holes = holeSteps(next, evaluate(next));
    assert.ok(holes.some((h) => h.store === "EST" && h.day === 21));
    assert.equal(getCell(next.grid, "EST", "pharmacist", 21), "");
  });

  it("groups new holes by date so Saturday 31 lists every open store", () => {
    const next = applyNextMonthPlan(doc, plan);
    const groups = groupHolesByDay(next, holeSteps(next, evaluate(next)));
    const wed = groups.find((g) => g.day === 21);
    assert.equal(wed?.heading, "Wed Oct 21");
    assert.deepEqual(wed?.stores.map((s) => s.code), ["EST"]);
    const sat = groups.find((g) => g.day === 31);
    assert.equal(sat?.heading, "Sat Oct 31");
    assert.deepEqual(sat?.stores.map((s) => s.code), ["EST", "MOL", "SCA"]);
    const grouped = groups.reduce((n, g) => n + g.stores.length, 0);
    assert.equal(grouped, holeSteps(next, evaluate(next)).length);
  });

  it("does not carry day notes into the new month (they are keyed by day number)", () => {
    const withNote = { ...doc, dayNotes: { EST: { "12": "Inventory count, close at 4" } } };
    const next = applyNextMonthPlan(withNote, planNextMonth(withNote));
    assert.deepEqual(next.dayNotes, {});
    assert.equal(withNote.dayNotes.EST?.["12"], "Inventory count, close at 4"); // the old month keeps its note
  });

  it("drops a name that is not licensed for that store's state, and says so", () => {
    const demo = createDemo();
    const p = planNextMonth(demo);
    const drop = p.dropped.find((d) => d.reason === "unlicensed" && d.name === "Fenn Ritter");
    assert.equal(drop?.name, "Fenn Ritter");
    assert.equal(drop?.store, "WIN");
    assert.match(dropLine(drop!), /not licensed in that state/);
    const next = applyNextMonthPlan(demo, p);
    assert.equal(evaluate(next).unlicensed, 0);
  });
});
