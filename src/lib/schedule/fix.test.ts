import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chipLabel,
  clearLeftoverDay,
  clearNameOnStoreDay,
  fixSteps,
  holeCandidates,
  keepDouble,
  keepDoubleHoles,
  keepDoubleLabel,
  pickerLabel,
  pickerOptions,
  sortPeopleByHome,
  suggestNames,
  ghostRest,
  warnSteps,
} from "./fix.ts";
import { getCell, setCellValue } from "./grid.ts";
import { evaluate } from "./rules.ts";
import { createSample } from "./sample.ts";

describe("fix steps", () => {
  it("names Jane’s double and the Estacada hole", () => {
    const doc = createSample();
    const steps = fixSteps(doc, evaluate(doc));
    assert.equal(steps.length, 2);
    assert.equal(steps[0]?.kind, "double");
    assert.match(steps[0]?.headline ?? "", /Jane Smith/);
    assert.match(steps[0]?.headline ?? "", /Estacada/);
    assert.match(steps[0]?.headline ?? "", /Molalla/);
    assert.match(steps[0]?.headline ?? "", /Fri Sep 4/);
    assert.equal(steps[1]?.kind, "hole");
    assert.match(steps[1]?.headline ?? "", /Estacada/);
    assert.match(steps[1]?.headline ?? "", /Wed Sep 16/);
    assert.match(steps[1]?.headline ?? "", /no coverage/);
  });

  it("chip uses English plus a more-count, not HOLES", () => {
    const doc = createSample();
    const label = chipLabel(fixSteps(doc, evaluate(doc)), 2);
    assert.equal(label.includes("HOLES"), false);
    assert.equal(label.includes("CLOSED-DAY"), false);
    assert.match(label, /1 more/);
  });

  it("clear leftover Saturday removes Mark without filling anything", () => {
    const base = createSample();
    const seeded = {
      ...base,
      grid: setCellValue(base.grid, "WL", "pharmacist", 5, "Mark Chen"),
    };
    const doc = clearLeftoverDay(seeded, "WL", 5);
    assert.equal(getCell(doc.grid, "WL", "pharmacist", 5), "");
    assert.equal(evaluate(doc).closed, 0);
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 16), "");
  });

  it("keep Estacada clears Jane from Molalla Friday and leaves EST", () => {
    const doc = keepDouble(createSample(), "Jane Smith", 4, "EST");
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 4), "Jane Smith");
    assert.equal(getCell(doc.grid, "MOL", "pharmacist2", 4), "");
    assert.equal(evaluate(doc).doubles, 0);
  });

  it("sorts home pharmacists before floats, then by home store", () => {
    const doc = createSample();
    const names = sortPeopleByHome(doc, ["Tom Reyes", "Jane Smith", "Susan Brown", "Chris Hale"]);
    assert.ok(names.indexOf("Jane Smith") < names.indexOf("Tom Reyes"));
    assert.ok(names.indexOf("Tom Reyes") < names.indexOf("Susan Brown"));
    assert.ok(names.indexOf("Susan Brown") < names.indexOf("Chris Hale"));
  });

  it("hole candidates for Estacada Wednesday 16 are free pharmacists, Jane first", () => {
    const doc = createSample();
    const names = holeCandidates(doc, "EST", 16).map((c) => c.name);
    assert.equal(names[0], "Jane Smith");
    assert.ok(names.includes("Susan Brown"));
    assert.ok(names.includes("Chris Hale"));
    assert.equal(names.includes("Tom Reyes"), false);
    assert.equal(names.includes("Priya Nair"), false);
    assert.equal(names.includes("Mark Chen"), false);
  });

  it("keep Molalla would leave Estacada with no coverage; keep Estacada would not", () => {
    const doc = createSample();
    assert.deepEqual(keepDoubleHoles(doc, "Jane Smith", 4, "EST"), []);
    assert.deepEqual(keepDoubleHoles(doc, "Jane Smith", 4, "MOL"), ["EST"]);
    assert.match(keepDoubleLabel(doc, "Jane Smith", 4, "MOL"), /Estacada would have no coverage/);
    assert.match(keepDoubleLabel(doc, "Jane Smith", 4, "EST"), /^Keep at Estacada$/);
  });

  it("picker labels busy, PTO, and free without hiding names", () => {
    const doc = createSample();
    assert.match(pickerLabel(doc, "Jane Smith", "EST", 4, "Jane Smith"), /already MOL/);
    assert.match(pickerLabel(doc, "Jane Smith", "EST", 14, ""), /PTO/);
    assert.match(pickerLabel(doc, "Susan Brown", "EST", 16, ""), /free/);
    const rph = pickerOptions(doc, "EST", "RPh", 16, "");
    assert.equal(rph[0]?.name, "Jane Smith");
    assert.ok(rph.some((o) => o.name === "Tom Reyes" && /already MOL/.test(o.label)));
    assert.equal(rph.length >= 6, true);
  });

  it("Jane typed onto PTO is a yellow warn, and solo float is not a warn", () => {
    const base = createSample();
    assert.equal(warnSteps(base, evaluate(base)).some((w) => w.kind === "solo-float"), false);
    const doc = {
      ...base,
      grid: setCellValue(base.grid, "EST", "pharmacist", 14, "Jane Smith"),
    };
    const warns = warnSteps(doc, evaluate(doc));
    assert.equal(warns[0]?.kind, "pto");
    assert.match(warns[0]?.headline ?? "", /Jane Smith/);
    assert.match(warns[0]?.headline ?? "", /time off/);
    assert.equal(warns.some((w) => w.kind === "solo-float"), false);
  });

  it("clear Jane from Saturday 14 does not empty Susan", () => {
    const base = createSample();
    const seeded = {
      ...base,
      grid: setCellValue(base.grid, "EST", "pharmacist", 14, "Jane Smith"),
    };
    const doc = clearNameOnStoreDay(seeded, "EST", 14, "Jane Smith");
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 14), "");
    assert.equal(getCell(doc.grid, "EST", "pharmacist2", 14), "Susan Brown");
    assert.equal(
      evaluate(doc).issues.find((i) => i.store === "EST" && i.day === 14)?.ptoNames.length,
      0,
    );
  });

  it("suggests Jane Smith when typing Jan in a pharmacist cell", () => {
    const doc = createSample();
    const opts = pickerOptions(doc, "EST", "RPh", 16, "");
    const hits = suggestNames(opts, "Jan");
    assert.equal(hits[0]?.name, "Jane Smith");
    assert.equal(hits.some((h) => h.name === "Tom Reyes"), false);
    assert.equal(ghostRest("Jane Smith", "Jan"), "e Smith");
  });

  it("matches initials and keeps the full pharmacist list when the query is empty", () => {
    const doc = createSample();
    const opts = pickerOptions(doc, "EST", "RPh", 16, "");
    assert.equal(suggestNames(opts, "js")[0]?.name, "Jane Smith");
    assert.equal(suggestNames(opts, "smi")[0]?.name, "Jane Smith");
    const all = suggestNames(opts, "");
    assert.equal(all.length, opts.length);
    assert.ok(all.length >= 6);
  });
});
