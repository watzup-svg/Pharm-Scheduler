import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { choicesFor } from "./dashboard.ts";
import { createDemo } from "./demo.ts";
import { fixSteps } from "./fix.ts";
import { printGate } from "./gate.ts";
import { setCellValue } from "./grid.ts";
import { stateName, stateOfStore, unlicensedAt } from "./licence.ts";
import { placeName } from "./place.ts";
import { evaluate, issueKey } from "./rules.ts";
import { stampWeekday, setPatternCell } from "./stamp.ts";
import { getCell } from "./grid.ts";
import { createSample } from "./sample.ts";

describe("a pharmacist can only work in a state they are licensed in", () => {
  const demo = createDemo();

  it("reads the state from a store address and names it", () => {
    assert.equal(stateOfStore({ address: "406 McClaine St, Silverton, OR 97381" }), "OR");
    assert.equal(stateName("WA"), "Washington");
  });

  it("knows who lacks a licence where; nothing recorded means unknown, so no flag", () => {
    assert.equal(unlicensedAt(demo, "Fenn Ritter", "WIN"), "WA");
    assert.equal(unlicensedAt(demo, "Fenn Ritter", "MOL"), null);
    assert.equal(unlicensedAt(demo, "Kip Alder", "WIN"), null); // holds both
    const sample = createSample();
    assert.equal(unlicensedAt(sample, "Jane Smith", "EST"), null);
    const cleared = { ...demo, people: demo.people.map((p) => (p.name === "Fenn Ritter" ? { ...p, licensedStates: [] } : p)) };
    assert.equal(unlicensedAt(cleared, "Fenn Ritter", "WIN"), null);
  });

  it("placeName refuses an unlicensed placement, like a closed day, and still allows clearing", () => {
    const res = placeName(demo, "WOO", "pharmacist", 26, "Fenn Ritter"); // Woodland is WA
    assert.equal(res.ok, false);
    assert.equal(res.reason, "unlicensed");
    assert.equal(getCell(res.doc.grid, "WOO", "pharmacist", 26), "");
    const ok = placeName(demo, "WOO", "pharmacist", 26, "Kip Alder");
    assert.equal(ok.ok, true);
    const cleared = placeName(demo, "WIN", "pharmacist", 13, "");
    assert.equal(cleared.ok, true);
  });

  it("a name that is already there is a hard problem, listed, and blocks print", () => {
    const ev = evaluate(demo);
    assert.equal(ev.byKey[issueKey("WIN", 13)]?.unlicensedNames[0], "Fenn Ritter");
    assert.match(ev.byKey[issueKey("WIN", 13)]!.why, /Not licensed in this state: Fenn Ritter/);
    assert.equal(ev.ready, false);
    const step = fixSteps(demo, ev, "rph").find((s) => s.kind === "license");
    assert.equal(step?.store, "WIN");
    assert.match(step!.headline, /isn’t licensed in WA/);
    // fixing it (clearing the name) is what resolves it; the day then reads as a hole
    const cleared = placeName(demo, "WIN", "pharmacist", 13, "").doc;
    const after = evaluate(cleared);
    assert.equal(after.unlicensed, 0);
    assert.equal(after.byKey[issueKey("WIN", 13)]?.hole, true);
  });

  it("alone it blocks the pack: everything else fixed, one unlicensed name left", () => {
    let doc = createSample();
    doc = { ...doc, people: doc.people.map((p) => (p.name === "Susan Brown" ? { ...p, licensedStates: ["WA"] } : p)) };
    doc = { ...doc, stores: doc.stores.map((s) => ({ ...s, address: s.address })) };
    // sample is all Oregon; Susan holds WA only. Put her by hand (placeName would refuse).
    doc = { ...doc, grid: setCellValue(doc.grid, "EST", "pharmacist", 16, "Susan Brown") };
    doc = { ...doc, grid: setCellValue(doc.grid, "MOL", "pharmacist2", 4, "") };
    const ev = evaluate(doc);
    assert.equal(ev.holes, 0);
    assert.equal(ev.doubles, 0);
    assert.equal(ev.unlicensed >= 1, true);
    assert.equal(printGate(doc, ev).blocked, true);
  });

  it("stamps skip an unlicensed person and say so", () => {
    let doc = createDemo();
    doc = { ...doc, pattern: setPatternCell(doc.pattern, "WOO", "pharmacist", 1, "Fenn Ritter") };
    doc = { ...doc, grid: setCellValue(doc.grid, "WOO", "pharmacist", 19, "") };
    const res = stampWeekday(doc, 1, "WOO");
    assert.equal(getCell(res.doc.grid, "WOO", "pharmacist", 19), "");
    assert.ok(res.dropped.some((d) => d.reason === "unlicensed" && d.name === "Fenn Ritter"));
  });

  it("the picker model marks them blocked instead of offering them", () => {
    const choices = choicesFor(demo, "WOO", 26);
    const fenn = choices.find((c) => c.name === "Fenn Ritter");
    assert.equal(fenn?.state, "blocked");
    assert.equal(fenn?.lacksLicence, "WA");
    assert.equal(choices.find((c) => c.name === "Kip Alder")?.state, "dayoff"); // Mondays are Kip’s usual day off
    assert.equal(choices.find((c) => c.name === "Ines Calloway")?.state, "double");
  });
});
