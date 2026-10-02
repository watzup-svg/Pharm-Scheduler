import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { covering, monthStatus, nextHole, offThisMonth, shortageDays } from "./dashboard.ts";
import { createDemo } from "./demo.ts";
import { parseDoc, serializeDoc } from "./file.ts";
import { printGate } from "./gate.ts";
import { evaluate, issueKey } from "./rules.ts";

describe("demo month", () => {
  const doc = createDemo();
  const ev = evaluate(doc);

  it("has all 18 stores and 22 invented pharmacists, each with a real home store", () => {
    assert.equal(doc.stores.length, 18);
    assert.equal(doc.people.length, 22);
    assert.equal(new Set(doc.people.map((p) => p.name)).size, 22);
    assert.ok(doc.people.every((p) => doc.stores.some((s) => s.code === p.home)));
    assert.equal(doc.people.filter((p) => p.role === "Float Pharmacist").length, 4);
    assert.equal(doc.year, 2026);
    assert.equal(doc.month, 10);
  });

  it("is not ready, and print is blocked", () => {
    assert.equal(ev.ready, false);
    assert.equal(printGate(doc, ev).blocked, true);
  });

  it("plants each kind of hard error where it says", () => {
    const at = (s: string, d: number) => ev.byKey[issueKey(s, d)]!;
    // doubles across stores (one store twice on a day can no longer be written)
    assert.deepEqual(at("EST", 9).doubledNames, ["Gideon Ashcroft"]);
    assert.deepEqual(at("MOL", 9).doubledNames, ["Gideon Ashcroft"]);
    assert.deepEqual(at("LEN", 6).doubledNames, []);
    assert.deepEqual(at("RR", 27).doubledNames, ["Kip Alder"]);
    // names on closed days: Saturday, a store holiday, a Sunday
    assert.equal(at("CAT", 10).leftover, true);
    assert.equal(at("SCA", 12).leftover, true);
    assert.equal(at("WS", 18).leftover, true);
    // licence: Fenn is licensed in Oregon only and is covering a Washington store
    assert.deepEqual(at("WIN", 13).unlicensedNames, ["Fenn Ritter"]);
    assert.equal(ev.unlicensed, 1);
    // holes
    for (const [s, d] of [["WAL", 14], ["CLA", 21], ["MOT", 20], ["EST", 24], ["WOO", 26], ["WOO", 27]] as const) {
      assert.equal(at(s, d).hole, true, `${s} ${d}`);
    }
  });

  it("has warnings and valid cases that must not block: yellow time off, cover, a float at home", () => {
    const at = (s: string, d: number) => ev.byKey[issueKey(s, d)]!;
    assert.deepEqual(at("CLA", 20).ptoNames, ["Imani Fairweather"]);
    assert.equal(at("CLA", 20).hole, false);
    assert.equal(covering(doc, "Fenn Ritter", "MOL"), false); // home MOL
    assert.equal(covering(doc, "Fenn Ritter", "WAL"), true);
    assert.equal(covering(doc, "Lena Sorensen", "IND"), false);
    assert.equal(at("IND", 20).hole, false);
    assert.equal(at("SIL", 10).hole, false);
    assert.equal(at("SIL", 10).doubledNames.length, 0);
  });

  it("shows the front-door model: problems, next hole, who is off, and a short day", () => {
    const status = monthStatus(doc, ev);
    assert.equal(status.steps.length, 12);
    assert.equal(status.next?.kind, "leftover");
    assert.ok(!status.next?.headline.includes("Hi-School Pharmacy")); // short names in sentences
    const hole = nextHole(doc);
    assert.equal(hole?.store, "WAL");
    assert.equal(hole?.day, 14);
    assert.deepEqual(
      hole?.choices.filter((c) => c.state === "free").map((c) => c.name).sort(),
      ["Fenn Ritter", "Greta Voss", "Kip Alder", "Lena Sorensen"],
    );
    assert.ok(offThisMonth(doc).some((r) => r.name === "Imani Fairweather" && r.sitting.length === 1));
    assert.ok(shortageDays(doc).some((d) => d.day === 20 && d.openStores > d.available));
  });

  it("round-trips through save and open", () => {
    const back = parseDoc(serializeDoc(doc));
    assert.equal(back.stores.length, 18);
    assert.equal(back.people.length, 22);
    assert.equal(evaluate(back).holes, ev.holes);
    assert.equal(evaluate(back).doubles, ev.doubles);
  });
});
