import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { monthStatus } from "./dashboard.ts";
import { createDemo } from "./demo.ts";
import { serializeDoc } from "./file.ts";
import { forecastLine, forecastNextMonth } from "./next-month-forecast.ts";
import { applyNextMonthPlan, planNextMonth } from "./next-month.ts";
import { evaluate } from "./rules.ts";

describe("next month forecast", () => {
  const doc = createDemo();
  const plan = planNextMonth(doc);

  it("matches what starting the month actually leaves", () => {
    const f = forecastNextMonth(doc, plan);
    const next = applyNextMonthPlan(doc, plan);
    const steps = monthStatus(next, evaluate(next)).steps;
    assert.equal(f.total, steps.length);
    assert.equal(f.byKind.hole, steps.filter((s) => s.kind === "hole").length);
    assert.equal(f.byKind.double, steps.filter((s) => s.kind === "double").length);
  });

  it("names the practice month's November result", () => {
    const f = forecastNextMonth(doc, plan);
    assert.deepEqual(f, { total: 29, byKind: { hole: 26, double: 3, leftover: 0, license: 0 } });
    assert.equal(forecastLine("November", f), "November will start with 29 problems to fix: 26 shifts with no coverage and 3 people at two places.");
  });

  it("never changes the month on screen", () => {
    const before = serializeDoc(doc);
    forecastNextMonth(doc, plan);
    assert.equal(serializeDoc(doc), before);
  });

  it("reads plainly with one kind or none", () => {
    assert.equal(forecastLine("June", { total: 0, byKind: { hole: 0, double: 0, leftover: 0, license: 0 } }), "June will start with nothing to fix.");
    assert.equal(forecastLine("June", { total: 1, byKind: { hole: 1, double: 0, leftover: 0, license: 0 } }), "June will start with 1 problem to fix: 1 shift with no coverage.");
  });
});
