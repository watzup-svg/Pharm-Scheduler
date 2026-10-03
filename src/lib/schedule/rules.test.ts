import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUsableAutosave, parseDoc } from "./file.ts";
import { setCellValue } from "./grid.ts";
import { evaluate, issueKey } from "./rules.ts";
import { createSample } from "./sample.ts";

describe("sample lessons", () => {
  const doc = createSample();
  const ev = evaluate(doc);

  it("counts 1 hole, no leftovers, 1 double, and no yellow warns", () => {
    assert.equal(ev.holes, 1);
    assert.equal(ev.closed, 0);
    assert.equal(ev.staffClosed, 0);
    assert.equal(ev.doubles, 1);
    assert.equal(ev.warns, 0);
    assert.equal(ev.ready, false);
  });

  it("Jane Smith on EST and MOL the same Friday is a double", () => {
    const est = ev.byKey[issueKey("EST", 4)];
    const mol = ev.byKey[issueKey("MOL", 4)];
    assert.ok(est);
    assert.ok(mol);
    assert.deepEqual(est.doubledNames, ["Jane Smith"]);
    assert.deepEqual(mol.doubledNames, ["Jane Smith"]);
    assert.match(est.why, /Jane Smith is booked at two stores/);
    assert.match(mol.why, /Jane Smith is booked at two stores/);
  });

  it("Estacada Wednesday 16 has no pharmacist", () => {
    const est = ev.byKey[issueKey("EST", 16)];
    assert.equal(est?.hole, true);
    assert.equal(est?.why, "No coverage: no pharmacist. Add one.");
  });

  it("Chris Hale at Molalla Friday 18 is coverage, not a warning", () => {
    const mol = ev.byKey[issueKey("MOL", 18)];
    assert.equal(mol?.hole, false);
    assert.equal(mol?.soloFloatName, null);
    assert.equal(mol?.why ?? "", "");
  });

  it("Jane typed onto a PTO day is yellow and still printable", () => {
    const next = {
      ...doc,
      grid: setCellValue(doc.grid, "EST", "pharmacist", 14, "Jane Smith"),
    };
    const est = evaluate(next).byKey[issueKey("EST", 14)];
    assert.deepEqual(est?.ptoNames, ["Jane Smith"]);
    assert.match(est?.why ?? "", /Jane Smith on time off \(prints yellow\)/);
    assert.equal(est?.hole, false);
    assert.equal(est?.leftover, false);
  });

  it("a shift after someone's last day is a yellow warning with its own wording, not a hole", () => {
    const iso = (d: number) => `${doc.year}-${String(doc.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const next = {
      ...doc,
      people: doc.people.map((p) => (p.name === "Jane Smith" ? { ...p, endsOn: iso(10) } : p)),
      grid: setCellValue(doc.grid, "EST", "pharmacist", 22, "Jane Smith"),
    };
    const ev2 = evaluate(next);
    const est = ev2.byKey[issueKey("EST", 22)];
    assert.deepEqual(est?.ptoNames, ["Jane Smith"]);
    assert.match(est?.why ?? "", /Jane Smith after their last day \(prints yellow\)/);
    assert.equal(est?.hole, false);
    assert.ok(ev2.warns >= 1);
    assert.equal(ev2.ready, evaluate(doc).ready);
  });

  it("clearing Jane from Molalla Friday 4 removes the double", () => {
    const next = {
      ...doc,
      grid: setCellValue(doc.grid, "MOL", "pharmacist2", 4, ""),
    };
    const ev2 = evaluate(next);
    assert.equal(ev2.doubles, 0);
    assert.equal(ev2.byKey[issueKey("EST", 4)]?.doubledNames.length, 0);
  });

  it("autosave JSON roundtrip still has the double and the hole", () => {
    const raw = JSON.stringify({ doc, fileName: "x", dirty: false });
    const again = parseDoc(JSON.stringify(JSON.parse(raw).doc));
    const ev2 = evaluate(again);
    assert.equal(ev2.holes, 1);
    assert.equal(ev2.closed, 0);
    assert.equal(ev2.staffClosed, 0);
    assert.equal(ev2.doubles, 1);
    assert.equal(ev2.ready, false);
    assert.equal(ev2.byKey[issueKey("EST", 16)]?.hole, true);
    assert.deepEqual(ev2.byKey[issueKey("MOL", 4)]?.doubledNames, ["Jane Smith"]);
  });

  it("blank autosave is not usable (cannot flip the sample to ready)", () => {
    assert.equal(isUsableAutosave(doc), true);
    assert.equal(
      isUsableAutosave({ ...doc, stores: [], people: [], grid: {} }),
      false,
    );
  });
});
