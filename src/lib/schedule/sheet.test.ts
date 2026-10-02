import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCell } from "./grid.ts";
import { createSample } from "./sample.ts";
import {
  applyPlaces,
  clipFromCells,
  colCells,
  fillHandlePlaces,
  handleAnchor,
  nextOpenDay,
  pasteClip,
  previousFilled,
  rangeAssignPlaces,
  rowCells,
  weekdayPlaces,
} from "./sheet.ts";
import { clearRange } from "./stamp.ts";

describe("spreadsheet cell helpers", () => {
  const doc = createSample();

  it("skips Sunday and Labor Day to the next open day", () => {
    const fromSat = nextOpenDay(doc, { store: "EST", slot: "pharmacist", day: 5 }, 1);
    assert.equal(fromSat.day, 8);
    assert.equal(nextOpenDay(doc, { store: "EST", slot: "pharmacist", day: 1 }, 1).day, 2);
    assert.equal(nextOpenDay(doc, { store: "EST", slot: "pharmacist", day: 30 }, 1).day, 30);
  });

  it("previous filled slot day for the Estacada hole is Jane on the 12th", () => {
    const prev = previousFilled(doc, { store: "EST", slot: "pharmacist", day: 16 });
    assert.equal(prev?.day, 12);
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 12), "Jane Smith");
  });

  it("fill handle to the right fills only the empty open days on the drag path", () => {
    const preview = fillHandlePlaces(
      doc,
      [{ store: "EST", slot: "pharmacist", day: 12 }],
      { store: "EST", slot: "pharmacist", day: 16 },
    );
    assert.equal(preview.axis, "day");
    assert.deepEqual(
      preview.places.map((p) => p.day).sort((a, b) => a - b),
      [14, 15, 16],
    );
    const applied = applyPlaces(doc, preview.places);
    assert.equal(getCell(applied.doc.grid, "EST", "pharmacist", 16), "Jane Smith");
    assert.equal(getCell(applied.doc.grid, "EST", "pharmacist", 1), "Jane Smith");
  });

  it("fill handle does not overwrite filled days", () => {
    const preview = fillHandlePlaces(
      doc,
      [{ store: "EST", slot: "pharmacist", day: 1 }],
      { store: "EST", slot: "pharmacist", day: 5 },
    );
    assert.equal(preview.places.length, 0);
  });

  it("alt fill handle copies Jane onto other empty Tuesdays of that slot", () => {
    const preview = fillHandlePlaces(
      doc,
      [{ store: "EST", slot: "pharmacist", day: 1 }],
      { store: "EST", slot: "pharmacist", day: 15 },
      { alt: true },
    );
    assert.equal(preview.axis, "weekday");
    assert.deepEqual(
      preview.places.map((p) => p.day),
      [15],
    );
    assert.deepEqual(
      weekdayPlaces(doc, [{ store: "EST", slot: "pharmacist", day: 1 }]).map((p) => p.day),
      [15],
    );
  });

  it("fill handle down copies a pharmacist onto the empty Pharmacist 2 cell", () => {
    const preview = fillHandlePlaces(
      doc,
      [{ store: "EST", slot: "pharmacist", day: 1 }],
      { store: "EST", slot: "pharmacist2", day: 1 },
    );
    assert.ok(preview.places.some((p) => p.slot === "pharmacist2" && p.day === 1 && p.name === "Jane Smith"));
    const ignored = fillHandlePlaces(
      doc,
      [{ store: "EST", slot: "pharmacist", day: 1 }],
      { store: "EST", slot: "tech1", day: 1 },
    );
    assert.equal(ignored.places.length, 0);
  });

  it("typing onto a range fills only open empty cells", () => {
    const cells = [
      { store: "EST" as const, slot: "pharmacist" as const, day: 14 },
      { store: "EST" as const, slot: "pharmacist" as const, day: 15 },
      { store: "EST" as const, slot: "pharmacist" as const, day: 16 },
      { store: "EST" as const, slot: "pharmacist" as const, day: 1 },
    ];
    const places = rangeAssignPlaces(doc, cells, "Jane Smith");
    assert.deepEqual(
      places.map((p) => p.day).sort((a, b) => a - b),
      [14, 15, 16],
    );
  });

  it("cut of a rectangle pastes as a rectangle and does not auto-fill other holes", () => {
    const cells = [
      { store: "EST" as const, slot: "pharmacist" as const, day: 1 },
      { store: "EST" as const, slot: "pharmacist" as const, day: 2 },
    ];
    const clip = clipFromCells(doc, cells);
    const cut = clearRange(doc, cells);
    assert.equal(getCell(cut.grid, "EST", "pharmacist", 1), "");
    // Jane already works row 1 on the 8th and 9th; empty it so the paste is not refused as "already here".
    const room = clearRange(cut, [8, 9].map((day) => ({ store: "EST" as const, slot: "pharmacist" as const, day })));
    const pasted = pasteClip(room, { store: "EST", slot: "pharmacist2", day: 8 }, clip);
    assert.equal(getCell(pasted.doc.grid, "EST", "pharmacist2", 8), "Jane Smith");
    assert.equal(getCell(pasted.doc.grid, "EST", "pharmacist2", 9), "Jane Smith");
    assert.equal(getCell(pasted.doc.grid, "EST", "pharmacist", 1), "");
    assert.equal(getCell(pasted.doc.grid, "EST", "pharmacist", 16), "");
  });

  it("row and column selects cover the store slot or day", () => {
    const row = rowCells(doc, "EST", "pharmacist");
    assert.equal(row.length, 30);
    const col = colCells("EST", 1, ["pharmacist", "pharmacist2"]);
    assert.equal(col.length, 2);
    assert.equal(handleAnchor(row)?.day, 30);
  });
});
