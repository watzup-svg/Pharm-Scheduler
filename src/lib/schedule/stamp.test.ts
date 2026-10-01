import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDoc, serializeDoc } from "./file.ts";
import { getCell, setCellValue } from "./grid.ts";
import { jumpTargets } from "./jump.ts";
import { placeName } from "./place.ts";
import { evaluate } from "./rules.ts";
import { createSample } from "./sample.ts";
import {
  copyWeekdayColumn,
  fillOpenDaysInSlot,
  plannedFillSlot,
  plannedStampWeekday,
  ptoPlanned,
  setPatternCell,
  stampWeekday,
} from "./stamp.ts";

describe("place and stamp", () => {
  it("rejects a name on a shut Sunday", () => {
    const doc = createSample();
    const res = placeName(doc, "EST", "pharmacist", 6, "Jane Smith");
    assert.equal(res.ok, false);
    assert.equal(res.reason, "shut");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 6), "");
  });

  it("stamps Pattern Monday onto open Mondays and drops Labor Day", () => {
    let doc = createSample();
    doc = { ...doc, pattern: setPatternCell(doc.pattern, "EST", "pharmacist", 1, "Jane Smith") };
    const res = stampWeekday(doc, 1);
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 14), "Jane Smith");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 21), "Jane Smith");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 7), "");
    assert.ok(res.dropped.some((d) => d.fromDay === 7 && d.reason === "shut"));
  });

  it("stamp never writes a technician pattern cell", () => {
    let doc = createSample();
    doc = { ...doc, pattern: setPatternCell(doc.pattern, "EST", "tech1", 1, "Bob Jones") };
    doc = { ...doc, pattern: setPatternCell(doc.pattern, "EST", "pharmacist", 1, "Jane Smith") };
    const planned = plannedStampWeekday(doc, 1, "EST");
    assert.equal(planned.some((p) => p.slot === "tech1"), false);
    assert.ok(planned.some((p) => p.slot === "pharmacist" && p.name === "Jane Smith"));
    const res = stampWeekday(doc, 1, "EST");
    assert.equal(getCell(res.doc.grid, "EST", "tech1", 21), "");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 21), "Jane Smith");
  });

  it("copy Thursday column does not keep names by 1–31", () => {
    const doc = createSample();
    const res = copyWeekdayColumn(doc, 3);
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 3), "Jane Smith");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 10), "Jane Smith");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 17), "Jane Smith");
  });

  it("loads a v1 file without pattern", () => {
    const v1 = {
      format: "hischool-schedule",
      version: 1,
      year: 2026,
      month: 9,
      stores: [{ code: "EST", name: "Estacada", satOpen: true, sunOpen: false }],
      people: [{ name: "Jane Smith", role: "Pharmacist", home: "EST", lead: false }],
      holidays: [],
      timeOff: [],
      grid: { EST: { pharmacist: { "1": "Jane Smith" } } },
    };
    const doc = parseDoc(JSON.stringify(v1));
    assert.equal(doc.version, 2);
    assert.deepEqual(doc.pattern, {});
    assert.equal(doc.people[0]?.phone, "");
    const round = parseDoc(serializeDoc(doc));
    assert.equal(round.version, 2);
  });

  it("drops technicians and cashiers when an old file is opened", () => {
    const old = {
      format: "hischool-schedule",
      version: 2,
      year: 2026,
      month: 9,
      stores: [{ code: "EST", name: "Estacada", satOpen: true, sunOpen: false, address: "" }],
      people: [
        { name: "Jane Smith", role: "Pharmacist", home: "EST", lead: false },
        { name: "Bob Jones", role: "Pharmacy Technician", home: "EST", lead: true },
        { name: "Dana Lee", role: "Cashier", home: "EST", lead: false },
      ],
      holidays: [],
      timeOff: [{ name: "Dana Lee", dates: ["2026-09-04"], note: "" }],
      grid: {
        EST: {
          pharmacist: { "1": "Jane Smith" },
          tech1: { "20": "Bob Jones" },
          cashier: { "4": "Dana Lee" },
        },
      },
      printPrefs: { includeStaff: true },
    };
    const doc = parseDoc(JSON.stringify(old));
    assert.equal(doc.people.some((p) => p.name === "Jane Smith"), true);
    assert.equal(doc.people.some((p) => p.name === "Bob Jones"), false);
    assert.equal(doc.people.some((p) => p.name === "Dana Lee"), false);
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 1), "Jane Smith");
    assert.equal(getCell(doc.grid, "EST", "tech1", 20), "");
    assert.equal(getCell(doc.grid, "EST", "cashier", 4), "");
    assert.equal(doc.timeOff.some((t) => t.name === "Dana Lee"), false);
    assert.equal(doc.printPrefs.includeStaff, false);
  });

  it("jump next hole is Estacada pharmacist day 16", () => {
    const doc = createSample();
    const holes = jumpTargets(doc, evaluate(doc), "hole");
    assert.equal(holes[0]?.store, "EST");
    assert.equal(holes[0]?.day, 16);
    assert.equal(holes[0]?.slot, "pharmacist");
  });

  it("person tone is stable", async () => {
    const { personToneIndex } = await import("./color.ts");
    assert.equal(personToneIndex("Jane Smith"), personToneIndex("Jane Smith"));
    assert.notEqual(personToneIndex("Jane Smith"), personToneIndex("Tom Reyes"));
  });

  it("fill Jane EST pharmacist hits PTO 14–15; skip leaves them empty", () => {
    const doc = createSample();
    const ref = { store: "EST", slot: "pharmacist" as const, day: 1 };
    const planned = plannedFillSlot(doc, ref);
    const pto = ptoPlanned(doc, planned);
    assert.ok(pto.some((p) => p.day === 14 && p.name === "Jane Smith"));
    assert.ok(pto.some((p) => p.day === 15 && p.name === "Jane Smith"));
    assert.ok(planned.some((p) => p.day === 16));

    const skip = fillOpenDaysInSlot(doc, ref, true);
    assert.equal(getCell(skip.doc.grid, "EST", "pharmacist", 14), "");
    assert.equal(getCell(skip.doc.grid, "EST", "pharmacist", 15), "");
    assert.equal(getCell(skip.doc.grid, "EST", "pharmacist", 16), "Jane Smith");

    const place = fillOpenDaysInSlot(doc, ref);
    assert.equal(getCell(place.doc.grid, "EST", "pharmacist", 14), "Jane Smith");
    assert.equal(getCell(place.doc.grid, "EST", "pharmacist", 15), "Jane Smith");
  });

  it("stamp skipPto leaves Jane off Monday 14", () => {
    let doc = createSample();
    doc = { ...doc, pattern: setPatternCell(doc.pattern, "EST", "pharmacist", 1, "Jane Smith") };
    const skip = stampWeekday(doc, 1, "EST", true);
    assert.equal(getCell(skip.doc.grid, "EST", "pharmacist", 14), "");
    assert.equal(getCell(skip.doc.grid, "EST", "pharmacist", 21), "Jane Smith");
    const place = stampWeekday(doc, 1, "EST");
    assert.equal(getCell(place.doc.grid, "EST", "pharmacist", 14), "Jane Smith");
  });

  it("a typical-week stamp does not overwrite a hand edit", () => {
    let doc = createSample();
    doc = { ...doc, pattern: setPatternCell(doc.pattern, "EST", "pharmacist", 1, "Tom Reyes") };
    doc = { ...doc, grid: setCellValue(doc.grid, "EST", "pharmacist", 21, "Susan Brown") };
    const res = stampWeekday(doc, 1, "EST");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 21), "Susan Brown");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 14), "Tom Reyes");
    const planned = plannedStampWeekday(doc, 1, "EST");
    assert.equal(planned.some((p) => p.day === 21), false);
  });

  it("filling a row skips filled cells", () => {
    let doc = createSample();
    doc = { ...doc, grid: setCellValue(doc.grid, "EST", "pharmacist", 9, "Susan Brown") };
    const ref = { store: "EST", slot: "pharmacist" as const, day: 1 };
    assert.equal(plannedFillSlot(doc, ref).some((p) => p.day === 9), false);
    const res = fillOpenDaysInSlot(doc, ref);
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 9), "Susan Brown");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 16), "Jane Smith");
  });

  it("copying a weekday column skips filled cells", () => {
    let doc = createSample();
    doc = { ...doc, grid: setCellValue(doc.grid, "EST", "pharmacist", 10, "Susan Brown") };
    doc = { ...doc, grid: setCellValue(doc.grid, "EST", "pharmacist", 17, "") };
    const res = copyWeekdayColumn(doc, 3);
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 10), "Susan Brown");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 17), "Jane Smith");
  });

  it("opening a v1 range drops days the home store is closed (Sep 12–16 keeps 12, 14, 15, 16)", () => {
    const v1 = {
      format: "hischool-schedule",
      version: 1,
      year: 2026,
      month: 9,
      stores: [{ code: "EST", name: "Estacada", satOpen: true, sunOpen: false }],
      people: [{ name: "Jane Smith", role: "Pharmacist", home: "EST", lead: false }],
      holidays: [],
      timeOff: [{ name: "Jane Smith", from: "2026-09-12", to: "2026-09-16", note: "" }],
      grid: {},
    };
    const doc = parseDoc(JSON.stringify(v1));
    assert.deepEqual(doc.timeOff[0]?.dates, ["2026-09-12", "2026-09-14", "2026-09-15", "2026-09-16"]);
    // and it is dates, not a range: a round trip keeps the gap
    const again = parseDoc(serializeDoc(doc));
    assert.deepEqual(again.timeOff[0]?.dates, doc.timeOff[0]?.dates);
  });
});
