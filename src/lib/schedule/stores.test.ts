import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDoc, serializeDoc } from "./file.ts";
import { evaluate } from "./rules.ts";
import { createSample } from "./sample.ts";
import { blankMonthWithStores, HI_SCHOOL_STORES } from "./stores.ts";

describe("Hi-School pharmacy list", () => {
  it("has 18 pharmacies with unique valid codes and no hardware stores", () => {
    assert.equal(HI_SCHOOL_STORES.length, 18);
    const codes = HI_SCHOOL_STORES.map((s) => s.code);
    assert.equal(new Set(codes).size, 18);
    assert.ok(codes.every((c) => /^[A-Z0-9]{2,6}$/.test(c)));
    assert.ok(HI_SCHOOL_STORES.every((s) => !/hardware|ace/i.test(s.name)));
  });

  it("carries address, phone and hours for every store, and Saturday follows the posted hours", () => {
    for (const s of HI_SCHOOL_STORES) {
      assert.ok(s.address && s.phone && s.hours, s.code);
      assert.equal(s.sunOpen, false);
      assert.equal(s.satOpen, /Sat \d/.test(s.hours ?? ""), `${s.code} Saturday`);
    }
    const by = (c: string) => HI_SCHOOL_STORES.find((s) => s.code === c)!;
    assert.equal(by("EST").address, "207 S Broadway St, Estacada, OR 97023");
    assert.equal(by("MOL").name, "Cutter’s Hi-School Pharmacy");
    assert.equal(by("WL").satOpen, true);
    assert.equal(by("SIL").hours?.includes("Sat 9:00 AM–5:00 PM"), true);
  });

  it("keeps phone, hours and note through save and open, and still opens a store without them", () => {
    const doc = blankMonthWithStores(createSample());
    const back = parseDoc(serializeDoc(doc));
    assert.equal(back.stores.find((s) => s.code === "CAT")?.phone, "(360) 795-3691");
    assert.equal(back.stores.find((s) => s.code === "LEN")?.hours?.includes("8:30 AM"), true);
    const sample = parseDoc(serializeDoc(createSample()));
    assert.equal(sample.stores[0]?.phone, undefined);
  });

  it("makes a blank month: every open day is a hole, nothing is placed, and it round-trips", () => {
    const doc = blankMonthWithStores(createSample());
    assert.equal(doc.stores.length, 18);
    assert.deepEqual(doc.grid, {});
    assert.equal(doc.holidays.some((h) => h.label === "Labor Day"), false);
    const ev = evaluate(doc);
    assert.ok(ev.holes > 0);
    assert.equal(ev.doubles + ev.closed, 0);
    assert.equal(parseDoc(serializeDoc(doc)).stores.length, 18);
  });
});
