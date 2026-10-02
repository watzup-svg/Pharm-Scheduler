import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { DRIVE_TABLE, tableDrive } from "./drive-table.ts";
import { driveBetween, driveKey, pairMiles } from "./geo.ts";
import { HI_SCHOOL_STORES } from "./stores.ts";

describe("measured drive table", () => {
  it("covers every pair of the 18 stores exactly once, with sane numbers", () => {
    const codes = HI_SCHOOL_STORES.map((s) => s.code);
    assert.equal(codes.length, 18);
    assert.equal(Object.keys(DRIVE_TABLE).length, 153);
    for (let i = 0; i < codes.length; i++)
      for (let j = i + 1; j < codes.length; j++) {
        const t = DRIVE_TABLE[driveKey(codes[i]!, codes[j]!)];
        assert.ok(t, `${codes[i]} ${codes[j]} missing`);
        assert.ok(t[0] > 5 && t[0] < 400 && t[1] >= 25 && t[1] < 600);
        assert.ok(t[1] >= (t[0] / 70) * 60, "faster than 70 mph");
      }
  });

  it("is used for real addresses, below a hand-set number, and only the ferry pair adds the 15 minutes", () => {
    const doc = createDemo();
    assert.equal(pairMiles(doc, "WL", "EST").source, "table");
    assert.equal(pairMiles(doc, "WL", "EST").miles, 19.2);
    assert.equal(driveBetween(doc, "EST", "WL")!.estimated, false);
    assert.equal(tableDrive("CAT", "CLA")!.ferry, true);
    assert.equal(tableDrive("CAT", "CLA")!.minutes, 60);
    assert.equal(tableDrive("WL", "EST")!.ferry, false);
    const hand = { ...doc, driveMiles: { [driveKey("WL", "EST")]: 22 }, driveMinutes: { [driveKey("WL", "EST")]: 41 } };
    assert.equal(pairMiles(hand, "WL", "EST").miles, 22);
    assert.equal(driveBetween(hand, "WL", "EST")!.minutes, 41);
  });

  it("steps aside when a store's address changes", () => {
    const doc = createDemo();
    const moved = { ...doc, stores: doc.stores.map((s) => (s.code === "WL" ? { ...s, address: "1 New Rd, West Linn, OR 97068" } : s)) };
    assert.equal(pairMiles(moved, "WL", "EST").source, "estimated");
    assert.equal(pairMiles(moved, "EST", "MOL").source, "table");
  });
});
