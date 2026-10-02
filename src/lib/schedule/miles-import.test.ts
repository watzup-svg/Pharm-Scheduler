import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { driveKey } from "./geo.ts";
import { parseMilesLines } from "./miles-import.ts";

const codes = ["CAT", "CLA", "RR"];
describe("parseMilesLines", () => {
  it("reads good lines, skips a header, order-free keys", () => {
    const r = parseMilesLines("from,to,miles\nCLA,CAT,31.44\n cat ; rr ; 400 mi\n", codes);
    assert.deepEqual(r.problems, []);
    assert.equal(r.pairs[driveKey("CAT", "CLA")], 31.4);
    assert.equal(r.pairs[driveKey("CAT", "RR")], 400);
  });
  it("reports bad lines instead of guessing", () => {
    const r = parseMilesLines("CAT,ZZZ,5\nCAT,CAT,5\nCAT,CLA,abc\nCAT,CLA,-3\nCAT,RR", codes);
    assert.equal(Object.keys(r.pairs).length, 0);
    assert.equal(r.problems.length, 5);
  });
  it("flags a pair given twice with different values", () => {
    const r = parseMilesLines("CAT,CLA,10\nCLA,CAT,12", codes);
    assert.equal(r.pairs[driveKey("CAT", "CLA")], 12);
    assert.equal(r.problems.length, 1);
  });
});

describe("parseMilesLines minutes column", () => {
  it("reads optional minutes and rejects bad ones", () => {
    const r = parseMilesLines("CAT,CLA,10,25\nCAT,RR,40\nCLA,RR,5,0", codes);
    assert.equal(r.minutes[driveKey("CAT", "CLA")], 25);
    assert.equal(driveKey("CAT", "RR") in r.minutes, false);
    assert.equal(driveKey("CLA", "RR") in r.pairs, false);
    assert.equal(r.problems.length, 1);
  });
});
